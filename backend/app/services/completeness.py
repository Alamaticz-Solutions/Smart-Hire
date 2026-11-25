"""How complete a candidate profile is, and where a record came from."""
from __future__ import annotations

from typing import Any, Optional

#: (field, label) a usable profile should have. Experience counts only when above zero.
CORE_FIELDS: tuple[tuple[str, str], ...] = (
    ("full_name", "Name"),
    ("email", "Email"),
    ("phone", "Phone"),
    ("total_experience", "Total experience"),
    ("skills", "Skills"),
    ("current_location", "Current location"),
    ("current_organization", "Current employer"),
    ("notice_period", "Notice period"),
)
REVIEW_BELOW_PERCENT = 60

_EMPTY = ("", "null", "none", "nan", "[hidden]")


def _present(row: dict[str, Any], field: str) -> bool:
    value = row.get(field)
    if field == "notice_period" and (value is None or str(value).strip() == ""):
        value = row.get("availability_in_days")
    if value is None:
        return False
    if field == "total_experience":
        try:
            return float(value) > 0
        except (TypeError, ValueError):
            return False
    if field == "full_name" and ("Processing" in str(value) or "Failed" in str(value) or "Retrying" in str(value)):
        return False
    return str(value).strip().lower() not in _EMPTY


def missing_fields(row: dict[str, Any]) -> list[str]:
    return [label for field, label in CORE_FIELDS if not _present(row, field)]


def completeness_percent(row: dict[str, Any]) -> int:
    filled = sum(1 for field, _ in CORE_FIELDS if _present(row, field))
    return round(100 * filled / len(CORE_FIELDS))


def derive_origin(source: Optional[str], filename: Optional[str] = None) -> str:
    """Map the free-text ``source`` column to one of mail | excel | resume | manual."""
    value = (source or "").strip().lower()
    if value in ("uploaded from mail", "email", "mail"):
        return "mail"
    if value == "excel import":
        return "excel"
    if value == "manual entry":
        return "manual"
    return "resume"


def derive_state(row: dict[str, Any]) -> str:
    """``failed`` for broken imports, ``review`` for thin profiles, else ``active``."""
    if row.get("candidate_status") == "Error":
        return "failed"
    return "review" if completeness_percent(row) < REVIEW_BELOW_PERCENT else "active"
