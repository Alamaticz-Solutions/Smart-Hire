"""Candidate <-> job matching (LLM driven).

Both public functions take bare ids and do their own database access, so
routers can schedule them as background tasks without importing each other.
"""
from __future__ import annotations

import concurrent.futures

from langchain_core.messages import HumanMessage

from app.core.logging import get_logger
from app.db.engine import session_scope
from app.repositories import CandidateRepository, JobCandidateRepository, JobRepository
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

_BATCH_SIZE = 25      # keeps each prompt inside the provider's token budget
_BATCH_WORKERS = 3
_DEFAULT_REASON = "Matched based on candidate details."


def match_candidate_to_all_jobs(candidate_id: int) -> None:
    """Evaluate one candidate against every visible job and refresh its matches.

    Fire-and-forget: errors are logged, never raised, because this runs as a
    background task and must not break ingestion.
    """
    try:
        with session_scope() as session:
            data = CandidateRepository(session).get_row(candidate_id)
            if not data:
                return
            creator = data.get("created_by")
            owner = creator if creator and creator.lower() != "admin" else None
            jobs = JobRepository(session).list_for_matching(owner)

        if not jobs:
            return

        formatted_jds = "\n".join(
            f"JD ID: {job['id']}\nTitle: {job['title']}\nDescription: {job['description']}\n---" for job in jobs
        )
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

        response = retry_with_backoff(
            lambda: llm.invoke([HumanMessage(content=prompt)]),
            max_retries=5,
            base_delay=20.0,
            delay_increment=10.0,
            retryable_markers=("429",),
            raise_on_exhaustion=True,
        )
        if response is None:
            raise RuntimeError("Failed to get response from AI model")
        matches = parse_llm_json(response.content, bracket="[")

        known_job_ids = {job["id"] for job in jobs}
        with session_scope() as session:
            links = JobCandidateRepository(session)
            links.clear_matched_for_candidate(candidate_id)
            for match in matches or []:
                try:
                    job_id = int(match.get("job_id"))
                except (TypeError, ValueError):
                    continue
                if job_id in known_job_ids:  # ignore ids the model invented
                    links.upsert_match(job_id, candidate_id, match.get("reason") or _DEFAULT_REASON)
            CandidateRepository(session).set_qualified(candidate_id, links.count_for_candidate(candidate_id) > 0)
    except Exception as exc:
        logger.error("Error auto-matching candidate %s to jobs: %s", candidate_id, exc)


def match_candidates_for_job(job_id: int) -> dict:
    """Evaluate every candidate visible to the job's creator against the JD.

    Raises ``HTTPException(404)`` when the job does not exist (the
    ``/api/jobs/{id}/match`` endpoint relies on that).
    """
    from fastapi import HTTPException

    with session_scope() as session:
        job = JobRepository(session).get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        description, job_creator = job.description, job.created_by
        owner = job_creator if job_creator and not is_admin_or_hr(job_creator) else None
        rows = CandidateRepository(session).all_rows(owner)

    if not rows:
        return {"message": "No candidates found in DB"}

    _, llm = get_models()
    batches = [rows[i:i + _BATCH_SIZE] for i in range(0, len(rows), _BATCH_SIZE)]

    def evaluate_batch(batch: list) -> dict[int, str]:
        lines = [
            f"ID: {r.get('id')} | Name: {r.get('full_name')} | "
            f"Total Experience: {r.get('total_experience')} yrs | Pega Experience: {r.get('pega_experience')} yrs | "
            f"CDH Experience: {r.get('cdh_exp')} yrs | Skills: {r.get('skills')} | "
            f"Certifications: {r.get('certifications')} | Current Location: {r.get('current_location')} | "
            f"Preferred Locations: {r.get('pref_locations')}"
            for r in batch
        ]
        prompt = f"""You are an expert technical recruiter. Evaluate these candidates against the Job Description "pin to pin".

Job Description:
{description[:2000]}

Candidates to evaluate:
{chr(10).join(lines)}

{_MATCH_EVAL_RULES}

Format your response exactly as a JSON list of objects for matching candidates only:
[
  {{
    "id": <Candidate ID (integer)>,
    "reason": "1-sentence explanation of why they fit based on their specific experience, skills, and location"
  }}
]
Return ONLY the raw JSON block, no markdown, no other text."""

        response = retry_with_backoff(
            lambda p=prompt: llm.invoke([HumanMessage(content=p)]),
            max_retries=3,
            base_delay=2.0,
            delay_increment=0.0,
            retryable_markers=("429", "413"),
            raise_on_exhaustion=False,  # log and move on to the next batch
        )
        reasons: dict[int, str] = {}
        if response is not None:
            try:
                for item in parse_llm_json(response.content, bracket="["):
                    if item.get("id") is not None:
                        reasons[int(item["id"])] = item.get("reason", "")
            except Exception as exc:
                logger.error("Error parsing batch match response: %s", exc)
        return reasons

    reason_map: dict[int, str] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=_BATCH_WORKERS) as executor:
        for partial in executor.map(evaluate_batch, batches):
            reason_map.update(partial)

    with session_scope() as session:
        links = JobCandidateRepository(session)
        candidates = CandidateRepository(session)
        links.clear_matched_for_job(job_id)
        added = 0
        for row in rows:
            reason = reason_map.get(row["id"])
            if reason:
                links.upsert_match(job_id, row["id"], reason)
                candidates.set_qualified(row["id"], True)
                added += 1

    return {"message": f"Successfully matched and added {added} candidates to job"}
