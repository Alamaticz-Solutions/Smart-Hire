"""Integration settings endpoints (administrators only).

Covers mailbox / Drive settings, the Google OAuth code exchange, connection
tests and the reply-template test mail.
"""
import io
import json
import os
import smtplib
import urllib.parse
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

import requests
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import UPLOAD_DIR
from app.core.logging import get_logger
from app.core.responses import EnvelopeRoute
from app.db.engine import get_session
from app.models import IntegrationSettings
from app.repositories import (
    ActivityRepository,
    CandidateRepository,
    IntegrationSettingsRepository,
    MailReplyRepository,
)
from app.services.mail_filters import parse_day
from app.services.auth import get_user_role
from app.services.email_worker import THEME_TEMPLATES, send_email_via_graph
from app.services.integrations_test import test_graph_connection, test_imap_connection

logger = get_logger(__name__)

router = APIRouter(route_class=EnvelopeRoute)

MASK = "****"
MAIL_SOURCE = "uploaded from mail"
DEFAULT_THEME = "professional"
_SECRET_FIELDS = ("email_pass", "gdrive_client_secret", "gdrive_refresh_token", "ms_client_secret", "gmail_pass")


# ── schemas ────────────────────────────────────────────────────────────────
class IntegrationSettingsRequest(BaseModel):
    email_enabled: int
    imap_host: str
    imap_port: int
    smtp_host: str
    smtp_port: int
    email_user: str
    email_pass: str
    keywords: str
    drive_enabled: int
    reply_theme: Optional[str] = DEFAULT_THEME
    reply_subject: Optional[str] = "Re: {subject} (Ref: {ref})"
    reply_body_missing: Optional[str] = None
    reply_body_complete: Optional[str] = None
    gdrive_client_id: Optional[str] = None
    gdrive_client_secret: Optional[str] = None
    gdrive_refresh_token: Optional[str] = None
    gdrive_folder_id: Optional[str] = None
    gdrive_email: Optional[str] = None
    ms_client_id: Optional[str] = None
    ms_client_secret: Optional[str] = None
    ms_tenant_id: Optional[str] = "common"
    gmail_enabled: Optional[int] = 0
    gmail_email: Optional[str] = None
    gmail_pass: Optional[str] = None
    outlook_enabled: Optional[int] = 0
    outlook_email: Optional[str] = None
    additional_emails: Optional[str] = "[]"
    theme_usage_counts: Optional[str] = "{}"
    default_resume_template: Optional[str] = "alamaticz"
    # Mail import guards
    auto_reply_enabled: Optional[int] = 0
    mail_import_from: Optional[str] = None   # YYYY-MM-DD (inclusive)
    mail_import_to: Optional[str] = None     # YYYY-MM-DD (inclusive)
    skip_automated_senders: Optional[int] = 1


class GDriveExchangeRequest(BaseModel):
    client_id: str
    client_secret: str
    code: str


class TestMailboxRequest(BaseModel):
    imap_host: str
    imap_port: int
    email_user: str
    email_pass: str


class TestEmailTemplateRequest(BaseModel):
    recipient_email: str
    preview_type: str
    subject_template: str
    body_template: str


# ── helpers ────────────────────────────────────────────────────────────────
def _require_admin(request: Request) -> str:
    username = request.headers.get("x-user-username")
    if get_user_role(username) != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    return username


def _masked(value: Optional[str]) -> str:
    return MASK if value else ""


def _loads(raw: Optional[str], default):
    try:
        return json.loads(raw) if raw else default
    except (TypeError, ValueError):
        return default


def _resolve_templates(theme: Optional[str], subject, body_missing, body_complete) -> tuple[str, str, str]:
    """Preset themes win; custom/unknown themes use saved text with professional fallbacks."""
    fallback = THEME_TEMPLATES[DEFAULT_THEME]
    name = theme or DEFAULT_THEME
    if name in THEME_TEMPLATES and name != "custom":
        preset = THEME_TEMPLATES[name]
        return preset["subject"], preset["body_missing"], preset["body_complete"]
    return (
        subject or fallback["subject"],
        body_missing or fallback["body_missing"],
        body_complete or fallback["body_complete"],
    )


def _is_outlook(host: Optional[str]) -> bool:
    host = (host or "").lower()
    return "office365" in host or "outlook" in host


# ── settings ───────────────────────────────────────────────────────────────
@router.get("/api/integrations")
def get_integrations_settings(request: Request, session: Session = Depends(get_session)):
    _require_admin(request)
    row = IntegrationSettingsRepository(session).get()

    if row is None:
        professional = THEME_TEMPLATES[DEFAULT_THEME]
        return {
            "email_enabled": 0, "imap_host": "imap.gmail.com", "imap_port": 993,
            "smtp_host": "smtp.gmail.com", "smtp_port": 587, "email_user": "",
            "email_pass": "", "keywords": "resume,alamaticz,solution,job", "drive_enabled": 0,
            "reply_theme": DEFAULT_THEME,
            "reply_subject": "Re: {subject} (Ref: {ref})",
            "reply_body_missing": professional["body_missing"],
            "reply_body_complete": professional["body_complete"],
            "gdrive_client_id": "", "gdrive_client_secret": "", "gdrive_refresh_token": "",
            "gdrive_folder_id": "", "gdrive_email": "",
            "ms_client_id": "", "ms_client_secret": "", "ms_tenant_id": "common",
            "gmail_enabled": 0, "gmail_email": "", "gmail_pass": "",
            "outlook_enabled": 0, "outlook_email": "",
            "default_resume_template": "alamaticz", "additional_emails": "[]", "theme_usage_counts": "{}",
            "auto_reply_enabled": 0, "mail_import_from": "", "mail_import_to": "", "skip_automated_senders": 1,
        }

    subject, body_missing, body_complete = _resolve_templates(
        row.reply_theme, row.reply_subject, row.reply_body_missing, row.reply_body_complete
    )
    additional = _loads(row.additional_emails, [])
    for item in additional:
        if isinstance(item, dict) and item.get("email_pass"):
            item["email_pass"] = MASK

    return {
        "email_enabled": row.email_enabled,
        "imap_host": row.imap_host or "imap.gmail.com",
        "imap_port": row.imap_port or 993,
        "smtp_host": row.smtp_host or "smtp.gmail.com",
        "smtp_port": row.smtp_port or 587,
        "email_user": row.email_user or "",
        "email_pass": _masked(row.email_pass),
        "keywords": row.keywords or "resume,alamaticz,solution,job",
        "drive_enabled": row.drive_enabled,
        "reply_theme": row.reply_theme or DEFAULT_THEME,
        "reply_subject": subject,
        "reply_body_missing": body_missing,
        "reply_body_complete": body_complete,
        "gdrive_client_id": row.gdrive_client_id or "",
        "gdrive_client_secret": _masked(row.gdrive_client_secret),
        "gdrive_refresh_token": _masked(row.gdrive_refresh_token),
        "gdrive_folder_id": row.gdrive_folder_id or "",
        "gdrive_email": row.gdrive_email or "",
        "ms_client_id": row.ms_client_id or "",
        "ms_client_secret": _masked(row.ms_client_secret),
        "ms_tenant_id": row.ms_tenant_id or "common",
        "gmail_enabled": row.gmail_enabled or 0,
        "gmail_email": row.gmail_email or "",
        "gmail_pass": _masked(row.gmail_pass),
        "outlook_enabled": row.outlook_enabled or 0,
        "outlook_email": row.outlook_email or "",
        "additional_emails": json.dumps(additional),
        "theme_usage_counts": row.theme_usage_counts or "{}",
        "default_resume_template": row.default_resume_template or "alamaticz",
        "auto_reply_enabled": row.auto_reply_enabled or 0,
        "mail_import_from": row.mail_import_from or "",
        "mail_import_to": row.mail_import_to or "",
        "skip_automated_senders": 0 if row.skip_automated_senders == 0 else 1,
    }


@router.post("/api/integrations")
def save_integrations_settings(
    settings: IntegrationSettingsRequest, request: Request, session: Session = Depends(get_session)
):
    username = _require_admin(request)

    start, end = parse_day(settings.mail_import_from), parse_day(settings.mail_import_to)
    if settings.mail_import_from and start is None:
        raise HTTPException(status_code=400, detail="Import 'from' date must be YYYY-MM-DD")
    if settings.mail_import_to and end is None:
        raise HTTPException(status_code=400, detail="Import 'to' date must be YYYY-MM-DD")
    if start and end and end < start:
        raise HTTPException(status_code=400, detail="Import 'to' date cannot be before the 'from' date")

    repo = IntegrationSettingsRepository(session)
    row = repo.get_or_create()
    previous_auto_reply = row.auto_reply_enabled or 0
    data = settings.model_dump()
    data["mail_import_from"] = settings.mail_import_from or None
    data["mail_import_to"] = settings.mail_import_to or None

    # The UI echoes secrets back as "****": keep the stored value then.
    for name in _SECRET_FIELDS:
        if data.get(name) == MASK:
            data[name] = getattr(row, name)

    previous = {
        str(item.get("email_user", "")).lower(): item.get("email_pass", "")
        for item in _loads(row.additional_emails, []) if isinstance(item, dict)
    }
    additional = _loads(data.get("additional_emails"), [])
    for item in additional:
        if isinstance(item, dict) and item.get("email_pass") == MASK and item.get("email_user"):
            item["email_pass"] = previous.get(item["email_user"].lower(), "")
    data["additional_emails"] = json.dumps(additional)

    counts = _loads(row.theme_usage_counts, {})
    theme = settings.reply_theme or DEFAULT_THEME
    counts[theme] = counts.get(theme, 0) + 1
    data["theme_usage_counts"] = json.dumps(counts)

    for name, value in data.items():
        setattr(row, name, value)

    extra_enabled = any(
        isinstance(item, dict) and item.get("email_enabled") for item in _loads(data["additional_emails"], [])
    )
    every_mailbox_off = not (
        settings.email_enabled or settings.gmail_enabled or settings.outlook_enabled or extra_enabled
    )
    if every_mailbox_off:  # only then are e-mail-imported candidates removed
        removed = CandidateRepository(session).delete_by_source(MAIL_SOURCE)
        for _, filename in removed:
            if filename:
                path = os.path.join(UPLOAD_DIR, filename)
                try:
                    if os.path.exists(path):
                        os.remove(path)
                except OSError as exc:
                    logger.error("Error deleting file %s: %s", path, exc)
        logger.info("Deleted %d email-imported candidates because email sync was disabled.", len(removed))

    activity = ActivityRepository(session)
    activity.add(username, "updated integrations settings")
    if (settings.auto_reply_enabled or 0) != previous_auto_reply:
        state = "ON" if settings.auto_reply_enabled else "OFF"
        activity.add(username, f"turned candidate auto-reply {state}")
    return {"status": "saved"}


@router.get("/api/integrations/replies")
def get_reply_log(request: Request, session: Session = Depends(get_session)):
    """Acknowledgement log: counts per status plus the most recent entries."""
    _require_admin(request)
    replies = MailReplyRepository(session)
    counts = replies.counts()
    recent = [
        {
            "id": r.id, "recipient": r.recipient, "candidate_id": r.candidate_id, "status": r.status,
            "mailbox": r.mailbox_email, "subject": r.original_subject, "attempts": r.attempts,
            "error": r.last_error, "created_at": r.created_at, "sent_at": r.sent_at,
        }
        for r in replies.recent(25)
    ]
    return {
        "counts": {k: counts.get(k, 0) for k in ("pending", "sent", "skipped", "failed")},
        "recent": recent,
        "failed": [_reply_row(r) for r in replies.failed(100)],
    }


def _reply_row(r) -> dict:
    return {
        "id": r.id, "recipient": r.recipient, "candidate_id": r.candidate_id, "mailbox": r.mailbox_email,
        "subject": r.original_subject, "attempts": r.attempts, "error": r.last_error,
        "created_at": r.created_at, "sent_at": r.sent_at,
    }


@router.get("/api/integrations/replies/failed.xlsx")
def export_failed_replies(request: Request, session: Session = Depends(get_session)):
    """Excel list of candidates whose acknowledgement could not be sent."""
    from openpyxl import Workbook

    _require_admin(request)
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Failed replies"
    sheet.append(["Candidate email", "Candidate ID", "Mailbox", "Original subject", "Attempts", "Reason", "Queued at"])
    for r in MailReplyRepository(session).failed(5000):
        sheet.append([r.recipient, r.candidate_id, r.mailbox_email, r.original_subject, r.attempts,
                      r.last_error, str(r.created_at or "")])
    for column, width in zip("ABCDEFG", (34, 13, 28, 40, 10, 60, 22)):
        sheet.column_dimensions[column].width = width
    buffer = io.BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="failed_replies.xlsx"'},
    )


# ── Google Drive OAuth ─────────────────────────────────────────────────────
@router.post("/api/integrations/gdrive/exchange")
def exchange_gdrive_code(payload: GDriveExchangeRequest, request: Request):
    _require_admin(request)

    code = payload.code.strip()
    if "code=" in code:  # the whole redirect URL was pasted
        try:
            code = urllib.parse.parse_qs(urllib.parse.urlparse(code).query)["code"][0]
        except Exception:
            pass

    try:
        response = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": payload.client_id.strip("\"' "),
                "client_secret": payload.client_secret.strip("\"' "),
                "redirect_uri": "http://localhost",
                "grant_type": "authorization_code",
            },
            timeout=15,
        )
        if response.status_code != 200:
            raise HTTPException(status_code=400, detail=f"Token exchange failed: {response.text}")

        body = response.json()
        refresh_token = body.get("refresh_token")
        if not refresh_token:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Google did not return a refresh token. Google only sends the refresh token on the FIRST "
                    "authorization. Please go to Google Account Settings -> Security -> Third-party apps with "
                    "account access, remove 'Hire AI' access, and authorize again."
                ),
            )

        email = "Unknown Google Account"
        if access_token := body.get("access_token"):
            about = requests.get(
                "https://www.googleapis.com/drive/v3/about?fields=user",
                headers={"Authorization": f"Bearer {access_token}"}, timeout=10,
            )
            if about.status_code == 200:
                email = about.json().get("user", {}).get("emailAddress", email)
        return {"refresh_token": refresh_token, "email": email}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to communicate with Google API: {exc}")


# ── connection tests ───────────────────────────────────────────────────────
@router.post("/api/integrations/test")
def test_mailbox_connection(
    settings: TestMailboxRequest, request: Request, session: Session = Depends(get_session)
):
    _require_admin(request)
    row = IntegrationSettingsRepository(session).get()

    password = settings.email_pass
    if password == MASK and row is not None:
        if row.email_user and row.email_user.lower() == settings.email_user.lower():
            password = row.email_pass
        else:
            for item in _loads(row.additional_emails, []):
                if isinstance(item, dict) and str(item.get("email_user", "")).lower() == settings.email_user.lower():
                    password = item.get("email_pass", "")
                    break

    if _is_outlook(settings.imap_host) and row and row.ms_client_id and row.ms_client_secret and row.ms_tenant_id:
        return test_graph_connection(row.ms_tenant_id, row.ms_client_id, row.ms_client_secret, settings.email_user)
    return test_imap_connection(settings.imap_host, settings.imap_port, settings.email_user, password)


@router.get("/api/integrations/status")
def test_integrations_connection(request: Request, session: Session = Depends(get_session)):
    _require_admin(request)
    row = IntegrationSettingsRepository(session).get()
    if row is None or not row.email_enabled:
        return {"status": "disabled", "message": "Email integration is disabled."}

    graph_ready = bool(row.ms_client_id and row.ms_client_secret and (row.ms_tenant_id or "common"))
    tenant = row.ms_tenant_id or "common"

    if row.outlook_enabled and row.outlook_email:
        if not graph_ready:
            return {"status": "error", "message": "Microsoft Graph credentials are not fully configured."}
        return test_graph_connection(tenant, row.ms_client_id, row.ms_client_secret, row.outlook_email)

    if row.gmail_enabled and row.gmail_email:
        return test_imap_connection("imap.gmail.com", 993, row.gmail_email, row.gmail_pass)

    if not row.imap_host or not row.email_user:
        return {"status": "unconfigured", "message": "Credentials are not fully configured. Enable an integration."}
    if _is_outlook(row.imap_host):
        if not graph_ready:
            return {"status": "error", "message": "Microsoft Graph credentials are not configured in Primary Mailbox."}
        return test_graph_connection(tenant, row.ms_client_id, row.ms_client_secret, row.email_user)
    return test_imap_connection(row.imap_host, row.imap_port or 993, row.email_user, row.email_pass)


@router.post("/api/settings/test-email-template")
def test_email_template_endpoint(
    request_data: TestEmailTemplateRequest, request: Request, session: Session = Depends(get_session)
):
    _require_admin(request)
    row: Optional[IntegrationSettings] = IntegrationSettingsRepository(session).get()
    if row is None:
        return {"status": "error", "message": "Email integration is not configured."}
    if not row.email_user:
        return {"status": "error", "message": "Email user is not configured."}

    name = "Jane Doe"
    missing = "Phone, Current Location, Expected CTC" if request_data.preview_type == "missing" else ""
    subject = request_data.subject_template.replace("{{full_name}}", name)
    body = request_data.body_template.replace("{{full_name}}", name).replace("{{missing_fields}}", missing)

    try:
        if row.imap_host and _is_outlook(row.imap_host):
            if not (row.ms_client_id and row.ms_client_secret and row.ms_tenant_id):
                return {"status": "error", "message": "Microsoft Graph credentials are not fully configured."}
            sent = send_email_via_graph(
                row.ms_client_id, row.ms_client_secret, row.ms_tenant_id,
                row.email_user, request_data.recipient_email, subject, body,
            )
            if not sent:
                return {"status": "error", "message": "Failed to send email via Microsoft Graph API."}
        else:
            if not row.email_pass:
                return {"status": "error", "message": "SMTP password is not configured."}
            message = MIMEMultipart()
            message["From"], message["To"], message["Subject"] = row.email_user, request_data.recipient_email, subject
            message.attach(MIMEText(body, "plain"))
            server = smtplib.SMTP(row.smtp_host, row.smtp_port or 587, timeout=10.0)
            try:
                server.starttls()
                server.login(row.email_user, row.email_pass)
                server.sendmail(row.email_user, request_data.recipient_email, message.as_string())
            finally:
                server.quit()
        return {"status": "success", "message": f"Test email sent to {request_data.recipient_email}"}
    except Exception as exc:
        return {"status": "error", "message": f"Failed to send email: {exc}"}
