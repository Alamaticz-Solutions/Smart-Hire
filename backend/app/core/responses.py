"""The single response contract used by every JSON endpoint.

Success::

    {"success": true,  "message": "OK", "data": <payload>, "meta": null,
     "error": null, "request_id": "ab12cd34ef56"}

Failure::

    {"success": false, "message": "Job not found", "detail": "Job not found",
     "data": null, "error": {"code": "not_found", "details": null},
     "request_id": "ab12cd34ef56"}

``detail`` duplicates ``message`` for clients written against the previous
FastAPI-default error shape.

Handlers keep returning plain dicts / lists; :class:`EnvelopeRoute` wraps them
(and converts ``{"detail": ...}`` error bodies), so routers only declare
``APIRouter(route_class=EnvelopeRoute)``.
"""
from __future__ import annotations

import json
from contextvars import ContextVar
from typing import Any, Optional

from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from starlette.responses import Response

request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")

_ERROR_CODES = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    422: "validation_error",
    429: "rate_limited",
}


def error_code_for(status_code: int) -> str:
    return _ERROR_CODES.get(status_code, "internal_error" if status_code >= 500 else "error")


def success_body(data: Any = None, message: str = "OK", meta: Optional[dict] = None) -> dict[str, Any]:
    return {
        "success": True,
        "message": message,
        "data": data,
        "meta": meta,
        "error": None,
        "request_id": request_id_ctx.get(),
    }


def error_body(message: str, status_code: int, details: Any = None, code: Optional[str] = None) -> dict[str, Any]:
    return {
        "success": False,
        "message": message,
        "detail": message,
        "data": None,
        "meta": None,
        "error": {"code": code or error_code_for(status_code), "details": details},
        "request_id": request_id_ctx.get(),
    }


def error_response(message: str, status_code: int, details: Any = None, code: Optional[str] = None) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=error_body(message, status_code, details, code))


def _is_envelope(body: Any) -> bool:
    return isinstance(body, dict) and "success" in body and ("data" in body or "error" in body)


def _rebuild(original: Response, content: dict[str, Any]) -> JSONResponse:
    """New JSON response that keeps status, headers and background tasks."""
    rebuilt = JSONResponse(content=content, status_code=original.status_code)
    for name, value in original.raw_headers:
        if name.lower() not in (b"content-length", b"content-type"):
            rebuilt.raw_headers.append((name, value))
    rebuilt.background = original.background
    return rebuilt


class EnvelopeRoute(APIRoute):
    """Wrap JSON handler results in the standard envelope."""

    def get_route_handler(self):
        original_handler = super().get_route_handler()

        async def envelope_handler(request: Request) -> Response:
            response = await original_handler(request)
            if not isinstance(response, JSONResponse) or response.media_type != "application/json":
                return response  # streams, files, redirects, bare responses
            try:
                body = json.loads(response.body)
            except (ValueError, TypeError):
                return response
            if _is_envelope(body):
                return response

            status = response.status_code
            if status >= 400:
                detail = body.get("detail") if isinstance(body, dict) else None
                message = detail if isinstance(detail, str) else (
                    body.get("message") if isinstance(body, dict) and isinstance(body.get("message"), str) else "Request failed"
                )
                return _rebuild(response, error_body(message, status, None if isinstance(detail, str) else detail))

            message = "OK"
            if isinstance(body, dict) and isinstance(body.get("message"), str):
                message = body["message"]
            return _rebuild(response, success_body(body, message))

        return envelope_handler
