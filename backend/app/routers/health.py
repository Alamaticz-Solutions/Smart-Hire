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

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.core.logging import get_logger
from app.db.row_helpers import dict_row_factory
from app.db.session import get_db_connection

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
    return {"status": "ok"}


@router.get("/api/activity")
def get_activity_logs():
    try:
        with get_db_connection() as conn:
            conn.row_factory = dict_row_factory
            cur = conn.cursor()
            cur.execute("SELECT * FROM activity_logs ORDER BY timestamp DESC")
            logs = [dict(row) for row in cur.fetchall()]
        return logs
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/activity")
def create_activity_log(req: ActivityCreate):
    _log_activity_db(req.username, req.action)
    return {"status": "logged"}


@router.delete("/api/activity")
def clear_activity_logs(request: Request):
    username = request.headers.get("x-user-username")
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM activity_logs")
            conn.commit()
        _log_activity_db(username or "unknown", "cleared the activity feed")
        return {"status": "cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/team-members")
def list_team_members():
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
def create_team_member(req: TeamMemberCreate, request: Request):
    username = request.headers.get("x-user-username") or "admin"
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
def delete_team_member(member_id: int, request: Request):
    username = request.headers.get("x-user-username") or "admin"
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
