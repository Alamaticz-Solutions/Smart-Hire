"""Job CRUD, job-to-candidate association and job-sharing routes.

AI matching (triggered on create/update and via ``/api/jobs/{id}/match``)
lives in ``app.services.matching`` / ``app.routers.matching``.
"""
from __future__ import annotations

import re
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.core.responses import EnvelopeRoute
from app.db.engine import get_session
from app.dependencies import assert_owns_or_admin, require_approved_user
from app.models import Job
from app.repositories import (
    VALID_LINK_STATUSES,
    ActivityRepository,
    CandidateRepository,
    JobCandidateRepository,
    JobRepository,
    MaskedKeywordRepository,
    UserRepository,
)
from app.services.auth import apply_user_hidden_fields, get_user_info, get_user_role, is_admin_or_hr, is_user_approved
from app.services.matching import match_candidates_for_job

router = APIRouter(route_class=EnvelopeRoute)
logger = get_logger(__name__)

HIDDEN = "[HIDDEN]"
MANUAL_REASON = "Manually associated by recruiter."
EXTERNAL_VISIBLE_KEYS = {"id", "full_name", "ai_reason", "job_status", "candidate_status"}


# ── schemas ────────────────────────────────────────────────────────────────
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


# ── helpers ────────────────────────────────────────────────────────────────
def _run_matching_task(job_id: int) -> None:
    """Background wrapper that logs (instead of losing) matching failures."""
    try:
        match_candidates_for_job(job_id)
    except Exception as exc:
        logger.error("Error matching candidates for job %s: %s", job_id, exc)


_PATTERNS: dict[str, re.Pattern] = {}


def _mask_rows(rows: list[dict], keywords: list[str]) -> list[dict]:
    def mask(value):
        if not isinstance(value, str) or not value:
            return value
        for keyword in keywords:
            keyword = keyword.strip()
            if not keyword:
                continue
            pattern = _PATTERNS.setdefault(keyword, re.compile(re.escape(keyword), re.IGNORECASE))
            value = pattern.sub("****", value)
        return value

    return [{k: mask(v) for k, v in row.items()} for row in rows]


def _job_dict(job: Job, counts: dict, shares: list[str]) -> dict:
    data = {c.name: getattr(job, c.name) for c in Job.__table__.columns}
    data["matched_count"] = counts.get("matched", 0)
    data["selected_count"] = counts.get("selected", 0)
    data["shared_with"] = shares
    return data


def _present_job(session: Session, job: Job) -> dict:
    repo = JobRepository(session)
    counts = repo.link_counts([job.id]).get(job.id, {})
    return _job_dict(job, counts, repo.shares_for([job.id]).get(job.id, []))


def _get_job_or_404(session: Session, job_id: int) -> Job:
    job = JobRepository(session).get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


def _viewer(username: Optional[str]) -> tuple[bool, bool]:
    """``(sees_everything, is_external)`` for ``username``."""
    info = get_user_info(username) if username else None
    if not info:
        return False, False
    external = info["is_external"] == 1
    sees_all = info["is_admin"] == 1 or info["role"] == "admin" or is_admin_or_hr(username)
    return sees_all, external


def _require_view_access(session: Session, job: Job, username: str, sees_all: bool, external: bool) -> None:
    if sees_all:
        return
    if external:
        if not JobRepository(session).is_shared_with(job.id, username):
            raise HTTPException(status_code=403, detail="Forbidden")
    elif job.created_by and job.created_by.lower() != username.lower():
        raise HTTPException(status_code=403, detail="Forbidden")


def _apply_privacy(rows: list[dict], username: str, session: Session) -> list[dict]:
    if not is_admin_or_hr(username):
        for row in rows:
            row["certifications"] = HIDDEN
        rows = _mask_rows(rows, MaskedKeywordRepository(session).list_all())
    return apply_user_hidden_fields(rows, username)


def _blank_nulls(rows: list[dict]) -> None:
    for row in rows:
        for key, value in row.items():
            if value is None:
                row[key] = ""


# ── jobs ───────────────────────────────────────────────────────────────────
@router.get("/api/jobs")
def list_jobs(request: Request, session: Session = Depends(get_session)):
    username = request.headers.get("x-user-username")
    if not is_user_approved(username):
        return []

    sees_all, external = _viewer(username)
    repo = JobRepository(session)
    if external:
        jobs = repo.list_shared_with(username)
    elif sees_all:
        jobs = repo.list_all()
    else:
        jobs = repo.list_by_owner(username)

    ids = [job.id for job in jobs]
    counts, shares = repo.link_counts(ids), repo.shares_for(ids)
    return [_job_dict(job, counts.get(job.id, {}), shares.get(job.id, [])) for job in jobs]


@router.post("/api/jobs")
def create_job(
    job: JobCreate,
    background_tasks: BackgroundTasks,
    username: str = Depends(require_approved_user),
    session: Session = Depends(get_session),
):
    created = JobRepository(session).add(Job(**job.model_dump(), created_by=username))
    ActivityRepository(session).add(username or "unknown", f"posted a Job Description for '{job.title}'")
    result = _present_job(session, created)
    session.commit()  # the matching task needs the committed job row
    background_tasks.add_task(_run_matching_task, created.id)
    return result


@router.put("/api/jobs/{job_id}")
def update_job(
    job_id: int,
    job: JobCreate,
    background_tasks: BackgroundTasks,
    username: str = Depends(require_approved_user),
    session: Session = Depends(get_session),
):
    existing = _get_job_or_404(session, job_id)
    assert_owns_or_admin(existing.created_by, username)
    for field, value in job.model_dump().items():
        setattr(existing, field, value)
    session.flush()
    result = _present_job(session, existing)
    session.commit()
    background_tasks.add_task(_run_matching_task, job_id)
    return result


@router.delete("/api/jobs/{job_id}")
def delete_job(job_id: int, username: str = Depends(require_approved_user), session: Session = Depends(get_session)):
    job = _get_job_or_404(session, job_id)
    assert_owns_or_admin(job.created_by, username)
    title = job.title
    JobRepository(session).delete(job_id)
    ActivityRepository(session).add(username or "unknown", f"deleted Job Description '{title}'")
    return {"message": "Job deleted"}


# ── candidates of a job ────────────────────────────────────────────────────
@router.get("/api/jobs/{job_id}/candidates")
def get_job_candidates(job_id: int, username: str = Depends(require_approved_user), session: Session = Depends(get_session)):
    job = _get_job_or_404(session, job_id)
    sees_all, external = _viewer(username)
    _require_view_access(session, job, username, sees_all, external)

    rows = CandidateRepository(session).list_for_job(job_id)
    for row in rows:
        row.pop("file_bytes", None)
    _blank_nulls(rows)

    if external:
        for row in rows:
            for key in list(row):
                if key not in EXTERNAL_VISIBLE_KEYS:
                    row[key] = ""
    return _apply_privacy(rows, username, session)


@router.get("/api/jobs/{job_id}/unmatched-candidates")
def get_unmatched_candidates(
    job_id: int, username: str = Depends(require_approved_user), session: Session = Depends(get_session)
):
    job = _get_job_or_404(session, job_id)
    sees_all, external = _viewer(username)
    _require_view_access(session, job, username, sees_all, external)

    rows = CandidateRepository(session).list_unmatched_for_job(job_id, None if sees_all else username)
    for row in rows:
        row.pop("file_bytes", None)  # never serialise binary résumés
    _blank_nulls(rows)
    return _apply_privacy(rows, username, session)


@router.post("/api/jobs/{job_id}/candidates/{candidate_id}")
def add_job_candidate(
    job_id: int, candidate_id: int, username: str = Depends(require_approved_user), session: Session = Depends(get_session)
):
    job = _get_job_or_404(session, job_id)
    assert_owns_or_admin(job.created_by, username)

    links = JobCandidateRepository(session)
    if links.exists(job_id, candidate_id):
        raise HTTPException(status_code=400, detail="Candidate is already matched to this job.")
    links.add(job_id, candidate_id, MANUAL_REASON)

    name = CandidateRepository(session).get_name(candidate_id)
    ActivityRepository(session).add(username or "unknown", f"manually matched candidate '{name}' to job '{job.title}'")
    return {"message": "Candidate associated with job successfully"}


@router.put("/api/jobs/{job_id}/candidates/{candidate_id}")
def update_job_candidate_status(
    job_id: int,
    candidate_id: int,
    update: JobStatusUpdate,
    username: str = Depends(require_approved_user),
    session: Session = Depends(get_session),
):
    job = _get_job_or_404(session, job_id)
    assert_owns_or_admin(job.created_by, username)

    links = JobCandidateRepository(session)
    if update.status is not None:
        if update.status not in VALID_LINK_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        links.set_status(job_id, candidate_id, update.status)
    if update.ai_reason is not None:
        links.set_reason(job_id, candidate_id, update.ai_reason)
    return {"message": "Status updated"}


@router.delete("/api/jobs/{job_id}/candidates/{candidate_id}")
def delete_job_candidate(
    job_id: int, candidate_id: int, username: str = Depends(require_approved_user), session: Session = Depends(get_session)
):
    job = _get_job_or_404(session, job_id)
    assert_owns_or_admin(job.created_by, username)
    JobCandidateRepository(session).remove(job_id, candidate_id)
    return {"message": "Candidate removed from job"}


# ── sharing ────────────────────────────────────────────────────────────────
def _require_job_manager(username: str, job: Job) -> None:
    if get_user_role(username) != "admin" and job.created_by and job.created_by.lower() != username.lower():
        raise HTTPException(status_code=403, detail="Forbidden")


@router.post("/api/jobs/{job_id}/share")
def share_job(
    job_id: int, req: JobShareRequest, username: str = Depends(require_approved_user), session: Session = Depends(get_session)
):
    if not is_admin_or_hr(username):
        raise HTTPException(status_code=403, detail="Forbidden")
    job = _get_job_or_404(session, job_id)
    _require_job_manager(username, job)

    users = UserRepository(session)
    valid = []
    for name in req.usernames:
        user = users.get_by_username(name)
        if user is not None:
            valid.append(user.username)  # canonical casing (FK to users.username)
        else:
            logger.warning("share_job: skipping unknown username %r for job %s", name, job_id)

    JobRepository(session).replace_shares(job_id, valid)
    ActivityRepository(session).add(
        username or "unknown", f"shared Job Description '{job.title}' with {len(valid)} external users"
    )
    return {"status": "shared"}


@router.get("/api/jobs/{job_id}/shares")
def get_job_shares(job_id: int, username: str = Depends(require_approved_user), session: Session = Depends(get_session)):
    if not is_admin_or_hr(username):
        raise HTTPException(status_code=403, detail="Forbidden")
    job = _get_job_or_404(session, job_id)
    _require_job_manager(username, job)
    return JobRepository(session).shares_for([job_id]).get(job_id, [])
