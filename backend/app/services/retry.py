"""
Shared retry helper for transient LLM (Groq) call failures.

This consolidates ~5 near-identical, hand-rolled retry loops that were
scattered throughout `app/main.py` around `llm.invoke(...)` calls (resume
extraction, job matching, JD parsing, batch candidate matching, and
follow-up email/resume processing). Each of those loops re-implemented the
same "retry on 429, sleep, try again" idea but with inconsistent parameters:

  - Some used max_retries=5 with an escalating delay of `20 + attempt * 10`
    seconds (resume extraction, job matching).
  - Others used max_retries=3 with a flat 3s or 2s delay (JD parsing,
    batch candidate matching, follow-up processing).
  - Some checked only `"429" in str(err)`, others also matched `"rate"` or
    `"413"` in the error message.
  - Most re-raised the last error once retries were exhausted, but one call
    site (batch candidate matching) instead swallowed the failure, logged
    it, and moved on with a `None` response.

`retry_with_backoff` captures all of that as one configurable function so a
later refactor pass can replace each loop with a single call, passing in
whatever max_retries/delay/markers that call site already used.
"""

from __future__ import annotations

import time
from typing import Callable, Iterable, TypeVar

from app.core.logging import get_logger

logger = get_logger(__name__)

T = TypeVar("T")

# The substring check used everywhere in the original loops (`"429" in str(err)`).
# Call sites that also matched "rate" or "413" pass their own markers.
DEFAULT_RETRYABLE_MARKERS: tuple[str, ...] = ("429",)


def retry_with_backoff(
    fn: Callable[[], T],
    *,
    max_retries: int = 3,
    base_delay: float = 2.0,
    delay_increment: float = 0.0,
    retryable_markers: Iterable[str] = DEFAULT_RETRYABLE_MARKERS,
    raise_on_exhaustion: bool = True,
) -> T | None:
    """Call `fn()`, retrying on transient/rate-limit errors with a backoff sleep.

    Args:
        fn: Zero-arg callable to invoke, e.g. `lambda: llm.invoke([...])`.
            Kept zero-arg so callers just wrap their existing call in a
            lambda instead of restructuring it - this is what keeps the
            change at each call site to a one-line swap.
        max_retries: Total attempts before giving up (matches the original
            loops' `max_retries` variable, e.g. 3 or 5).
        base_delay: Seconds to sleep before the first retry.
        delay_increment: Extra seconds added per subsequent attempt, so the
            actual sleep is `base_delay + attempt * delay_increment`. Pass 0
            (the default) for a flat delay, e.g. the original `time.sleep(3)`
            sites; pass e.g. base_delay=20, delay_increment=10 to reproduce
            the original `time.sleep(20 + attempt * 10)` sites.
        retryable_markers: Case-insensitive substrings checked against
            `str(exception)` to decide whether an error is transient and
            worth retrying (the original code's `"429" in str(api_err)`
            checks, sometimes extended with `"rate"` or `"413"`).
        raise_on_exhaustion: If True (default, matches most call sites),
            re-raise the last exception once retries are exhausted. If
            False, return None instead - this reproduces the one call site
            (batch candidate matching) that logs the failure and continues
            rather than propagating it.

    Returns:
        Whatever `fn()` returns on success, or None if retries were
        exhausted and `raise_on_exhaustion=False`.

    Raises:
        Whatever exception `fn()` last raised, if it was non-retryable or
        retries were exhausted and `raise_on_exhaustion=True`.
    """
    markers = tuple(retryable_markers)
    last_err: Exception | None = None

    for attempt in range(max_retries):
        try:
            return fn()
        except Exception as err:  # noqa: BLE001 - intentionally broad, matches original `except Exception as api_err`
            last_err = err
            is_retryable = any(marker.lower() in str(err).lower() for marker in markers)
            is_last_attempt = attempt >= max_retries - 1

            if is_retryable and not is_last_attempt:
                time.sleep(base_delay + attempt * delay_increment)
                continue

            if raise_on_exhaustion:
                raise
            # Original call sites that swallow rather than propagate (e.g.
            # batch candidate matching) still `print`ed/logged the error
            # before moving on, so the failure was visible in server logs
            # even though the caller didn't see an exception. Preserve that
            # diagnostic signal here, at the one place it can't be silently
            # dropped by a future non-raising call site.
            logger.error("retry_with_backoff: giving up after %d attempt(s): %s", attempt + 1, err)
            return None

    # Unreachable in practice (the loop always returns or raises above),
    # but keeps type checkers happy and guards against max_retries <= 0.
    if last_err is not None and raise_on_exhaustion:
        raise last_err
    return None
