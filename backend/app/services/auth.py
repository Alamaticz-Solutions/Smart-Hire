"""Permission helpers: approval, role, admin/HR flags, hidden-field masking.

Almost every endpoint needs one of these as an auth gate, and the database may
be a network round trip away, so user permission fields are cached briefly
in-process.  Permissions change rarely (an admin toggling a checkbox), so a
short TTL is safe; writers call :func:`invalidate_user_cache` to make changes
visible immediately.
"""
import time
from typing import Optional

from app.db.engine import session_scope
from app.repositories import UserRepository

_USER_CACHE_TTL_SECONDS = 30
_user_cache: dict[str, tuple[float, Optional[dict]]] = {}

#: Accounts that are always considered approved.
SEEDED_USERNAMES = ("admin", "user", "boopathi", "praveen", "harish", "sabari")


def invalidate_user_cache(username: Optional[str] = None) -> None:
    """Drop one user (or, with ``None``, every user) from the cache."""
    if username is None:
        _user_cache.clear()
    else:
        _user_cache.pop(username.lower(), None)


def get_user_info(username: Optional[str]) -> Optional[dict]:
    """Cached permission lookup (role / admin / hr / external / approved / hidden fields)."""
    if not username:
        return None
    key = username.lower()
    cached = _user_cache.get(key)
    if cached and cached[0] > time.time():
        return cached[1]

    info: Optional[dict] = None
    try:
        with session_scope() as session:
            user = UserRepository(session).get_by_username(username)
            if user is not None:
                info = {
                    "role": user.role,
                    "is_admin": user.is_admin,
                    "is_hr": user.is_hr,
                    "is_external": user.is_external,
                    "is_approved": user.is_approved,
                    "hidden_fields": user.hidden_fields,
                    "full_name": user.full_name,
                }
    except Exception:
        info = None
    _user_cache[key] = (time.time() + _USER_CACHE_TTL_SECONDS, info)
    return info


def is_user_approved(username: Optional[str]) -> bool:
    if not username:
        return False
    if username.lower() in SEEDED_USERNAMES:
        return True
    info = get_user_info(username)
    return bool(info and info["is_approved"] == 1)


def get_user_role(username: Optional[str]) -> str:
    if not username:
        return "user"
    info = get_user_info(username)
    if info:
        if info["is_admin"] == 1 or info["role"] == "admin":
            return "admin"
        return info["role"]
    return "user"


def is_admin_or_hr(username: str) -> bool:
    if not username:
        return False
    info = get_user_info(username)
    return bool(info and (info["is_admin"] == 1 or info["is_hr"] == 1))


def get_user_hidden_fields(username: str) -> list[str]:
    if not username:
        return []
    info = get_user_info(username)
    if info and info["hidden_fields"]:
        return [f.strip().lower() for f in info["hidden_fields"].split(",") if f.strip()]
    return []


def apply_user_hidden_fields(rows: list[dict], username: str) -> list[dict]:
    hidden = get_user_hidden_fields(username)
    if not hidden:
        return rows
    for row in rows:
        for field in hidden:
            if field in row:
                row[field] = "[HIDDEN]"
    return rows
