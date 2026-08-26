"""Signed, stateless session tokens (HMAC-SHA256, stdlib only - no JWT library).

Replaces trusting the client-supplied `x-user-username` header as-is (any
caller could set it to any username with zero verification - see
docs/ARCHITECTURE.md). A token is issued at login/register/firebase-sync and
verified by `main.py`'s `verify_session_middleware`, which is the ONLY place
that derives a trusted username and writes it into the `x-user-username`
header that every existing router/dependency already reads - so this closes
the spoofing hole without touching each of those call sites individually.

SESSION_SECRET should be set in production so sessions survive a restart. If
unset, a random secret is generated at process start (logged as a warning) -
consistent with this app's "boots with a blank .env" local-dev posture: it
still works, every existing session is just invalidated on the next restart.
"""
import base64
import hashlib
import hmac
import os
import secrets
import time

from app.core.logging import get_logger

logger = get_logger(__name__)

_env_secret = os.getenv("SESSION_SECRET")
if not _env_secret:
    logger.warning(
        "SESSION_SECRET is not set - generating a random per-process secret. "
        "All logged-in sessions will be invalidated on the next restart. "
        "Set SESSION_SECRET in the environment to avoid this in production."
    )
_SECRET = (_env_secret or secrets.token_hex(32)).encode()

_DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60  # 7 days


def _sign(payload: bytes) -> str:
    return hmac.new(_SECRET, payload, hashlib.sha256).hexdigest()


def create_session_token(username: str, ttl_seconds: int = _DEFAULT_TTL_SECONDS) -> str:
    expiry = int(time.time()) + ttl_seconds
    payload = f"{username}|{expiry}".encode()
    payload_b64 = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    return f"{payload_b64}.{_sign(payload)}"


def verify_session_token(token: str) -> str | None:
    if not token or "." not in token:
        return None
    payload_b64, _, signature = token.partition(".")
    try:
        padding = "=" * (-len(payload_b64) % 4)
        payload = base64.urlsafe_b64decode(payload_b64 + padding)
    except Exception:
        return None

    if not hmac.compare_digest(_sign(payload), signature):
        return None

    try:
        username, expiry_str = payload.decode().rsplit("|", 1)
        expiry = int(expiry_str)
    except (ValueError, UnicodeDecodeError):
        return None

    if time.time() > expiry:
        return None
    return username
