"""Background mailbox-polling worker: fetches new emails (IMAP or Microsoft
Graph/Outlook), extracts resume attachments, runs them through resume
processing, and sends themed auto-reply/acknowledgement emails.

Moved verbatim (same logic) from app/main.py:
  - process_single_mailbox()   (main.py ~5525-6354, ~830 lines -- the
    largest single function in the codebase)
  - poll_emails_and_process()  (main.py ~6355-6464, the polling loop that
    calls process_single_mailbox() on a timer)

IMPORTANT -- startup reference-before-definition hazard fixed by this move:
main.py's `@app.on_event("startup")` handler, `load_models_in_background()`
(main.py ~291-294), does:

    threading.Thread(target=poll_emails_and_process, daemon=True).start()

at line ~294 -- roughly 6,000 lines *before* `poll_emails_and_process` is
actually defined at line ~6355. That only ever worked because Python
resolves a bare name inside a function body at *call* time, not at
*def* time: by the time the startup event actually fired and the thread
function was resolved, the module had finished executing top to bottom and
the name existed in module globals. It was never safe by construction --
just accidentally safe because everything lived in one module that always
finished importing before any request (or startup event) could run.
Extracting this code into its own real, importable module removes that
fragility: `poll_emails_and_process` now exists as soon as
`app.services.email_worker` is imported, independent of where in main.py
the startup handler happens to sit relative to it.

Dependencies:
  - `process_resume`, `log_candidate`, `EXTRACT_PROMPT`, and
    `SafePyMuPDFLoader` are imported from `app.services.resume_processing`
    (resume-extraction helpers that build the LLM extraction call and
    persist the result).
  - `get_models` is imported from `app.services.ai_clients`, the single
    process-wide LLM/embeddings client cache.
  - database access goes through `app.repositories` (SQLAlchemy sessions).
"""
from __future__ import annotations

import hashlib
import imaplib
import json
import os
import re
import smtplib
from dataclasses import dataclass
from datetime import datetime
from typing import Optional
import time
from email import message_from_bytes
from email.header import decode_header
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import parseaddr

from langchain_community.document_loaders import Docx2txtLoader
from langchain_core.messages import HumanMessage

from app.core.config import UPLOAD_DIR
from app.core.logging import get_logger
from app.db.engine import session_scope
from app.repositories import (
    CandidateRepository,
    CustomColumnRepository,
    IntegrationSettingsRepository,
    MailReplyRepository,
    ProcessedEmailRepository,
)
from app.services import vector_store
from app.services.mail_filters import (
    day_bounds,
    graph_timestamp,
    in_window,
    is_automated_sender,
    received_from_header,
    to_naive_utc,
)
from app.services.ai_clients import get_models
from app.services.json_parsing import parse_llm_json
from app.services.retry import retry_with_backoff
from app.services.resume_processing import (
    EXTRACT_PROMPT,
    SafePyMuPDFLoader,
    log_candidate,
    process_resume,
)

logger = get_logger(__name__)

# ── Auto-reply themes ────────────────────────────────────────────────────────
# Moved verbatim from main.py ~4719-4787. Owned here (rather than in
# app/routers/integrations.py) because it's consumed most heavily by the
# theme-resolution logic in this file; the integrations router imports it
# back from here for its own default-settings response.
THEME_TEMPLATES = {
    'professional': {
        'subject': 'Re: {subject} (Ref: {ref})',
        'body_missing': (
            "Dear {candidate_name},\n\n"
            "Thank you for your interest in Alamaticz Solutions and for submitting your application.\n\n"
            "We appreciate the time you have taken to apply for this opportunity. To help us evaluate your profile further, "
            "kindly share the following details:\n\n"
            "{missing_fields}\n\n"
            "Once we receive the above information, our recruitment team will review your profile and get back to you regarding the next steps in the selection process.\n\n"
            "We look forward to hearing from you.\n\n"
            "Best regards,\n\n"
            "HR Team\n"
            "Alamaticz Solutions"
        ),
        'body_complete': (
            "Dear {candidate_name},\n\n"
            "Thank you for your interest in Alamaticz Solutions and for submitting your application.\n\n"
            "We appreciate the time you have taken to apply for this opportunity. Our recruitment team will review your profile and get back to you regarding the next steps in the selection process.\n\n"
            "Best regards,\n\n"
            "HR Team\n"
            "Alamaticz Solutions"
        )
    },
    'creative': {
        'subject': 'Excited to connect! Re: {subject} (Ref: {ref})',
        'body_missing': (
            "Hi {candidate_name}!\n\n"
            "Thanks for reaching out and sharing your resume with us. We love connecting with talented people!\n\n"
            "We are eager to dive into your application, but we are missing a few details. Could you please share the following with us?\n\n"
            "{missing_fields}\n\n"
            "As soon as we get these details, we'll review your profile and get back to you regarding the next steps.\n\n"
            "Can't wait to hear back from you!\n\n"
            "Cheers,\n\n"
            "The Talent Team\n"
            "Alamaticz Solutions"
        ),
        'body_complete': (
            "Hi {candidate_name}!\n\n"
            "Thanks for reaching out and sharing your application with us!\n\n"
            "We have everything we need. Our team is already looking over your profile, and we'll be in touch soon with the next steps.\n\n"
            "Have a fantastic day!\n\n"
            "Cheers,\n\n"
            "The Talent Team\n"
            "Alamaticz Solutions"
        )
    },
    'warm': {
        'subject': 'Thank you for applying! Re: {subject} (Ref: {ref})',
        'body_missing': (
            "Hello {candidate_name},\n\n"
            "We hope you are having a wonderful day! Thank you so much for taking the time to apply to our team.\n\n"
            "To help us get a better picture of your experience and fit for the role, could you please help us with these remaining details?\n\n"
            "{missing_fields}\n\n"
            "We really appreciate your support and look forward to reviewing your application as soon as we receive this.\n\n"
            "Wishing you all the best,\n\n"
            "Your Friends at HR\n"
            "Alamaticz Solutions"
        ),
        'body_complete': (
            "Hello {candidate_name},\n\n"
            "We hope you are doing well! Thank you so much for sending over your application.\n\n"
            "This is just a quick note to let you know we've received all your information. Our team will review everything carefully and get back to you soon.\n\n"
            "Take care,\n\n"
            "Your Friends at HR\n"
            "Alamaticz Solutions"
        )
    }
}


def _resolve_theme_templates(reply_theme, reply_subject, reply_body_missing, reply_body_complete):
    """Resolve the effective (subject, body_missing, body_complete) template strings.

    Extracted from a theme if/elif block that was copy-pasted 3 times inside
    `process_single_mailbox` (main.py originally at ~6068-6080, ~6091-6103,
    and ~6294-6306 -- a 4th copy lives in the `/api/integrations` GET route,
    main.py ~4880-4892, which is out of this file's territory and stays
    there). The rule in all cases is the same: a known non-custom theme
    always wins with its built-in templates; a 'custom' theme (or an
    unrecognized theme name) falls back to the caller-supplied
    subject/body_missing/body_complete, filling in the 'professional'
    defaults for whichever of those three came back empty.
    """
    subj_tpl = reply_subject
    body_missing_tpl = reply_body_missing
    body_complete_tpl = reply_body_complete

    if reply_theme in THEME_TEMPLATES:
        if reply_theme != 'custom':
            subj_tpl = THEME_TEMPLATES[reply_theme]['subject']
            body_missing_tpl = THEME_TEMPLATES[reply_theme]['body_missing']
            body_complete_tpl = THEME_TEMPLATES[reply_theme]['body_complete']
        else:
            if not subj_tpl:
                subj_tpl = THEME_TEMPLATES['professional']['subject']
            if not body_missing_tpl:
                body_missing_tpl = THEME_TEMPLATES['professional']['body_missing']
            if not body_complete_tpl:
                body_complete_tpl = THEME_TEMPLATES['professional']['body_complete']
    else:
        if not subj_tpl:
            subj_tpl = THEME_TEMPLATES['professional']['subject']
        if not body_missing_tpl:
            body_missing_tpl = THEME_TEMPLATES['professional']['body_missing']
        if not body_complete_tpl:
            body_complete_tpl = THEME_TEMPLATES['professional']['body_complete']

    return subj_tpl, body_missing_tpl, body_complete_tpl


def _get_missing_fields(candidate: dict) -> list[str]:
    """Return the human-readable list of profile fields still missing on `candidate`.

    Extracted from the 8-field "missing fields" checklist that was
    duplicated twice inside `process_single_mailbox` (main.py originally at
    ~6025-6059 for the existing-candidate follow-up path, and ~6233-6274 for
    the new-candidate path). Both copies checked the exact same 8 fields in
    the exact same order with the exact same "empty-ish" sentinel values
    (`None`, `""`, `"-"`, `"—"`, `"null"`, `"None"`), so this is a pure
    dedup with no behavior change.
    """
    missing_fields = []

    # BUG FIX: these fields are normally coerced to float by
    # `process_resume_logic`/`process_single_mailbox` before being written,
    # but `POST /api/candidates` (routers/candidates.py's
    # `add_candidate_manually`) inserts whatever the client sent for these
    # columns with no numeric coercion, so a manually-created candidate can
    # have e.g. total_experience="5+" in the DB. The old bare `float(...)`
    # call raised ValueError for that row, which the caller's enclosing
    # try/except swallowed as "ERROR sending follow-up email reply" -
    # silently skipping the candidate's acknowledgement email entirely.
    # Fall back to treating an unparseable value as present-but-unknown
    # (i.e. not "missing") rather than crashing the whole reply.
    def _to_float(val):
        try:
            return float(val)
        except (TypeError, ValueError):
            return None

    total_exp = candidate.get('total_experience')
    total_exp_f = _to_float(total_exp)
    if total_exp is None or str(total_exp).strip() == "" or (total_exp_f is not None and total_exp_f == 0.0):
        missing_fields.append("Total years of experience")

    pega_exp = candidate.get('pega_experience')
    cdh_exp = candidate.get('cdh_exp')
    pega_exp_f = _to_float(pega_exp)
    cdh_exp_f = _to_float(cdh_exp)
    has_pega = pega_exp is not None and str(pega_exp).strip() != "" and (pega_exp_f is None or pega_exp_f > 0.0)
    has_cdh = cdh_exp is not None and str(cdh_exp).strip() != "" and (cdh_exp_f is None or cdh_exp_f > 0.0)
    if not has_pega and not has_cdh:
        missing_fields.append("Relevant experience for this role")

    ctc = candidate.get('ctc')
    if not ctc or str(ctc).strip() in ("", "—", "-", "None", "null"):
        missing_fields.append("Current CTC")

    expected_ctc = candidate.get('expected_ctc')
    if not expected_ctc or str(expected_ctc).strip() in ("", "—", "-", "None", "null"):
        missing_fields.append("Expected CTC")

    notice_period = candidate.get('notice_period')
    if notice_period is None or str(notice_period).strip() in ("", "—", "-", "None", "null"):
        missing_fields.append("Notice period / Earliest joining date")

    current_location = candidate.get('current_location')
    if not current_location or str(current_location).strip() in ("", "—", "-", "None", "null"):
        missing_fields.append("Current location")

    pref_locations = candidate.get('pref_locations')
    if not pref_locations or str(pref_locations).strip() in ("", "—", "-", "None", "null"):
        missing_fields.append("Preferred work location(s)")

    linkedin = candidate.get('linkedin')
    if not linkedin or str(linkedin).strip() in ("", "—", "-", "None", "null"):
        missing_fields.append("LinkedIn profile URL")

    return missing_fields


def _is_processed(msg_uid: str) -> bool:
    with session_scope() as session:
        return ProcessedEmailRepository(session).exists(msg_uid)


def _claim_message(msg_uid: str) -> bool:
    """Record a message as being handled; ``False`` when another worker already did."""
    try:
        with session_scope() as session:
            repo = ProcessedEmailRepository(session)
            if repo.exists(msg_uid):
                return False
            repo.mark(msg_uid)
        return True
    except Exception:
        return False


def send_email_via_graph(ms_client_id, ms_client_secret, ms_tenant_id, email_user, recipient_email, subject, body):
    """Send one plain-text email through the Microsoft Graph API sendMail endpoint.

    Moved verbatim from main.py ~5400-5449 (it lives between the
    integrations routes and process_single_mailbox in the original file,
    and is called by both this module's auto-reply logic and by
    app.routers.integrations's test-email-template route).
    """
    import requests
    try:
        token_url = f"https://login.microsoftonline.com/{ms_tenant_id}/oauth2/v2.0/token"
        data = {
            "client_id": ms_client_id,
            "client_secret": ms_client_secret,
            "scope": "https://graph.microsoft.com/.default",
            "grant_type": "client_credentials"
        }
        token_res = requests.post(token_url, data=data)
        access_token = token_res.json().get("access_token")
        if not access_token:
            logger.error("Failed to get Graph API token for sending email.")
            return False

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }

        email_data = {
            "message": {
                "subject": subject,
                "body": {
                    "contentType": "Text",
                    "content": body
                },
                "toRecipients": [
                    {
                        "emailAddress": {
                            "address": recipient_email
                        }
                    }
                ]
            },
            "saveToSentItems": "true"
        }

        send_url = f"https://graph.microsoft.com/v1.0/users/{email_user}/sendMail"
        res = requests.post(send_url, headers=headers, json=email_data)

        if res.status_code == 202:
            return True
        else:
            logger.error(f"Graph API sendMail failed: {res.text}")
            return False
    except Exception as e:
        logger.error(f"Exception in send_email_via_graph: {e}")
        return False


@dataclass
class ImportGuards:
    """Which mail the poller may import (refreshed from the Connect page each cycle)."""

    date_from: Optional[str] = None
    date_to: Optional[str] = None
    skip_automated: bool = True


_guards = ImportGuards()


def _queue_reply(msg_uid: str, candidate_id, recipient: str, original_subject: str, mailbox: str) -> None:
    """Record that ``recipient`` should be acknowledged (idempotent; sends nothing)."""
    if not recipient or recipient.lower() == (mailbox or "").lower():
        return  # never reply to ourselves
    if is_automated_sender(recipient):
        return  # never reply to machines
    try:
        with session_scope() as session:
            MailReplyRepository(session).queue(msg_uid, candidate_id, recipient, original_subject, mailbox)
    except Exception as exc:
        logger.error(f"Could not queue acknowledgement for {recipient}: {exc}")


def _mailbox_transport(settings: dict, mailbox: str) -> Optional[dict]:
    """How to send as ``mailbox`` (Graph or SMTP), from the saved settings."""
    target = (mailbox or "").lower()
    ms = (settings.get("ms_client_id"), settings.get("ms_client_secret"), settings.get("ms_tenant_id"))
    graph_ok = all(ms) and settings.get("ms_tenant_id") != "common"

    if (settings.get("outlook_email") or "").lower() == target:
        return {"kind": "graph", "ms": ms} if graph_ok else None
    if (settings.get("email_user") or "").lower() == target:
        host = (settings.get("imap_host") or "").lower()
        if "office365" in host or "outlook" in host:
            return {"kind": "graph", "ms": ms} if graph_ok else None
        return {
            "kind": "smtp", "host": settings.get("smtp_host") or "smtp.gmail.com",
            "port": settings.get("smtp_port") or 587, "user": mailbox, "password": settings.get("email_pass"),
        }
    if (settings.get("gmail_email") or "").lower() == target:
        return {"kind": "smtp", "host": "smtp.gmail.com", "port": 587, "user": mailbox,
                "password": settings.get("gmail_pass")}
    try:
        for item in json.loads(settings.get("additional_emails") or "[]"):
            if str(item.get("email_user", "")).lower() == target and item.get("email_pass"):
                return {"kind": "smtp", "host": item.get("smtp_host", "smtp.gmail.com"),
                        "port": item.get("smtp_port", 587), "user": mailbox, "password": item["email_pass"]}
    except ValueError:
        pass
    return None


def send_pending_replies(settings: dict, batch: int = 25) -> int:
    """Send queued acknowledgements - only while the Connect-page switch is on.

    Every imported message has exactly one row in ``mail_replies``. A row is
    sent at most once, a recipient already answered for the same candidate is
    skipped, and replies queued while the switch was off go out once it is on.
    """
    if not settings.get("auto_reply_enabled"):
        return 0
    sent = 0
    with session_scope() as session:
        replies = MailReplyRepository(session)
        candidates = CandidateRepository(session)
        for reply in replies.pending(batch):
            if replies.already_replied(reply.recipient, reply.candidate_id):
                reply.status, reply.last_error = "skipped", "recipient already acknowledged"
                session.commit()
                continue

            candidate = candidates.get_row(reply.candidate_id) if reply.candidate_id else None
            if candidate and (
                candidate.get("candidate_status") == "Error" or "Processing" in (candidate.get("full_name") or "")
            ):
                reply.status, reply.last_error = "skipped", "candidate processing failed"
                session.commit()
                continue

            transport = _mailbox_transport(settings, reply.mailbox_email)
            reply.attempts = (reply.attempts or 0) + 1
            if transport is None:
                reply.last_error = "No sending credentials / permission for this mailbox"
                if reply.attempts >= MailReplyRepository.MAX_ATTEMPTS:
                    reply.status = "failed"
                session.commit()
                continue

            name = (candidate or {}).get("full_name") or "Candidate"
            missing = _get_missing_fields(candidate) if candidate else [
                "Total years of experience", "Relevant experience for this role", "Current CTC", "Expected CTC",
                "Notice period / Earliest joining date", "Current location", "Preferred work location(s)",
                "LinkedIn profile URL",
            ]
            subj_tpl, missing_tpl, complete_tpl = _resolve_theme_templates(
                settings.get("reply_theme") or "professional", settings.get("reply_subject"),
                settings.get("reply_body_missing"), settings.get("reply_body_complete"),
            )
            if missing:
                bullets = "\n".join(f"* {field}" for field in missing)
                body = missing_tpl.replace("{candidate_name}", name).replace("{missing_fields}", bullets)
            else:
                body = complete_tpl.replace("{candidate_name}", name)
            ref = f"CAND-{reply.candidate_id}" if reply.candidate_id else "NEW"
            subject = subj_tpl.replace("{subject}", reply.original_subject or "Application").replace("{ref}", ref)

            try:
                if transport["kind"] == "graph":
                    ok = send_email_via_graph(*transport["ms"], reply.mailbox_email, reply.recipient, subject, body)
                    if not ok:
                        raise RuntimeError("Microsoft Graph sendMail failed (the app needs the Mail.Send permission)")
                else:
                    message = MIMEMultipart()
                    message["From"], message["To"], message["Subject"] = reply.mailbox_email, reply.recipient, subject
                    message.attach(MIMEText(body, "plain"))
                    server = smtplib.SMTP(transport["host"], transport["port"], timeout=10.0)
                    try:
                        server.starttls()
                        server.login(transport["user"], transport["password"])
                        server.sendmail(reply.mailbox_email, reply.recipient, message.as_string())
                    finally:
                        server.quit()
                reply.status, reply.sent_at, reply.last_error = "sent", datetime.utcnow(), None
                sent += 1
                logger.info(f"Sent acknowledgement to {reply.recipient}")
            except Exception as exc:
                reply.last_error = str(exc)[:300]
                if reply.attempts >= MailReplyRepository.MAX_ATTEMPTS:
                    reply.status = "failed"
                logger.error(f"Acknowledgement to {reply.recipient} failed: {exc}")
            session.commit()  # persist every outcome immediately: never risk a duplicate send
    return sent


def process_single_mailbox(email_user, email_pass, imap_host, imap_port, smtp_host, smtp_port, keywords_str, reply_theme, reply_subject, reply_body_missing, reply_body_complete, ms_client_id=None, ms_client_secret=None, ms_tenant_id=None):
    logger.info(f'Starting to process mailbox for {email_user}')

    # Parse keywords
    keywords = [k.strip().lower() for k in keywords_str.split(",") if k.strip()]
    if not keywords:
        keywords = ["resume", "alamaticz", "solution", "job"]

    # Connect IMAP or Graph API
    raw_emails_to_process = []

    use_graph = False
    headers = None
    mail = None
    if 'office365' in imap_host.lower() or 'outlook' in imap_host.lower():
        with session_scope() as session:
            _settings_row = IntegrationSettingsRepository(session).get()
            ms_row = (
                (_settings_row.ms_client_id, _settings_row.ms_client_secret, _settings_row.ms_tenant_id)
                if _settings_row else None
            )

        effective_ms_client_id = ms_client_id or (ms_row[0] if ms_row else None)
        effective_ms_client_secret = ms_client_secret or (ms_row[1] if ms_row else None)
        effective_ms_tenant_id = ms_tenant_id or (ms_row[2] if ms_row else None)

        if effective_ms_client_id and effective_ms_client_secret and effective_ms_tenant_id:
            use_graph = True
            try:
                import requests
                token_url = f"https://login.microsoftonline.com/{effective_ms_tenant_id}/oauth2/v2.0/token"
                data = {
                    "client_id": effective_ms_client_id,
                    "client_secret": effective_ms_client_secret,
                    "scope": "https://graph.microsoft.com/.default",
                    "grant_type": "client_credentials"
                }
                token_res = requests.post(token_url, data=data)
                access_token = token_res.json().get("access_token")
                if access_token:
                    headers = {"Authorization": f"Bearer {access_token}"}
                    _lower, _upper = day_bounds(_guards.date_from, _guards.date_to)
                    _filters = []
                    if _lower:
                        _filters.append(f"receivedDateTime ge {graph_timestamp(_lower)}")
                    if _upper:
                        _filters.append(f"receivedDateTime le {graph_timestamp(_upper)}")
                    msg_url = (
                        f"https://graph.microsoft.com/v1.0/users/{email_user}/mailFolders/Inbox/messages"
                        f"?$top=100&$select=id,internetMessageId,receivedDateTime"
                    )
                    if _filters:
                        msg_url += "&$filter=" + " and ".join(_filters).replace(" ", "%20")
                    messages = []
                    while msg_url:
                        msg_res = requests.get(msg_url, headers=headers)
                        if msg_res.status_code == 200:
                            data = msg_res.json()
                            messages.extend(data.get('value', []))
                            msg_url = data.get('@odata.nextLink')
                        else:
                            break
                    if messages:
                        messages.sort(key=lambda m: m.get('receivedDateTime') or '')  # oldest first


                        for m in messages:
                            m_id = m['id']
                            internet_msg_id = m.get('internetMessageId', "")
                            if internet_msg_id:
                                match = re.search(r'<([^>]+)>', internet_msg_id)
                                if match:
                                    internet_msg_id = match.group(1)

                            effective_msg_id = internet_msg_id if internet_msg_id else m_id
                            exists = _is_processed(effective_msg_id)
                            if exists:
                                continue

                            mime_url = f"https://graph.microsoft.com/v1.0/users/{email_user}/messages/{m_id}/$value"
                            mime_res = requests.get(mime_url, headers=headers)
                            if mime_res.status_code == 200:
                                raw_emails_to_process.append((mime_res.content, effective_msg_id, m_id))
            except Exception as e:
                logger.error(f"Graph API Error: {e}")

    if not use_graph:
        mail = None
        try:
            mail = imaplib.IMAP4_SSL(imap_host, imap_port or 993, timeout=15)
            mail.login(email_user, email_pass)
            status_select, select_data = mail.select("inbox")

            unseen_nums = []
            status_unseen, response_unseen = mail.search(None, "UNSEEN")
            if status_unseen == "OK" and response_unseen[0]:
                unseen_nums = response_unseen[0].split()

            total_msgs = int(select_data[0]) if status_select == "OK" and select_data[0] else 0

            recent_nums = []
            if total_msgs > 0:
                # Fetch all messages instead of just the last 50
                recent_nums = [str(i).encode() for i in range(1, total_msgs + 1)]

            msg_nums_set = set(unseen_nums + recent_nums)
            msg_nums = sorted(list(msg_nums_set), key=lambda x: int(x))


            for num in msg_nums:
                try:
                    status, msg_data = mail.fetch(num, '(BODY.PEEK[HEADER.FIELDS (MESSAGE-ID DATE FROM SUBJECT)])')
                    if status == "OK" and msg_data[0]:
                        header_data = msg_data[0][1].decode('utf-8', errors='ignore')
                        _date_line = next(
                            (l.split(':', 1)[1].strip() for l in header_data.split('\n') if l.lower().startswith('date:')),
                            None,
                        )
                        if not in_window(received_from_header(_date_line), _guards.date_from, _guards.date_to):
                            continue  # outside the configured import window: leave untouched
                        msg_id = ""
                        for line in header_data.split('\n'):
                            if line.lower().startswith('message-id:'):
                                msg_id = line.split(':', 1)[1].strip()
                                match = re.search(r'<([^>]+)>', msg_id)
                                if match:
                                    msg_id = match.group(1)
                                break

                        if not msg_id:
                            msg_id = "hash_" + hashlib.md5(header_data.encode('utf-8')).hexdigest()

                        if _is_processed(msg_id):
                            continue

                        status_full, msg_data_full = mail.fetch(num, '(BODY.PEEK[])')
                        if status_full == "OK" and msg_data_full[0]:
                            raw_emails_to_process.append((msg_data_full[0][1], msg_id))
                except Exception as e:
                    logger.error(f"Error fetching IMAP email: {e}")
        except Exception as e:
            logger.error(f"IMAP Error: {e}")
        finally:
            if mail:
                try:
                    mail.logout()
                except Exception:
                    pass

    # Process all fetched emails
    for item in raw_emails_to_process:
        try:
            if isinstance(item, tuple):
                if len(item) == 3:
                    raw_email, effective_msg_id, graph_m_id = item
                else:
                    raw_email, effective_msg_id = item
                    graph_m_id = None
            else:
                raw_email = item
                effective_msg_id = None
                graph_m_id = None

            msg = message_from_bytes(raw_email)

            # Extract Message-ID
            if effective_msg_id:
                msg_id = effective_msg_id
            else:
                msg_id = msg.get("Message-ID", "")
                if msg_id:
                    match = re.search(r'<([^>]+)>', msg_id)
                    if match:
                        msg_id = match.group(1)

                if not msg_id:
                    # Fallback: hash of headers to make a pseudo ID
                    subject_header = str(msg.get("Subject", ""))
                    date_header = str(msg.get("Date", ""))
                    from_header = str(msg.get("From", ""))
                    header_text2 = f"Subject: {subject_header}\nDate: {date_header}\nFrom: {from_header}\n\n"
                    msg_id = hashlib.md5(header_text2.encode('utf-8', errors='ignore')).hexdigest()

            # Check if already processed or being processed by another worker
            exists = _is_processed(msg_id)

            if exists:
                continue

            # Mark email as processing immediately to prevent multiple workers from picking it up
            # and to prevent infinite retry loops if an exception occurs later
            if not _claim_message(msg_id):
                continue  # another worker already took this message

            # Extract Subject, From, Body
            subject_header = msg.get("Subject", "")
            decoded_subject = ""
            for part, encoding in decode_header(subject_header):
                if isinstance(part, bytes):
                    decoded_subject += part.decode(encoding or "utf-8", errors="ignore")
                else:
                    decoded_subject += str(part)

            from_header = msg.get("From", "")
            decoded_from = ""
            for part, encoding in decode_header(from_header):
                if isinstance(part, bytes):
                    decoded_from += part.decode(encoding or "utf-8", errors="ignore")
                else:
                    decoded_from += str(part)

            # --- PREVENT INFINITE BOUNCE LOOPS ---
            subject_lower = decoded_subject.lower()
            from_lower = decoded_from.lower()
            is_bounce = False

            if "undeliverable:" in subject_lower or "delivery status notification" in subject_lower or "delivery failure" in subject_lower or "returned mail" in subject_lower:
                is_bounce = True
            if "postmaster@" in from_lower or "mailer-daemon@" in from_lower or "noreply@" in from_lower or "no-reply@" in from_lower:
                is_bounce = True

            if _guards.skip_automated and is_automated_sender(parseaddr(decoded_from)[1]):
                logger.info(f"Skipping automated sender {decoded_from!r} (subject {decoded_subject!r}).")
                continue

            if is_bounce:
                logger.info(f"Skipping bounce/automated message from {decoded_from} with subject '{decoded_subject}' to prevent infinite auto-reply loop.")
                continue

            # Extract plain text body
            body_text = ""
            attachments = []
            if msg.is_multipart():
                for part in msg.walk():
                    content_type = part.get_content_type()
                    content_disposition = str(part.get("Content-Disposition"))
                    if content_type == "text/plain" and "attachment" not in content_disposition:
                        payload = part.get_payload(decode=True)
                        if payload:
                            body_text += payload.decode(part.get_content_charset() or "utf-8", errors="ignore")
                    elif "attachment" in content_disposition or part.get_filename():
                        filename = part.get_filename()
                        if filename:
                            decoded_filename = ""
                            for filename_part, encoding in decode_header(filename):
                                if isinstance(filename_part, bytes):
                                    decoded_filename += filename_part.decode(encoding or "utf-8", errors="ignore")
                                else:
                                    decoded_filename += str(filename_part)
                            if decoded_filename:
                                attachments.append((decoded_filename, part.get_payload(decode=True)))
            else:
                payload = msg.get_payload(decode=True)
                if payload:
                    body_text = payload.decode(msg.get_content_charset() or "utf-8", errors="ignore")

            # Fetch attachments explicitly from Graph API if they were stripped from the MIME $value
            if graph_m_id and headers:
                try:
                    import base64
                    import requests
                    attach_url = f"https://graph.microsoft.com/v1.0/users/{email_user}/messages/{graph_m_id}/attachments"
                    attach_res = requests.get(attach_url, headers=headers)
                    if attach_res.status_code == 200:
                        graph_attachments = attach_res.json().get('value', [])
                        for att in graph_attachments:
                            if att.get('@odata.type') == '#microsoft.graph.fileAttachment':
                                att_name = att.get('name')
                                content_bytes_b64 = att.get('contentBytes', '')
                                if content_bytes_b64 and att_name:
                                    att_content_bytes = base64.b64decode(content_bytes_b64)
                                    # Prefer Graph API attachment over MIME parsing
                                    # because Graph API MIME $value often strips attachment content.
                                    # Remove existing attachment with same name to prevent duplicates and bad data.
                                    attachments = [a for a in attachments if a[0].lower() != att_name.lower()]
                                    attachments.append((att_name, att_content_bytes))
                except Exception as g_err:
                    logger.error(f"Error fetching explicit Graph API attachments for {graph_m_id}: {g_err}")

            # Check if this email is from an existing candidate (via Ref tag in Subject, or matching sender email)
            sender_name, sender_email = parseaddr(decoded_from)
            mail_received_at = to_naive_utc(received_from_header(msg.get('Date')))
            matched_candidate_row = None

            # 1. Search by reference ID in subject
            match_ref = re.search(r'Ref:\s*CAND-(\d+)', decoded_subject, re.IGNORECASE)
            if match_ref:
                try:
                    ref_candidate_id = int(match_ref.group(1))
                    with session_scope() as session:
                        matched_candidate_row = CandidateRepository(session).get_row(ref_candidate_id)
                except Exception as e_ref:
                    logger.error(f"ERROR matching by Ref ID in subject: {e_ref}")
            # 2. Fall back to search by sender email address
            if not matched_candidate_row and sender_email:
                try:
                    with session_scope() as session:
                        matched_candidate_row = CandidateRepository(session).find_by_sender_or_email(sender_email)
                except Exception as e_email:
                    logger.error(f"ERROR matching by sender email: {e_email}")

            if matched_candidate_row:
                existing_candidate = dict(matched_candidate_row)
                logger.info(f"Identified follow-up email from existing candidate ID {existing_candidate['id']} ({existing_candidate['full_name']})")

                # Check if a new resume file is attached and download/index it
                new_filename = None
                new_file_bytes = None
                resume_text = ""
                if attachments:
                    has_resume = any(
                        fname.lower().endswith((".pdf", ".docx"))
                        for fname, _ in attachments if fname
                    )
                    if has_resume:
                        for fname, content in attachments:
                            if not content:
                                continue
                            f_lower = fname.lower()
                            if f_lower.endswith(".pdf") or f_lower.endswith(".docx"):
                                safe_name = re.sub(r'[^a-zA-Z0-9._-]', '_', fname)
                                safe_name = f"mail_{hashlib.md5(msg_id.encode()).hexdigest()[:8]}_{safe_name}"
                                fpath = os.path.join(UPLOAD_DIR, safe_name)
                                with open(fpath, "wb") as f_out:
                                    f_out.write(content)
                                new_filename = safe_name
                                new_file_bytes = content

                                # Extract the text and index it for semantic search
                                try:
                                    if safe_name.lower().endswith(".pdf"):
                                        loader = SafePyMuPDFLoader(fpath)
                                    else:
                                        loader = Docx2txtLoader(fpath)
                                    docs = loader.load()
                                    resume_text = "\n".join([d.page_content for d in docs])
                                    vector_store.index_documents(docs, safe_name)
                                except Exception as pg_err:
                                    logger.error(f"Error indexing updated resume: {pg_err}")
                                finally:
                                    try:
                                        if os.path.exists(fpath):
                                            os.remove(fpath)
                                    except Exception:
                                        pass
                                break

                # Use EXTRACT_PROMPT to parse the combined new resume content and/or email text
                combined_text = resume_text[:7000] if resume_text else ""
                if body_text:
                    combined_text += f"\n\n=== EMAIL MESSAGE BODY ===\n{body_text}\n=========================="

                with session_scope() as session:
                    custom_cols = [
                        (c.col_key, c.col_label, c.description)
                        for c in CustomColumnRepository(session).list_all()
                    ]

                custom_fields_str = ""
                if custom_cols:
                    for col_key, col_label, desc in custom_cols:
                        desc_str = f"Extract data corresponding to column heading '{col_label}'"
                        if desc:
                            desc_str += f" ({desc})"
                        custom_fields_str += f',\n  "{col_key}": "<{desc_str}>"'

                prompt_str = EXTRACT_PROMPT.format(text=combined_text, custom_fields=custom_fields_str)

                _, llm = get_models()
                parsed_data = {}
                try:
                    # Shared retry helper (was a hand-rolled max_retries=3 / flat
                    # 3s-sleep / "429" in str(err) loop inline here).
                    resp = retry_with_backoff(
                        lambda: llm.invoke([HumanMessage(content=prompt_str)]),
                        max_retries=3,
                        base_delay=3.0,
                    )
                    if resp is not None:
                        # Shared fence-stripping + bracket-slicing JSON extraction
                        # helper (was inline ```json fence/bracket-slicing here).
                        parsed_data = parse_llm_json(resp.content, bracket="{")
                except Exception as llm_err:
                    logger.error(f"ERROR parsing follow-up email/resume via LLM: {llm_err}")

                # Normalization & Validation
                # Phone: Keep only digits and +
                if 'phone' in parsed_data and parsed_data['phone']:
                    parsed_data['phone'] = re.sub(r'[^\d+]', '', str(parsed_data['phone']))

                # Email: Basic validation
                if 'email' in parsed_data and parsed_data['email']:
                    if '@' not in str(parsed_data['email']):
                        parsed_data['email'] = ""

                # Experience: Force float
                for exp_field in ['total_experience', 'pega_experience', 'cdh_exp']:
                    if exp_field in parsed_data and parsed_data[exp_field] not in [None, ""]:
                        try:
                            match = re.search(r'\d+(\.\d+)?', str(parsed_data[exp_field]))
                            parsed_data[exp_field] = float(match.group()) if match else 0.0
                        except Exception:
                            parsed_data[exp_field] = 0.0

                # Integer fields
                for num_field in ['notice_period', 'availability_in_days']:
                    if num_field in parsed_data and parsed_data[num_field] not in [None, ""]:
                        np_str = str(parsed_data[num_field]).lower()
                        if 'immediate' in np_str:
                            parsed_data[num_field] = 0
                        else:
                            try:
                                match = re.search(r'\d+', np_str)
                                val = int(match.group()) if match else ""
                                if match and 'month' in np_str:
                                    val = val * 30
                                parsed_data[num_field] = val
                            except Exception:
                                parsed_data[num_field] = ""

                # Update existing row with all dynamic columns
                updates = {}
                with session_scope() as session:
                    allowed_cols = CandidateRepository(session).column_names

                for k, v in parsed_data.items():
                    if k in allowed_cols and k not in ('id', 'filename', 'full_name'):
                        if v is not None and str(v).strip() not in ("", "null", "None"):
                            updates[k] = v

                if new_filename:
                    updates['filename'] = new_filename
                    if new_file_bytes:
                        updates['file_bytes'] = new_file_bytes
                if sender_email:
                    updates['sender_email'] = sender_email
                updates['source'] = 'uploaded from mail'

                # Merge email message body
                old_msg = existing_candidate.get('email_message') or ""
                new_msg = f"{old_msg}\n\n=== FOLLOW-UP EMAIL MESSAGE ===\n{body_text}".strip()
                updates['email_message'] = new_msg

                # Reset formatted resume cache
                updates['formatted_json'] = None

                if updates:
                    try:
                        with session_scope() as session:
                            CandidateRepository(session).update(existing_candidate['id'], updates)
                        logger.info(f"Successfully updated candidate ID {existing_candidate['id']} with follow-up details.")
                    except Exception as db_update_err:
                        logger.error(f"ERROR updating candidate from follow-up email: {db_update_err}")

                # Recheck missing fields on updated profile
                try:
                    with session_scope() as session:
                        updated_candidate = CandidateRepository(session).get_row(existing_candidate['id']) or {}

                    candidate_email = updated_candidate.get('email')
                    recipient_email = candidate_email if candidate_email and str(candidate_email).strip() not in ("", "null", "None") else sender_email
                    # Queue only: the poller sends it later if (and only if) auto-reply is switched on.
                    _queue_reply(msg_id, updated_candidate.get('id'), recipient_email, decoded_subject, email_user)
                except Exception as reply_err:
                    logger.error(f"ERROR sending follow-up email reply: {reply_err}")

                # Email is already marked as processed at the top of the loop
                continue

            # Check if the email contains any resume attachments (.pdf or .docx)
            has_resume_attachment = False
            if attachments:
                has_resume_attachment = any(
                    fname.lower().endswith((".pdf", ".docx"))
                    for fname, _ in attachments if fname
                )

            # Always match if there is a resume attachment, otherwise fall back to keyword match
            match_found = has_resume_attachment
            if not match_found:
                attachment_names = " ".join([fname for fname, _ in attachments if fname]) if attachments else ""
                search_content = f"{decoded_subject} {body_text} {attachment_names}".lower()
                for kw in keywords:
                    if kw in search_content:
                        match_found = True
                        break

            processed_attachment = False
            if match_found and attachments:
                # Only proceed if there is at least one resume attachment (.pdf or .docx)
                has_resume = any(
                    fname.lower().endswith(".pdf") or fname.lower().endswith(".docx")
                    for fname, _ in attachments if fname
                )
                if has_resume:
                    # Process attachments
                    for fname, content in attachments:
                        if not content:
                            continue
                        f_lower = fname.lower()
                        if f_lower.endswith(".pdf") or f_lower.endswith(".docx"):
                            safe_name = re.sub(r'[^a-zA-Z0-9._-]', '_', fname)
                            safe_name = f"mail_{hashlib.md5(msg_id.encode()).hexdigest()[:8]}_{safe_name}"
                            fpath = os.path.join(UPLOAD_DIR, safe_name)
                            with open(fpath, "wb") as f_out:
                                f_out.write(content)

                            try:
                                placeholder_id = log_candidate({
                                    "filename": safe_name,
                                    "full_name": f"⏳ Processing: {safe_name}",
                                    "is_approved": 1,
                                    "created_by": "email_worker",
                                    "file_bytes": content,
                                    "file_url": None,
                                    "source": "Email"
                                })
                                process_resume(safe_name, fpath, is_approved=1, username="email_worker", email_message=body_text, sender_email=sender_email, file_url=None, placeholder_id=placeholder_id)
                                if mail_received_at:
                                    with session_scope() as session:
                                        CandidateRepository(session).update(placeholder_id, {'mail_received_at': mail_received_at})
                                processed_attachment = True
                            except Exception as e_proc:
                                logger.error(f"ERROR: Failed processing resume {safe_name} from email: {e_proc}")

                if has_resume_attachment and not processed_attachment:
                    logger.warning(f"Email {msg_id} has resume attachment, but processing failed. Skipping DB log to allow retry.")
                    continue

                if processed_attachment:
                    # Mark email as read on server
                    if mail:
                        try:
                            mail.store(num, '+FLAGS', '\\Seen')
                        except Exception:
                            pass

                    # Send auto acknowledgment
                    try:
                        sender_name, sender_email = parseaddr(from_header)
                        if sender_email:
                            # Fetch parsed candidate metadata to find missing fields
                            candidate = None
                            try:
                                with session_scope() as session:
                                    candidate = CandidateRepository(session).find_latest_by_filename(safe_name)
                            except Exception as db_err:
                                logger.error(f"ERROR: Failed to fetch candidate metadata for auto-acknowledgement: {db_err}")

                            if candidate and (candidate.get("candidate_status") == "Error" or "⏳ Processing" in candidate.get("full_name", "")):
                                logger.warning(f"Candidate {safe_name} processing failed or incomplete. Skipping auto-reply.")
                                continue

                            candidate_email = candidate.get('email') if candidate else None
                            recipient_email = candidate_email if candidate_email and str(candidate_email).strip() not in ("", "null", "None") else sender_email
                            # Queue only: sent later, once, and only while auto-reply is on.
                            _queue_reply(
                                msg_id, candidate.get('id') if candidate else None,
                                recipient_email, decoded_subject, email_user,
                            )
                    except Exception as smtp_err:
                        logger.error(f"ERROR: Failed sending auto-acknowledgement: {smtp_err}")

            # Email already marked as processed at the start of the loop

        except Exception as msg_err:
            logger.error(f"ERROR: Failed processing single email: {msg_err}")


def poll_emails_and_process():
    logger.info("Starting background email worker thread...")
    while True:
        try:
            # Fetch settings from DB (robust: handle missing columns gracefully)
            with session_scope() as session:
                _row = IntegrationSettingsRepository(session).get()
                row = {c.name: getattr(_row, c.name) for c in _row.__table__.columns} if _row else None

            if not row:
                time.sleep(30)
                continue

            settings = row
            _guards.date_from = settings.get("mail_import_from") or None
            _guards.date_to = settings.get("mail_import_to") or None
            _guards.skip_automated = settings.get("skip_automated_senders") not in (0, False)
            email_enabled = settings.get("email_enabled", 0)
            imap_host = settings.get("imap_host", "")
            imap_port = settings.get("imap_port", 993)
            smtp_host = settings.get("smtp_host", "smtp.gmail.com")
            smtp_port = settings.get("smtp_port", 587)
            email_user = settings.get("email_user", "")
            email_pass = settings.get("email_pass", "")
            keywords_str = settings.get("keywords", "resume,alamaticz,solution,job")
            reply_theme = settings.get("reply_theme", "professional")
            reply_subject = settings.get("reply_subject", "Re: {subject} (Ref: {ref})")
            reply_body_missing = settings.get("reply_body_missing", None)
            reply_body_complete = settings.get("reply_body_complete", None)
            additional_emails_raw = settings.get("additional_emails", None)
            ms_client_id = settings.get("ms_client_id", "")
            ms_client_secret = settings.get("ms_client_secret", "")
            ms_tenant_id = settings.get("ms_tenant_id", "common")

            gmail_enabled = settings.get("gmail_enabled", 0)
            gmail_email = settings.get("gmail_email", "")
            gmail_pass = settings.get("gmail_pass", "")
            outlook_enabled = settings.get("outlook_enabled", 0)
            outlook_email = settings.get("outlook_email", "")

            # 1. Process legacy primary email if enabled
            if email_enabled and imap_host and email_user and email_pass:
                try:
                    process_single_mailbox(
                        email_user, email_pass, imap_host, imap_port,
                        smtp_host, smtp_port, keywords_str,
                        reply_theme, reply_subject, reply_body_missing, reply_body_complete,
                        ms_client_id, ms_client_secret, ms_tenant_id
                    )
                except Exception as prim_err:
                    logger.error(f"ERROR processing legacy primary mailbox {email_user}: {prim_err}")

            # 1b. Process Gmail if enabled
            if gmail_enabled and gmail_email and gmail_pass:
                try:
                    process_single_mailbox(
                        gmail_email, gmail_pass, "imap.gmail.com", 993,
                        "smtp.gmail.com", 587, keywords_str,
                        reply_theme, reply_subject, reply_body_missing, reply_body_complete,
                        None, None, None
                    )
                except Exception as gmail_err:
                    logger.error(f"ERROR processing Gmail mailbox {gmail_email}: {gmail_err}")

            # 1c. Process Outlook if enabled
            if outlook_enabled and outlook_email and ms_client_id and ms_client_secret and ms_tenant_id:
                try:
                    # NOTE: "dummy_pass" is intentionally passed as the IMAP
                    # password here. It is never actually used: process_single_mailbox
                    # detects the Outlook/Graph path purely by hostname substring
                    # ("outlook.office365.com" below matches 'office365' in
                    # imap_host.lower()) and takes the Graph API branch, which
                    # authenticates with ms_client_id/ms_client_secret/ms_tenant_id
                    # instead of a mailbox password. This is fragile, undocumented
                    # coupling between the hostname string and the auth branch --
                    # preserved as-is from main.py (original ~6424) rather than
                    # fixed here, but flagged as worth a future cleanup (e.g. an
                    # explicit `use_graph=True` parameter instead of a hostname
                    # sniff + throwaway password).
                    process_single_mailbox(
                        outlook_email, "dummy_pass", "outlook.office365.com", 993,
                        "smtp.office365.com", 587, keywords_str,
                        reply_theme, reply_subject, reply_body_missing, reply_body_complete,
                        ms_client_id, ms_client_secret, ms_tenant_id
                    )
                except Exception as outlook_err:
                    logger.error(f"ERROR processing Outlook mailbox {outlook_email}: {outlook_err}")

            # 2. Process additional emails if configured
            if additional_emails_raw:
                try:
                    add_emails = json.loads(additional_emails_raw)
                    for item in add_emails:
                        if item.get("email_enabled") and item.get("email_user") and item.get("email_pass"):
                            try:
                                process_single_mailbox(
                                    item.get("email_user"),
                                    item.get("email_pass"),
                                    item.get("imap_host", "imap.gmail.com"),
                                    item.get("imap_port", 993),
                                    item.get("smtp_host", "smtp.gmail.com"),
                                    item.get("smtp_port", 587),
                                    keywords_str,
                                    reply_theme,
                                    reply_subject,
                                    reply_body_missing,
                                    reply_body_complete,
                                    ms_client_id,
                                    ms_client_secret,
                                    ms_tenant_id
                                )
                            except Exception as add_err:
                                logger.error(f"ERROR processing additional mailbox {item.get('email_user')}: {add_err}")
                except Exception as json_err:
                    logger.error(f"ERROR parsing additional_emails from DB: {json_err}")

            # 3. Send queued acknowledgements (no-op while the Connect-page switch is off)
            try:
                send_pending_replies(settings)
            except Exception as reply_err:
                logger.error(f"ERROR sending queued acknowledgements: {reply_err}")

        except Exception as conn_err:
            logger.error(f"ERROR: Email background loop connection error: {conn_err}")

        # Poll every 1 minute as requested
        time.sleep(60)
