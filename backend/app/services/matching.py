"""Candidate <-> Job matching (LLM-driven) service.

Moved from app/main.py:
  - match_candidate_to_all_jobs  (original lines 2092-2212)
  - match_candidates_for_job     (original lines 3680-3809)

── Why this module takes bare IDs instead of pre-loaded objects ───────────
`update_candidate` (a route that lives in `routers/candidates.py`, owned by
a different agent/vertical) fires `match_candidate_to_all_jobs` as a
background task whenever a candidate is edited. If this module imported a
candidate model/helper from `routers.candidates` (or a future
`services.candidates`), and that module ever needed to reach back into
matching (e.g. to trigger a re-match after a save), we'd have a circular
import: candidates -> matching -> candidates.

Both moved functions already followed this shape in the original code (they
take an id and do their own `SELECT * FROM ... WHERE id = ?`), so no
signature change was needed - only their DB access was adapted to use
`get_db_connection()`. Keeping that shape is what lets `routers/candidates.py`
call into this module (or schedule it as a background task) without this
module ever needing to import anything from candidates. The small
candidate/job lookup snippets below are inlined for the same reason (see
each helper's docstring) rather than imported from a candidates-owned
module that may not exist yet.
"""

from __future__ import annotations

import concurrent.futures

from langchain_core.messages import HumanMessage

from app.core.logging import get_logger
from app.db.row_helpers import dict_row_factory
from app.db.session import get_db_connection
from app.services.ai_clients import get_models
from app.services.auth import is_admin_or_hr
from app.services.json_parsing import parse_llm_json
from app.services.retry import retry_with_backoff

logger = get_logger(__name__)


_MATCH_EVAL_RULES = """Rules for evaluation:
1. Numeric Experience Matching: If a Job Description asks for "X+ years of experience", a candidate matches if their experience is greater than or equal to X.
   - For example: if Job Description requires "1+ years of experience in pega", then candidates with 3.0 years, 4.0 years, or 4.8 years of Pega experience all match perfectly because 3.0 >= 1.0, 4.0 >= 1.0, and 4.8 >= 1.0.
2. Certification Abbreviations:
   - CSSA is equivalent to any of: "PEGA Certified Senior System Architect", "Pega Certified Senior System Architect", "Certified Pega Senior System Architect", "Senior System Architect", or "CSSA".
   - CSA is equivalent to any of: "PEGA Certified System Architect", "Pega Certified System Architect", "Certified Pega System Architect", "System Architect", or "CSA".
   - LSA is equivalent to any of: "PEGA Certified Lead System Architect", "Pega Certified Lead System Architect", "Certified Pega Lead System Architect", "Lead System Architect", or "LSA".
3. Do not invent requirements. If the Job Description only mentions Pega experience, do NOT reject candidates for lacking CSSA or other unrelated certifications.
4. Location Matching: If the Job Description specifies a location requirement, a candidate matches if their Current Location or any of their Preferred Locations match the specified job location (e.g. if the Job Description mentions 'Chennai', a candidate with Current Location or Preferred Location 'Chennai' is a match)."""


def match_candidate_to_all_jobs(candidate_id: int) -> None:
    """Evaluate one candidate against every open job and (re)populate `job_candidates` matches.

    Fire-and-forget: swallows its own errors and logs them, matching the
    original background-task usage from `update_candidate`/resume upload.
    """
    try:
        # Look up the candidate. A dedicated connection with the dict row
        # factory, closed before the (slow) LLM call - mirrors the original,
        # which explicitly closed this connection at line 2112 rather than
        # holding it open across the LLM round-trip.
        with get_db_connection() as conn:
            conn.row_factory = dict_row_factory
            cur = conn.cursor()
            cur.execute("SELECT * FROM candidate_metadata WHERE id = ?", (candidate_id,))
            row = cur.fetchone()
            if not row:
                return
            data = dict(row)

            cand_creator = data.get("created_by")
            if cand_creator and cand_creator.lower() != "admin":
                cur.execute("SELECT id, title, description FROM jobs WHERE LOWER(created_by) = LOWER(?)", (cand_creator,))
            else:
                cur.execute("SELECT id, title, description FROM jobs")
            jobs = [dict(r) for r in cur.fetchall()]

        if not jobs:
            return

        jds_str_list = [
            f"JD ID: {job['id']}\nTitle: {job['title']}\nDescription: {job['description']}\n---"
            for job in jobs
        ]
        formatted_jds = "\n".join(jds_str_list)

        _, llm = get_models()

        prompt = f"""You are an expert technical recruiter. Evaluate candidate "{data.get('full_name', 'Candidate')}" against the following Job Descriptions "pin to pin".

Candidate Details:
- Skills: {data.get('skills', '')}
- Experience: {data.get('total_experience', 0)} years (Pega Experience: {data.get('pega_experience', 0)} years, CDH Experience: {data.get('cdh_exp', 0)} years)
- Certifications: {data.get('certifications', '')}
- Current Location: {data.get('current_location', '')}
- Preferred Locations: {data.get('pref_locations', '')}

Job Descriptions:
{formatted_jds}

{_MATCH_EVAL_RULES}

For each Job Description, decide if the candidate is a good match based on the rules.
Respond with a JSON list of objects for matches only:
[
  {{"job_id": <job_id>, "reason": "<1-sentence explanation of fit based on specific experience, skills, and location>"}}
]
If there are no matches, return an empty list [].
Return ONLY the JSON block, no markdown, no other text."""

        # Original call site (main.py L2156-2167): max_retries=5, escalating
        # delay of 20 + attempt*10s, retries only on "429", re-raises on
        # exhaustion (caught by the outer try/except below).
        resp = retry_with_backoff(
            lambda: llm.invoke([HumanMessage(content=prompt)]),
            max_retries=5,
            base_delay=20.0,
            delay_increment=10.0,
            retryable_markers=("429",),
            raise_on_exhaustion=True,
        )
        if resp is None:
            raise Exception("Failed to get response from AI model")

        matches = parse_llm_json(resp.content, bracket="[")

        # Fresh write connection - deliberately NOT the same connection/`with`
        # block as the read above, matching the original's two-connection
        # shape (read-then-close, LLM call, then a new connection to write).
        # No row_factory here: the code below reads `cur.fetchone()[0]`
        # positionally, so a dict-returning factory would break it.
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM job_candidates WHERE candidate_id = ? AND status = 'matched'", (candidate_id,))

            if matches:
                for match in matches:
                    job_id = match.get("job_id")
                    reason = match.get("reason", "Matched based on candidate details.")
                    if job_id:
                        cur.execute(
                            """
                            INSERT INTO job_candidates (job_id, candidate_id, ai_reason, status)
                            VALUES (?, ?, ?, 'matched')
                            ON CONFLICT(job_id, candidate_id) DO UPDATE SET ai_reason = excluded.ai_reason
                            """,
                            (job_id, candidate_id, reason),
                        )

            cur.execute("SELECT COUNT(*) FROM job_candidates WHERE candidate_id = ?", (candidate_id,))
            cnt = cur.fetchone()[0]
            is_qualified = 1 if cnt > 0 else 0
            cur.execute("UPDATE candidate_metadata SET is_qualified = ? WHERE id = ?", (is_qualified, candidate_id))

            conn.commit()
    except Exception as match_err:
        logger.error("Error auto-matching candidate %s to jobs: %s", candidate_id, match_err)


def match_candidates_for_job(job_id: int) -> dict:
    """Evaluate every candidate visible to the job's creator against the JD and (re)populate matches.

    Raises HTTPException(404) if the job doesn't exist - kept as-is even
    though raising a FastAPI exception from a service module is not ideal
    layering, because `routers/matching.py`'s `/api/jobs/{id}/match` endpoint
    depends on that exact behavior (see task notes: preserve identical
    behavior rather than "fixing" this in the same pass).
    """
    from fastapi import HTTPException  # local import: keep the FastAPI dependency out of the module's top-level surface

    with get_db_connection() as conn:
        conn.row_factory = dict_row_factory
        cur = conn.cursor()
        cur.execute("SELECT description, created_by FROM jobs WHERE id = ?", (job_id,))
        job = cur.fetchone()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        jd = job["description"]
        job_creator = job["created_by"]

        # Candidate lookup helper inlined here (rather than imported from a
        # candidates-owned module) for the same decoupling reason described
        # in the module docstring - a future consolidation pass could dedupe
        # this against routers/candidates.py's equivalent query.
        if job_creator and not is_admin_or_hr(job_creator):
            cur.execute("SELECT * FROM candidate_metadata WHERE LOWER(created_by) = LOWER(?)", (job_creator,))
        else:
            cur.execute("SELECT * FROM candidate_metadata")
        db_rows = [dict(r) for r in cur.fetchall()]

        if not db_rows:
            return {"message": "No candidates found in DB"}

        _, llm = get_models()

        # Batch candidates to fit within Groq TPM limit (6000 tokens).
        batch_size = 25
        batches = [db_rows[i : i + batch_size] for i in range(0, len(db_rows), batch_size)]

        def evaluate_batch(batch_rows: list) -> dict:
            candidate_lines = [
                f"ID: {r.get('id')} | "
                f"Name: {r.get('full_name')} | "
                f"Total Experience: {r.get('total_experience')} yrs | "
                f"Pega Experience: {r.get('pega_experience')} yrs | "
                f"CDH Experience: {r.get('cdh_exp')} yrs | "
                f"Skills: {r.get('skills')} | "
                f"Certifications: {r.get('certifications')} | "
                f"Current Location: {r.get('current_location')} | "
                f"Preferred Locations: {r.get('pref_locations')}"
                for r in batch_rows
            ]

            prompt = f"""You are an expert technical recruiter. Evaluate these candidates against the Job Description "pin to pin".

Job Description:
{jd[:2000]}

Candidates to evaluate:
{chr(10).join(candidate_lines)}

{_MATCH_EVAL_RULES}

Format your response exactly as a JSON list of objects for matching candidates only:
[
  {{
    "id": <Candidate ID (integer)>,
    "reason": "1-sentence explanation of why they fit based on their specific experience, skills, and location"
  }}
]
Return ONLY the raw JSON block, no markdown, no other text."""

            # Original call site (main.py L3754-3766): max_retries=3, flat 2s
            # delay, retries on "429" or "413", and - unlike the function
            # above - does NOT re-raise: it logs and moves on to the next
            # batch with resp=None. raise_on_exhaustion=False reproduces
            # exactly that "log and continue" contract.
            resp = retry_with_backoff(
                lambda p=prompt: llm.invoke([HumanMessage(content=p)]),
                max_retries=3,
                base_delay=2.0,
                delay_increment=0.0,
                retryable_markers=("429", "413"),
                raise_on_exhaustion=False,
            )

            batch_reasons: dict[int, str] = {}
            if resp is not None:
                try:
                    ai_reasons = parse_llm_json(resp.content, bracket="[")
                    for item in ai_reasons:
                        cid = item.get("id")
                        if cid is not None:
                            batch_reasons[int(cid)] = item.get("reason", "")
                except Exception as parse_err:
                    logger.error("Error parsing batch match response: %s", parse_err)
            return batch_reasons

        # Evaluate batches concurrently instead of one at a time with a
        # manual 0.5s sleep between each -- this was a purely sequential
        # loop of N independent LLM calls (each batch's prompt/response is
        # self-contained, nothing here depends on another batch's result),
        # so a job with e.g. 150 candidates paid 6 sequential LLM round
        # trips plus 6 * 0.5s of pure waiting for no reason. Mirrors the
        # same ThreadPoolExecutor(max_workers=3) pattern routers/matching.py's
        # match_jd already uses for the identical shape of problem;
        # max_workers=3 caps concurrent Groq requests, replacing the old
        # inter-batch sleep as the rate-limit safeguard. Each batch's
        # retry/error handling is unchanged -- a failed batch still just
        # contributes an empty dict via reason_map.update(...), same as
        # before.
        reason_map: dict[int, str] = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            for batch_reasons in executor.map(evaluate_batch, batches):
                reason_map.update(batch_reasons)

        # Clear old automatic matches for this job that haven't been selected.
        cur.execute("DELETE FROM job_candidates WHERE job_id = ? AND status = 'matched'", (job_id,))

        matches_added = 0
        for r in db_rows:
            cid = r["id"]
            reason = reason_map.get(cid)

            if reason:
                cur.execute(
                    """
                    INSERT INTO job_candidates (job_id, candidate_id, ai_reason, status)
                    VALUES (?, ?, ?, 'matched')
                    ON CONFLICT(job_id, candidate_id) DO UPDATE SET ai_reason = excluded.ai_reason
                    """,
                    (job_id, cid, reason),
                )
                cur.execute("UPDATE candidate_metadata SET is_qualified = 1 WHERE id = ?", (cid,))
                matches_added += 1

        conn.commit()

    return {"message": f"Successfully matched and added {matches_added} candidates to job"}
