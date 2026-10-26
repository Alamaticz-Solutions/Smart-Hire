"""Health check, activity feed and team-member endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.core.responses import EnvelopeRoute
from app.db.engine import get_session
from app.dependencies import require_approved_user
from app.repositories import ActivityRepository, TeamMemberRepository
from app.services.auth import is_admin_or_hr

logger = get_logger(__name__)

router = APIRouter(route_class=EnvelopeRoute)


class ActivityCreate(BaseModel):
    username: str
    action: str


class TeamMemberCreate(BaseModel):
    name: str


def _serialize(model, *fields) -> dict:
    return {name: getattr(model, name) for name in fields}


# ── Health ────────────────────────────────────────────────────────────────
@router.get("/api/health")
def health(session: Session = Depends(get_session)):
    """Liveness plus one real database round trip."""
    try:
        session.execute(text("SELECT 1"))
        return {"status": "ok", "db": "ok"}
    except Exception as exc:
        logger.error("Health check DB probe failed: %s", exc)
        raise HTTPException(status_code=503, detail={"status": "degraded", "db": "unreachable"})


# ── Activity feed ─────────────────────────────────────────────────────────
@router.get("/api/activity")
def get_activity_logs(username: str = Depends(require_approved_user), session: Session = Depends(get_session)):
    return ActivityRepository(session).list_with_names()


@router.post("/api/activity")
def create_activity_log(
    req: ActivityCreate,
    username: str = Depends(require_approved_user),
    session: Session = Depends(get_session),
):
    # Always log under the authenticated caller, never the username in the
    # body - otherwise any approved caller could forge entries for others.
    ActivityRepository(session).add(username, req.action)
    return {"status": "logged"}


@router.delete("/api/activity")
def clear_activity_logs(username: str = Depends(require_approved_user), session: Session = Depends(get_session)):
    if not is_admin_or_hr(username):
        raise HTTPException(status_code=403, detail="Forbidden")
    activity = ActivityRepository(session)
    activity.clear()
    activity.add(username, "cleared the activity feed")
    return {"status": "cleared"}


# ── Team members ──────────────────────────────────────────────────────────
@router.get("/api/team-members")
def list_team_members(username: str = Depends(require_approved_user), session: Session = Depends(get_session)):
    return [_serialize(m, "id", "name", "created_at") for m in TeamMemberRepository(session).list_all()]


@router.post("/api/team-members")
def create_team_member(
    req: TeamMemberCreate,
    username: str = Depends(require_approved_user),
    session: Session = Depends(get_session),
):
    if not is_admin_or_hr(username):
        raise HTTPException(status_code=403, detail="Forbidden")
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    team = TeamMemberRepository(session)
    if team.exists(name):
        raise HTTPException(status_code=400, detail=f"Team member '{name}' already exists")
    team.add(name)
    ActivityRepository(session).add(username, f"added '{name}' to the recruiter persona matrix")
    return {"status": "added", "name": name}


@router.delete("/api/team-members/{member_id}")
def delete_team_member(
    member_id: int,
    username: str = Depends(require_approved_user),
    session: Session = Depends(get_session),
):
    if not is_admin_or_hr(username):
        raise HTTPException(status_code=403, detail="Forbidden")
    team = TeamMemberRepository(session)
    member = team.get(member_id)
    if member is None:
        raise HTTPException(status_code=404, detail="Team member not found")
    name = member.name
    team.delete(member)
    ActivityRepository(session).add(username, f"removed '{name}' from the recruiter persona matrix")
    return {"status": "deleted"}
