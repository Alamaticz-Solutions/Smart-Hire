"""Where candidates came from: the mail log (Outlook pulls) and spreadsheet import batches.

Admin / HR only. The mail log has one row per message the poller looked at, with the time the mailbox
received it and what happened to it; import batches have one row per uploaded sheet with per-row results.
"""
from __future__ import annotations

import io
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.core.responses import EnvelopeRoute
from app.db.engine import get_session
from app.models import Candidate, MailReply
from app.repositories import (
    ActivityRepository,
    CandidateRepository,
    ImportBatchRepository,
    IntegrationSettingsRepository,
    MailMessageRepository,
    ProcessedEmailRepository,
)
from app.services.auth import is_admin_or_hr

logger = get_logger(__name__)
router = APIRouter(route_class=EnvelopeRoute)

RETRYABLE_OUTCOMES = ("failed", "pending_retry", "no_resume", "legacy_file", "not_pulled")
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class RetryRequest(BaseModel):
    msg_uids: list[str]


def _require_staff(request: Request) -> str:
    username = request.headers.get("x-user-username")
    if not is_admin_or_hr(username):
        raise HTTPException(status_code=403, detail="Forbidden")
    return username


def _day(value: Optional[str], end: bool = False) -> Optional[datetime]:
    if not value:
        return None
    try:
        day = datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date '{value}' (use YYYY-MM-DD)")
    return day + timedelta(days=1) if end else day


def _xlsx(headers: list[str], rows: list[list], widths: list[int], title: str, filename: str) -> StreamingResponse:
    from openpyxl import Workbook

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = title
    sheet.append(headers)
    for row in rows:
        sheet.append(row)
    for column, width in zip("ABCDEFGHIJ", widths):
        sheet.column_dimensions[column].width = width
    buffer = io.BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    return StreamingResponse(
        buffer, media_type=XLSX,
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "Access-Control-Expose-Headers": "Content-Disposition"},
    )


def _message_dict(row, names: dict[int, str], replies: dict[str, str]) -> dict:
    return {
        "msg_uid": row.msg_uid, "mailbox": row.mailbox_email, "sender_email": row.sender_email,
        "sender_name": row.sender_name, "subject": row.subject, "received_at": row.received_at,
        "has_attachments": row.has_attachments, "attachments": row.attachment_names or "",
        "outcome": row.outcome, "reason": row.reason, "candidate_id": row.candidate_id,
        "candidate_name": names.get(row.candidate_id) if row.candidate_id else None,
        "reply_status": replies.get(row.msg_uid),
    }


def _lookups(session: Session, rows) -> tuple[dict[int, str], dict[str, str]]:
    candidate_ids = [r.candidate_id for r in rows if r.candidate_id]
    names: dict[int, str] = {}
    if candidate_ids:
        for cid, name in session.execute(select(Candidate.id, Candidate.full_name).where(Candidate.id.in_(candidate_ids))):
            names[cid] = name
    uids = [r.msg_uid for r in rows]
    replies: dict[str, str] = {}
    if uids:
        for uid, status in session.execute(select(MailReply.msg_uid, MailReply.status).where(MailReply.msg_uid.in_(uids))):
            replies[uid] = status
    return names, replies


# ── mail log ───────────────────────────────────────────────────────────────
@router.get("/api/mail/messages")
def list_mail_messages(
    request: Request,
    outcome: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    session: Session = Depends(get_session),
):
    _require_staff(request)
    limit = max(1, min(limit, 200))
    rows, total = MailMessageRepository(session).list(
        outcome, search, _day(date_from), _day(date_to, end=True), limit, max(0, offset)
    )
    names, replies = _lookups(session, rows)
    return {"items": [_message_dict(r, names, replies) for r in rows], "total": total}


@router.get("/api/mail/summary")
def mail_summary(request: Request, session: Session = Depends(get_session)):
    """Counts per outcome plus the health of the poller (last time it reached the mailbox)."""
    _require_staff(request)
    counts = MailMessageRepository(session).counts()
    settings = IntegrationSettingsRepository(session).get()
    heartbeat = getattr(settings, "worker_heartbeat", None)
    enabled = bool(settings and (settings.outlook_enabled or settings.gmail_enabled or settings.email_enabled))
    if not enabled:
        health = "off"
    elif settings and settings.worker_last_error:
        health = "error"
    elif heartbeat and datetime.now(timezone.utc).replace(tzinfo=None) - heartbeat < timedelta(minutes=5):
        health = "ok"
    else:
        health = "stale"
    return {
        "total": sum(counts.values()), "by_outcome": counts,
        "poller": {
            "health": health, "last_ok": heartbeat,
            "last_error": settings.worker_last_error if settings else None,
            "auto_reply": bool(settings and settings.auto_reply_enabled),
        },
    }


@router.post("/api/mail/messages/retry")
def retry_mail_messages(
    body: RetryRequest, request: Request, session: Session = Depends(get_session),
):
    """Put mails back in the queue: the next poll imports them again (a failed placeholder candidate is removed first)."""
    username = _require_staff(request)
    mail_log = MailMessageRepository(session)
    processed = ProcessedEmailRepository(session)
    candidates = CandidateRepository(session)
    queued = skipped = 0
    for uid in body.msg_uids[:500]:
        row = mail_log.get(uid)
        if row is None or row.outcome not in RETRYABLE_OUTCOMES:
            skipped += 1
            continue
        if row.candidate_id:
            existing = candidates.get_row(row.candidate_id)
            if existing and existing.get("record_state") == "failed":
                candidates.delete(row.candidate_id)
        processed.unmark(uid)
        row.outcome, row.reason, row.candidate_id = "pending_retry", "Queued for retry - next poll will import it again", None
        queued += 1
    ActivityRepository(session).add(username, f"queued {queued} mail(s) for re-import")
    return {"queued": queued, "skipped": skipped}


@router.get("/api/mail/messages/export.xlsx")
def export_mail_messages(
    request: Request,
    outcome: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    session: Session = Depends(get_session),
):
    _require_staff(request)
    rows, _ = MailMessageRepository(session).list(outcome, search, _day(date_from), _day(date_to, end=True), 5000, 0)
    names, replies = _lookups(session, rows)
    data = [
        [str(r.received_at or ""), r.sender_email, r.sender_name, r.subject, r.attachment_names or "", r.outcome,
         r.reason, names.get(r.candidate_id, "") if r.candidate_id else "", replies.get(r.msg_uid, "")]
        for r in rows
    ]
    return _xlsx(
        ["Received (UTC)", "Sender", "Name", "Subject", "Attachments", "Outcome", "Reason", "Candidate", "Reply"],
        data, [20, 32, 24, 48, 36, 18, 50, 24, 12], "Mail log", "mail_log.xlsx",
    )


# ── spreadsheet import batches ─────────────────────────────────────────────
def _batch_dict(b) -> dict:
    return {
        "id": b.id, "kind": b.kind, "name": b.name, "created_by": b.created_by, "created_at": b.created_at,
        "finished_at": b.finished_at, "status": b.status, "total_rows": b.total_rows, "imported": b.imported,
        "updated": b.updated, "skipped": b.skipped, "errors": b.errors, "note": b.note,
    }


@router.get("/api/imports")
def list_imports(request: Request, session: Session = Depends(get_session)):
    _require_staff(request)
    return [_batch_dict(b) for b in ImportBatchRepository(session).list_recent(200)]


@router.get("/api/imports/{batch_id}/items")
def import_items(batch_id: int, request: Request, status: Optional[str] = None, session: Session = Depends(get_session)):
    _require_staff(request)
    batches = ImportBatchRepository(session)
    batch = batches.get(batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail="Import not found")
    items = [
        {"id": i.id, "sheet": i.sheet, "row_no": i.row_no, "label": i.label, "status": i.status,
         "reason": i.reason, "candidate_id": i.candidate_id}
        for i in batches.items(batch_id, status)
    ]
    return {"batch": _batch_dict(batch), "items": items}


@router.get("/api/imports/{batch_id}/report.xlsx")
def import_report(batch_id: int, request: Request, session: Session = Depends(get_session)):
    _require_staff(request)
    batches = ImportBatchRepository(session)
    batch = batches.get(batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail="Import not found")
    rows = [[i.sheet, i.row_no, i.label, i.status, i.reason, i.candidate_id] for i in batches.items(batch_id)]
    return _xlsx(["Sheet", "Row", "Candidate", "Result", "Reason", "Candidate ID"], rows,
                 [18, 8, 36, 12, 60, 14], "Import report", f"import_{batch_id}_report.xlsx")


@router.post("/api/imports/{batch_id}/undo")
def undo_import(batch_id: int, request: Request, session: Session = Depends(get_session)):
    """Delete the candidates this import *created* (rows that only updated existing candidates are left as they are)."""
    username = _require_staff(request)
    batches = ImportBatchRepository(session)
    batch = batches.get(batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail="Import not found")
    if batch.status == "undone":
        raise HTTPException(status_code=400, detail="This import was already undone")
    candidates = CandidateRepository(session)
    created = [
        cid for (cid,) in session.execute(select(Candidate.id).where(Candidate.import_batch_id == batch_id, Candidate.origin == "excel"))
    ]
    candidates.delete_many(created)
    batch.status = "undone"
    batch.note = f"Undone by {username}: {len(created)} candidate(s) removed (updated rows were kept)"
    ActivityRepository(session).add(username, f"undid import '{batch.name}' ({len(created)} candidates removed)")
    return {"removed": len(created)}
