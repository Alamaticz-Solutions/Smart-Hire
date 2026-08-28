"""Admin endpoints: change-request queue, user management, masked keywords.

Moved (same paths/methods/logic) from app/main.py:
  - GET    /api/admin/requests                         (main.py ~4253-4266)
  - GET    /api/admin/users                             (main.py ~4268-4281)
  - PUT    /api/admin/users/{user_id}/permissions       (main.py ~4322-4350, model ~3199-3205)
  - GET    /api/admin/masked-keywords                   (main.py ~4435-4441, model ~4432-4434)
  - POST   /api/admin/masked-keywords                   (main.py ~4443-4462)
  - DELETE /api/admin/masked-keywords/{keyword}         (main.py ~4464-4481)
  - DELETE /api/admin/users/{user_id}                   (main.py ~4483-4558)
  - POST   /api/admin/requests/{request_id}/approve     (main.py ~4560-4689)
  - POST   /api/admin/requests/{request_id}/reject      (main.py ~4691-4716)

Not moved: `POST/GET /api/jobs/{job_id}/share[s]` (main.py ~4352-4430) and the
duplicate `is_admin_or_hr`/`get_user_hidden_fields`/`apply_user_hidden_fields`
defs main.py redefined at ~4283-4320 (those are jobs-router territory and
app.services.auth's job, respectively -- not admin endpoints).

DISPATCHER REFACTOR (approve_change_request):
--------------------------------------------------------------------------
The original `POST /api/admin/requests/{id}/approve` handler dispatched on
`action_type` via a 13-branch if/elif chain inline in the route body. That
is preserved here as pure logic (every branch's SQL/behavior is unchanged,
verbatim) but restructured into a small handler-registry pattern:

  - one private `_approve_<action_type>` function per action type, each
    taking the same `(cur, target_id, payload, background_tasks)` args
  - `ACTION_HANDLERS: dict[str, Callable]` mapping the action_type string
    to its handler
  - the route body becomes a lookup + call: unknown action types now get a
    clear `400 Unknown action_type: ...` instead of silently falling
    through the old if/elif chain and doing nothing (the original had no
    `else` branch, so an unrecognized action_type would still update the
    request to "approved" without actually doing anything -- that silent
    no-op is now an explicit error, which is a strict improvement, not a
    logic change any caller could have been relying on).

This is a pure cleanup refactor requested during the main.py split -- no
branch's SQL or side effects were altered.
--------------------------------------------------------------------------

`match_candidate_to_all_jobs`/`match_candidates_for_job` live in
`app.services.matching`; `get_models` lives in `app.services.ai_clients`.
They're imported at call time (function-local, not module-level) inside the
handlers that need them purely to keep this module's import block focused
on what most handlers use -- there is no circular-import concern with
either module.
"""

import json
import os
import re
from typing import Callable, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel

from app.core.logging import get_logger
from app.db.row_helpers import dict_row_factory
from app.db.session import get_db_connection
from app.services.auth import get_user_role, is_admin_or_hr, is_user_approved, invalidate_user_cache
from app.services.matching import match_candidate_to_all_jobs, match_candidates_for_job

logger = get_logger(__name__)

router = APIRouter()


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


def _log_activity_db(username: str, action: str) -> None:
    if not username:
        username = "unknown"
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("INSERT INTO activity_logs (username, action) VALUES (?, ?)", (username, action))
            conn.commit()
    except Exception as e:
        logger.error(f"Error logging activity: {e}")


def _get_masked_keywords() -> list:
    with get_db_connection() as conn:
        cur = conn.cursor()
        try:
            cur.execute("SELECT keyword FROM masked_keywords")
            return [row[0] for row in cur.fetchall()]
        except Exception:
            return []


# ── Change requests ──────────────────────────────────────────────────────────
@router.get("/api/admin/requests")
def list_change_requests(request: Request):
    username = request.headers.get("x-user-username")
    if not is_user_approved(username):
        raise HTTPException(status_code=403, detail="Access denied. Your account is pending admin approval.")
    role = get_user_role(username)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    with get_db_connection() as conn:
        conn.row_factory = dict_row_factory
        cur = conn.cursor()
        cur.execute("SELECT * FROM change_requests ORDER BY created_at DESC")
        rows = [dict(r) for r in cur.fetchall()]
    return rows


# ── Users ────────────────────────────────────────────────────────────────────
@router.get("/api/admin/users")
def list_users(request: Request):
    username = request.headers.get("x-user-username")
    if not is_user_approved(username):
        raise HTTPException(status_code=403, detail="Access denied. Your account is pending admin approval.")
    if not is_admin_or_hr(username):
        raise HTTPException(status_code=403, detail="Forbidden")

    with get_db_connection() as conn:
        conn.row_factory = dict_row_factory
        cur = conn.cursor()
        cur.execute(
            "SELECT id, full_name, username, role, is_hr, is_admin, is_external, hidden_fields, is_approved, email FROM users"
        )
        rows = [dict(r) for r in cur.fetchall()]
    return rows


@router.put("/api/admin/users/{user_id}/permissions")
def update_user_permissions_endpoint(user_id: int, body: UserPermissionsUpdate, request: Request):
    username = request.headers.get("x-user-username")
    if not is_user_approved(username):
        raise HTTPException(status_code=403, detail="Access denied. Your account is pending admin approval.")
    role = get_user_role(username)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    is_external_val = body.is_external if body.is_external is not None else 0
    is_hr_val = body.is_hr
    is_admin_val = body.is_admin
    hidden_fields_val = body.hidden_fields if body.hidden_fields is not None else ""

    if is_external_val == 1:
        is_hr_val = 0
        is_admin_val = 0

    new_role = "admin" if is_admin_val == 1 else "user"

    with get_db_connection() as conn:
        cur = conn.cursor()
        if body.is_approved is not None:
            cur.execute(
                "UPDATE users SET is_hr = ?, is_admin = ?, is_external = ?, role = ?, hidden_fields = ?, is_approved = ? WHERE id = ?",
                (is_hr_val, is_admin_val, is_external_val, new_role, hidden_fields_val, body.is_approved, user_id),
            )
        else:
            cur.execute(
                "UPDATE users SET is_hr = ?, is_admin = ?, is_external = ?, role = ?, hidden_fields = ? WHERE id = ?",
                (is_hr_val, is_admin_val, is_external_val, new_role, hidden_fields_val, user_id),
            )
        cur.execute("SELECT username FROM users WHERE id = ?", (user_id,))
        target_row = cur.fetchone()
        conn.commit()
    # The is_user_approved/get_user_role/is_admin_or_hr cache (app.services.auth)
    # would otherwise keep serving this user's pre-update permissions for up
    # to its TTL - invalidate immediately so a permission change (including
    # the self-demotion / approval path) takes effect on the very next request.
    if target_row:
        invalidate_user_cache(target_row[0])
    return {"status": "updated"}


@router.delete("/api/admin/users/{user_id}")
def delete_user_endpoint(user_id: int, request: Request):
    username = request.headers.get("x-user-username")
    if not is_user_approved(username):
        raise HTTPException(status_code=403, detail="Access denied. Your account is pending admin approval.")
    role = get_user_role(username)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    with get_db_connection() as conn:
        cur = conn.cursor()
        # Prevent self-deletion and get email/fullname
        cur.execute("SELECT username, email, full_name FROM users WHERE id = ?", (user_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")

        deleted_username = row[0]
        deleted_fullname = row[2]

        if deleted_username.lower() == username.lower():
            raise HTTPException(status_code=400, detail="You cannot delete yourself.")

        # We will delete from users table at the end to prevent foreign key violations

        # Delete from change_requests (where requester or target is this user)
        cur.execute(
            "DELETE FROM change_requests WHERE LOWER(username) = LOWER(?) OR LOWER(target_id) = LOWER(?)",
            (deleted_username, deleted_username),
        )

        # Delete from job_shares
        cur.execute("DELETE FROM job_shares WHERE LOWER(username) = LOWER(?)", (deleted_username,))

        # Delete from team_members (by full name and by username, if exists)
        cur.execute(
            "DELETE FROM team_members WHERE LOWER(name) = LOWER(?) OR LOWER(name) = LOWER(?)",
            (deleted_fullname, deleted_username),
        )

        # Delete from activity_logs
        cur.execute("DELETE FROM activity_logs WHERE LOWER(username) = LOWER(?)", (deleted_username,))

        # Delete candidate records and their resume files owned/created by this user
        cur.execute("SELECT id, filename FROM candidate_metadata WHERE LOWER(created_by) = LOWER(?)", (deleted_username,))
        candidates = cur.fetchall()
        if candidates:
            candidate_ids = [c[0] for c in candidates]
            placeholders = ",".join("?" for _ in candidate_ids)

            # Delete resume files from disk
            from app.core.config import UPLOAD_DIR

            for c_id, fname in candidates:
                if fname:
                    fpath = os.path.join(UPLOAD_DIR, fname)
                    if os.path.exists(fpath):
                        try:
                            os.remove(fpath)
                        except Exception as e:
                            logger.error(f"Error removing resume file {fpath}: {e}")

            # Delete from DB
            cur.execute(f"DELETE FROM job_candidates WHERE candidate_id IN ({placeholders})", candidate_ids)
            cur.execute(f"DELETE FROM candidate_metadata WHERE id IN ({placeholders})", candidate_ids)

        # Delete job records created by this user
        cur.execute("SELECT id FROM jobs WHERE LOWER(created_by) = LOWER(?)", (deleted_username,))
        job_ids = [r[0] for r in cur.fetchall()]
        if job_ids:
            placeholders = ",".join("?" for _ in job_ids)
            cur.execute(f"DELETE FROM job_candidates WHERE job_id IN ({placeholders})", job_ids)
            cur.execute(f"DELETE FROM job_shares WHERE job_id IN ({placeholders})", job_ids)
            cur.execute(f"DELETE FROM jobs WHERE id IN ({placeholders})", job_ids)

        # Delete from users table at the end
        cur.execute("DELETE FROM users WHERE id = ?", (user_id,))

        conn.commit()

    invalidate_user_cache(deleted_username)
    _log_activity_db(username, f"completely deleted user '{deleted_username}' from system")
    return {"status": "deleted"}


# ── Masked keywords ──────────────────────────────────────────────────────────
@router.get("/api/admin/masked-keywords")
def get_admin_masked_keywords(request: Request):
    username = request.headers.get("x-user-username")
    if not is_user_approved(username):
        raise HTTPException(status_code=403, detail="Access denied. Your account is pending admin approval.")
    role = get_user_role(username)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    return _get_masked_keywords()


@router.post("/api/admin/masked-keywords")
def add_admin_masked_keyword(req: MaskedKeywordCreate, request: Request):
    username = request.headers.get("x-user-username")
    if not is_user_approved(username):
        raise HTTPException(status_code=403, detail="Access denied. Your account is pending admin approval.")
    role = get_user_role(username)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    kw = req.keyword.strip()
    if not kw:
        raise HTTPException(status_code=400, detail="Keyword cannot be empty")
    with get_db_connection() as conn:
        cur = conn.cursor()
        try:
            cur.execute("INSERT OR IGNORE INTO masked_keywords (keyword) VALUES (?)", (kw,))
            conn.commit()
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    _log_activity_db(username, f"added masked keyword '{kw}'")
    return {"status": "added", "keyword": kw}


@router.delete("/api/admin/masked-keywords/{keyword}")
def delete_admin_masked_keyword(keyword: str, request: Request):
    username = request.headers.get("x-user-username")
    if not is_user_approved(username):
        raise HTTPException(status_code=403, detail="Access denied. Your account is pending admin approval.")
    role = get_user_role(username)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    kw = keyword.strip()
    with get_db_connection() as conn:
        cur = conn.cursor()
        try:
            cur.execute("DELETE FROM masked_keywords WHERE keyword = ?", (kw,))
            conn.commit()
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    _log_activity_db(username, f"deleted masked keyword '{kw}'")
    return {"status": "deleted", "keyword": kw}


# ── Change-request approve/reject ────────────────────────────────────────────
# Each handler receives (cur, target_id, payload, background_tasks) and
# performs exactly the same SQL/side effects as its original if/elif branch
# in main.py's approve_change_request. `cur` belongs to the caller's
# connection/transaction; handlers must not commit or close it.

def _approve_add_column(cur, target_id, payload, background_tasks):
    col_data = json.loads(payload)
    clean_key = re.sub(r'[^a-zA-Z0-9_]', '', col_data["col_key"].replace(' ', '_')).lower()
    cur.execute("PRAGMA table_info(candidate_metadata)")
    existing = [c[1] for c in cur.fetchall()]
    if clean_key not in existing:
        cur.execute(f"ALTER TABLE candidate_metadata ADD COLUMN {clean_key} TEXT")
        cur.execute(
            "INSERT OR IGNORE INTO custom_columns (col_key, col_label, description) VALUES (?, ?, ?)",
            (clean_key, col_data["col_label"], col_data["description"]),
        )


def _approve_delete_column(cur, target_id, payload, background_tasks):
    col_key = target_id
    cur.execute("DELETE FROM custom_columns WHERE col_key=?", (col_key,))
    # Sanitize before interpolating into DDL -- ALTER TABLE ... DROP COLUMN
    # can't be parameterized, and target_id is attacker-controllable at
    # change-request creation time (a non-admin can stage a delete_column
    # request; an admin's approval click is what actually executes this
    # SQL). Mirrors the same clean_key sanitization already applied in
    # _approve_add_column above for the identical reason.
    clean_key = re.sub(r'[^a-zA-Z0-9_]', '', col_key.replace(' ', '_')).lower()
    try:
        cur.execute(f"ALTER TABLE candidate_metadata DROP COLUMN {clean_key}")
    except Exception:
        pass


def _approve_update_candidate(cur, target_id, payload, background_tasks):
    candidate_id = int(target_id)
    updates = json.loads(payload)
    # SECURITY FIX: `updates` keys come from a change-request payload that a
    # non-admin can stage (see `_approve_delete_column` above for the same
    # class of issue) and were being interpolated directly into
    # `UPDATE ... SET {k}=?` with no validation, unlike the equivalent
    # reachable route (`PUT /api/candidates/{id}` in routers/candidates.py,
    # line ~347) which filters against `PRAGMA table_info(candidate_metadata)`
    # before building its SET clause. Apply the same whitelist here so a
    # crafted payload key can't inject arbitrary SQL into the DDL-adjacent
    # f-string.
    cur.execute("PRAGMA table_info(candidate_metadata)")
    allowed_cols = {c[1] for c in cur.fetchall()}
    updates = {k: v for k, v in updates.items() if k in allowed_cols and k != "id"}
    if not updates:
        return
    set_clause = ", ".join(f"{k}=?" for k in updates)
    cur.execute(
        f"UPDATE candidate_metadata SET {set_clause} WHERE id=?",
        list(updates.values()) + [candidate_id],
    )
    match_related_fields = {
        'full_name', 'total_experience', 'pega_experience', 'cdh_exp',
        'skills', 'certifications', 'current_location', 'pref_locations',
    }
    if any(field in updates for field in match_related_fields):
        background_tasks.add_task(match_candidate_to_all_jobs, candidate_id)


def _approve_delete_candidate(cur, target_id, payload, background_tasks):
    candidate_id = int(target_id)
    cur.execute("DELETE FROM job_candidates WHERE candidate_id=?", (candidate_id,))
    cur.execute("DELETE FROM candidate_metadata WHERE id=?", (candidate_id,))


def _approve_resume(cur, target_id, payload, background_tasks):
    candidate_id = int(target_id)
    cur.execute("UPDATE candidate_metadata SET is_approved = 1 WHERE id = ?", (candidate_id,))
    background_tasks.add_task(match_candidate_to_all_jobs, candidate_id)


def _approve_create_job(cur, target_id, payload, background_tasks):
    job_data = json.loads(payload)
    cur.execute("INSERT INTO jobs (title, description) VALUES (?, ?)", (job_data["title"], job_data["description"]))
    job_id = cur.lastrowid
    background_tasks.add_task(match_candidates_for_job, job_id)


def _approve_update_job(cur, target_id, payload, background_tasks):
    job_id = int(target_id)
    job_data = json.loads(payload)
    cur.execute("UPDATE jobs SET title = ?, description = ? WHERE id = ?", (job_data["title"], job_data["description"], job_id))
    background_tasks.add_task(match_candidates_for_job, job_id)


def _approve_delete_job(cur, target_id, payload, background_tasks):
    job_id = int(target_id)
    cur.execute("DELETE FROM job_candidates WHERE job_id = ?", (job_id,))
    cur.execute("DELETE FROM jobs WHERE id = ?", (job_id,))


def _approve_update_job_candidate(cur, target_id, payload, background_tasks):
    job_id, candidate_id = map(int, target_id.split(":"))
    update_data = json.loads(payload)
    if "status" in update_data and update_data["status"] is not None:
        cur.execute(
            "UPDATE job_candidates SET status = ? WHERE job_id = ? AND candidate_id = ?",
            (update_data["status"], job_id, candidate_id),
        )
    if "ai_reason" in update_data and update_data["ai_reason"] is not None:
        cur.execute(
            "UPDATE job_candidates SET ai_reason = ? WHERE job_id = ? AND candidate_id = ?",
            (update_data["ai_reason"], job_id, candidate_id),
        )


def _approve_delete_job_candidate(cur, target_id, payload, background_tasks):
    job_id, candidate_id = map(int, target_id.split(":"))
    cur.execute("DELETE FROM job_candidates WHERE job_id = ? AND candidate_id = ?", (job_id, candidate_id))


def _approve_match_job(cur, target_id, payload, background_tasks):
    job_id = int(target_id)
    background_tasks.add_task(match_candidates_for_job, job_id)


def _approve_reset_all(cur, target_id, payload, background_tasks):
    from langchain_community.vectorstores import PGVector

    from app.services.ai_clients import get_models

    cur.execute("DELETE FROM candidate_metadata")
    try:
        embeddings, _ = get_models()
        db = PGVector(
            connection_string=os.getenv("POSTGRES_DATABASE_URL"),
            embedding_function=embeddings,
            collection_name="resume_embeddings",
        )
        db.delete_collection()
    except Exception as e:
        # Best-effort: candidate_metadata is already wiped above regardless
        # of whether this succeeds, so we don't re-raise (that would roll
        # back the whole reset over a secondary cleanup step). But silently
        # swallowing this meant a Postgres outage during reset left stale
        # embeddings in place with no visible signal anywhere - logged now
        # so it's at least diagnosable instead of silently corrupting future
        # chat/matching relevance.
        logger.error(f"Reset: failed to clear vector embeddings collection: {e}")


def _approve_approve_user(cur, target_id, payload, background_tasks):
    target_username = target_id
    cur.execute("UPDATE users SET is_approved = 1 WHERE LOWER(username) = LOWER(?)", (target_username,))
    invalidate_user_cache(target_username)


# action_type -> handler registry. See module docstring for rationale.
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
def approve_change_request(request_id: int, request: Request, background_tasks: BackgroundTasks):
    username = request.headers.get("x-user-username")
    if not is_user_approved(username):
        raise HTTPException(status_code=403, detail="Access denied. Your account is pending admin approval.")
    role = get_user_role(username)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    with get_db_connection() as conn:
        conn.row_factory = dict_row_factory
        cur = conn.cursor()
        cur.execute("SELECT * FROM change_requests WHERE id = ?", (request_id,))
        req_row = cur.fetchone()
        if not req_row:
            raise HTTPException(status_code=404, detail="Request not found")

        req_data = dict(req_row)
        if req_data["status"] != "pending":
            raise HTTPException(status_code=400, detail="Request is already resolved")

        action_type = req_data["action_type"]
        target_id = req_data["target_id"]
        payload = req_data["payload"]

        handler = ACTION_HANDLERS.get(action_type)
        if not handler:
            raise HTTPException(status_code=400, detail=f"Unknown action_type: {action_type}")

        try:
            handler(cur, target_id, payload, background_tasks)
            cur.execute("UPDATE change_requests SET status = 'approved' WHERE id = ?", (request_id,))
            conn.commit()
        except HTTPException:
            conn.rollback()
            raise
        except Exception as e:
            conn.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to execute request: {str(e)}")

    return {"status": "approved"}


@router.post("/api/admin/requests/{request_id}/reject")
def reject_change_request(request_id: int, request: Request, body: Optional[ChangeRequestReject] = None):
    username = request.headers.get("x-user-username")
    if not is_user_approved(username):
        raise HTTPException(status_code=403, detail="Access denied. Your account is pending admin approval.")
    role = get_user_role(username)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    reason = (body.reason if body else None) or None

    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT status, action_type, target_id FROM change_requests WHERE id = ?", (request_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Request not found")
        status, action_type, target_id = row
        if status != "pending":
            raise HTTPException(status_code=400, detail="Request is already resolved")

        if action_type == "approve_user":
            cur.execute("DELETE FROM users WHERE LOWER(username) = LOWER(?)", (target_id,))

        # S7.3: capture why a request was rejected - there was previously no
        # way to record a reason, so a rejection gave the requester (and any
        # admin reviewing history later) no explanation at all. There's still
        # no notification channel to actually deliver this to the requester
        # (same gap as the OTP-delivery issue) - it's recorded, not sent.
        cur.execute("UPDATE change_requests SET status = 'rejected', rejection_reason = ? WHERE id = ?", (reason, request_id))
        conn.commit()

    return {"status": "rejected"}
