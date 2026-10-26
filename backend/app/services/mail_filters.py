"""Pure helpers that decide which incoming mail the poller may import."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Optional

#: Tokens in an address that identify machine-generated mail.
AUTOMATED_TOKENS = (
    "noreply", "no-reply", "no_reply", "donotreply", "do-not-reply", "mailer-daemon", "postmaster",
    "notification", "newsletter", "bounce", "invoice", "billing", "statements",
    "alerts", "automated", "digest",
)


def is_automated_sender(address: Optional[str]) -> bool:
    """True for addresses such as ``noreply@...`` or ``invoice+statements@...``."""
    if not address:
        return False
    local = address.lower().split("@", 1)[0]
    return any(token in local for token in AUTOMATED_TOKENS)


def parse_day(value: Optional[str]) -> Optional[date]:
    """``YYYY-MM-DD`` (empty / invalid -> ``None``)."""
    if not value:
        return None
    try:
        return date.fromisoformat(str(value).strip()[:10])
    except ValueError:
        return None


def day_bounds(date_from: Optional[str], date_to: Optional[str]) -> tuple[Optional[datetime], Optional[datetime]]:
    """Inclusive UTC window: ``from`` 00:00:00 ... ``to`` 23:59:59.999999."""
    start, end = parse_day(date_from), parse_day(date_to)
    lower = datetime(start.year, start.month, start.day, tzinfo=timezone.utc) if start else None
    upper = (
        datetime(end.year, end.month, end.day, tzinfo=timezone.utc) + timedelta(days=1) - timedelta(microseconds=1)
        if end else None
    )
    return lower, upper


def in_window(received: Optional[datetime], date_from: Optional[str], date_to: Optional[str]) -> bool:
    """Is ``received`` inside the configured window?

    With no window configured everything is accepted; with one configured,
    mail whose date cannot be determined is rejected (never import what we
    cannot date).
    """
    lower, upper = day_bounds(date_from, date_to)
    if lower is None and upper is None:
        return True
    if received is None:
        return False
    if received.tzinfo is None:
        received = received.replace(tzinfo=timezone.utc)
    if lower and received < lower:
        return False
    if upper and received > upper:
        return False
    return True


def received_from_header(value: Optional[str]) -> Optional[datetime]:
    """Parse an RFC-2822 ``Date:`` header."""
    if not value:
        return None
    try:
        return parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None


def to_naive_utc(value: Optional[datetime]) -> Optional[datetime]:
    """UTC wall-clock time without tzinfo, as stored in the database."""
    if value is None:
        return None
    return value.astimezone(timezone.utc).replace(tzinfo=None) if value.tzinfo else value


def graph_timestamp(value: Optional[datetime]) -> Optional[str]:
    """Format for an OData ``receivedDateTime`` filter."""
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if value else None
