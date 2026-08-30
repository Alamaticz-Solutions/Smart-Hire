"""Health check, activity log, and team-member endpoints.

Moved verbatim (same paths/methods/logic) from app/main.py:
  - GET    /api/health              (main.py ~822-824)
  - GET    /api/activity            (main.py ~830-841)
  - POST   /api/activity            (main.py ~843-846)
  - DELETE /api/activity            (main.py ~848-860)
  - GET    /api/team-members        (main.py ~865-876)
  - POST   /api/team-members        (main.py ~878-899)
  - DELETE /api/team-members/{id}   (main.py ~901-925)

DB access has been adapted from raw `sqlite3.connect(STATS_DB, ...)` calls to
the `get_db_connection()` context manager (app.db.session) so connections are
always closed, including on exception paths that previously leaked them
(e.g. the original `create_team_member`/`delete_team_member` bodies opened a
connection with no surrounding try/finally around the `sqlite3.connect(...)`
call itself).
"""

import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.logging import get_logger
from app.db.row_helpers import dict_row_factory
from app.db.session import get_db_connection
from app.dependencies import require_approved_user
from app.services.auth import is_admin_or_hr

logger = get_logger(__name__)

router = APIRouter()


class ActivityCreate(BaseModel):
    username: str
    action: str


class TeamMemberCreate(BaseModel):
    name: str


def _log_activity_db(username: str, action: str) -> None:
    """Insert one row into activity_logs. Used by the team-member routes below to
    record who added/removed a team member, mirroring main.py's log_activity_db.
    """
    if not username:
        username = "unknown"
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("INSERT INTO activity_logs (username, action) VALUES (?, ?)", (username, action))
            conn.commit()
    except Exception as e:
        logger.error(f"Error logging activity: {e}")


# ── Health ─────────────────────────────────────────────────────────────────────
@router.get("/api/health")
def health():
    # A hardcoded {"status": "ok"} tells a load balancer/uptime monitor
    # nothing about whether the app can actually serve a request - a
    # DB-connectivity failure would previously still report healthy. This
    # does the cheapest possible real check: one round trip.
    try:
        with get_db_connection() as conn:
            conn.cursor().execute("SELECT 1")
        return {"status": "ok", "db": "ok"}
    except Exception as e:
        logger.error("Health check DB probe failed: %s", e)
        raise HTTPException(status_code=503, detail={"status": "degraded", "db": "unreachable"})


@router.get("/api/activity")
def get_activity_logs(username: str = Depends(require_approved_user)):
    try:
        with get_db_connection() as conn:
            conn.row_factory = dict_row_factory
            cur = conn.cursor()
            # LEFT JOIN so the feed can show a real display name (the
            # topbar already shows one) instead of the bare username -
            # LEFT, not INNER, so a log row for a since-deleted user still
            # shows up instead of silently vanishing from the feed.
            cur.execute(
                """
                SELECT al.*, u.full_name
                FROM activity_logs al
                LEFT JOIN users u ON LOWER(u.username) = LOWER(al.username)
                ORDER BY al.timestamp DESC
                """
            )
            logs = [dict(row) for row in cur.fetchall()]
        return logs
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/activity")
def create_activity_log(req: ActivityCreate, username: str = Depends(require_approved_user)):
    # Log under the authenticated caller, not whatever `username` the
    # request body claims - the body field previously let any approved
    # caller forge activity-log entries under someone else's name.
    _log_activity_db(username, req.action)
    return {"status": "logged"}


@router.delete("/api/activity")
def clear_activity_logs(username: str = Depends(require_approved_user)):
    if not is_admin_or_hr(username):
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM activity_logs")
            conn.commit()
        _log_activity_db(username, "cleared the activity feed")
        return {"status": "cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/team-members")
def list_team_members(username: str = Depends(require_approved_user)):
    try:
        with get_db_connection() as conn:
            conn.row_factory = dict_row_factory
            cur = conn.cursor()
            cur.execute("SELECT * FROM team_members ORDER BY name ASC")
            members = [dict(row) for row in cur.fetchall()]
        return members
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/team-members")
def create_team_member(req: TeamMemberCreate, username: str = Depends(require_approved_user)):
    if not is_admin_or_hr(username):
        raise HTTPException(status_code=403, detail="Forbidden")
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            try:
                cur.execute("INSERT INTO team_members (name) VALUES (?)", (name,))
                conn.commit()
            except sqlite3.IntegrityError:
                raise HTTPException(status_code=400, detail=f"Team member '{name}' already exists")
        _log_activity_db(username, f"added '{name}' to the recruiter persona matrix")
        return {"status": "added", "name": name}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/team-members/{member_id}")
def delete_team_member(member_id: int, username: str = Depends(require_approved_user)):
    if not is_admin_or_hr(username):
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()

            # Get member name first to log it
            cur.execute("SELECT name FROM team_members WHERE id = ?", (member_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Team member not found")
            member_name = row[0]

            cur.execute("DELETE FROM team_members WHERE id = ?", (member_id,))
            conn.commit()

        _log_activity_db(username, f"removed '{member_name}' from the recruiter persona matrix")
        return {"status": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
