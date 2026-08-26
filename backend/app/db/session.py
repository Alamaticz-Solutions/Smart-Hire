"""Context-manager wrapper around sqlite3.connect(STATS_DB) to de-duplicate ~98 call sites in main.py and stop connections leaking on exception."""

import contextlib
import sqlite3

from app.core.config import STATS_DB

# IMPORTANT: this must call sqlite3.connect (not psycopg2.connect directly).
# app/db/postgres_adapter.py's patch_if_configured() monkey-patches
# sqlite3.connect itself at startup so that, when Postgres env vars are
# present, plain `sqlite3.connect(...)` calls transparently open a
# psycopg2-backed PGConnection instead of a real sqlite3 connection. Calling
# sqlite3.connect here (rather than caching the function reference at import
# time) ensures we always get whichever backend is active for the process.


@contextlib.contextmanager
def get_db_connection(timeout: float = 30.0):
    """Yield a DB connection (sqlite3 or Postgres, per postgres_adapter's patch) and guarantee it is closed.

    This is a pure de-duplication / connection-leak fix, not a connection
    pool -- pooling is out of scope here and deferred to a future task.
    Callers get a single fresh connection per `with` block today; because
    every call site goes through this one function, a pool can be dropped
    in later without touching call sites.
    """
    conn = sqlite3.connect(STATS_DB, timeout=timeout)
    try:
        yield conn
    finally:
        conn.close()
