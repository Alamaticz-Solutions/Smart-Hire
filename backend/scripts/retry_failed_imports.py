"""Re-process candidates that failed only because the AI provider rate-limited us (HTTP 429).

Slow and safe: parses a few resumes at a time, waits between them, and STOPS at the first new
rate-limit so it never hammers the provider (which is how those rows failed in the first place).

    python -m scripts.retry_failed_imports --dry-run          # just count them
    python -m scripts.retry_failed_imports --limit 10         # retry the oldest 10 (default)
    python -m scripts.retry_failed_imports --limit 50 --delay 30

Run it against the real database only when you mean to: it calls the AI provider (Groq) for each resume.
"""
import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select  # noqa: E402

from app.core.config import UPLOAD_DIR  # noqa: E402
from app.db.engine import session_scope  # noqa: E402
from app.models import Candidate  # noqa: E402
from app.repositories import CandidateRepository  # noqa: E402
from app.services.resume_processing import process_resume  # noqa: E402


def _rate_limited_ids(session) -> list[int]:
    stmt = (
        select(Candidate.id)
        .where(Candidate.candidate_status == "Error", Candidate.file_bytes.is_not(None))
        .where(Candidate.error_detail.ilike("%429%") | Candidate.error_detail.ilike("%RateLimit%"))
        .order_by(Candidate.id)
    )
    return list(session.scalars(stmt))


def _mark_recovered(candidate_id: int, after: dict) -> None:
    """The candidate parsed fine: reflect that in the Mail Inbox and fill the sender from the mail log."""
    from app.models import MailMessage

    with session_scope() as session:
        log = session.scalars(select(MailMessage).where(MailMessage.candidate_id == candidate_id)).first()
        updates = {}
        if log is not None:
            failed = after.get("candidate_status") == "Error"
            log.outcome = "failed" if failed else "imported"
            log.reason = (after.get("error_detail") or "Resume could not be processed") if failed else f"Recovered: candidate created ({after.get('full_name') or 'unnamed'})"
            if log.sender_email and not after.get("sender_email"):
                updates["sender_email"] = log.sender_email
            if log.received_at and not after.get("mail_received_at"):
                updates["mail_received_at"] = log.received_at
        if updates:
            CandidateRepository(session).update(candidate_id, updates)


def _mark_not_resume(candidate_id: int) -> None:
    from app.models import MailMessage

    with session_scope() as session:
        log = session.scalars(select(MailMessage).where(MailMessage.candidate_id == candidate_id)).first()
        if log is not None:
            log.outcome, log.reason, log.candidate_id = "no_resume", "Attachment is not a resume (invoice / visa / receipt / similar)", None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, default=10, help="how many to retry in this run (default 10)")
    parser.add_argument("--delay", type=float, default=20.0, help="seconds to wait between resumes (default 20)")
    parser.add_argument("--dry-run", action="store_true", help="only report how many are waiting")
    parser.add_argument("--patient", action="store_true", help="when rate-limited, wait 2 minutes and carry on (up to 5 times in a row) instead of stopping")
    args = parser.parse_args()

    with session_scope() as session:
        ids = _rate_limited_ids(session)
    print(f"{len(ids)} candidate(s) failed only because of an AI rate limit.")
    if args.dry_run or not ids:
        return 0

    done = 0
    strikes = 0
    for candidate_id in ids[: args.limit]:
        with session_scope() as session:
            repo = CandidateRepository(session)
            row = repo.get_row(candidate_id)
            filename, content = row.get("filename"), row.get("file_bytes")
            if isinstance(content, memoryview):
                content = content.tobytes()
            repo.update(candidate_id, {"full_name": f"⏳ Retrying: {filename}", "candidate_status": "Processing", "error_detail": None})
        path = os.path.join(UPLOAD_DIR, filename)
        with open(path, "wb") as handle:
            handle.write(content)

        print(f"[{done + 1}/{min(args.limit, len(ids))}] retrying {filename} ...", flush=True)
        process_resume(filename, path, 1, "email_worker", None, None, None, candidate_id)  # same rules as a live import (non-resumes are rejected)

        with session_scope() as session:
            after = CandidateRepository(session).get_row(candidate_id) or {}
        if not after:  # the document turned out not to be a resume: the placeholder was removed
            _mark_not_resume(candidate_id)
            print("    -> not a resume (removed)")
            done += 1
            continue
        detail = after.get("error_detail") or ""
        if after.get("candidate_status") == "Error" and ("429" in detail or "RateLimit" in detail):
            strikes += 1
            if not args.patient or strikes >= 5:
                print("Rate-limited again - stopping. Try later, or with a longer --delay.")
                return 1
            print("    rate-limited: waiting 2 minutes, then continuing")
            time.sleep(120)
            continue
        strikes = 0
        _mark_recovered(candidate_id, after)
        done += 1
        print(f"    -> {after.get('candidate_status')}: {after.get('full_name')}")
        time.sleep(args.delay)

    print(f"Done: {done} retried, {len(ids) - done} still waiting.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
