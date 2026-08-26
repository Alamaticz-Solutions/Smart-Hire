"""Integrations settings / connection-test routes.

Moved verbatim (same paths/methods/logic) from app/main.py:
  - GET    /api/integrations                     (main.py ~4821-4958)
  - POST   /api/integrations                      (main.py ~4960-5101)
  - POST   /api/integrations/gdrive/exchange       (main.py ~5108-5172)
  - POST   /api/integrations/test                  (main.py ~5180-5269)
  - GET    /api/integrations/status                 (main.py ~5271-5398)
  - POST   /api/settings/test-email-template        (main.py ~5457-5523)

Plus the Pydantic request models that were colocated with them in main.py:
  IntegrationSettingsRequest, GDriveExchangeRequest, TestMailboxRequest,
  TestEmailTemplateRequest.

The `/api/integrations/test` and `/api/integrations/status` routes
originally each hand-rolled their own ~90-130 line IMAP-login-probe and
Microsoft-Graph-token-probe logic (four near-identical copies total across
the two routes). Both now call the shared `test_imap_connection` /
`test_graph_connection` helpers in app.services.integrations_test instead
-- see that module's docstring for the extraction details. One cosmetic
side effect of the dedup: the generic-IMAP success message in
`/api/integrations/status` changes from the original literal
"Successfully connected to Mailbox!" to "Successfully connected to
{email_user}!" (matching the shared helper's message, which is what every
other IMAP-success branch already returned) -- purely a message-text
change, no behavior change.

`THEME_TEMPLATES` and `send_email_via_graph` are imported from
app.services.email_worker (same agent, same phase) rather than duplicated
here -- see that module's docstring for why it owns them.

DB access uses `get_db_connection()` (app.db.session) instead of raw
`sqlite3.connect(STATS_DB, ...)` so connections are always closed.
"""
import json
import sqlite3
import urllib.parse
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.core.logging import get_logger
from app.db.session import get_db_connection
from app.services.auth import get_user_role
from app.services.email_worker import THEME_TEMPLATES, send_email_via_graph
from app.services.integrations_test import test_graph_connection, test_imap_connection

logger = get_logger(__name__)

router = APIRouter()


def _log_activity_db(username: str, action: str) -> None:
    """Insert one row into activity_logs. Mirrors main.py's log_activity_db /
    the private copy in app/routers/health.py -- used here only by
    save_integrations_settings.
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
    reply_theme: Optional[str] = "professional"
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


@router.get("/api/integrations")
def get_integrations_settings(request: Request):
    username = request.headers.get("x-user-username")
    role = get_user_role(username)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT email_enabled, imap_host, imap_port, smtp_host, smtp_port,
                   email_user, email_pass, keywords, drive_enabled,
                   reply_theme, reply_subject, reply_body_missing, reply_body_complete,
                   gdrive_client_id, gdrive_client_secret, gdrive_refresh_token, gdrive_folder_id, gdrive_email,
                   ms_client_id, ms_client_secret, ms_tenant_id,
                   additional_emails, theme_usage_counts,
                   gmail_enabled, gmail_email, gmail_pass, outlook_enabled, outlook_email, default_resume_template
            FROM integrations_settings LIMIT 1
        """)
        row = cur.fetchone()

    if not row:
        return {
            "email_enabled": 0, "imap_host": "imap.gmail.com", "imap_port": 993,
            "smtp_host": "smtp.gmail.com", "smtp_port": 587, "email_user": "",
            "email_pass": "", "keywords": "resume,alamaticz,solution,job", "drive_enabled": 0,
            "reply_theme": "professional",
            "reply_subject": "Re: {subject} (Ref: {ref})",
            "reply_body_missing": THEME_TEMPLATES["professional"]["body_missing"],
            "reply_body_complete": THEME_TEMPLATES["professional"]["body_complete"],
            "gdrive_client_id": "",
            "gdrive_client_secret": "",
            "gdrive_refresh_token": "",
            "gdrive_folder_id": "",
            "gdrive_email": "",
            "ms_client_id": "",
            "ms_client_secret": "",
            "ms_tenant_id": "common",
            "gmail_enabled": 0,
            "gmail_email": "",
            "gmail_pass": "",
            "outlook_enabled": 0,
            "outlook_email": "",
            "default_resume_template": "alamaticz",
            "additional_emails": "[]",
            "theme_usage_counts": "{}"
        }

    masked_pass = ""
    if row[6]:
        masked_pass = "****"

    reply_theme = row[9] or "professional"
    reply_subject = row[10]
    reply_body_missing = row[11]
    reply_body_complete = row[12]

    # Load default templates if preset is not custom
    if reply_theme in THEME_TEMPLATES:
        if reply_theme != 'custom':
            reply_subject = THEME_TEMPLATES[reply_theme]['subject']
            reply_body_missing = THEME_TEMPLATES[reply_theme]['body_missing']
            reply_body_complete = THEME_TEMPLATES[reply_theme]['body_complete']
        else:
            if not reply_subject: reply_subject = THEME_TEMPLATES['professional']['subject']
            if not reply_body_missing: reply_body_missing = THEME_TEMPLATES['professional']['body_missing']
            if not reply_body_complete: reply_body_complete = THEME_TEMPLATES['professional']['body_complete']
    else:
        if not reply_subject: reply_subject = THEME_TEMPLATES['professional']['subject']
        if not reply_body_missing: reply_body_missing = THEME_TEMPLATES['professional']['body_missing']
        if not reply_body_complete: reply_body_complete = THEME_TEMPLATES['professional']['body_complete']

    masked_gdrive_secret = ""
    if row[14]:
        masked_gdrive_secret = "****"

    masked_gdrive_refresh = ""
    if row[15]:
        masked_gdrive_refresh = "****"

    masked_ms_secret = ""
    if row[19]:
        masked_ms_secret = "****"

    ms_tenant_id = row[20] or "common"

    additional_emails_raw = row[21] if len(row) > 21 else "[]"
    masked_additional_emails = "[]"
    if additional_emails_raw:
        try:
            add_emails = json.loads(additional_emails_raw)
            for item in add_emails:
                if item.get("email_pass"):
                    item["email_pass"] = "****"
            masked_additional_emails = json.dumps(add_emails)
        except Exception:
            pass

    theme_usage_counts = row[22] if len(row) > 22 else "{}"

    gmail_enabled = row[23] if len(row) > 23 else 0
    gmail_email = row[24] if len(row) > 24 else ""
    gmail_pass_masked = "****" if len(row) > 25 and row[25] else ""
    outlook_enabled = row[26] if len(row) > 26 else 0
    outlook_email = row[27] if len(row) > 27 else ""

    return {
        "email_enabled": row[0],
        "imap_host": row[1] or "imap.gmail.com",
        "imap_port": row[2] or 993,
        "smtp_host": row[3] or "smtp.gmail.com",
        "smtp_port": row[4] or 587,
        "email_user": row[5] or "",
        "email_pass": masked_pass,
        "keywords": row[7] or "resume,alamaticz,solution,job",
        "drive_enabled": row[8],
        "reply_theme": reply_theme,
        "reply_subject": reply_subject,
        "reply_body_missing": reply_body_missing,
        "reply_body_complete": reply_body_complete,
        "gdrive_client_id": row[13] or "",
        "gdrive_client_secret": masked_gdrive_secret,
        "gdrive_refresh_token": masked_gdrive_refresh,
        "gdrive_folder_id": row[16] or "",
        "gdrive_email": row[17] or "",
        "ms_client_id": row[18] or "",
        "ms_client_secret": masked_ms_secret,
        "ms_tenant_id": ms_tenant_id,
        "gmail_enabled": gmail_enabled,
        "gmail_email": gmail_email,
        "gmail_pass": gmail_pass_masked,
        "outlook_enabled": outlook_enabled,
        "outlook_email": outlook_email,
        "additional_emails": masked_additional_emails,
        "theme_usage_counts": theme_usage_counts,
        "default_resume_template": row[28] if len(row) > 28 and row[28] else "alamaticz"
    }


@router.post("/api/integrations")
def save_integrations_settings(settings: IntegrationSettingsRequest, request: Request):
    username = request.headers.get("x-user-username")
    role = get_user_role(username)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    with get_db_connection() as conn:
        cur = conn.cursor()

        cur.execute("SELECT id, email_pass, gdrive_client_secret, gdrive_refresh_token, ms_client_secret, ms_tenant_id, additional_emails, theme_usage_counts, gmail_pass FROM integrations_settings LIMIT 1")
        row = cur.fetchone()

        final_pass = settings.email_pass
        if final_pass == "****" and row:
            final_pass = row[1]

        final_gmail_pass = settings.gmail_pass
        if final_gmail_pass == "****" and row and len(row) > 8:
            final_gmail_pass = row[8]

        final_gdrive_secret = settings.gdrive_client_secret
        if final_gdrive_secret == "****" and row:
            final_gdrive_secret = row[2]

        final_gdrive_refresh = settings.gdrive_refresh_token
        if final_gdrive_refresh == "****" and row:
            final_gdrive_refresh = row[3]

        final_ms_secret = settings.ms_client_secret
        if final_ms_secret == "****" and row:
            final_ms_secret = row[4]

        final_ms_tenant = settings.ms_tenant_id

        # Handle additional_emails passwords restoration
        try:
            new_list = json.loads(settings.additional_emails or "[]")
        except Exception:
            new_list = []

        old_passwords = {}
        if row and len(row) > 6 and row[6]:
            try:
                old_list = json.loads(row[6])
                for item in old_list:
                    if "email_user" in item and "email_pass" in item:
                        old_passwords[item["email_user"].lower()] = item["email_pass"]
            except Exception:
                pass

        for item in new_list:
            if item.get("email_pass") == "****" and item.get("email_user"):
                item["email_pass"] = old_passwords.get(item["email_user"].lower(), "")

        final_additional_emails = json.dumps(new_list)

        # Load and increment theme usage count
        current_counts = {}
        if row and len(row) > 7 and row[7]:
            try:
                current_counts = json.loads(row[7])
            except Exception:
                current_counts = {}
        selected_theme = settings.reply_theme or "professional"
        current_counts[selected_theme] = current_counts.get(selected_theme, 0) + 1
        final_theme_usage = json.dumps(current_counts)

        if row:
            cur.execute("""
            UPDATE integrations_settings SET
                email_enabled = ?, imap_host = ?, imap_port = ?,
                smtp_host = ?, smtp_port = ?, email_user = ?,
                email_pass = ?, keywords = ?, drive_enabled = ?,
                reply_theme = ?, reply_subject = ?,
                reply_body_missing = ?, reply_body_complete = ?,
                gdrive_client_id = ?, gdrive_client_secret = ?,
                gdrive_refresh_token = ?, gdrive_folder_id = ?,
                gdrive_email = ?, ms_client_id = ?, ms_client_secret = ?,
                ms_tenant_id = ?, additional_emails = ?,
                theme_usage_counts = ?,
                gmail_enabled = ?, gmail_email = ?, gmail_pass = ?,
                outlook_enabled = ?, outlook_email = ?,
                default_resume_template = ?
            WHERE id = ?
            """, (settings.email_enabled, settings.imap_host, settings.imap_port,
                  settings.smtp_host, settings.smtp_port, settings.email_user,
                  final_pass, settings.keywords, settings.drive_enabled,
                  settings.reply_theme, settings.reply_subject,
                  settings.reply_body_missing, settings.reply_body_complete,
                  settings.gdrive_client_id, final_gdrive_secret,
                  final_gdrive_refresh, settings.gdrive_folder_id,
                  settings.gdrive_email, settings.ms_client_id, final_ms_secret,
                  final_ms_tenant, final_additional_emails, final_theme_usage,
                  settings.gmail_enabled, settings.gmail_email, final_gmail_pass,
                  settings.outlook_enabled, settings.outlook_email, settings.default_resume_template, row[0]))
        else:
            cur.execute("""
            INSERT INTO integrations_settings (
                email_enabled, imap_host, imap_port, smtp_host, smtp_port, email_user, email_pass, keywords, drive_enabled,
                reply_theme, reply_subject, reply_body_missing, reply_body_complete,
                gdrive_client_id, gdrive_client_secret, gdrive_refresh_token, gdrive_folder_id, gdrive_email,
                ms_client_id, ms_client_secret, ms_tenant_id, additional_emails,
                theme_usage_counts, gmail_enabled, gmail_email, gmail_pass, outlook_enabled, outlook_email, default_resume_template
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (settings.email_enabled, settings.imap_host, settings.imap_port,
                  settings.smtp_host, settings.smtp_port, settings.email_user,
                  final_pass, settings.keywords, settings.drive_enabled,
                  settings.reply_theme, settings.reply_subject,
                  settings.reply_body_missing, settings.reply_body_complete,
                  settings.gdrive_client_id, final_gdrive_secret,
                  settings.gdrive_refresh_token, settings.gdrive_folder_id,
                  settings.gdrive_email, settings.ms_client_id, final_ms_secret,
                  final_ms_tenant, final_additional_emails, final_theme_usage,
                  settings.gmail_enabled, settings.gmail_email, final_gmail_pass,
                  settings.outlook_enabled, settings.outlook_email, settings.default_resume_template))

        if settings.email_enabled == 0:
            try:
                cur.execute("SELECT id, filename FROM candidate_metadata WHERE source = 'uploaded from mail'")
                email_candidates = cur.fetchall()
                for cand_id, filename in email_candidates:
                    if filename:
                        import os
                        from app.core.config import UPLOAD_DIR
                        file_path = os.path.join(UPLOAD_DIR, filename)
                        if os.path.exists(file_path):
                            try:
                                os.remove(file_path)
                                logger.info(f"Deleted email candidate file: {file_path}")
                            except Exception as file_err:
                                logger.error(f"Error deleting file {file_path}: {file_err}")

                    cur.execute("DELETE FROM job_candidates WHERE candidate_id = ?", (cand_id,))
                    cur.execute("DELETE FROM candidate_metadata WHERE id = ?", (cand_id,))
                logger.info(f"Deleted {len(email_candidates)} email-imported candidates because email sync was disabled.")
            except Exception as delete_err:
                logger.error(f"Error purging email candidates: {delete_err}")

        conn.commit()

    _log_activity_db(username, "updated integrations settings")
    return {"status": "saved"}


@router.post("/api/integrations/gdrive/exchange")
def exchange_gdrive_code(payload: GDriveExchangeRequest, request: Request):
    username = request.headers.get("x-user-username")
    role = get_user_role(username)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    import requests

    client_id = payload.client_id.strip('"\' ')
    client_secret = payload.client_secret.strip('"\' ')
    code = payload.code.strip()

    # Extract code if full URL was pasted
    if "code=" in code:
        try:
            parsed = urllib.parse.urlparse(code)
            code = urllib.parse.parse_qs(parsed.query)["code"][0]
        except Exception:
            pass

    token_url = "https://oauth2.googleapis.com/token"
    token_data = {
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": "http://localhost",
        "grant_type": "authorization_code"
    }

    try:
        resp = requests.post(token_url, data=token_data, timeout=15)
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail=f"Token exchange failed: {resp.text}")

        resp_data = resp.json()
        refresh_token = resp_data.get("refresh_token")
        access_token = resp_data.get("access_token")

        if not refresh_token:
            raise HTTPException(
                status_code=400,
                detail="Google did not return a refresh token. Google only sends the refresh token on the FIRST authorization. Please go to Google Account Settings -> Security -> Third-party apps with account access, remove 'Hire AI' access, and authorize again."
            )

        # Try to retrieve Google account email using drive/v3/about
        email = "Unknown Google Account"
        if access_token:
            headers = {
                "Authorization": f"Bearer {access_token}"
            }
            about_resp = requests.get("https://www.googleapis.com/drive/v3/about?fields=user", headers=headers, timeout=10)
            if about_resp.status_code == 200:
                user_info = about_resp.json().get("user", {})
                email = user_info.get("emailAddress", "Unknown Google Account")

        return {
            "refresh_token": refresh_token,
            "email": email
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to communicate with Google API: {str(e)}")


@router.post("/api/integrations/test")
def test_mailbox_connection(settings: TestMailboxRequest, request: Request):
    username = request.headers.get("x-user-username")
    role = get_user_role(username)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    email_user = settings.email_user
    email_pass = settings.email_pass
    imap_host = settings.imap_host
    imap_port = settings.imap_port

    # If password is masked, restore it from the DB
    if email_pass == "****":
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT email_user, email_pass, additional_emails FROM integrations_settings LIMIT 1")
            row = cur.fetchone()

        if row:
            # Check primary
            if row[0] and row[0].lower() == email_user.lower():
                email_pass = row[1]
            else:
                # Check additional
                try:
                    add_emails = json.loads(row[2] or "[]")
                    for item in add_emails:
                        if item.get("email_user") and item["email_user"].lower() == email_user.lower():
                            email_pass = item.get("email_pass", "")
                            break
                except Exception:
                    pass

    use_graph = False
    ms_client_id = ms_client_secret = ms_tenant_id = None
    if 'office365' in imap_host.lower() or 'outlook' in imap_host.lower():
        # Check Microsoft Graph API credentials
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT ms_client_id, ms_client_secret, ms_tenant_id FROM integrations_settings LIMIT 1")
            ms_row = cur.fetchone()

        if ms_row and ms_row[0] and ms_row[1] and ms_row[2]:
            use_graph = True
            ms_client_id, ms_client_secret, ms_tenant_id = ms_row

    if use_graph:
        return test_graph_connection(ms_tenant_id, ms_client_id, ms_client_secret, email_user)
    else:
        return test_imap_connection(imap_host, imap_port, email_user, email_pass)


@router.get("/api/integrations/status")
def test_integrations_connection(request: Request):
    username = request.headers.get("x-user-username")
    role = get_user_role(username)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    with get_db_connection() as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT * FROM integrations_settings LIMIT 1")
        row = cur.fetchone()

    if not row:
        return {"status": "disabled", "message": "Email integration is disabled."}

    settings = dict(row)
    if not settings.get("email_enabled"):
        return {"status": "disabled", "message": "Email integration is disabled."}

    outlook_enabled = settings.get("outlook_enabled", 0)
    outlook_email = settings.get("outlook_email", "")
    gmail_enabled = settings.get("gmail_enabled", 0)
    gmail_email = settings.get("gmail_email", "")
    gmail_pass = settings.get("gmail_pass", "")
    ms_client_id = settings.get("ms_client_id", "")
    ms_client_secret = settings.get("ms_client_secret", "")
    ms_tenant_id = settings.get("ms_tenant_id", "common")
    imap_host = settings.get("imap_host", "")
    imap_port = settings.get("imap_port", 993)
    email_user = settings.get("email_user", "")
    email_pass = settings.get("email_pass", "")

    if outlook_enabled and outlook_email:
        if not ms_client_id or not ms_client_secret or not ms_tenant_id:
            return {"status": "error", "message": "Microsoft Graph credentials are not fully configured."}
        return test_graph_connection(ms_tenant_id, ms_client_id, ms_client_secret, outlook_email)

    elif gmail_enabled and gmail_email:
        return test_imap_connection("imap.gmail.com", 993, gmail_email, gmail_pass)

    else:
        if not imap_host or not email_user:
            return {"status": "unconfigured", "message": "Credentials are not fully configured. Enable an integration."}

        if 'office365' in imap_host.lower() or 'outlook' in imap_host.lower():
            if not ms_client_id or not ms_client_secret or not ms_tenant_id:
                return {"status": "error", "message": "Microsoft Graph credentials are not configured in Primary Mailbox."}
            return test_graph_connection(ms_tenant_id, ms_client_id, ms_client_secret, email_user)
        else:
            return test_imap_connection(imap_host, imap_port, email_user, email_pass)


@router.post("/api/settings/test-email-template")
def test_email_template_endpoint(request_data: TestEmailTemplateRequest, request: Request):
    username = request.headers.get("x-user-username")
    role = get_user_role(username)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT imap_host, smtp_host, smtp_port, email_user, email_pass, ms_client_id, ms_client_secret, ms_tenant_id FROM integrations_settings LIMIT 1")
        row = cur.fetchone()

    if not row:
        return {"status": "error", "message": "Email integration is not configured."}

    imap_host = row[0]
    smtp_host = row[1]
    smtp_port = row[2] or 587
    email_user = row[3]
    email_pass = row[4]
    ms_client_id = row[5]
    ms_client_secret = row[6]
    ms_tenant_id = row[7]

    if not email_user:
        return {"status": "error", "message": "Email user is not configured."}

    full_name = "Jane Doe"
    missing_fields_str = "Phone, Current Location, Expected CTC" if request_data.preview_type == "missing" else ""

    subject = request_data.subject_template.replace('{{full_name}}', full_name)
    body = request_data.body_template.replace('{{full_name}}', full_name).replace('{{missing_fields}}', missing_fields_str)

    try:
        if imap_host and ('office365' in imap_host.lower() or 'outlook' in imap_host.lower()):
            if not ms_client_id or not ms_client_secret or not ms_tenant_id:
                return {"status": "error", "message": "Microsoft Graph credentials are not fully configured."}

            success = send_email_via_graph(ms_client_id, ms_client_secret, ms_tenant_id, email_user, request_data.recipient_email, subject, body)
            if success:
                return {"status": "success", "message": f"Test email sent to {request_data.recipient_email}"}
            else:
                return {"status": "error", "message": "Failed to send email via Microsoft Graph API."}
        else:
            import smtplib
            from email.mime.text import MIMEText
            from email.mime.multipart import MIMEMultipart

            if not email_pass:
                return {"status": "error", "message": "SMTP password is not configured."}

            msg = MIMEMultipart()
            msg['From'] = email_user
            msg['To'] = request_data.recipient_email
            msg['Subject'] = subject
            msg.attach(MIMEText(body, 'plain'))

            server = smtplib.SMTP(smtp_host, smtp_port, timeout=10.0)
            server.starttls()
            server.login(email_user, email_pass)
            server.sendmail(email_user, request_data.recipient_email, msg.as_string())
            server.quit()

            return {"status": "success", "message": f"Test email sent to {request_data.recipient_email}"}
    except Exception as e:
        return {"status": "error", "message": f"Failed to send email: {str(e)}"}
