import os
import re
import sqlite3
import threading
from typing import Any, Dict, List, Optional

# PostgreSQL Env Configuration
POSTGRES_URL = os.getenv("POSTGRES_DATABASE_URL")
# Individual connection options
PG_HOST = os.getenv("POSTGRES_HOST")
PG_PORT = os.getenv("POSTGRES_PORT", "5432")
PG_USER = os.getenv("POSTGRES_USER")
PG_PASS = os.getenv("POSTGRES_PASSWORD")
PG_DB = os.getenv("POSTGRES_DB")

# Check if PostgreSQL is configured
IS_PG_CONFIGURED = bool(POSTGRES_URL or (PG_HOST and PG_USER and PG_PASS and PG_DB))

class PGRow:
    """
    Mock sqlite3.Row to support name-based and index-based lookups,
    and convert to dict or list matching default sqlite3 row_factory API.
    """
    def __init__(self, cursor, row_data):
        self._row_data = row_data
        self._keys = [desc[0] for desc in cursor.description] if cursor.description else []
        self._mapping = {key: val for key, val in zip(self._keys, row_data)}

    def __getitem__(self, key):
        if isinstance(key, int):
            return self._row_data[key]
        elif isinstance(key, str):
            return self._mapping[key]
        raise TypeError("Row indices must be integers or strings")

    def get(self, key, default=None):
        return self._mapping.get(key, default)

    def keys(self):
        return self._keys

    def __len__(self):
        return len(self._row_data)


    def __contains__(self, key):
        return key in self._mapping

    def __repr__(self):
        return f"PGRow({self._mapping})"

    def items(self):
        return self._mapping.items()

    def values(self):
        return self._mapping.values()

class PGCursor:
    def __init__(self, pg_cursor, connection):
        self.pg_cursor = pg_cursor
        self.connection = connection
        self.lastrowid = None

    @property
    def rowcount(self):
        # sqlite3.Cursor.rowcount is a plain attribute; this wrapper never
        # defined it, so any call site written against the sqlite3 API (as
        # every route in this codebase is) got an AttributeError against
        # Postgres. Proxy straight through to the underlying driver cursor,
        # which does support it.
        return self.pg_cursor.rowcount

    def execute(self, query, params=None):
        translated = self._translate_query(query)
        pg_params = params
        if params is not None:
            if isinstance(params, dict):
                pg_params = {k: (None if (isinstance(v, str) and v.strip() == "") else v) for k, v in params.items()}
            elif isinstance(params, (list, tuple)):
                pg_params = [None if (isinstance(v, str) and v.strip() == "") else v for v in params]
            else:
                pg_params = (None if (isinstance(params, str) and params.strip() == "") else params,)
        else:
            pg_params = None
        
        # Execute query
        try:
            self.pg_cursor.execute(translated, pg_params)
        except Exception as e:
            try:
                print(f"--- POSTGRES EXECUTION FAILURE ---")
                print(f"Query: {translated.encode('ascii', errors='replace').decode('ascii')}")
                print(f"Params: {str(pg_params).encode('ascii', errors='replace').decode('ascii')}")
                print(f"Error: {e}")
            except Exception:
                pass
            raise e
        
        # Capture last inserted ID if query has RETURNING id
        if "RETURNING id" in translated:
            try:
                row = self.pg_cursor.fetchone()
                if row:
                    self.lastrowid = row[0]
            except Exception:
                pass
        return self

    def executemany(self, query, params_list):
        translated = self._translate_query(query)
        cleaned_list = []
        for params in params_list:
            if isinstance(params, dict):
                cleaned = {k: (None if v == "" else v) for k, v in params.items()}
            elif isinstance(params, (list, tuple)):
                cleaned = [None if v == "" else v for v in params]
            else:
                cleaned = None if params == "" else params
            cleaned_list.append(cleaned)
        self.pg_cursor.executemany(translated, cleaned_list)
        return self

    def fetchone(self):
        try:
            row = self.pg_cursor.fetchone()
        except Exception:
            return None
            
        if not row:
            return None
        if self.connection.row_factory:
            return self.connection.row_factory(self, row)
        # Default: always wrap in PGRow so dict(row) works
        return PGRow(self, row)

    def fetchall(self):
        try:
            rows = self.pg_cursor.fetchall()
        except Exception:
            return []
            
        if not rows:
            return []
        if self.connection.row_factory:
            return [self.connection.row_factory(self, r) for r in rows]
        # Default: always wrap in PGRow so dict(row) works
        return [PGRow(self, r) for r in rows]


    @property
    def description(self):
        return self.pg_cursor.description

    def close(self):
        self.pg_cursor.close()

    def _translate_query(self, query: str) -> str:
        q = query.strip()
        
        # 1. Placeholders: ? -> %s
        translated = q.replace("?", "%s")
        # Escape literal '%' (not followed by 's') to '%%' for psycopg2 format compatibility
        translated = re.sub(r'%(?!s)', '%%', translated)
        
        # 2. CREATE TABLE translations
        # id INTEGER PRIMARY KEY AUTOINCREMENT -> id SERIAL PRIMARY KEY
        translated = re.sub(
            r'INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT', 
            'SERIAL PRIMARY KEY', 
            translated, 
            flags=re.IGNORECASE
        )
        # DATETIME -> TIMESTAMP
        translated = re.sub(
            r'\bDATETIME\b', 
            'TIMESTAMP', 
            translated, 
            flags=re.IGNORECASE
        )
        
        # 3. INSERT OR IGNORE translation
        if "INSERT OR IGNORE" in translated.upper():
            m = re.match(
                r'INSERT\s+OR\s+IGNORE\s+INTO\s+(\w+)', 
                translated, 
                flags=re.IGNORECASE
            )
            if m:
                table_name = m.group(1).lower()
                conflict_target = ""
                if table_name == "masked_keywords":
                    conflict_target = "keyword"
                elif table_name == "team_members":
                    conflict_target = "name"
                elif table_name == "custom_columns":
                    conflict_target = "col_key"
                elif table_name == "processed_emails":
                    conflict_target = "msg_uid"
                
                # Replace INSERT OR IGNORE with INSERT INTO
                translated = re.sub(
                    r'INSERT\s+OR\s+IGNORE\s+INTO', 
                    'INSERT INTO', 
                    translated, 
                    flags=re.IGNORECASE
                )
                if conflict_target:
                    translated += f" ON CONFLICT ({conflict_target}) DO NOTHING"
            else:
                translated = re.sub(
                    r'INSERT\s+OR\s+IGNORE\s+INTO', 
                    'INSERT INTO', 
                    translated, 
                    flags=re.IGNORECASE
                )
        
        # 4. PRAGMA table_info translation
        m_pragma = re.match(
            r'PRAGMA\s+table_info\((\w+)\)', 
            translated, 
            flags=re.IGNORECASE
        )
        if m_pragma:
            table_name = m_pragma.group(1)
            translated = f"""
                SELECT 0 as cid, column_name as name, data_type as type, 
                       CASE WHEN is_nullable = 'NO' THEN 1 ELSE 0 END as notnull, 
                       column_default as dflt_value, 0 as pk
                FROM information_schema.columns 
                WHERE table_name = '{table_name.lower()}'
            """
            
        # 5. Safe regex-based integer notice period check for Postgres casting
        # CAST(notice_period AS INTEGER) -> CASE WHEN notice_period ~ '^[0-9]+$' THEN CAST(notice_period AS INTEGER) ELSE 0 END
        translated = re.sub(
            r'CAST\s*\(\s*notice_period\s+AS\s+INTEGER\s*\)',
            "CASE WHEN notice_period ~ '^[0-9]+$' THEN CAST(notice_period AS INTEGER) ELSE 0 END",
            translated,
            flags=re.IGNORECASE
        )

        # 6. Case-insensitivity: LIKE -> ILIKE
        # (Exclude sub-strings inside LIKE quotes if any, but since the queries in main.py are SQL statements, we replace the keyword LIKE)
        translated = re.sub(r'\bLIKE\b', 'ILIKE', translated, flags=re.IGNORECASE)

        # 7. RETURNING id translation
        if translated.strip().upper().startswith("INSERT") and "RETURNING" not in translated.upper():
            m_table = re.match(
                r'INSERT\s+INTO\s+(\w+)', 
                translated, 
                flags=re.IGNORECASE
            )
            if m_table:
                table = m_table.group(1).lower()
                if table in ["candidate_metadata", "custom_columns", "jobs", "users", "change_requests", "activity_logs", "team_members", "integrations_settings", "job_shares", "job_candidates"]:
                    translated += " RETURNING id"

        # 8. Translate 'password' column -> 'password_hash' for PostgreSQL users table compatibility.
        # The SQLite schema uses 'password' but PostgreSQL uses 'password_hash'.
        # We use word-boundary regex to avoid accidentally replacing other words.
        # We specifically avoid translating 'SMTP_PASSWORD', 'email_pass', etc.
        translated = re.sub(r'\bpassword\b(?!\s*_)', 'password_hash', translated, flags=re.IGNORECASE)

        # 9. Translate SQLite-only 'users' CREATE TABLE to be compatible with PostgreSQL
        # (adds missing columns like full_name, is_hr, is_admin, is_external, hidden_fields, is_approved)
        # These columns already exist in the users table if created via fast_init_db.py,
        # but in case the table was created by a pure SQLite schema, we ensure ALTER TABLE is skipped gracefully.

        return translated

class PGConnection:
    def __init__(self, pg_conn, pool=None):
        self.pg_conn = pg_conn
        self._row_factory = None
        # When borrowed from a pool, `close()` returns the physical
        # connection to the pool instead of tearing down the socket -- see
        # `close()` below and `_get_pool()`.
        self._pool = pool

    @property
    def row_factory(self):
        return self._row_factory

    @row_factory.setter
    def row_factory(self, value):
        # Maps sqlite3.Row requests to custom PGRow; allows other callables through
        if value is sqlite3.Row:
            self._row_factory = PGRow
        elif callable(value):
            # Support custom row factories like dict_row_factory
            self._row_factory = value
        elif value is None:
            self._row_factory = None
        else:
            self._row_factory = PGRow

    def cursor(self):
        return PGCursor(self.pg_conn.cursor(), self)

    def commit(self):
        self.pg_conn.commit()

    def rollback(self):
        self.pg_conn.rollback()

    def close(self):
        if self._pool is not None:
            # Returning to a pool, not actually closing the socket. Roll
            # back first: `get_db_connection()` callers only ever explicitly
            # `commit()` when they mean to persist a change, so any
            # exception path (or a caller that reads without committing)
            # can leave an open transaction on this connection. Handing that
            # to the next borrower unrolled-back would let one request's
            # abandoned transaction bleed into an unrelated request.
            try:
                self.pg_conn.rollback()
            except Exception:
                pass
            try:
                self._pool.putconn(self.pg_conn)
                return
            except Exception:
                pass  # Pool already closed/broken -- fall through and close for real.
        self.pg_conn.close()

# Connection pool. `connect_pg()` used to open a brand-new TCP+TLS+auth
# connection to Postgres on every single call -- since every one of the
# ~99 `get_db_connection()` call sites across the app calls `connect_pg()`
# via the sqlite3.connect monkeypatch, that meant nearly every API request
# paid a full new-connection handshake before doing any real work. This was
# identified as the single biggest performance issue in the app. A pool
# reuses a small number of already-authenticated physical connections
# instead, so most requests just borrow/return an existing connection.
_pg_pool = None

# Small pool: this app's routes run synchronously on FastAPI's threadpool
# (default cap ~40 workers, but rarely all busy on Postgres at once), and
# most requests hold a connection only briefly. Configurable via env vars
# in case a specific deployment needs more headroom.
POSTGRES_POOL_MIN = int(os.getenv("POSTGRES_POOL_MIN", "1"))
POSTGRES_POOL_MAX = int(os.getenv("POSTGRES_POOL_MAX", "10"))


_pool_init_lock = threading.Lock()


def _get_pool():
    # `if _pg_pool is None: create it` is not thread-safe on its own: FastAPI
    # runs sync route handlers (and this module's own sync DB calls made from
    # the async `verify_session_middleware`) on a threadpool, so multiple
    # concurrent requests can all see `_pg_pool is None` at once - exactly
    # what happens the moment a page loads and fires several requests
    # together right after server startup, before the pool has been created
    # yet. Each of those threads would then create its OWN separate
    # ThreadedConnectionPool; whichever assignment happened last "wins" and
    # becomes the module-level `_pg_pool`, but connections already handed out
    # by the other, now-orphaned pool(s) are still live and in use - and when
    # a caller holding one of those calls `close()`, `self._pool.putconn(...)`
    # returns it to the pool IT was given, not the one everyone else is now
    # using, so that connection is silently lost to the "real" pool forever
    # (shrinking the effective pool size below POSTGRES_POOL_MIN over time)
    # while the caller that requested it can still intermittently get a
    # connection whose lifecycle nothing is tracking correctly. This
    # reproduced as auth randomly appearing to fail right after login (a
    # burst of concurrent requests, each independently racing to initialize
    # the pool) despite the login response and session token both being
    # completely correct. Double-checked locking (check, lock, check again)
    # keeps the common case - pool already initialized - lock-free.
    global _pg_pool
    if _pg_pool is None:
        with _pool_init_lock:
            if _pg_pool is None:
                import psycopg2.pool
                if POSTGRES_URL:
                    _pg_pool = psycopg2.pool.ThreadedConnectionPool(POSTGRES_POOL_MIN, POSTGRES_POOL_MAX, POSTGRES_URL)
                else:
                    _pg_pool = psycopg2.pool.ThreadedConnectionPool(
                        POSTGRES_POOL_MIN, POSTGRES_POOL_MAX,
                        host=PG_HOST, port=PG_PORT, user=PG_USER, password=PG_PASS, database=PG_DB,
                    )
    return _pg_pool


def closeall_pool():
    """Close every pooled connection. Call on app shutdown to avoid leaking sockets."""
    global _pg_pool
    if _pg_pool is not None:
        _pg_pool.closeall()
        _pg_pool = None


def connect_pg(*args, **kwargs):
    # `ThreadedConnectionPool.getconn()` does not block when the pool is
    # exhausted - it raises `PoolError` immediately. With a small pool (see
    # POSTGRES_POOL_MAX above) any legitimate burst above that size (e.g. a
    # page load firing several requests at once) previously surfaced as a
    # hard 500 to the user instead of the brief wait it actually needed, since
    # most requests hold their connection only briefly. Retry with a short
    # backoff instead of failing on the first exhausted check.
    import time
    import psycopg2.pool
    pool = _get_pool()
    last_err = None
    for attempt in range(20):
        try:
            conn = pool.getconn()
            break
        except psycopg2.pool.PoolError as e:
            last_err = e
            time.sleep(0.1)
    else:
        if last_err is not None:
            raise last_err
        raise psycopg2.pool.PoolError("PostgreSQL connection pool exhausted after retry attempts.")
    conn.set_client_encoding('UTF8')
    return PGConnection(conn, pool=pool)

def patch_if_configured():
    """
    Patches sqlite3.connect to route to PostgreSQL when Postgres env vars are
    configured. If they're not configured, this is a no-op: sqlite3.connect
    is left untouched and the app runs on local SQLite (see STATS_DB in
    app/core/config.py). Only raises when Postgres WAS configured but can't
    actually be used (missing driver, unreachable server) - a genuine
    misconfiguration worth failing loudly on, as opposed to "not configured
    at all," which is a normal, supported local-dev mode.
    """
    if not IS_PG_CONFIGURED:
        return False

    try:
        import psycopg2
    except ImportError as e:
        raise RuntimeError("Database Dependency Error: 'psycopg2-binary' package is not installed. PostgreSQL is required.") from e
        
    try:
        # Test connection immediately on startup to ensure remote database is reachable
        test_conn = connect_pg()
        test_conn.close()
    except Exception as e:
        raise RuntimeError(f"Database Connection Error: Failed to connect to remote PostgreSQL server: {e}") from e

    sqlite3.connect = connect_pg
    print("Database: Successfully patched sqlite3 to route queries to remote PostgreSQL server.")
    return True

