"""Admin endpoints: change-request queue, user management, masked keywords.

Approving a change request dispatches on its ``action_type`` through the
``ACTION_HANDLERS`` registry (one small handler per action).
"""
import json
from typing import Callable, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import UPLOAD_DIR
from app.core.logging import get_logger
from app.core.responses import EnvelopeRoute
from app.db.engine import get_session
from app.models import MATCH_RELATED_FIELDS, Job
from app.repositories import (
    ActivityRepository,
    CandidateRepository,
    ChangeRequestRepository,
    JobCandidateRepository,
    JobRepository,
    MaskedKeywordRepository,
    TeamMemberRepository,
    UserRepository,
)
from app.services import columns as column_service
from app.services import vector_store
from app.services.auth import get_user_role, invalidate_user_cache, is_admin_or_hr, is_user_approved
from app.services.matching import match_candidate_to_all_jobs, match_candidates_for_job

import os

logger = get_logger(__name__)

router = APIRouter(route_class=EnvelopeRoute)

_PENDING_MESSAGE = "Access denied. Your account is pending admin approval."


# ── schemas ────────────────────────────────────────────────────────────────
class UserPermissionsUpdate(BaseModel):
    is_hr: int
    is_admin: int
    is_external: Optional[int] = 0
    hidden_fields: Optional[str] = ""
    is_approved: Optional[int] = None


class MaskedKeywordCreate(BaseModel):
    keyword: str


class ChangeRequestReject(BaseModel):
    reason: Optional[str] = None


# ── guards ─────────────────────────────────────────────────────────────────
def _require_admin(request: Request) -> str:
    username = request.headers.get("x-user-username")
    if not is_user_approved(username):
        raise HTTPException(status_code=403, detail=_PENDING_MESSAGE)
    if get_user_role(username) != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    return username


def _require_staff(request: Request) -> str:
    username = request.headers.get("x-user-username")
    if not is_user_approved(username):
        raise HTTPException(status_code=403, detail=_PENDING_MESSAGE)
    if not is_admin_or_hr(username):
        raise HTTPException(status_code=403, detail="Forbidden")
    return username


def _model_dict(model, *fields) -> dict:
    return {name: getattr(model, name) for name in fields}


# ── change requests ────────────────────────────────────────────────────────
@router.get("/api/admin/requests")
def list_change_requests(request: Request, session: Session = Depends(get_session)):
    _require_admin(request)
    fields = ("id", "username", "action_type", "target_id", "payload", "description",
              "status", "rejection_reason", "created_at")
    return [_model_dict(r, *fields) for r in ChangeRequestRepository(session).list_recent_first()]


def _approve_add_column(session, target_id, payload, background):
    data = json.loads(payload)
    try:
        column_service.add_custom_column(session, data["col_key"], data["col_label"], data.get("description", ""))
    except column_service.ColumnExistsError:
        pass  # already present: approving is idempotent


def _approve_delete_column(session, target_id, payload, background):
    column_service.remove_custom_column(session, target_id)


def _approve_update_candidate(session, target_id, payload, background):
    candidate_id = int(target_id)
    repo = CandidateRepository(session)
    valid = repo.column_names
    updates = {k: v for k, v in json.loads(payload).items() if k in valid and k != "id"}
    if not updates:
        return
    repo.update(candidate_id, updates)
    if MATCH_RELATED_FIELDS & set(updates):
        background.add_task(match_candidate_to_all_jobs, candidate_id)


def _approve_delete_candidate(session, target_id, payload, background):
    CandidateRepository(session).delete(int(target_id))


def _approve_resume(session, target_id, payload, background):
    candidate_id = int(target_id)
    CandidateRepository(session).update(candidate_id, {"is_approved": 1})
    background.add_task(match_candidate_to_all_jobs, candidate_id)


def _approve_create_job(session, target_id, payload, background):
    data = json.loads(payload)
    job = JobRepository(session).add(Job(title=data["title"], description=data["description"]))
    background.add_task(match_candidates_for_job, job.id)


def _approve_update_job(session, target_id, payload, background):
    job_id = int(target_id)
    data = json.loads(payload)
    job = JobRepository(session).get(job_id)
    if job is not None:
        job.title, job.description = data["title"], data["description"]
    background.add_task(match_candidates_for_job, job_id)


def _approve_delete_job(session, target_id, payload, background):
    JobRepository(session).delete(int(target_id))


def _approve_update_job_candidate(session, target_id, payload, background):
    job_id, candidate_id = map(int, target_id.split(":"))
    data = json.loads(payload)
    links = JobCandidateRepository(session)
    if data.get("status") is not None:
        links.set_status(job_id, candidate_id, data["status"])
    if data.get("ai_reason") is not None:
        links.set_reason(job_id, candidate_id, data["ai_reason"])


def _approve_delete_job_candidate(session, target_id, payload, background):
    job_id, candidate_id = map(int, target_id.split(":"))
    JobCandidateRepository(session).remove(job_id, candidate_id)


def _approve_match_job(session, target_id, payload, background):
    background.add_task(match_candidates_for_job, int(target_id))


def _approve_reset_all(session, target_id, payload, background):
    CandidateRepository(session).delete_all()
    vector_store.delete_collection()


def _approve_approve_user(session, target_id, payload, background):
    user = UserRepository(session).get_by_username(target_id)
    if user is not None:
        user.is_approved = 1
    invalidate_user_cache(target_id)


ACTION_HANDLERS: dict[str, Callable] = {
    "add_column": _approve_add_column,
    "delete_column": _approve_delete_column,
    "update_candidate": _approve_update_candidate,
    "delete_candidate": _approve_delete_candidate,
    "approve_resume": _approve_resume,
    "create_job": _approve_create_job,
    "update_job": _approve_update_job,
    "delete_job": _approve_delete_job,
    "update_job_candidate": _approve_update_job_candidate,
    "delete_job_candidate": _approve_delete_job_candidate,
    "match_job": _approve_match_job,
    "reset_all": _approve_reset_all,
    "approve_user": _approve_approve_user,
}


@router.post("/api/admin/requests/{request_id}/approve")
def approve_change_request(
    request_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    _require_admin(request)
    requests = ChangeRequestRepository(session)
    change = requests.get(request_id)
    if change is None:
        raise HTTPException(status_code=404, detail="Request not found")
    if change.status != "pending":
        raise HTTPException(status_code=400, detail="Request is already resolved")

    handler = ACTION_HANDLERS.get(change.action_type)
    if handler is None:
        raise HTTPException(status_code=400, detail=f"Unknown action_type: {change.action_type}")

    try:
        handler(session, change.target_id, change.payload, background_tasks)
        change.status = "approved"
        session.flush()
        session.commit()  # background tasks started by the handler must see the result
    except HTTPException:
        session.rollback()
        raise
    except Exception as exc:
        session.rollback()
        logger.exception("Executing change request %s failed", request_id)
        raise HTTPException(status_code=500, detail=f"Failed to execute request: {exc}")
    return {"status": "approved"}


@router.post("/api/admin/requests/{request_id}/reject")
def reject_change_request(
    request_id: int,
    request: Request,
    body: Optional[ChangeRequestReject] = None,
    session: Session = Depends(get_session),
):
    _require_admin(request)
    change = ChangeRequestRepository(session).get(request_id)
    if change is None:
        raise HTTPException(status_code=404, detail="Request not found")
    if change.status != "pending":
        raise HTTPException(status_code=400, detail="Request is already resolved")

    if change.action_type == "approve_user" and change.target_id:
        UserRepository(session).delete_by_username(change.target_id)
        invalidate_user_cache(change.target_id)
    change.status = "rejected"
    change.rejection_reason = (body.reason if body else None) or None
    return {"status": "rejected"}


# ── users ──────────────────────────────────────────────────────────────────
@router.get("/api/admin/users")
def list_users(request: Request, session: Session = Depends(get_session)):
    _require_staff(request)
    fields = ("id", "full_name", "username", "role", "is_hr", "is_admin", "is_external",
              "hidden_fields", "is_approved", "email")
    return [_model_dict(u, *fields) for u in UserRepository(session).list_all()]


@router.put("/api/admin/users/{user_id}/permissions")
def update_user_permissions(
    user_id: int, body: UserPermissionsUpdate, request: Request, session: Session = Depends(get_session)
):
    _require_admin(request)
    user = UserRepository(session).get_by_id(user_id)
    if user is not None:
        is_external = body.is_external if body.is_external is not None else 0
        is_hr, is_admin = body.is_hr, body.is_admin
        if is_external == 1:
            is_hr = is_admin = 0
        user.is_hr, user.is_admin, user.is_external = is_hr, is_admin, is_external
        user.role = "admin" if is_admin == 1 else "user"
        user.hidden_fields = body.hidden_fields if body.hidden_fields is not None else ""
        if body.is_approved is not None:
            user.is_approved = body.is_approved
        invalidate_user_cache(user.username)
    return {"status": "updated"}


@router.delete("/api/admin/users/{user_id}")
def delete_user(user_id: int, request: Request, session: Session = Depends(get_session)):
    acting = _require_admin(request)
    users = UserRepository(session)
    user = users.get_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    username, full_name = user.username, user.full_name
    if username.lower() == acting.lower():
        raise HTTPException(status_code=400, detail="You cannot delete yourself.")

    jobs = JobRepository(session)
    candidates = CandidateRepository(session)

    ChangeRequestRepository(session).delete_involving_user(username)
    jobs.delete_shares_for_user(username)
    TeamMemberRepository(session).delete_by_names(full_name or "", username)
    ActivityRepository(session).delete_for_user(username)

    owned = candidates.identity_rows(username)
    for row in candidates.all_rows(username):
        if row.get("filename"):
            path = os.path.join(UPLOAD_DIR, row["filename"])
            try:
                if os.path.exists(path):
                    os.remove(path)
            except OSError as exc:
                logger.error("Error removing resume file %s: %s", path, exc)
    candidates.delete_many(r["id"] for r in owned)
    jobs.delete_many(jobs.ids_created_by(username))

    users.delete(user)
    invalidate_user_cache(username)
    ActivityRepository(session).add(acting, f"completely deleted user '{username}' from system")
    return {"status": "deleted"}


# ── masked keywords ────────────────────────────────────────────────────────
@router.get("/api/admin/masked-keywords")
def list_masked_keywords(request: Request, session: Session = Depends(get_session)):
    _require_admin(request)
    return MaskedKeywordRepository(session).list_all()


@router.post("/api/admin/masked-keywords")
def add_masked_keyword(req: MaskedKeywordCreate, request: Request, session: Session = Depends(get_session)):
    username = _require_admin(request)
    keyword = req.keyword.strip()
    if not keyword:
        raise HTTPException(status_code=400, detail="Keyword cannot be empty")
    MaskedKeywordRepository(session).add(keyword)
    ActivityRepository(session).add(username, f"added masked keyword '{keyword}'")
    return {"status": "added", "keyword": keyword}


@router.delete("/api/admin/masked-keywords/{keyword}")
def delete_masked_keyword(keyword: str, request: Request, session: Session = Depends(get_session)):
    username = _require_admin(request)
    keyword = keyword.strip()
    MaskedKeywordRepository(session).remove(keyword)
    ActivityRepository(session).add(username, f"deleted masked keyword '{keyword}'")
    return {"status": "deleted", "keyword": keyword}
