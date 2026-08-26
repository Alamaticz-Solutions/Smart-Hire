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

    When Postgres is active, `sqlite3.connect` is monkey-patched to
    `postgres_adapter.connect_pg`, which borrows a connection from a
    process-wide pool instead of opening a new TCP+auth connection every
    call -- see `postgres_adapter._get_pool()`. `conn.close()` below
    returns the connection to that pool rather than tearing it down (the
    pooled `PGConnection.close()` handles that transparently), so this
    function's own de-duplication/leak-fix contract is unchanged: callers
    get a connection per `with` block and it's always released on exit,
    they just don't need to know or care whether "released" means "closed"
    (plain sqlite3) or "returned to the pool" (Postgres).
    """
    conn = sqlite3.connect(STATS_DB, timeout=timeout)
    try:
        yield conn
    finally:
        conn.close()
