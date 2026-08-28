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

PERFORMANCE NOTE: the Postgres database here (Neon, AWS us-east-2) measured
at ~250-500ms round-trip time PER QUERY from this app's location - that's
the dominant cost on every request, not query complexity. Almost every
endpoint calls at least one of is_user_approved/get_user_role/is_admin_or_hr
as an auth gate, and several ALSO ran their own separate, near-identical
"SELECT ... FROM users WHERE username=" query on top of that (jobs.py x3,
candidates.py, chat.py, matching.py) - two-plus latency round trips spent on
permission-checking alone before any real work started, on a page load that
was already slow. User role/permission fields change rarely (an admin
toggling a checkbox, not a per-second event), so a short in-memory cache
here is a safe, high-leverage fix: one DB round trip per user per TTL window
instead of one per request per helper call.
"""
import time
from typing import Optional

from app.db.session import get_db_connection

_USER_CACHE_TTL_SECONDS = 30
_user_cache: dict[str, tuple[float, Optional[dict]]] = {}


def invalidate_user_cache(username: Optional[str] = None) -> None:
    """Call after any write to `users` (permission change, delete, registration)
    so the next lookup re-reads from the DB instead of serving a stale row for
    up to _USER_CACHE_TTL_SECONDS. `username=None` clears the whole cache."""
    if username is None:
        _user_cache.clear()
    else:
        _user_cache.pop(username.lower(), None)


def get_user_info(username: Optional[str]) -> Optional[dict]:
    """Cached user-permission lookup (role/is_admin/is_hr/is_external/
    is_approved/hidden_fields). Public on purpose - callers that need more
    than one of these fields (jobs.py, candidates.py, chat.py, matching.py
    all used to run their own separate "SELECT ... FROM users WHERE
    username=" query for this) should call this instead of querying `users`
    directly, so they share this module's cache rather than adding another
    per-request DB round trip next to it."""
    if not username:
        return None
    key = username.lower()
    cached = _user_cache.get(key)
    if cached and cached[0] > time.time():
        return cached[1]
    row = None
    with get_db_connection() as conn:
        cur = conn.cursor()
        try:
            cur.execute(
                "SELECT role, is_admin, is_hr, is_external, is_approved, hidden_fields, full_name "
                "FROM users WHERE LOWER(username) = LOWER(?)",
                (username,),
            )
            r = cur.fetchone()
            if r:
                role, is_admin, is_hr, is_external, is_approved, hidden_fields, full_name = r
                row = {
                    "role": role, "is_admin": is_admin, "is_hr": is_hr,
                    "is_external": is_external, "is_approved": is_approved,
                    "hidden_fields": hidden_fields, "full_name": full_name,
                }
        except Exception:
            pass
    _user_cache[key] = (time.time() + _USER_CACHE_TTL_SECONDS, row)
    return row


def is_user_approved(username: Optional[str]) -> bool:
    if not username:
        return False
    # Seeded/default users are always approved
    if username.lower() in ("admin", "user", "boopathi", "praveen", "harish", "sabari"):
        return True
    row = get_user_info(username)
    return bool(row and row["is_approved"] == 1)


def get_user_role(username: Optional[str]) -> str:
    if not username:
        return "user"
    row = get_user_info(username)
    if row:
        if row["is_admin"] == 1 or row["role"] == "admin":
            return "admin"
        return row["role"]
    return "user"


def is_admin_or_hr(username: str) -> bool:
    if not username:
        return False
    row = get_user_info(username)
    return bool(row and (row["is_admin"] == 1 or row["is_hr"] == 1))


def get_user_hidden_fields(username: str) -> list[str]:
    if not username:
        return []
    row = get_user_info(username)
    if row and row["hidden_fields"]:
        return [f.strip().lower() for f in row["hidden_fields"].split(",") if f.strip()]
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
