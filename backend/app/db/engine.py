"""SQLAlchemy engine and session management (replaces the sqlite3 monkeypatch).

The engine is created lazily so tests can call :func:`configure_engine` with a
different URL before the first query.
"""
from __future__ import annotations

import threading
from contextlib import contextmanager
from typing import Iterator, Optional

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import DATABASE_URL
from app.core.logging import get_logger

logger = get_logger(__name__)

_lock = threading.Lock()
_engine: Optional[Engine] = None
_factory: Optional[sessionmaker[Session]] = None


def _build_engine(url: URL) -> Engine:
    if url.get_backend_name() == "sqlite":
        kwargs: dict = {"connect_args": {"check_same_thread": False, "timeout": 30}}
        if url.database in (None, "", ":memory:"):
            kwargs["poolclass"] = StaticPool
        engine = create_engine(url, **kwargs)

        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(dbapi_connection, _record):  # pragma: no cover - trivial
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=OFF")  # legacy data contains orphaned links
            cursor.close()

        return engine
    return create_engine(url, pool_size=5, max_overflow=10, pool_pre_ping=True, pool_recycle=1800)


def configure_engine(url: Optional[URL] = None) -> Engine:
    global _engine, _factory
    with _lock:
        if _engine is not None:
            _engine.dispose()
        _engine = _build_engine(url or DATABASE_URL)
        _factory = sessionmaker(bind=_engine, autoflush=True, expire_on_commit=False)
        logger.info("Database engine ready (%s)", _engine.dialect.name)
        return _engine


def get_engine() -> Engine:
    return _engine or configure_engine()


def get_session_factory() -> sessionmaker[Session]:
    if _factory is None:
        configure_engine()
    assert _factory is not None
    return _factory


def dispose_engine() -> None:
    global _engine, _factory
    with _lock:
        if _engine is not None:
            _engine.dispose()
        _engine = _factory = None


def get_session() -> Iterator[Session]:
    """FastAPI dependency: one session per request; commit on success."""
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@contextmanager
def session_scope() -> Iterator[Session]:
    """Transactional scope for code running outside a request (workers)."""
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
