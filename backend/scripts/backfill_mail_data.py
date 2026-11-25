"""Fill in the mail history: received date for every mail-origin candidate and a Mail Inbox row per mailbox message.

READ-ONLY against Outlook (Graph GET only). Writes only to this app's database: it creates the
``mail_messages`` rows, links each candidate to the mail it came from (by the id hash in its file name) and sets
``mail_received_at`` / ``source_msg_uid``. Safe to run again.

    python -m scripts.backfill_mail_data --dry-run
    python -m scripts.backfill_mail_data
"""
import argparse
import hashlib
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select  # noqa: E402

from app.db.engine import session_scope  # noqa: E402
from app.db.init_db import init_db  # noqa: E402
from app.models import Candidate  # noqa: E402
from app.repositories import (  # noqa: E402
    CandidateRepository, IntegrationSettingsRepository, MailMessageRepository, ProcessedEmailRepository,
)
from app.services.graph_client import GraphSession, error_text  # noqa: E402
from app.services.mail_filters import is_automated_sender, parse_iso_utc  # noqa: E402


def _uid(message: dict) -> str:
    internet = message.get("internetMessageId") or ""
    found = re.search(r"<([^>]+)>", internet)
    return found.group(1) if found else (internet or message["id"])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="count what would change, write nothing")
    args = parser.parse_args()

    if not args.dry_run:
        init_db()
    with session_scope() as session:
        row = IntegrationSettingsRepository(session).get()
        mailbox, tenant, client, secret = row.outlook_email, row.ms_tenant_id, row.ms_client_id, row.ms_client_secret
    if not (mailbox and tenant and client and secret) or tenant == "common":
        print("Outlook is not fully configured (mailbox / real tenant id / client id / secret).")
        return 1

    graph = GraphSession(tenant, client, secret)
    url = (f"/users/{mailbox}/mailFolders/Inbox/messages?$top=100"
           "&$select=id,internetMessageId,subject,from,receivedDateTime,hasAttachments")
    messages = []
    while url:
        response = graph.get(url)
        if response.status_code != 200:
            print(f"Graph error {response.status_code}: {error_text(response)}")
            return 1
        payload = response.json()
        messages.extend(payload.get("value", []))
        url = payload.get("@odata.nextLink")
        print(f"\rread {len(messages)} messages...", end="", flush=True)
    print(f"\n{len(messages)} messages in the Inbox")

    with session_scope() as session:
        by_prefix = {}
        for cid, filename, status, uid_now, received in session.execute(
            select(Candidate.id, Candidate.filename, Candidate.candidate_status, Candidate.source_msg_uid, Candidate.mail_received_at)
            .where(Candidate.filename.like("mail\\_%", escape="\\"))
        ):
            match = re.match(r"mail_([0-9a-f]{8})_", filename or "")
            if match:
                by_prefix.setdefault(match.group(1), []).append((cid, status, uid_now, received))
        processed = ProcessedEmailRepository(session)
        done = processed.existing([_uid(m) for m in messages])

        counts = {}
        linked = dates = 0
        log = MailMessageRepository(session)
        candidates = CandidateRepository(session)
        for message in messages:
            uid = _uid(message)
            sender = (message.get("from") or {}).get("emailAddress", {})
            received = parse_iso_utc(message.get("receivedDateTime"))
            owners = by_prefix.get(hashlib.md5(uid.encode()).hexdigest()[:8], [])
            if owners:
                cid, status, _uid_now, _received = owners[0]
                failed = status == "Error"
                outcome = "failed" if failed else "imported"
                reason = "Resume could not be processed - retry from here" if failed else "Candidate created from this mail"
            elif is_automated_sender(sender.get("address")):
                outcome, reason, cid = "skipped_automated", "Automated sender (noreply / invoice / newsletter)", None
            elif uid in done:
                outcome, cid = "no_resume", None
                reason = "Pulled earlier; no resume was imported (not a resume, legacy file, or a follow-up)"
            else:
                outcome, reason, cid = "not_pulled", "In the mailbox but not imported yet", None
            counts[outcome] = counts.get(outcome, 0) + 1
            if args.dry_run:
                continue
            log.upsert(
                uid, mailbox_email=mailbox, sender_email=sender.get("address"), sender_name=sender.get("name"),
                subject=(message.get("subject") or "")[:500], received_at=received,
                has_attachments=int(bool(message.get("hasAttachments"))), outcome=outcome, reason=reason, candidate_id=cid,
            )
            for cand_id, _status, uid_now, received_now in owners:
                updates = {}
                if not uid_now:
                    updates["source_msg_uid"] = uid
                if received and not received_now:
                    updates["mail_received_at"] = received
                    dates += 1
                if updates:
                    updates["origin"] = "mail"
                    candidates.update(cand_id, updates)
                    linked += 1
    print("outcomes:", counts)
    print(f"{'would link' if args.dry_run else 'linked'} candidates: {linked or sum(len(v) for v in by_prefix.values())}; received dates {'to set' if args.dry_run else 'set'}: {dates}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
