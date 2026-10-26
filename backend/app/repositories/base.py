"""Repository plumbing.

Repositories receive a session and never commit: the caller (request
dependency or ``session_scope``) owns the transaction, so several repositories
can take part in one unit of work.
"""
from __future__ import annotations

from typing import Any, Mapping

from sqlalchemy.orm import Session


class BaseRepository:
    def __init__(self, session: Session) -> None:
        self.session = session


def row_to_dict(row: Any) -> dict[str, Any]:
    """Convert a SQLAlchemy ``Row`` / mapping to a plain ``dict``."""
    if row is None:
        return {}
    mapping: Mapping[str, Any] = row._mapping if hasattr(row, "_mapping") else row
    return dict(mapping)
