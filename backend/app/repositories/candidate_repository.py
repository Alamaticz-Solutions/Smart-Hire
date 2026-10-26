"""Data access for candidates.

Administrator-defined *custom columns* make the physical table wider than the
ORM model, so dict-shaped reads and writes go through a reflected ``Table``
(always in sync with the real schema) while single-entity operations use the
ORM model.
"""
from __future__ import annotations

import json
import threading
import warnings
from typing import Any, Iterable, Optional, Sequence

from sqlalchemy import event, exc as sa_exc
from sqlalchemy import MetaData, Table, and_, delete, func, insert, or_, select, update
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.models import CANDIDATE_LIST_COLUMNS, Candidate, JobCandidate
from app.repositories.base import BaseRepository, row_to_dict

_table_cache: dict[int, Table] = {}
_cache_lock = threading.Lock()


_SCHEMA_CHANGED = "candidate_schema_changed"


def invalidate_candidate_table_cache(session: Optional[Session] = None) -> None:
    """Forget the reflected table.

    Pass the ``session`` that ran the DDL: its own reads then see the new
    schema immediately, and the shared cache is cleared again right after that
    session commits (clearing earlier would let another connection re-cache
    the *old* schema while the DDL is still uncommitted).
    """
    with _cache_lock:
        _table_cache.clear()
    if session is not None:
        session.info[_SCHEMA_CHANGED] = True


@event.listens_for(Session, "after_commit")
def _clear_cache_after_ddl_commit(session: Session) -> None:
    if session.info.pop(_SCHEMA_CHANGED, False):
        with _cache_lock:
            _table_cache.clear()


@event.listens_for(Session, "after_rollback")
def _discard_schema_flag(session: Session) -> None:
    session.info.pop(_SCHEMA_CHANGED, None)


def _reflect(engine: Engine) -> Table:
    key = id(engine)
    with _cache_lock:
        table = _table_cache.get(key)
        if table is None:
            with warnings.catch_warnings():
                # expression indexes (LOWER(created_by)) cannot be reflected; harmless here
                warnings.simplefilter("ignore", sa_exc.SAWarning)
                table = Table(Candidate.__tablename__, MetaData(), autoload_with=engine)
            _table_cache[key] = table
        return table


def _within_notice(notice: Any, max_days: int) -> bool:
    """True for "immediate" or a numeric notice period of at most ``max_days``."""
    text = str(notice or "").strip().lower()
    if "immediate" in text:
        return True
    digits = "".join(ch for ch in text if ch.isdigit())
    return bool(digits) and int(digits) <= max_days


def _coerce(column_type: Any, value: Any) -> Any:
    """Best-effort conversion of ``value`` to ``column_type``'s Python type."""
    if value is None or isinstance(value, bool):
        return value
    python_type = getattr(column_type, "python_type", None)
    try:
        if python_type is str and isinstance(value, (int, float)):
            return str(value)
        if python_type is int and isinstance(value, (str, float)):
            return int(float(value))
        if python_type is float and isinstance(value, (str, int)):
            return float(value)
    except (TypeError, ValueError):
        return None
    return value


class CandidateRepository(BaseRepository):
    # ── schema ───────────────────────────────────────────────────────────
    @property
    def table(self) -> Table:
        if self.session.info.get(_SCHEMA_CHANGED):
            # uncommitted DDL in this session: reflect through its own
            # connection and never share the result via the cache
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", sa_exc.SAWarning)
                return Table(Candidate.__tablename__, MetaData(), autoload_with=self.session.connection())
        return _reflect(self.session.get_bind())

    @property
    def column_names(self) -> set[str]:
        return {c.name for c in self.table.columns}

    # ── single entity ────────────────────────────────────────────────────
    def get(self, candidate_id: int) -> Optional[Candidate]:
        return self.session.get(Candidate, candidate_id)

    def get_row(self, candidate_id: int) -> Optional[dict[str, Any]]:
        """Full row (every column incl. custom + file bytes) as a dict."""
        row = self.session.execute(select(self.table).where(self.table.c.id == candidate_id)).first()
        return row_to_dict(row) if row else None

    def get_name(self, candidate_id: int) -> str:
        name = self.session.scalar(select(Candidate.full_name).where(Candidate.id == candidate_id))
        return name or f"ID {candidate_id}"

    def find_by_filename(self, filename: str, exclude_id: Optional[int] = None) -> Optional[int]:
        stmt = select(Candidate.id).where(Candidate.filename == filename)
        if exclude_id is not None:
            stmt = stmt.where(Candidate.id != exclude_id)
        return self.session.scalar(stmt.limit(1))

    def find_latest_by_filename(self, filename: str) -> Optional[dict[str, Any]]:
        t = self.table
        row = self.session.execute(
            select(t).where(t.c.filename == filename).order_by(t.c.id.desc()).limit(1)
        ).first()
        return row_to_dict(row) if row else None

    def find_by_sender_or_email(self, address: str) -> Optional[dict[str, Any]]:
        address = address.lower()
        t = self.table
        row = self.session.execute(
            select(t)
            .where(or_(func.lower(t.c.sender_email) == address, func.lower(t.c.email) == address))
            .order_by(t.c.id.desc())
            .limit(1)
        ).first()
        return row_to_dict(row) if row else None

    def get_file_info(self, filename: str) -> Optional[tuple[Optional[str], Optional[bytes], Optional[int], Optional[str]]]:
        """``(file_url, file_bytes, candidate_id, created_by)`` for ``filename``."""
        row = self.session.execute(
            select(Candidate.file_url, Candidate.file_bytes, Candidate.id, Candidate.created_by)
            .where(Candidate.filename == filename)
            .limit(1)
        ).first()
        if not row:
            return None
        file_bytes = row[1]
        if isinstance(file_bytes, memoryview):
            file_bytes = file_bytes.tobytes()
        return row[0], file_bytes, row[2], row[3]

    # ── writes ───────────────────────────────────────────────────────────
    def insert(self, data: dict[str, Any]) -> int:
        values = self._clean(data)
        values.pop("id", None)
        result = self.session.execute(insert(self.table).values(**values))
        return int(result.inserted_primary_key[0])

    def update(self, candidate_id: int, data: dict[str, Any]) -> int:
        """Returns the number of rows updated."""
        values = self._clean(data)
        values.pop("id", None)
        if not values:
            return 0
        result = self.session.execute(update(self.table).where(self.table.c.id == candidate_id).values(**values))
        return int(result.rowcount or 0)

    def set_formatted_json(self, candidate_id: int, payload: Optional[str]) -> None:
        self.session.execute(update(Candidate).where(Candidate.id == candidate_id).values(formatted_json=payload))

    def set_qualified(self, candidate_id: int, qualified: bool) -> None:
        self.session.execute(update(Candidate).where(Candidate.id == candidate_id).values(is_qualified=int(qualified)))

    def delete(self, candidate_id: int) -> None:
        self.session.execute(delete(JobCandidate).where(JobCandidate.candidate_id == candidate_id))
        self.session.execute(delete(Candidate).where(Candidate.id == candidate_id))

    def delete_many(self, candidate_ids: Iterable[int]) -> None:
        ids = list(candidate_ids)
        if not ids:
            return
        self.session.execute(delete(JobCandidate).where(JobCandidate.candidate_id.in_(ids)))
        self.session.execute(delete(Candidate).where(Candidate.id.in_(ids)))

    def delete_excel_placeholders(self, filename: str) -> None:
        self.session.execute(
            delete(Candidate).where(Candidate.filename == filename, Candidate.full_name.like("⏳ Parsing Excel:%"))
        )

    def delete_by_source(self, source: str) -> list[tuple[int, Optional[str]]]:
        """Delete every candidate imported from ``source``; returns (id, filename)."""
        rows = self.session.execute(
            select(Candidate.id, Candidate.filename).where(Candidate.source == source)
        ).all()
        self.delete_many(r[0] for r in rows)
        return [(r[0], r[1]) for r in rows]

    def delete_all(self) -> None:
        self.session.execute(delete(JobCandidate))
        self.session.execute(delete(Candidate))

    # ── reads (lists) ────────────────────────────────────────────────────
    def list_rows(
        self, owner: Optional[str] = None, limit: Optional[int] = None, offset: int = 0
    ) -> list[dict[str, Any]]:
        """List-view rows, newest first; ``owner`` restricts to one user's candidates."""
        columns = [getattr(Candidate, name) for name in CANDIDATE_LIST_COLUMNS]
        stmt = select(*columns).order_by(Candidate.timestamp.desc(), Candidate.id.desc())
        if owner:
            stmt = stmt.where(func.lower(Candidate.created_by) == owner.lower())
        if limit is not None:
            stmt = stmt.limit(limit).offset(offset)
        return [row_to_dict(r) for r in self.session.execute(stmt)]

    def count(self, owner: Optional[str] = None) -> int:
        stmt = select(func.count()).select_from(Candidate)
        if owner:
            stmt = stmt.where(func.lower(Candidate.created_by) == owner.lower())
        return int(self.session.scalar(stmt) or 0)

    def all_rows(self, owner: Optional[str] = None) -> list[dict[str, Any]]:
        stmt = select(self.table)
        if owner:
            stmt = stmt.where(func.lower(self.table.c.created_by) == owner.lower())
        return [row_to_dict(r) for r in self.session.execute(stmt)]

    def rows_by_filenames(self, filenames: Sequence[str]) -> list[dict[str, Any]]:
        if not filenames:
            return []
        stmt = select(self.table).where(self.table.c.filename.in_(list(filenames)))
        return [row_to_dict(r) for r in self.session.execute(stmt)]

    def identity_rows(self, owner: str) -> list[dict[str, Any]]:
        """``id / full_name / email / phone`` of an owner's candidates (dedupe)."""
        stmt = select(Candidate.id, Candidate.full_name, Candidate.email, Candidate.phone).where(
            func.lower(Candidate.created_by) == owner.lower()
        )
        return [row_to_dict(r) for r in self.session.execute(stmt)]

    def list_for_job(self, job_id: int) -> list[dict[str, Any]]:
        columns = [getattr(Candidate, name) for name in CANDIDATE_LIST_COLUMNS]
        stmt = (
            select(*columns, JobCandidate.ai_reason, JobCandidate.status.label("job_status"))
            .join(JobCandidate, Candidate.id == JobCandidate.candidate_id)
            .where(JobCandidate.job_id == job_id)
        )
        return [row_to_dict(r) for r in self.session.execute(stmt)]

    def list_unmatched_for_job(self, job_id: int, owner: Optional[str] = None) -> list[dict[str, Any]]:
        t = self.table
        matched = select(JobCandidate.candidate_id).where(JobCandidate.job_id == job_id)
        stmt = select(t).where(t.c.id.not_in(matched)).order_by(t.c.full_name.asc())
        if owner:
            stmt = stmt.where(func.lower(t.c.created_by) == owner.lower())
        return [row_to_dict(r) for r in self.session.execute(stmt)]

    def search(self, filters: dict[str, Any], owner: Optional[str]) -> list[dict[str, Any]]:
        """Structured search used by the chat assistant."""
        columns = [getattr(Candidate, name) for name in CANDIDATE_LIST_COLUMNS]
        stmt = select(*columns).order_by(Candidate.timestamp.desc())
        conditions = []
        if owner:
            conditions.append(func.lower(Candidate.created_by) == owner.lower())

        if name_q := filters.get("name_query"):
            like = f"%{name_q}%"
            conditions.append(or_(
                Candidate.full_name.like(like),
                Candidate.current_organization.like(like),
                Candidate.email.like(like),
            ))
        skills = filters.get("skills_keywords")
        if isinstance(skills, list):
            for skill in skills:
                skill = str(skill).strip()
                if skill:
                    like = f"%{skill}%"
                    conditions.append(or_(Candidate.skills.like(like), Candidate.certifications.like(like)))
        for key, column in (("min_pega_exp", Candidate.pega_experience), ("min_total_exp", Candidate.total_experience)):
            value = filters.get(key)
            if value is not None:
                try:
                    conditions.append(column >= float(value))
                except (TypeError, ValueError):
                    pass
        if location := filters.get("current_location"):
            like = f"%{location}%"
            conditions.append(or_(Candidate.current_location.like(like), Candidate.pref_locations.like(like)))

        if conditions:
            stmt = stmt.where(and_(*conditions))
        rows = [row_to_dict(r) for r in self.session.execute(stmt)]

        max_notice = filters.get("notice_period_max")
        if max_notice is not None:
            try:
                rows = [r for r in rows if _within_notice(r.get("notice_period"), int(max_notice))]
            except (TypeError, ValueError):
                pass
        return rows

    # ── helpers ──────────────────────────────────────────────────────────
    def _clean(self, data: dict[str, Any]) -> dict[str, Any]:
        """Keep only real columns and coerce values to each column's type.

        Blank strings become NULL, dict/list values become JSON text, numbers
        written to text columns are stringified and numeric text written to
        numeric columns is parsed.
        """
        table = self.table
        cleaned: dict[str, Any] = {}
        for key, value in data.items():
            if key not in table.c:
                continue
            if key != "file_bytes":
                if value == "":
                    value = None
                elif isinstance(value, (dict, list)):
                    value = json.dumps(value)
                value = _coerce(table.c[key].type, value)
            cleaned[key] = value
        return cleaned
