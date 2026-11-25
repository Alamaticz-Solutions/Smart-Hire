"""Microsoft Graph access: one place for timeouts, token caching, throttling retries and error reporting."""
from __future__ import annotations

import time
from typing import Optional

import requests

from app.core.logging import get_logger

logger = get_logger(__name__)

GRAPH_BASE = "https://graph.microsoft.com/v1.0"
CONNECT_TIMEOUT = 10
READ_TIMEOUT = 45
MAX_ATTEMPTS = 4
_RETRY_STATUSES = (429, 500, 502, 503, 504)
_MAX_SLEEP = 30.0

_tokens: dict[tuple, tuple[str, float]] = {}  # (tenant, client_id) -> (access_token, expires_at)


class GraphError(Exception):
    """A Graph / token call that could not be completed (message is safe to show an admin)."""


def _sleep(seconds: float) -> None:  # separate function so tests can skip the wait
    time.sleep(seconds)


def get_token(tenant_id: str, client_id: str, client_secret: str, force: bool = False) -> str:
    key = (tenant_id, client_id)
    cached = _tokens.get(key)
    if cached and not force and cached[1] > time.time() + 120:
        return cached[0]
    try:
        response = requests.post(
            f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token",
            data={"client_id": client_id, "client_secret": client_secret,
                  "scope": "https://graph.microsoft.com/.default", "grant_type": "client_credentials"},
            timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
        )
        payload = response.json()
    except Exception as exc:
        raise GraphError(f"Could not reach Microsoft sign-in: {exc}") from exc
    token = payload.get("access_token")
    if not token:
        raise GraphError(f"Microsoft token request failed: {payload.get('error_description') or payload.get('error') or response.status_code}")
    _tokens[key] = (token, time.time() + int(payload.get("expires_in", 3600)))
    return token


def clear_token_cache() -> None:
    _tokens.clear()


class GraphSession:
    """Authenticated Graph calls for one app registration."""

    def __init__(self, tenant_id: str, client_id: str, client_secret: str):
        self.creds = (tenant_id, client_id, client_secret)

    def request(self, method: str, url: str, **kwargs) -> requests.Response:
        """Perform a call with timeout, 401 token refresh and Retry-After handling for 429/5xx."""
        if url.startswith("/"):
            url = GRAPH_BASE + url
        refreshed = False
        last: Optional[requests.Response] = None
        for attempt in range(1, MAX_ATTEMPTS + 1):
            headers = {**kwargs.pop("headers", {}), "Authorization": f"Bearer {get_token(*self.creds, force=refreshed)}"}
            try:
                response = requests.request(method, url, headers=headers, timeout=(CONNECT_TIMEOUT, READ_TIMEOUT), **kwargs)
            except requests.RequestException as exc:
                if attempt == MAX_ATTEMPTS:
                    raise GraphError(f"Graph request failed: {exc}") from exc
                _sleep(min(2.0 * attempt, _MAX_SLEEP))
                continue
            last = response
            if response.status_code == 401 and not refreshed:
                refreshed = True
                continue
            if response.status_code in _RETRY_STATUSES and attempt < MAX_ATTEMPTS:
                try:
                    wait = float(response.headers.get("Retry-After", 2.0 * attempt))
                except ValueError:
                    wait = 2.0 * attempt
                logger.warning("Graph %s %s -> %s, retrying in %.0fs", method, url.split("?")[0], response.status_code, wait)
                _sleep(min(wait, _MAX_SLEEP))
                continue
            return response
        return last  # type: ignore[return-value]

    def get(self, url: str, **kwargs) -> requests.Response:
        return self.request("GET", url, **kwargs)

    def post(self, url: str, **kwargs) -> requests.Response:
        return self.request("POST", url, **kwargs)


def error_text(response: requests.Response) -> str:
    try:
        return response.json().get("error", {}).get("message") or response.text[:200]
    except Exception:
        return response.text[:200]
