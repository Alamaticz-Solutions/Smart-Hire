"""Auth/permission helpers (user approval, role, admin-or-hr, hidden-field masking).

Extracted early in the module dependency order on purpose: in the original
main.py monolith, `is_admin_or_hr` was defined ~3350 lines after
`get_candidates_list` already called it. That only worked because Python
resolves names inside a function body at call time, not at def time, so as
long as both lived in the same module by the time any request came in, the
late definition was invisible. Splitting the app into modules removes that
safety net (a module that imports `get_candidates_list` before
`is_admin_or_hr` is defined would now hard-fail on import), so these helpers
are pulled into their own leaf module with no dependencies on the rest of the
app, safe to import from anywhere.
"""
from typing import Optional

from app.db.session import get_db_connection


def is_user_approved(username: Optional[str]) -> bool:
    if not username:
        return False
    # Seeded/default users are always approved
    if username.lower() in ("admin", "user", "boopathi", "praveen", "harish", "sabari"):
        return True
    with get_db_connection() as conn:
        cur = conn.cursor()
        try:
            cur.execute("SELECT is_approved FROM users WHERE LOWER(username) = LOWER(?)", (username,))
            row = cur.fetchone()
            if row and row[0] == 1:
                return True
        except Exception:
            pass
    return False


def get_user_role(username: Optional[str]) -> str:
    if not username:
        return "user"
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT role, is_admin FROM users WHERE LOWER(username) = LOWER(?)", (username,))
        row = cur.fetchone()
    if row:
        role, is_admin = row
        if is_admin == 1 or role == "admin":
            return "admin"
        return role
    return "user"


def is_admin_or_hr(username: str) -> bool:
    if not username:
        return False
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT is_admin, is_hr FROM users WHERE LOWER(username) = LOWER(?)", (username,))
        row = cur.fetchone()
    if row:
        is_admin, is_hr = row
        return is_admin == 1 or is_hr == 1
    return False


def get_user_hidden_fields(username: str) -> list[str]:
    if not username:
        return []
    with get_db_connection() as conn:
        cur = conn.cursor()
        try:
            cur.execute("SELECT hidden_fields FROM users WHERE LOWER(username) = LOWER(?)", (username,))
            row = cur.fetchone()
            if row and row[0]:
                return [f.strip().lower() for f in row[0].split(",") if f.strip()]
        except Exception:
            pass
    return []


def apply_user_hidden_fields(rows: list[dict], username: str) -> list[dict]:
    hidden = get_user_hidden_fields(username)
    if not hidden:
        return rows
    for r in rows:
        for field in hidden:
            if field in r:
                r[field] = "[HIDDEN]"
    return rows
