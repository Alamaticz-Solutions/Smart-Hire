"""Conversations: what people asked by e-mail, what the AI drafted, and what was actually sent.

Admin / HR only. Nothing here is sent unless a person clicks Send (or runs the batch), or the Connect page has
auto-reply switched on. Every send skips anyone this mailbox already e-mailed recently (Sent Items).
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.core.responses import EnvelopeRoute
from app.db.engine import get_session
from app.models import MailMessage, MailReply
from app.repositories import ActivityRepository, CandidateRepository, IntegrationSettingsRepository, MailReplyRepository
from app.services.auth import is_admin_or_hr
from app.services.email_worker import already_emailed_note, build_reply_content, send_one_reply

logger = get_logger(__name__)
router = APIRouter(route_class=EnvelopeRoute)

STATUSES = ("draft", "pending", "sent", "skipped", "failed")


class EditReply(BaseModel):
    reply: str


class SendOptions(BaseModel):
    force: bool = False


class BatchOptions(BaseModel):
    date_from: Optional[str] = None      # received from (YYYY-MM-DD, inclusive)
    date_to: Optional[str] = None        # received until (YYYY-MM-DD, inclusive)
    include_drafts: bool = False         # also send AI drafts that nobody approved yet
    limit: int = 200
    dry_run: bool = True                 # default: only preview
    confirm: bool = False                # must be true to really send


def _require_staff(request: Request) -> str:
    username = request.headers.get("x-user-username")
    if not is_admin_or_hr(username):
        raise HTTPException(status_code=403, detail="Forbidden")
    return username


def _settings(session: Session) -> dict:
    row = IntegrationSettingsRepository(session).get()
    return {c.name: getattr(row, c.name) for c in row.__table__.columns} if row else {}


def _day(value: Optional[str], end: bool = False) -> Optional[datetime]:
    if not value:
        return None
    try:
        day = datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date '{value}' (use YYYY-MM-DD)")
    return day + timedelta(days=1) if end else day


def _row_dict(reply: MailReply, mail: Optional[MailMessage], candidate: Optional[dict], settings: dict) -> dict:
    subject, body = build_reply_content(settings, reply, candidate)
    return {
        "id": reply.id, "msg_uid": reply.msg_uid, "kind": reply.kind or "acknowledgement", "status": reply.status,
        "received_at": mail.received_at if mail else reply.created_at,
        "sender_email": (mail.sender_email if mail else None) or reply.recipient, "sender_name": mail.sender_name if mail else None,
        "recipient": reply.recipient, "mailbox": reply.mailbox_email, "mail_subject": reply.original_subject,
        "question": reply.question, "inbound_text": reply.inbound_text,
        "reply_subject": subject, "reply_body": body, "is_ai": bool(reply.ai_reply),
        "candidate_id": reply.candidate_id, "candidate_name": (candidate or {}).get("full_name"),
        "last_error": reply.last_error, "sent_at": reply.sent_at, "sent_by": reply.sent_by, "edited_by": reply.edited_by,
    }


def _get_or_404(session: Session, reply_id: int) -> MailReply:
    reply = session.get(MailReply, reply_id)
    if reply is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return reply


@router.get("/api/conversations")
def list_conversations(
    request: Request,
    status: Optional[str] = None,
    kind: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    session: Session = Depends(get_session),
):
    _require_staff(request)
    stmt = select(MailReply, MailMessage).outerjoin(MailMessage, MailMessage.msg_uid == MailReply.msg_uid)
    count = select(func.count()).select_from(MailReply).outerjoin(MailMessage, MailMessage.msg_uid == MailReply.msg_uid)
    filters = []
    if status:
        filters.append(MailReply.status.in_([s for s in status.split(",") if s]))
    if kind:
        filters.append(func.coalesce(MailReply.kind, "acknowledgement") == kind)
    if search:
        like = f"%{search.lower()}%"
        filters.append(
            func.lower(func.coalesce(MailReply.recipient, "")).like(like)
            | func.lower(func.coalesce(MailReply.question, "")).like(like)
            | func.lower(func.coalesce(MailReply.original_subject, "")).like(like)
        )
    if date_from:
        filters.append(func.coalesce(MailMessage.received_at, MailReply.created_at) >= _day(date_from))
    if date_to:
        filters.append(func.coalesce(MailMessage.received_at, MailReply.created_at) < _day(date_to, end=True))
    for condition in filters:
        stmt, count = stmt.where(condition), count.where(condition)
    total = int(session.scalar(count) or 0)
    rows = session.execute(
        stmt.order_by(func.coalesce(MailMessage.received_at, MailReply.created_at).desc(), MailReply.id.desc())
        .limit(max(1, min(limit, 200))).offset(max(0, offset))
    ).all()
    settings = _settings(session)
    candidates = CandidateRepository(session)
    items = [
        _row_dict(reply, mail, candidates.get_row(reply.candidate_id) if reply.candidate_id else None, settings)
        for reply, mail in rows
    ]
    return {"items": items, "total": total}


@router.get("/api/conversations/summary")
def conversations_summary(request: Request, session: Session = Depends(get_session)):
    _require_staff(request)
    by_status = {s: 0 for s in STATUSES}
    by_kind: dict[str, int] = {}
    for status, kind, total in session.execute(
        select(MailReply.status, func.coalesce(MailReply.kind, "acknowledgement"), func.count()).group_by(MailReply.status, MailReply.kind)
    ):
        by_status[status] = by_status.get(status, 0) + total
        by_kind[kind] = by_kind.get(kind, 0) + total
    settings = _settings(session)
    return {
        "by_status": by_status, "by_kind": by_kind,
        "auto_reply": bool(settings.get("auto_reply_enabled")), "ai_answers_mode": settings.get("ai_answers_mode") or "draft",
    }


@router.put("/api/conversations/{reply_id}")
def edit_reply(reply_id: int, body: EditReply, request: Request, session: Session = Depends(get_session)):
    username = _require_staff(request)
    reply = _get_or_404(session, reply_id)
    if reply.status == "sent":
        raise HTTPException(status_code=400, detail="This reply was already sent")
    text = body.reply.strip()
    if not text:
        raise HTTPException(status_code=400, detail="The reply cannot be empty")
    reply.ai_reply, reply.edited_by = text, username
    return {"status": "saved"}


@router.post("/api/conversations/{reply_id}/approve")
def approve_reply(reply_id: int, request: Request, session: Session = Depends(get_session)):
    """Approve an AI draft: it joins the queue that goes out when auto-reply is on (or when you press Send)."""
    username = _require_staff(request)
    reply = _get_or_404(session, reply_id)
    if reply.status != "draft":
        raise HTTPException(status_code=400, detail="Only drafts need approval")
    reply.status, reply.edited_by = "pending", reply.edited_by or username
    ActivityRepository(session).add(username, f"approved the reply to {reply.recipient}")
    return {"status": "pending"}


@router.post("/api/conversations/{reply_id}/dismiss")
def dismiss_reply(reply_id: int, request: Request, session: Session = Depends(get_session)):
    username = _require_staff(request)
    reply = _get_or_404(session, reply_id)
    if reply.status == "sent":
        raise HTTPException(status_code=400, detail="This reply was already sent")
    reply.status, reply.last_error = "skipped", f"dismissed by {username}"
    return {"status": "skipped"}


@router.post("/api/conversations/{reply_id}/send")
def send_reply_now(reply_id: int, request: Request, options: SendOptions = SendOptions(), session: Session = Depends(get_session)):
    """Send this reply now (an explicit human action; works even while auto-reply is OFF)."""
    username = _require_staff(request)
    reply = _get_or_404(session, reply_id)
    if reply.status == "sent":
        raise HTTPException(status_code=400, detail="This reply was already sent")
    ok, message = send_one_reply(session, _settings(session), reply, username, force=options.force)
    session.commit()  # keep the outcome (attempt count / error) either way
    if not ok:
        raise HTTPException(status_code=409 if message.startswith("already emailed") else 400, detail=message)
    ActivityRepository(session).add(username, f"sent a reply to {reply.recipient}")
    return {"status": "sent"}


@router.post("/api/conversations/send-batch")
def send_batch(options: BatchOptions, request: Request, session: Session = Depends(get_session)):
    """Preview (default) or send the waiting replies for mail received in a date range.

    Skips anyone this mailbox already e-mailed recently, anyone already answered, and candidates whose
    processing failed. Sending needs ``dry_run=false`` AND ``confirm=true``.
    """
    username = _require_staff(request)
    start, end = _day(options.date_from), _day(options.date_to, end=True)
    statuses = ["pending"] + (["draft"] if options.include_drafts else [])
    stmt = (
        select(MailReply).outerjoin(MailMessage, MailMessage.msg_uid == MailReply.msg_uid).where(MailReply.status.in_(statuses))
    )
    moment = func.coalesce(MailMessage.received_at, MailReply.created_at)
    if start:
        stmt = stmt.where(moment >= start)
    if end:
        stmt = stmt.where(moment < end)
    rows = session.scalars(stmt.order_by(moment, MailReply.id).limit(max(1, min(options.limit, 300)))).all()

    settings = _settings(session)
    replies, candidates = MailReplyRepository(session), CandidateRepository(session)
    send, skip = [], []
    seen: set[str] = set()
    for reply in rows:
        candidate = candidates.get_row(reply.candidate_id) if reply.candidate_id else None
        key = (reply.recipient or "").lower()
        reason = None
        if key in seen:
            reason = "another reply to this person is already in this batch"
        elif replies.already_replied(reply.recipient, reply.candidate_id):
            reason = "recipient already acknowledged"
        elif candidate and candidate.get("candidate_status") == "Error":
            reason = "candidate processing failed"
        elif (reply.kind or "acknowledgement") != "answer":
            try:
                reason = already_emailed_note(settings, reply.mailbox_email, reply.recipient)
            except Exception as exc:
                raise HTTPException(status_code=503, detail=f"Sent Items could not be checked, so nothing was sent: {exc}")
        (skip if reason else send).append((reply, reason))
        if not reason:
            seen.add(key)

    preview = {
        "would_send": len(send), "would_skip": len(skip),
        "send_sample": [{"recipient": r.recipient, "subject": r.original_subject} for r, _ in send[:8]],
        "skip_reasons": _count([reason for _, reason in skip]),
    }
    if options.dry_run or not options.confirm:
        return {"dry_run": True, **preview}

    sent = failed = 0
    for reply, reason in skip:
        if reason and not reason.startswith("another reply"):
            reply.status, reply.last_error = "skipped", reason
    for reply, _ in send:
        ok, message = send_one_reply(session, settings, reply, username, force=True)  # already vetted above
        session.commit()  # one send, one commit: a crash can never cause a duplicate
        if ok:
            sent += 1
        else:
            failed += 1
            logger.error("Batch reply to %s failed: %s", reply.recipient, message)
    ActivityRepository(session).add(username, f"sent {sent} waiting replies in a batch ({failed} failed)")
    return {"dry_run": False, "sent": sent, "failed": failed, "skipped": len(skip), "skip_reasons": preview["skip_reasons"]}


def _count(values: list[Optional[str]]) -> dict[str, int]:
    summary: dict[str, int] = {}
    for value in values:
        key = (value or "").split(" on ")[0] if value and value.startswith("already emailed") else (value or "")
        summary[key] = summary.get(key, 0) + 1
    return summary
