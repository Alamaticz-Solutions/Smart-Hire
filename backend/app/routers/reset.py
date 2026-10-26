"""POST /api/reset - wipe candidates, requests, activity and processed mail.

Destructive, so it is restricted to admin / HR accounts (it originally had no
authentication at all).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.core.responses import EnvelopeRoute
from app.db.engine import get_session
from app.dependencies import require_approved_user
from app.repositories import (
    ActivityRepository,
    CandidateRepository,
    ChangeRequestRepository,
    ProcessedEmailRepository,
)
from app.services import vector_store
from app.services.auth import is_admin_or_hr

logger = get_logger(__name__)

router = APIRouter(route_class=EnvelopeRoute)


@router.post("/api/reset")
def reset_all(username: str = Depends(require_approved_user), session: Session = Depends(get_session)):
    if not is_admin_or_hr(username):
        raise HTTPException(status_code=403, detail="Only admins can reset all data")

    CandidateRepository(session).delete_all()
    ChangeRequestRepository(session).delete_all()
    ActivityRepository(session).clear()
    ProcessedEmailRepository(session).delete_all()
    session.commit()  # make the wipe durable before touching the vector store

    vector_store.delete_collection()
    return {"status": "reset complete"}
