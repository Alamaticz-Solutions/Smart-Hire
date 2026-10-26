"""READ-ONLY mailbox check: shows what the poller would pull, changes nothing.

* does not import candidates, write to the database or mark messages as read
* never sends mail (IMAP uses BODY.PEEK; Graph uses GET only)

IMAP (Gmail / Google Workspace / generic):
    python -m scripts.mailbox_check imap --host imap.gmail.com --user careers@alamaticz.com --limit 20
    (the password is prompted, or read from MAILBOX_PASSWORD)

Microsoft 365 via Graph (app-only, needs Mail.Read application permission):
    python -m scripts.mailbox_check graph --user careers@alamaticz.com \
        --tenant <tenant-id> --client-id <app-id>      (client secret prompted / MAILBOX_CLIENT_SECRET)
"""
import argparse
import email
import getpass
import imaplib
import os
import sys
from email.header import decode_header
from email.utils import parseaddr

RESUME_SUFFIXES = (".pdf", ".docx")
AUTOMATED_SENDERS = ("noreply", "no-reply", "mailer-daemon", "postmaster", "invoice", "billing", "notification")


def _decode(value) -> str:
    out = ""
    for part, encoding in decode_header(str(value or "")):
        out += part.decode(encoding or "utf-8", errors="ignore") if isinstance(part, bytes) else str(part)
    return out


def _report(index: int, sender: str, subject: str, attachments: list[str]) -> None:
    resumes = [a for a in attachments if a.lower().endswith(RESUME_SUFFIXES)]
    automated = any(token in sender.lower() for token in AUTOMATED_SENDERS)
    verdict = "SKIP (automated sender)" if automated else ("IMPORT (has résumé)" if resumes else "ignore (no résumé attachment)")
    print(f"{index:>3}. {verdict:<30} from={sender or '?'}  subject={subject[:60]!r}  attachments={attachments or '-'}")


def check_imap(args) -> int:
    password = os.getenv("MAILBOX_PASSWORD") or getpass.getpass("Mailbox / app password: ")
    mail = imaplib.IMAP4_SSL(args.host, args.port, timeout=20)
    try:
        mail.login(args.user, password)
        status, data = mail.select("INBOX", readonly=True)  # readonly: cannot change flags
        total = int(data[0]) if status == "OK" and data and data[0] else 0
        print(f"Connected to {args.user}: {total} messages in INBOX (read-only)\n")
        start = max(1, total - args.limit + 1)
        for number in range(total, start - 1, -1):
            status, parts = mail.fetch(str(number), "(BODY.PEEK[])")
            if status != "OK" or not parts or not parts[0]:
                continue
            message = email.message_from_bytes(parts[0][1])
            names = [_decode(p.get_filename()) for p in message.walk() if p.get_filename()]
            _report(total - number + 1, parseaddr(_decode(message.get("From")))[1], _decode(message.get("Subject")), names)
    finally:
        try:
            mail.logout()
        except Exception:
            pass
    return 0


def check_graph(args) -> int:
    import requests

    secret = os.getenv("MAILBOX_CLIENT_SECRET") or getpass.getpass("Client secret VALUE: ")
    token = requests.post(
        f"https://login.microsoftonline.com/{args.tenant}/oauth2/v2.0/token",
        data={"client_id": args.client_id, "client_secret": secret,
              "scope": "https://graph.microsoft.com/.default", "grant_type": "client_credentials"},
        timeout=20,
    ).json()
    if "access_token" not in token:
        print("Token error:", token.get("error_description", token), file=sys.stderr)
        return 1
    headers = {"Authorization": f"Bearer {token['access_token']}"}
    base = f"https://graph.microsoft.com/v1.0/users/{args.user}/mailFolders/Inbox/messages"
    response = requests.get(
        f"{base}?$top={args.limit}&$orderby=receivedDateTime desc&$select=id,subject,from,hasAttachments",
        headers=headers, timeout=30,
    )
    if response.status_code != 200:
        print("Graph error:", response.json().get("error", {}).get("message", response.text), file=sys.stderr)
        return 1
    print(f"Connected to {args.user} via Graph (read-only)\n")
    for index, item in enumerate(response.json().get("value", []), 1):
        names = []
        if item.get("hasAttachments"):
            att = requests.get(f"https://graph.microsoft.com/v1.0/users/{args.user}/messages/{item['id']}/attachments?$select=name",
                               headers=headers, timeout=30)
            names = [a["name"] for a in att.json().get("value", [])] if att.status_code == 200 else []
        sender = item.get("from", {}).get("emailAddress", {}).get("address", "")
        _report(index, sender, item.get("subject") or "", names)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only mailbox check")
    sub = parser.add_subparsers(dest="mode", required=True)
    imap = sub.add_parser("imap")
    imap.add_argument("--host", default="imap.gmail.com")
    imap.add_argument("--port", type=int, default=993)
    imap.add_argument("--user", required=True)
    imap.add_argument("--limit", type=int, default=20)
    graph = sub.add_parser("graph")
    graph.add_argument("--user", required=True)
    graph.add_argument("--tenant", required=True)
    graph.add_argument("--client-id", required=True)
    graph.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()
    return check_imap(args) if args.mode == "imap" else check_graph(args)


if __name__ == "__main__":
    raise SystemExit(main())
