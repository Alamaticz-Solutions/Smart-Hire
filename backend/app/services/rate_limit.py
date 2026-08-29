"""Minimal in-memory rate limiter for auth endpoints.

No external dependency (no slowapi/redis) - this app is small enough that a
per-process in-memory counter is an acceptable first line of defense against
credential-stuffing/OTP-brute-force, matching the single-process assumption
already made by OTP_STORE in routers/auth.py. It resets on restart and does
not share state across multiple worker processes; if this is deployed with
multiple workers behind a load balancer, replace the dict with a shared store
(Redis) for a real guarantee, but "no rate limiting at all" was the actual
finding this closes.
"""
import time
from collections import defaultdict

# key -> list of unix timestamps of recent attempts within the window
_attempts: dict = defaultdict(list)


def is_rate_limited(key: str, max_attempts: int, window_seconds: float) -> bool:
    now = time.time()
    attempts = _attempts[key]
    cutoff = now - window_seconds
    while attempts and attempts[0] < cutoff:
        attempts.pop(0)
    if len(attempts) >= max_attempts:
        return True
    attempts.append(now)
    return False


def reset(key: str) -> None:
    _attempts.pop(key, None)
