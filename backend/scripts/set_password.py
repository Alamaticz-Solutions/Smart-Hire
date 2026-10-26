"""Set (or reset) a user's password from the command line.

    python -m scripts.set_password admin
    python -m scripts.set_password admin --password "S3cret-pass"   # non-interactive

Run from the ``backend/`` directory.  Uses the same database configuration as
the application (``backend/.env``).
"""
import argparse
import getpass
import sys

from app.core.config import STATS_DB  # noqa: F401  (loads .env)
from app.db.postgres_adapter import patch_if_configured
from app.services.passwords import hash_password


def main() -> int:
    parser = argparse.ArgumentParser(description="Set a Hire AI user's password")
    parser.add_argument("username")
    parser.add_argument("--password", help="new password (prompted when omitted)")
    args = parser.parse_args()

    password = args.password or getpass.getpass("New password: ")
    if len(password) < 8 or not any(c.isdigit() for c in password):
        print("Password must be at least 8 characters and contain a digit.", file=sys.stderr)
        return 2

    patch_if_configured()
    import sqlite3

    conn = sqlite3.connect(STATS_DB, timeout=30.0)
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE users SET password_hash = ? WHERE LOWER(username) = LOWER(?)",
            (hash_password(password), args.username),
        )
        if cur.rowcount == 0:
            print(f"No user named {args.username!r}.", file=sys.stderr)
            return 1
        conn.commit()
    finally:
        conn.close()
    print(f"Password updated for {args.username!r}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
