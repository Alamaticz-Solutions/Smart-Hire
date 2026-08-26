"""POST /api/reset -- wipes all candidate/change-request/activity-log/processed-email data.

Moved from app/main.py (~3835-3854).

SECURITY FIX (approved by the user as part of this cleanup):
--------------------------------------------------------------------------
The original `/api/reset` handler in main.py had **no auth check at all**:

    @app.post("/api/reset")
    def reset_all(request: Request):
        conn = sqlite3.connect(STATS_DB, timeout=30.0)
        conn.execute("DELETE FROM candidate_metadata")
        ...

Any unauthenticated caller could wipe every candidate, change request,
activity log, and processed-email row, plus drop the resume-embeddings
vector collection -- a full data-loss endpoint with zero protection.

This version adds:
  1. `Depends(require_approved_user)` (app.dependencies) -- caller must send
     a recognized, approved `x-user-username` header at all.
  2. An explicit `is_admin_or_hr(username)` gate on top of that -- because
     this endpoint is uniquely destructive (wipes ALL data, not just the
     caller's own rows), plain approval is not enough; only admin/HR
     accounts may invoke it. Mirrors the same admin/HR bar main.py already
     used for other high-privilege actions (see app/services/auth.py).

Anyone who fails either check now gets a 403 instead of the reset silently
executing.
--------------------------------------------------------------------------
"""

import os

from fastapi import APIRouter, Depends, HTTPException
from langchain_community.vectorstores import PGVector

from app.core.logging import get_logger
from app.db.session import get_db_connection
from app.dependencies import require_approved_user
from app.services.ai_clients import get_models
from app.services.auth import is_admin_or_hr

logger = get_logger(__name__)

router = APIRouter()


@router.post("/api/reset")
def reset_all(username: str = Depends(require_approved_user)):
    # Security fix: restrict this destructive, previously-unauthenticated
    # endpoint to admin/HR accounts only. See module docstring above.
    if not is_admin_or_hr(username):
        raise HTTPException(status_code=403, detail="Only admins can reset all data")

    with get_db_connection() as conn:
        conn.execute("DELETE FROM candidate_metadata")
        conn.execute("DELETE FROM change_requests")
        conn.execute("DELETE FROM activity_logs")
        conn.execute("DELETE FROM processed_emails")
        conn.commit()

    try:
        embeddings, _ = get_models()
        db = PGVector(
            connection_string=os.getenv("POSTGRES_DATABASE_URL"),
            embedding_function=embeddings,
            collection_name="resume_embeddings",
        )
        db.delete_collection()
    except Exception:
        pass

    return {"status": "reset complete"}
