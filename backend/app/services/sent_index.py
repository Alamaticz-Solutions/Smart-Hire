"""Who has this mailbox already e-mailed? Built from the Sent Items folder and cached.

The old system replied to many candidates before this app tracked replies, so before ANY reply is sent we check
here and skip anyone who was already written to recently.
"""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.core.logging import get_logger
from app.services.graph_client import GraphSession
from app.services.mail_filters import parse_iso_utc

logger = get_logger(__name__)
CACHE_SECONDS = 1800

_cache: dict[str, tuple[float, dict[str, tuple[datetime, str]]]] = {}


def _build(graph: GraphSession, mailbox: str) -> dict[str, tuple[datetime, str]]:
    index: dict[str, tuple[datetime, str]] = {}
    url = f"/users/{mailbox}/mailFolders/SentItems/messages?$top=100&$select=subject,toRecipients,sentDateTime"
    while url:
        response = graph.get(url)
        if response.status_code != 200:
            raise RuntimeError(f"Sent Items could not be read ({response.status_code})")
        payload = response.json()
        for message in payload.get("value", []):
            sent = parse_iso_utc(message.get("sentDateTime"))
            for recipient in message.get("toRecipients", []):
                address = (recipient.get("emailAddress", {}).get("address") or "").lower()
                if address and sent and (address not in index or index[address][0] < sent):
                    index[address] = (sent, message.get("subject") or "")
        url = payload.get("@odata.nextLink")
    return index


def last_emailed(graph: GraphSession, mailbox: str, address: str, refresh: bool = False) -> Optional[tuple[datetime, str]]:
    """(when, subject) of the newest mail this mailbox sent to ``address``, or None."""
    key = mailbox.lower()
    cached = _cache.get(key)
    if refresh or cached is None or time.time() - cached[0] > CACHE_SECONDS:
        _cache[key] = (time.time(), _build(graph, mailbox))
        logger.info("Sent Items index built for %s (%d recipients)", mailbox, len(_cache[key][1]))
    return _cache[key][1].get((address or "").lower())


def remember_sent(mailbox: str, address: str, subject: str) -> None:
    """After we send something, remember it so the same person is not written to twice."""
    cached = _cache.get(mailbox.lower())
    if cached:
        cached[1][address.lower()] = (datetime.now(timezone.utc).replace(tzinfo=None), subject)


def emailed_within(graph: GraphSession, mailbox: str, address: str, days: int) -> Optional[tuple[datetime, str]]:
    """The previous mail to this address if it was sent within ``days`` days (0 disables the check)."""
    if days <= 0:
        return None
    found = last_emailed(graph, mailbox, address)
    if found and found[0] >= datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days):
        return found
    return None


def clear_cache() -> None:
    _cache.clear()
