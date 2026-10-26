"""Structured logging setup to replace ad-hoc print("ERROR: ...")/print("[SMTP] ...") calls scattered across the codebase."""

import logging
import sys

_LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

_configured = False


def _configure_root() -> None:
    global _configured
    if _configured:
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT))

    root = logging.getLogger()
    # Guard against duplicate handlers if this module is imported multiple
    # times under different module identities (e.g. app.core.logging vs a
    # stale cached copy) or if uvicorn/gunicorn already attached handlers.
    if not any(isinstance(h, logging.StreamHandler) for h in root.handlers):
        root.addHandler(handler)
    root.setLevel(logging.INFO)
    _configured = True


def get_logger(name: str) -> logging.Logger:
    """Return a module-scoped logger; configures the shared root handler on first use."""
    _configure_root()
    return logging.getLogger(name)
