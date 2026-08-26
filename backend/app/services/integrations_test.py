"""Shared IMAP / Microsoft Graph connection-probe helpers.

Extracted out of two near-identical ~90-130 line blocks that used to live
inline in app/main.py:

  - POST /api/integrations/test    (main.py ~5180-5269, `test_mailbox_connection`)
  - GET  /api/integrations/status  (main.py ~5271-5398, `test_integrations_connection`)

Both routes independently re-implemented the same two probes:

  1. "Can we get a Microsoft Graph client-credentials token for this
     tenant/client, and can we list at least one message in the target
     mailbox's Inbox with it?" (the Outlook/Office365 path)
  2. "Can we IMAP-login with this host/port/user/password?" (the
     Gmail/generic-IMAP path)

`test_graph_connection` and `test_imap_connection` below capture each probe
once. Both return the same `{"status": ..., "message": ...}` shape the
original inline blocks returned directly as the route's JSON response, so
callers can `return test_graph_connection(...)` / `return
test_imap_connection(...)` unchanged.
"""
from __future__ import annotations

from typing import Optional

from app.core.logging import get_logger

logger = get_logger(__name__)


def test_graph_connection(tenant_id: str, client_id: str, client_secret: str, mailbox_email: str) -> dict:
    """Probe whether these Microsoft Graph client-credentials work for `mailbox_email`.

    Mirrors the Graph API probe duplicated in both `/api/integrations/test`
    (main.py ~5228-5254) and `/api/integrations/status` (main.py ~5309-5334,
    ~5359-5384): acquire a client-credentials token, then try to list one
    message from the mailbox's Inbox to confirm the token actually has
    access to it.
    """
    import requests

    try:
        token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
        data = {
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": "https://graph.microsoft.com/.default",
            "grant_type": "client_credentials"
        }
        token_res = requests.post(token_url, data=data)
        token_data = token_res.json()
        if "access_token" not in token_data:
            return {"status": "error", "message": f"Failed to get Microsoft token: {token_data.get('error_description', 'Unknown error')}"}

        access_token = token_data["access_token"]
        headers = {"Authorization": f"Bearer {access_token}"}
        msg_url = f"https://graph.microsoft.com/v1.0/users/{mailbox_email}/mailFolders/Inbox/messages?$top=1"
        msg_res = requests.get(msg_url, headers=headers)

        if msg_res.status_code == 200:
            return {"status": "connected", "message": f"Successfully connected to {mailbox_email} via Microsoft Graph API!"}
        else:
            err = msg_res.json().get('error', {})
            return {"status": "error", "message": f"Graph API Error: {err.get('message', 'Unknown')}"}
    except Exception as e:
        return {"status": "error", "message": f"Graph API Connection failed: {str(e)}"}


def test_imap_connection(host: str, port: int, username: str, password: Optional[str]) -> dict:
    """Probe whether these IMAP credentials can log in to `host:port`.

    Mirrors the IMAP login probe duplicated in both `/api/integrations/test`
    (main.py ~5256-5269) and `/api/integrations/status` (main.py ~5336-5349,
    ~5385-5398): open an SSL IMAP connection, log in, and immediately log
    out again -- this is a pure connectivity/credentials check, no mail is
    read.
    """
    if password == "****" or not password:
        return {"status": "error", "message": "Password is not configured."}

    import imaplib
    try:
        mail = imaplib.IMAP4_SSL(host, port, timeout=10)
        mail.login(username, password)
        mail.logout()
        return {"status": "connected", "message": f"Successfully connected to {username}!"}
    except Exception as e:
        err_msg = str(e)
        if "Application-specific password required" in err_msg:
            return {"status": "error", "message": "Authentication failed: Application-specific password required."}
        return {"status": "error", "message": f"Connection failed: {err_msg}"}
