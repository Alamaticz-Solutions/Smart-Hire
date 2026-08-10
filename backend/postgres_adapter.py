import os
import re
import sqlite3
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

    def __iter__(self):
        # Yield (key, value) tuples so that dict(row) works correctly
        return iter(self._mapping.items())

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
                if table in ["candidate_metadata", "custom_columns", "jobs", "users", "change_requests", "activity_logs", "team_members", "integrations_settings"]:
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
    def __init__(self, pg_conn):
        self.pg_conn = pg_conn
        self._row_factory = None

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
        self.pg_conn.close()

def connect_pg(*args, **kwargs):
    import psycopg2
    if POSTGRES_URL:
        conn = psycopg2.connect(POSTGRES_URL)
    else:
        conn = psycopg2.connect(
            host=PG_HOST,
            port=PG_PORT,
            user=PG_USER,
            password=PG_PASS,
            database=PG_DB
        )
    conn.set_client_encoding('UTF8')
    return PGConnection(conn)

def patch_if_configured():
    """
    Patches sqlite3.connect dynamically to enforce PostgreSQL.
    """
    if not IS_PG_CONFIGURED:
        raise RuntimeError("Database Configuration Error: PostgreSQL connection details are not configured in the environment variables.")
    
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

