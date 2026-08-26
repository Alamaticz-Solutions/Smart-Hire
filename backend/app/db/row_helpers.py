"""Unified row-to-dict conversion, replacing main.py's two overlapping implementations (dict_row_factory and row_to_dict)."""

from typing import Any, Optional


def row_to_dict(row: Any, cursor: Optional[Any] = None) -> dict:
    """Convert a single DB row to a plain dict, regardless of its underlying shape.

    Consolidates two previously separate helpers in main.py:

    - `dict_row_factory(cursor, row)` (~lines 16-31): installed as a
      sqlite3/PGConnection `row_factory`, so it is invoked by the driver
      itself with `(cursor, row)` and needs to handle a raw tuple by
      zipping it against `cursor.description` when the row has no
      `.keys()`.
    - `row_to_dict(row)` (~lines 167-175): called manually, after the row
      has already been fetched, on either a `sqlite3.Row` (which exposes
      `.keys()`/mapping-style access) or a `PGRow`/dict (see
      app/db/postgres_adapter.py's PGRow, which also exposes `.items()`).

    This version supports both call shapes: pass `cursor` when converting a
    raw tuple straight out of a row_factory callback; omit it when the row
    already knows its own column names (sqlite3.Row, PGRow, dict).
    """
    if not row:
        return {}
    if isinstance(row, dict):
        return row
    # sqlite3.Row and PGRow both support mapping-style .keys()/__getitem__.
    if hasattr(row, "keys") and callable(row.keys):
        try:
            return {k: row[k] for k in row.keys()}
        except Exception:
            pass
    # PGRow (and similar) may additionally expose .items() directly.
    if hasattr(row, "items") and callable(row.items):
        try:
            return dict(row.items())
        except Exception:
            pass
    # Raw tuple with an explicit cursor: zip against column descriptions,
    # matching what sqlite3/psycopg2 pass into a row_factory callback.
    if cursor is not None and getattr(cursor, "description", None):
        try:
            return {col[0]: val for col, val in zip(cursor.description, row)}
        except Exception:
            pass
    try:
        return dict(row)
    except Exception:
        return {}


def dict_row_factory(cursor, row):
    """Drop-in `row_factory` for sqlite3.connect(...)/PGConnection: delegates to row_to_dict(row, cursor)."""
    try:
        return row_to_dict(row, cursor=cursor)
    except Exception:
        # Fallback: return the row as-is (may be a tuple for SQLite without a row_factory).
        return row
