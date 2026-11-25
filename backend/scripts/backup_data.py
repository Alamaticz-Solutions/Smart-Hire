"""Write a JSON snapshot of the candidate table (without file contents), mail log and settings keys to logs/backups/."""
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402

from app.db.engine import session_scope  # noqa: E402


def _plain(value):
    return value.isoformat() if hasattr(value, "isoformat") else (value.hex() if isinstance(value, (bytes, memoryview)) else value)


def main() -> int:
    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "logs", "backups")
    os.makedirs(out_dir, exist_ok=True)
    snapshot = {}
    with session_scope() as session:
        for table in ("candidate_metadata", "processed_emails", "mail_replies", "job_candidates", "jobs"):
            try:
                result = session.execute(text(f"SELECT * FROM {table}"))
            except Exception:
                session.rollback()
                continue
            columns = list(result.keys())
            snapshot[table] = [
                {c: _plain(v) for c, v in zip(columns, row) if c not in ("file_bytes",)} for row in result.fetchall()
            ]
    path = os.path.join(out_dir, f"backup_{stamp}.json")
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(snapshot, handle)
    print(path, {k: len(v) for k, v in snapshot.items()})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
