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

from app.core import config
from app.core.logging import get_logger

logger = get_logger(__name__)

_env_secret = os.getenv("SESSION_SECRET")
if not _env_secret:
    # Deliberately a warning, not a startup failure: this app currently
    # boots today with no SESSION_SECRET set (neither locally nor on the
    # existing deployment), so crashing on it would be a worse regression
    # than the bug it's warning about. In any real multi-worker/multi-
    # instance production deployment, each process minting its own random
    # secret means a token issued by one process fails verification on
    # another - intermittent, hard-to-reproduce 401s for real logged-in
    # users. Set SESSION_SECRET explicitly before deploying with >1 worker.
    level = logger.error if config.ENVIRONMENT in ("production", "prod") else logger.warning
    level(
        "SESSION_SECRET is not set - generating a random per-process secret. "
        "All logged-in sessions will be invalidated on the next restart, and "
        "a multi-worker/multi-instance deployment will see random logouts as "
        "requests land on different processes. Set SESSION_SECRET in the "
        "environment before deploying with more than one worker."
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
