"""Job CRUD, job<->candidate association, and job-sharing routes.

Moved from app/main.py:
  - GET    /api/jobs                              (original lines 3209-3255)
  - POST   /api/jobs                               (original lines 3257-3299)
  - PUT    /api/jobs/{job_id}                      (original lines 3301-3362)
  - DELETE /api/jobs/{job_id}                      (original lines 3364-3391)
  - GET    /api/jobs/{job_id}/candidates           (original lines 3393-3479)
  - GET    /api/jobs/{job_id}/unmatched-candidates (original lines 3481-3560)
  - POST   /api/jobs/{job_id}/candidates/{cid}     (original lines 3562-3615)
  - PUT    /api/jobs/{job_id}/candidates/{cid}     (original lines 3617-3651)
  - DELETE /api/jobs/{job_id}/candidates/{cid}     (original lines 3653-3678)
  - POST   /api/jobs/{job_id}/share                (original lines 4355-4400)
  - GET    /api/jobs/{job_id}/shares               (original lines 4402-4430)

Job<->candidate auto-matching (POST/PUT triggering an LLM re-match, and the
dedicated /api/jobs/{id}/match endpoint) now lives in
app.services.matching / app.routers.matching - see that module's docstring
for why matching takes bare IDs instead of objects from this router.
"""

from __future__ import annotations

import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.core.logging import get_logger
from app.db.row_helpers import dict_row_factory, row_to_dict
from app.db.session import get_db_connection
from app.dependencies import assert_owns_or_admin, require_approved_user
from app.services.auth import apply_user_hidden_fields, get_user_role, is_admin_or_hr, is_user_approved
from app.services.matching import match_candidates_for_job

router = APIRouter()
logger = get_logger(__name__)


class JobCreate(BaseModel):
    title: str
    description: str
    client_name: Optional[str] = ""
    contact_name: Optional[str] = ""
    client_phone: Optional[str] = ""
    account_manager: Optional[str] = ""
    assigned_recruiter: Optional[str] = ""
    target_date: Optional[str] = ""
    job_type: Optional[str] = ""
    job_status: Optional[str] = ""
    work_experience: Optional[str] = ""
    industry: Optional[str] = ""
    salary: Optional[str] = ""
    required_skills: Optional[str] = ""


class JobStatusUpdate(BaseModel):
    status: Optional[str] = None
    ai_reason: Optional[str] = None


class JobShareRequest(BaseModel):
    usernames: list[str]


# ── Small helpers inlined from main.py ──────────────────────────────────────
# These are candidate/activity-logging helpers owned conceptually by other
# verticals (candidates, activity logging) that don't have a shared service
# module yet. Duplicated here rather than importing routers/services owned by
# other in-flight agents, to avoid a circular/undefined import; a future
# consolidation pass can dedupe these against their eventual home.

def _log_activity_db(username: str, action: str) -> None:
    """Duplicated from main.py's log_activity_db (~line 805)."""
    if not username:
        username = "unknown"
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("INSERT INTO activity_logs (username, action) VALUES (?, ?)", (username, action))
            conn.commit()
    except Exception as e:
        logger.error("Error logging activity: %s", e)


def _get_job_title(job_id: int) -> str:
    """Duplicated from main.py's get_job_title (~line 979)."""
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT title FROM jobs WHERE id = ?", (job_id,))
        row = cur.fetchone()
    return row[0] if row else f"ID {job_id}"


def _get_masked_keywords() -> list:
    """Duplicated from main.py's get_masked_keywords (~line 725)."""
    with get_db_connection() as conn:
        cur = conn.cursor()
        try:
            cur.execute("SELECT keyword FROM masked_keywords")
            return [row[0] for row in cur.fetchall()]
        except Exception:
            return []


_PATTERN_CACHE: dict = {}


def _mask_text_with_keywords(text: str, keywords: list) -> str:
    """Duplicated from main.py's mask_text_with_keywords (~line 738)."""
    if not text or not keywords:
        return text
    result = str(text)
    for kw in keywords:
        kw_strip = kw.strip()
        if not kw_strip:
            continue
        if kw_strip not in _PATTERN_CACHE:
            _PATTERN_CACHE[kw_strip] = re.compile(re.escape(kw_strip), re.IGNORECASE)
        result = _PATTERN_CACHE[kw_strip].sub("****", result)
    return result


def _mask_candidate_record(candidate: dict, keywords: list) -> dict:
    """Duplicated from main.py's mask_candidate_record (~line 751)."""
    masked = {}
    for k, v in candidate.items():
        masked[k] = _mask_text_with_keywords(v, keywords) if isinstance(v, str) else v
    return masked


# ── Jobs ─────────────────────────────────────────────────────────────────────

@router.get("/api/jobs")
def list_jobs(request: Request):
    username = request.headers.get("x-user-username")
    if not is_user_approved(username):
        return []

    with get_db_connection() as conn:
        conn.row_factory = dict_row_factory
        cur = conn.cursor()

        is_external = False
        is_user_admin = False
        if username:
            cur.execute("SELECT is_external, is_admin, role FROM users WHERE LOWER(username) = LOWER(?)", (username,))
            row = cur.fetchone()
            if row:
                is_external = (row["is_external"] == 1)
                is_user_admin = (row["is_admin"] == 1 or row["role"] == "admin" or is_admin_or_hr(username))

        if is_external:
            cur.execute(
                """
                SELECT j.* FROM jobs j
                JOIN job_shares js ON j.id = js.job_id
                WHERE LOWER(js.username) = LOWER(?)
                ORDER BY j.id DESC
                """,
                (username,),
            )
        else:
            if is_user_admin:
                cur.execute("SELECT * FROM jobs ORDER BY id DESC")
            else:
                cur.execute("SELECT * FROM jobs WHERE LOWER(created_by) = LOWER(?) ORDER BY id DESC", (username,))

        jobs = [dict(r) for r in cur.fetchall()]
        for job in jobs:
            job_id = job["id"]
            cur.execute("SELECT status, COUNT(*) as cnt FROM job_candidates WHERE job_id = ? GROUP BY status", (job_id,))
            counts = {r["status"]: r["cnt"] for r in cur.fetchall()}
            job["matched_count"] = counts.get("matched", 0)
            job["selected_count"] = counts.get("selected", 0)

            cur.execute("SELECT username FROM job_shares WHERE job_id = ?", (job_id,))
            job["shared_with"] = [r["username"] for r in cur.fetchall()]

    return jobs


@router.post("/api/jobs")
def create_job(job: JobCreate, request: Request):
    username = request.headers.get("x-user-username") or "admin"
    if not is_user_approved(username):
        raise HTTPException(status_code=403, detail="Access denied. Your account is pending admin approval.")

    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO jobs (
                title, description, client_name, contact_name, client_phone, account_manager,
                assigned_recruiter, target_date, job_type, job_status,
                work_experience, industry, salary, required_skills, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job.title, job.description, job.client_name, job.contact_name, job.client_phone, job.account_manager,
                job.assigned_recruiter, job.target_date, job.job_type, job.job_status,
                job.work_experience, job.industry, job.salary, job.required_skills, username,
            ),
        )
        job_id = cur.lastrowid
        conn.commit()

    try:
        match_candidates_for_job(job_id)
    except Exception as e:
        logger.error("Error matching candidates for job %s: %s", job_id, e)

    with get_db_connection() as conn:
        conn.row_factory = dict_row_factory
        cur = conn.cursor()
        cur.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        updated_job = row_to_dict(cur.fetchone())

        cur.execute("SELECT status, COUNT(*) as cnt FROM job_candidates WHERE job_id = ? GROUP BY status", (job_id,))
        counts = {r["status"]: r["cnt"] for r in cur.fetchall()}
        updated_job["matched_count"] = counts.get("matched", 0)
        updated_job["selected_count"] = counts.get("selected", 0)
        updated_job["shared_with"] = []

    username = request.headers.get("x-user-username")
    _log_activity_db(username or "unknown", f"posted a Job Description for '{job.title}'")

    return updated_job


@router.put("/api/jobs/{job_id}")
def update_job(job_id: int, job: JobCreate, username: str = Depends(require_approved_user)):
    # NOTE: original main.py assigned `role = get_user_role(username)` here
    # but never used it in this function body - dropped as part of this move
    # (task-scoped cleanup of unused role lookups in the jobs vertical).

    with get_db_connection() as conn:
        cur = conn.cursor()

        cur.execute("SELECT created_by FROM jobs WHERE id = ?", (job_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Job not found")
        created_by = row[0]

        assert_owns_or_admin(created_by, username)

        cur.execute(
            """
            UPDATE jobs SET
                title = ?, description = ?, client_name = ?, contact_name = ?, client_phone = ?, account_manager = ?,
                assigned_recruiter = ?, target_date = ?, job_type = ?, job_status = ?,
                work_experience = ?, industry = ?, salary = ?, required_skills = ?
            WHERE id = ?
            """,
            (
                job.title, job.description, job.client_name, job.contact_name, job.client_phone, job.account_manager,
                job.assigned_recruiter, job.target_date, job.job_type, job.job_status,
                job.work_experience, job.industry, job.salary, job.required_skills,
                job_id,
            ),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Job not found")
        conn.commit()

    try:
        match_candidates_for_job(job_id)
    except Exception as e:
        logger.error("Error matching candidates for job %s: %s", job_id, e)

    with get_db_connection() as conn:
        conn.row_factory = dict_row_factory
        cur = conn.cursor()
        cur.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        updated_job = row_to_dict(cur.fetchone())

        cur.execute("SELECT status, COUNT(*) as cnt FROM job_candidates WHERE job_id = ? GROUP BY status", (job_id,))
        counts = {r["status"]: r["cnt"] for r in cur.fetchall()}
        updated_job["matched_count"] = counts.get("matched", 0)
        updated_job["selected_count"] = counts.get("selected", 0)

        cur.execute("SELECT username FROM job_shares WHERE job_id = ?", (job_id,))
        updated_job["shared_with"] = [r["username"] for r in cur.fetchall()]

    return updated_job


@router.delete("/api/jobs/{job_id}")
def delete_job(job_id: int, username: str = Depends(require_approved_user)):
    # NOTE: unused `role = get_user_role(username)` dropped - see update_job.

    with get_db_connection() as conn:
        cur = conn.cursor()

        cur.execute("SELECT title, created_by FROM jobs WHERE id = ?", (job_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Job not found")
        job_title, created_by = row

        assert_owns_or_admin(created_by, username)

        cur.execute("DELETE FROM job_candidates WHERE job_id = ?", (job_id,))
        cur.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        conn.commit()

    _log_activity_db(username or "unknown", f"deleted Job Description '{job_title}'")
    return {"message": "Job deleted"}


@router.get("/api/jobs/{job_id}/candidates")
def get_job_candidates(job_id: int, username: str = Depends(require_approved_user)):
    with get_db_connection() as conn:
        conn.row_factory = dict_row_factory
        cur = conn.cursor()

        cur.execute("SELECT created_by FROM jobs WHERE id = ?", (job_id,))
        job_row = cur.fetchone()
        if not job_row:
            raise HTTPException(status_code=404, detail="Job not found")
        job_creator = job_row["created_by"]

        cur.execute("SELECT is_external, is_admin, role, full_name FROM users WHERE LOWER(username) = LOWER(?)", (username,))
        user_row = cur.fetchone()
        is_external = False
        is_user_admin = False
        if user_row:
            is_external = (user_row["is_external"] == 1)
            is_user_admin = (user_row["is_admin"] == 1 or user_row["role"] == "admin" or is_admin_or_hr(username))

        if not is_user_admin:
            if is_external:
                cur.execute("SELECT 1 FROM job_shares WHERE job_id = ? AND LOWER(username) = LOWER(?)", (job_id, username))
                if not cur.fetchone():
                    raise HTTPException(status_code=403, detail="Forbidden")
            else:
                if job_creator and job_creator.lower() != username.lower():
                    raise HTTPException(status_code=403, detail="Forbidden")

        cols_to_select = (
            "c.id, c.filename, c.full_name, c.candidate_status, c.total_experience, c.pega_experience, "
            "c.skills, c.certifications, c.ctc, c.notice_period, c.current_organization, c.email, c.phone, "
            "c.linkedin, c.created_by, c.timestamp, c.source, c.cdh_exp, c.expected_ctc, c.percentage_hike, "
            "c.candidate_interview_status, c.availability_in_days, c.current_location, c.pref_locations, "
            "c.current_client, c.domain, c.tier, c.certification_version, "
            "c.sender_email, c.is_qualified, c.is_approved, c.file_url"
        )
        cur.execute(
            f"""
            SELECT {cols_to_select}, jc.ai_reason, jc.status as job_status
            FROM candidate_metadata c
            JOIN job_candidates jc ON c.id = jc.candidate_id
            WHERE jc.job_id = ?
            """,
            (job_id,),
        )
        candidates = [dict(row) for row in cur.fetchall()]

    for row in candidates:
        row.pop("file_bytes", None)
        for k, v in row.items():
            if v is None:
                row[k] = ""

    if is_external:
        allowed_keys = {"id", "full_name", "ai_reason", "job_status", "candidate_status"}
        for c in candidates:
            for key in list(c.keys()):
                if key not in allowed_keys:
                    c[key] = ""

    is_user_admin_or_hr = is_admin_or_hr(username)
    if not is_user_admin_or_hr:
        for row in candidates:
            row["certifications"] = "[HIDDEN]"

    if not is_admin_or_hr(username):
        keywords = _get_masked_keywords()
        candidates = [_mask_candidate_record(row, keywords) for row in candidates]

    candidates = apply_user_hidden_fields(candidates, username)
    return candidates


@router.get("/api/jobs/{job_id}/unmatched-candidates")
def get_unmatched_candidates(job_id: int, request: Request, username: str = Depends(require_approved_user)):
    with get_db_connection() as conn:
        conn.row_factory = dict_row_factory
        cur = conn.cursor()

        cur.execute("SELECT created_by FROM jobs WHERE id = ?", (job_id,))
        job_row = cur.fetchone()
        if not job_row:
            raise HTTPException(status_code=404, detail="Job not found")
        job_creator = job_row["created_by"]

        cur.execute("SELECT is_external, is_admin, role FROM users WHERE LOWER(username) = LOWER(?)", (username,))
        user_row = cur.fetchone()
        is_external = False
        is_user_admin = False
        if user_row:
            is_external = (user_row["is_external"] == 1)
            is_user_admin = (user_row["is_admin"] == 1 or user_row["role"] == "admin" or is_admin_or_hr(username))

        if not is_user_admin:
            if is_external:
                cur.execute("SELECT 1 FROM job_shares WHERE job_id = ? AND LOWER(username) = LOWER(?)", (job_id, username))
                if not cur.fetchone():
                    raise HTTPException(status_code=403, detail="Forbidden")
            else:
                if job_creator and job_creator.lower() != username.lower():
                    raise HTTPException(status_code=403, detail="Forbidden")

        if is_user_admin:
            cur.execute(
                """
                SELECT * FROM candidate_metadata
                WHERE id NOT IN (
                    SELECT candidate_id FROM job_candidates WHERE job_id = ?
                )
                ORDER BY full_name ASC
                """,
                (job_id,),
            )
        else:
            cur.execute(
                """
                SELECT * FROM candidate_metadata
                WHERE LOWER(created_by) = LOWER(?)
                AND id NOT IN (
                    SELECT candidate_id FROM job_candidates WHERE job_id = ?
                )
                ORDER BY full_name ASC
                """,
                (username, job_id),
            )

        candidates = [dict(row) for row in cur.fetchall()]

    for row in candidates:
        for k, v in row.items():
            if v is None:
                row[k] = ""

    username = request.headers.get("x-user-username")
    is_user_admin_or_hr = is_admin_or_hr(username)
    if not is_user_admin_or_hr:
        for row in candidates:
            row["certifications"] = "[HIDDEN]"

    if not is_admin_or_hr(username):
        keywords = _get_masked_keywords()
        candidates = [_mask_candidate_record(row, keywords) for row in candidates]

    candidates = apply_user_hidden_fields(candidates, username)
    return candidates


@router.post("/api/jobs/{job_id}/candidates/{candidate_id}")
def add_job_candidate(job_id: int, candidate_id: int, username: str = Depends(require_approved_user)):
    # NOTE: unused `role = get_user_role(username)` dropped - see update_job.

    with get_db_connection() as conn:
        cur = conn.cursor()

        cur.execute("SELECT created_by FROM jobs WHERE id = ?", (job_id,))
        job_row = cur.fetchone()
        if not job_row:
            raise HTTPException(status_code=404, detail="Job not found")
        job_creator = job_row[0]

        assert_owns_or_admin(job_creator, username)

        cur.execute("SELECT 1 FROM job_candidates WHERE job_id = ? AND candidate_id = ?", (job_id, candidate_id))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="Candidate is already matched to this job.")

        cur.execute(
            """
            INSERT INTO job_candidates (job_id, candidate_id, ai_reason, status)
            VALUES (?, ?, 'Manually associated by recruiter.', 'matched')
            """,
            (job_id, candidate_id),
        )

        cur.execute("SELECT full_name FROM candidate_metadata WHERE id = ?", (candidate_id,))
        cand_row = cur.fetchone()
        cand_name = cand_row[0] if cand_row else f"ID {candidate_id}"

        cur.execute("SELECT title FROM jobs WHERE id = ?", (job_id,))
        job_row = cur.fetchone()
        job_title = job_row[0] if job_row else f"ID {job_id}"

        conn.commit()

    try:
        _log_activity_db("recruiter", f"manually matched candidate '{cand_name}' to job '{job_title}'")
    except Exception as e:
        logger.error("Failed to log activity: %s", e)

    return {"message": "Candidate associated with job successfully"}


@router.put("/api/jobs/{job_id}/candidates/{candidate_id}")
def update_job_candidate_status(
    job_id: int,
    candidate_id: int,
    update: JobStatusUpdate,
    username: str = Depends(require_approved_user),
):
    # NOTE: unused `role = get_user_role(username)` dropped - see update_job.

    with get_db_connection() as conn:
        cur = conn.cursor()

        cur.execute("SELECT created_by FROM jobs WHERE id = ?", (job_id,))
        job_row = cur.fetchone()
        if not job_row:
            raise HTTPException(status_code=404, detail="Job not found")
        job_creator = job_row[0]

        assert_owns_or_admin(job_creator, username)

        if update.status is not None:
            if update.status not in ["matched", "selected"]:
                raise HTTPException(status_code=400, detail="Invalid status")
            cur.execute("UPDATE job_candidates SET status = ? WHERE job_id = ? AND candidate_id = ?", (update.status, job_id, candidate_id))

        if update.ai_reason is not None:
            cur.execute("UPDATE job_candidates SET ai_reason = ? WHERE job_id = ? AND candidate_id = ?", (update.ai_reason, job_id, candidate_id))

        conn.commit()

    return {"message": "Status updated"}


@router.delete("/api/jobs/{job_id}/candidates/{candidate_id}")
def delete_job_candidate(job_id: int, candidate_id: int, username: str = Depends(require_approved_user)):
    # NOTE: unused `role = get_user_role(username)` dropped - see update_job.

    with get_db_connection() as conn:
        cur = conn.cursor()

        cur.execute("SELECT created_by FROM jobs WHERE id = ?", (job_id,))
        job_row = cur.fetchone()
        if not job_row:
            raise HTTPException(status_code=404, detail="Job not found")
        job_creator = job_row[0]

        assert_owns_or_admin(job_creator, username)

        cur.execute("DELETE FROM job_candidates WHERE job_id = ? AND candidate_id = ?", (job_id, candidate_id))
        conn.commit()

    return {"message": "Candidate removed from job"}


# ── Job sharing ──────────────────────────────────────────────────────────────

@router.post("/api/jobs/{job_id}/share")
def share_job(job_id: int, req: JobShareRequest, username: str = Depends(require_approved_user)):
    if not is_admin_or_hr(username):
        raise HTTPException(status_code=403, detail="Forbidden")

    with get_db_connection() as conn:
        cur = conn.cursor()

        cur.execute("SELECT created_by FROM jobs WHERE id = ?", (job_id,))
        job_row = cur.fetchone()
        if not job_row:
            raise HTTPException(status_code=404, detail="Job not found")

        created_by = job_row[0]
        role = get_user_role(username)
        if role != "admin":
            if created_by and created_by.lower() != username.lower():
                raise HTTPException(status_code=403, detail="Forbidden")

        cur.execute("SELECT 1 FROM jobs WHERE id = ?", (job_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Job not found")

        cur.execute("DELETE FROM job_shares WHERE job_id = ?", (job_id,))
        for u in req.usernames:
            cur.execute("INSERT INTO job_shares (job_id, username) VALUES (?, ?)", (job_id, u))

        conn.commit()

    job_title = _get_job_title(job_id)
    _log_activity_db(username or "unknown", f"shared Job Description '{job_title}' with {len(req.usernames)} external users")

    return {"status": "shared"}


@router.get("/api/jobs/{job_id}/shares")
def get_job_shares(job_id: int, username: str = Depends(require_approved_user)):
    if not is_admin_or_hr(username):
        raise HTTPException(status_code=403, detail="Forbidden")

    with get_db_connection() as conn:
        cur = conn.cursor()

        cur.execute("SELECT created_by FROM jobs WHERE id = ?", (job_id,))
        job_row = cur.fetchone()
        if not job_row:
            raise HTTPException(status_code=404, detail="Job not found")

        created_by = job_row[0]
        role = get_user_role(username)
        if role != "admin":
            if created_by and created_by.lower() != username.lower():
                raise HTTPException(status_code=403, detail="Forbidden")

        cur.execute("SELECT username FROM job_shares WHERE job_id = ?", (job_id,))
        rows = cur.fetchall()

    return [r[0] for r in rows]
