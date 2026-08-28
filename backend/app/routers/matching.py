"""Freeform JD matching and job-triggered candidate matching routes.

Moved from app/main.py:
  - POST /api/match-jd            (original lines 3017-3165)
  - POST /api/jobs/{job_id}/match (original lines 3811-3832)

`/api/jobs/{job_id}/match` is a thin permission-check wrapper around
`app.services.matching.match_candidates_for_job` (moved separately into that
service module - see its docstring for why it takes a bare `job_id` rather
than a pre-loaded job object). `/api/match-jd` is a distinct flow: it does a
PGVector similarity search over resume embeddings for a freeform JD string,
then LLM-evaluates the results in parallel batches. It shares the same
evaluation-prompt shape as `match_candidates_for_job` but not the same
data/control flow (concurrent futures over raw PGVector hits vs. a serial
batch loop over `candidate_metadata` rows owned by a job), so it's kept here
as a route-local helper rather than folded into services/matching.py.
"""

from __future__ import annotations

import concurrent.futures
import os

from fastapi import APIRouter, Depends, HTTPException, Request
from langchain_community.vectorstores import PGVector
from langchain_core.messages import HumanMessage
from pydantic import BaseModel

from app.core.logging import get_logger
from app.db.row_helpers import dict_row_factory
from app.db.session import get_db_connection
from app.dependencies import assert_owns_or_admin, require_approved_user
from app.services.auth import get_user_info, is_admin_or_hr, is_user_approved
from app.services.json_parsing import parse_llm_json
from app.services.ai_clients import get_models
from app.services.matching import match_candidates_for_job

router = APIRouter()
logger = get_logger(__name__)


class JDMatchRequest(BaseModel):
    job_description: str


_MATCH_EVAL_RULES = """Rules for evaluation:
1. Numeric Experience Matching: If a Job Description asks for "X+ years of experience", a candidate matches if their experience is greater than or equal to X.
   - For example: if Job Description requires "1+ years of experience in pega", then candidates with 3.0 years, 4.0 years, or 4.8 years of Pega experience all match perfectly because 3.0 >= 1.0, 4.0 >= 1.0, and 4.8 >= 1.0.
2. Certification Abbreviations:
   - CSSA is equivalent to any of: "PEGA Certified Senior System Architect", "Pega Certified Senior System Architect", "Certified Pega Senior System Architect", "Senior System Architect", or "CSSA".
   - CSA is equivalent to any of: "PEGA Certified System Architect", "Pega Certified System Architect", "Certified Pega System Architect", "System Architect", or "CSA".
   - LSA is equivalent to any of: "PEGA Certified Lead System Architect", "Pega Certified Lead System Architect", "Certified Pega Lead System Architect", "Lead System Architect", or "LSA".
3. Do not invent requirements. If the Job Description only mentions Pega experience, do NOT reject candidates for lacking CSSA or other unrelated certifications.
4. Location Matching: If the Job Description specifies a location requirement, a candidate matches if their Current Location or any of their Preferred Locations match the specified job location (e.g. if the Job Description mentions 'Chennai', a candidate with Current Location or Preferred Location 'Chennai' is a match)."""


@router.post("/api/match-jd")
def match_jd(req: JDMatchRequest, request: Request):
    jd = req.job_description.strip()
    if not jd:
        raise HTTPException(status_code=400, detail="Empty Job Description")

    username = request.headers.get("x-user-username") or ""
    is_user_admin = False

    has_vectors = False
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()

            if username:
                row = get_user_info(username)
                if row:
                    is_user_admin = (row["is_admin"] == 1 or row["role"] == "admin" or is_admin_or_hr(username))

            cur.execute("SELECT COUNT(*) FROM langchain_pg_embedding")
            has_vectors = (cur.fetchone()[0] > 0)
    except Exception:
        has_vectors = False

    if not has_vectors:
        return {"matches": []}

    embeddings, llm = get_models()
    db = PGVector(
        connection_string=os.getenv("POSTGRES_DATABASE_URL"),
        embedding_function=embeddings,
        collection_name="resume_embeddings",
    )

    try:
        docs = db.similarity_search(jd, k=15)
    except Exception:
        return {"matches": []}

    matched_sources = set()
    for d in docs:
        if "source" in d.metadata:
            matched_sources.add(d.metadata["source"])

    if not matched_sources:
        return {"matches": []}

    with get_db_connection() as conn:
        conn.row_factory = dict_row_factory
        cur = conn.cursor()
        placeholders = ",".join("?" * len(matched_sources))
        # Use tuple for psycopg2 compatibility with IN clauses.
        cur.execute(f"SELECT * FROM candidate_metadata WHERE filename IN ({placeholders})", tuple(matched_sources))
        db_rows = [dict(r) for r in cur.fetchall()]

    if not is_user_admin:
        # Allow rows where created_by matches username OR where created_by is null/empty (shared records).
        db_rows = [r for r in db_rows if not r.get("created_by") or r["created_by"].lower() == username.lower()]

    if not db_rows:
        return {"matches": []}

    candidate_lines = [
        f"Name: {r.get('full_name')} | "
        f"Total Experience: {r.get('total_experience')} yrs | "
        f"Pega Experience: {r.get('pega_experience')} yrs | "
        f"CDH Experience: {r.get('cdh_exp')} yrs | "
        f"Skills: {r.get('skills')} | "
        f"Certifications: {r.get('certifications')} | "
        f"Current Location: {r.get('current_location')} | "
        f"Preferred Locations: {r.get('pref_locations')}"
        for r in db_rows
    ]

    def evaluate_batch(batch_lines):
        prompt = f"""You are an expert technical recruiter. Evaluate the following candidates against the Job Description "pin to pin".

Job Description:
{jd[:2000]}

Candidates to evaluate:
{chr(10).join(batch_lines)}

{_MATCH_EVAL_RULES}

For EACH candidate, decide if they match based on the rules. If they match, provide a 1-sentence explanation of why they are a good fit.
Format your response exactly as a JSON list of objects:
[
  {{
    "name": "Candidate Name",
    "reason": "1-sentence explanation of why they fit based on their specific experience, skills, and location"
  }}
]
Return ONLY the raw JSON block, no markdown, no other text."""
        try:
            resp = llm.invoke([HumanMessage(content=prompt)])
            # Original call site (main.py L3129-3142) hand-rolled the same
            # ```json fence-strip + bracket-slice + json.loads idiom now
            # centralized in parse_llm_json.
            ai_reasons = parse_llm_json(resp.content, bracket="[")
            return {str(item.get("name", "")).strip().lower(): item.get("reason", "") for item in ai_reasons}
        except Exception:
            return {}

    reason_map = {}
    batch_size = 5
    batches = [candidate_lines[i : i + batch_size] for i in range(0, len(candidate_lines), batch_size)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        for res in executor.map(evaluate_batch, batches):
            reason_map.update(res)

    matches = []
    for r in db_rows:
        name = str(r.get("full_name", "")).strip().lower()
        reason = reason_map.get(name, "Matched based on resume content similarity.")
        if reason == "Matched based on resume content similarity.":
            for k, v in reason_map.items():
                if k in name or name in k:
                    reason = v
                    break
        r["ai_reason"] = reason
        matches.append(r)

    return {"matches": matches}


@router.post("/api/jobs/{job_id}/match")
def match_candidates_for_job_endpoint(job_id: int, username: str = Depends(require_approved_user)):
    # NOTE: original main.py also assigned `role = get_user_role(username)`
    # here but never used it; the task scoped that cleanup to routers/jobs.py
    # specifically, so it's called out here rather than silently dropped or
    # silently kept.

    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT created_by FROM jobs WHERE id = ?", (job_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Job not found")
        created_by = row[0]

    assert_owns_or_admin(created_by, username)

    return match_candidates_for_job(job_id)
