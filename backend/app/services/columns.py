"""Administrator-defined custom candidate columns.

Custom columns are real ``TEXT`` columns added to ``candidate_metadata`` at
runtime plus a row in ``custom_columns`` (label / description for the UI and
the LLM extraction prompt).
"""
from __future__ import annotations

import re

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.models import Candidate
from app.repositories import CandidateRepository, CustomColumnRepository, invalidate_candidate_table_cache

logger = get_logger(__name__)

_UNSAFE = re.compile(r"[^a-zA-Z0-9_]")
_BUILTIN_COLUMNS = frozenset(c.name for c in Candidate.__table__.columns)


class ColumnExistsError(ValueError):
    """The requested column already exists."""


def clean_key(raw: str) -> str:
    """Normalise a user-supplied key into a safe lower-case identifier."""
    return _UNSAFE.sub("", raw.replace(" ", "_")).lower()


def add_custom_column(session: Session, key: str, label: str, description: str) -> str:
    """Add the column; returns the normalised key. Raises ``ColumnExistsError``."""
    clean = clean_key(key)
    if not clean:
        raise ValueError("Invalid column name")
    if clean in CandidateRepository(session).column_names:
        raise ColumnExistsError("Column already exists")
    session.execute(text(f'ALTER TABLE candidate_metadata ADD COLUMN "{clean}" TEXT'))
    CustomColumnRepository(session).add(clean, label, description)
    invalidate_candidate_table_cache(session)
    return clean


def remove_custom_column(session: Session, key: str) -> None:
    """Delete the label row and drop the column (built-in columns are never dropped)."""
    clean = clean_key(key)
    CustomColumnRepository(session).remove(key)
    if clean and clean not in _BUILTIN_COLUMNS and clean in CandidateRepository(session).column_names:
        try:
            session.execute(text(f'ALTER TABLE candidate_metadata DROP COLUMN "{clean}"'))
        except Exception:
            logger.warning("Could not drop column %s", clean, exc_info=True)
    invalidate_candidate_table_cache(session)
