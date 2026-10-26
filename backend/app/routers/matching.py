"""Free-text JD matching and job-triggered candidate matching routes."""
from __future__ import annotations

import concurrent.futures

from fastapi import APIRouter, Depends, HTTPException
from langchain_core.messages import HumanMessage
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.core.responses import EnvelopeRoute
from app.db.engine import get_session
from app.dependencies import assert_owns_or_admin, require_approved_user
from app.repositories import CandidateRepository, JobRepository
from app.services import vector_store
from app.services.ai_clients import get_models
from app.services.auth import get_user_info, is_admin_or_hr
from app.services.json_parsing import parse_llm_json
from app.services.matching import _MATCH_EVAL_RULES, match_candidates_for_job

router = APIRouter(route_class=EnvelopeRoute)
logger = get_logger(__name__)

_DEFAULT_REASON = "Matched based on resume content similarity."
_BATCH_SIZE = 5
_WORKERS = 3
_SIMILAR_RESUMES = 15


class JDMatchRequest(BaseModel):
    job_description: str


def _candidate_line(row: dict) -> str:
    return (
        f"Name: {row.get('full_name')} | "
        f"Total Experience: {row.get('total_experience')} yrs | "
        f"Pega Experience: {row.get('pega_experience')} yrs | "
        f"CDH Experience: {row.get('cdh_exp')} yrs | "
        f"Skills: {row.get('skills')} | "
        f"Certifications: {row.get('certifications')} | "
        f"Current Location: {row.get('current_location')} | "
        f"Preferred Locations: {row.get('pref_locations')}"
    )


@router.post("/api/match-jd")
def match_jd(
    req: JDMatchRequest,
    username: str = Depends(require_approved_user),
    session: Session = Depends(get_session),
):
    jd = req.job_description.strip()
    if not jd:
        raise HTTPException(status_code=400, detail="Empty Job Description")

    info = get_user_info(username)
    sees_all = bool(info and (info["is_admin"] == 1 or info["role"] == "admin" or is_admin_or_hr(username)))

    if not vector_store.has_vectors():
        return {"matches": []}

    try:
        documents = vector_store.similarity_search(jd, k=_SIMILAR_RESUMES)
    except Exception:
        return {"matches": []}

    sources = sorted({d.metadata["source"] for d in documents if "source" in d.metadata})
    if not sources:
        return {"matches": []}

    rows = CandidateRepository(session).rows_by_filenames(sources)
    if not sees_all:
        rows = [r for r in rows if not r.get("created_by") or r["created_by"].lower() == username.lower()]
    if not rows:
        return {"matches": []}
    for row in rows:
        row.pop("file_bytes", None)  # never serialise binary résumés

    _, llm = get_models()

    def evaluate(batch_lines: list[str]) -> dict[str, str]:
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
            reply = llm.invoke([HumanMessage(content=prompt)])
            items = parse_llm_json(reply.content, bracket="[")
            return {str(i.get("name", "")).strip().lower(): i.get("reason", "") for i in items}
        except Exception:
            return {}

    lines = [_candidate_line(r) for r in rows]
    batches = [lines[i:i + _BATCH_SIZE] for i in range(0, len(lines), _BATCH_SIZE)]
    reasons: dict[str, str] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=_WORKERS) as pool:
        for partial in pool.map(evaluate, batches):
            reasons.update(partial)

    for row in rows:
        name = str(row.get("full_name", "")).strip().lower()
        reason = reasons.get(name, _DEFAULT_REASON)
        if reason == _DEFAULT_REASON:
            for key, value in reasons.items():
                if key in name or name in key:
                    reason = value
                    break
        row["ai_reason"] = reason
    return {"matches": rows}


@router.post("/api/jobs/{job_id}/match")
def match_job_endpoint(
    job_id: int,
    username: str = Depends(require_approved_user),
    session: Session = Depends(get_session),
):
    job = JobRepository(session).get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    assert_owns_or_admin(job.created_by, username)
    session.commit()  # release the read transaction before the long LLM run
    return match_candidates_for_job(job_id)
