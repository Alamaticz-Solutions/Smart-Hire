"""Database schema creation, migrations, and seed data for the Hire AI stats DB."""
import os
import hashlib
import sqlite3

from app.core.config import STATS_DB


# NOTE: This function is intentionally NOT invoked at import time (unlike the
# original main.py, where `init_db()` was a bare module-level call executed as
# a side effect of importing the module). It must be called explicitly — e.g.
# from a FastAPI lifespan handler — so that startup ordering is deterministic
# and testable.
#
# IMPORTANT ordering constraint: `patch_if_configured()` from
# `app.db.postgres_adapter` monkey-patches `sqlite3.connect` to transparently
# route to PostgreSQL. It MUST run BEFORE this function is ever called,
# otherwise init_db() will create/migrate a plain local SQLite file instead of
# the intended Postgres database.
def init_db():
    conn = sqlite3.connect(STATS_DB, timeout=30.0)
    cur  = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS candidate_metadata (
            id                   INTEGER PRIMARY KEY AUTOINCREMENT,
            filename             TEXT,
            full_name            TEXT,
            candidate_status     TEXT DEFAULT 'New',
            total_experience     REAL DEFAULT 0.0,
            pega_experience      REAL DEFAULT 0.0,
            skills               TEXT,
            certifications       TEXT,
            ctc                  TEXT,
            notice_period        TEXT,
            current_organization TEXT,
            email                TEXT,
            phone                TEXT,
            linkedin             TEXT,
            created_by           TEXT DEFAULT 'admin',
            timestamp            DATETIME DEFAULT CURRENT_TIMESTAMP,
            file_bytes           BYTEA
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS custom_columns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            col_key TEXT UNIQUE,
            col_label TEXT,
            description TEXT
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            client_name TEXT,
            contact_name TEXT,
            client_phone TEXT,
            account_manager TEXT,
            assigned_recruiter TEXT,
            target_date TEXT,
            job_type TEXT,
            job_status TEXT,
            work_experience TEXT,
            industry TEXT,
            salary TEXT,
            required_skills TEXT,
            created_by TEXT DEFAULT 'admin',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS job_candidates (
            job_id INTEGER,
            candidate_id INTEGER,
            ai_reason TEXT,
            status TEXT DEFAULT 'matched',
            PRIMARY KEY (job_id, candidate_id),
            FOREIGN KEY (job_id) REFERENCES jobs(id),
            FOREIGN KEY (candidate_id) REFERENCES candidate_metadata(id)
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            is_hr INTEGER DEFAULT 0,
            is_admin INTEGER DEFAULT 0,
            is_external INTEGER DEFAULT 0,
            hidden_fields TEXT DEFAULT '',
            email TEXT,
            mobile TEXT,
            is_approved INTEGER DEFAULT 0
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS change_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            action_type TEXT NOT NULL,
            target_id TEXT,
            payload TEXT,
            description TEXT,
            status TEXT DEFAULT 'pending',
            rejection_reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Migration: some deployments have a pre-existing change_requests table
    # from an older schema that CREATE TABLE IF NOT EXISTS above is a no-op
    # against - discovered live when a real Postgres DB's change_requests
    # table was missing `username` entirely, 500ing every approval-required
    # action (new user registration included) with "column username of
    # relation change_requests does not exist". NOT NULL is relaxed to a
    # DEFAULT here (unlike the fresh-table CREATE above) since ALTER TABLE
    # ADD COLUMN can't add NOT NULL to a table that may already have rows.
    cur.execute("PRAGMA table_info(change_requests)")
    existing_cr_cols = {c[1] for c in cur.fetchall()}
    cr_migrate_cols = {
        'username': "TEXT DEFAULT 'unknown'",
        'action_type': "TEXT DEFAULT ''",
        'target_id': 'TEXT',
        'payload': 'TEXT',
        'description': 'TEXT',
        'status': "TEXT DEFAULT 'pending'",
        'rejection_reason': 'TEXT',
        'created_at': 'DATETIME DEFAULT CURRENT_TIMESTAMP',
    }
    for col, dtype in cr_migrate_cols.items():
        if col not in existing_cr_cols:
            cur.execute(f"ALTER TABLE change_requests ADD COLUMN {col} {dtype}")

    try:
        cur.execute("ALTER TABLE users ADD COLUMN mobile TEXT")
        conn.commit()
    except Exception:
        conn.rollback()

    cur.execute('''
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            action TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    # Migration: fix activity_logs if it was created with old schema (user_id instead of username).
    # This is a destructive migration (DROP + recreate) rather than an ALTER/backfill, which means
    # any rows logged under the old schema are discarded. That's accepted here because activity_logs
    # is best-effort audit trail data, not a system of record, and the old schema had no username
    # column to backfill from in the first place.
    try:
        cur.execute("PRAGMA table_info(activity_logs)")
        al_cols = [c[1] for c in cur.fetchall()]
        if 'username' not in al_cols:
            print("INFO: Migrating activity_logs table (adding username column)...")
            cur.execute("DROP TABLE IF EXISTS activity_logs")
            cur.execute('''
                CREATE TABLE activity_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL,
                    action TEXT NOT NULL,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            print("INFO: activity_logs table migrated successfully.")
    except Exception as e_al:
        print(f"WARNING: activity_logs migration check failed: {e_al}")

    cur.execute('''
        CREATE TABLE IF NOT EXISTS team_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS job_shares (
            job_id INTEGER,
            username TEXT,
            PRIMARY KEY (job_id, username),
            FOREIGN KEY (job_id) REFERENCES jobs(id),
            FOREIGN KEY (username) REFERENCES users(username)
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS masked_keywords (
            keyword TEXT PRIMARY KEY
        )
    ''')
    cur.execute("SELECT COUNT(*) FROM masked_keywords")
    if cur.fetchone()[0] == 0:
        for kw in ["CSSA", "LSA"]:
            cur.execute("INSERT OR IGNORE INTO masked_keywords (keyword) VALUES (?)", (kw,))

    # Clean up any lingering processing states from an ungraceful shutdown
    # We update instead of deleting to prevent foreign key violations if the candidate was already linked to a job
    cur.execute("UPDATE candidate_metadata SET full_name = REPLACE(full_name, '⏳ Processing: ', '❌ Failed: ') WHERE full_name LIKE '%Processing%'")

    # Migration: add missing columns to candidate_metadata
    cur.execute("PRAGMA table_info(candidate_metadata)")
    existing = [c[1] for c in cur.fetchall()]
    new_cols = {
        'candidate_status': "TEXT DEFAULT 'New'",
        'source': "TEXT DEFAULT 'Resume Upload'",
        'cdh_exp': 'REAL DEFAULT 0.0',
        'expected_ctc': 'TEXT',
        'percentage_hike': 'TEXT',
        'candidate_interview_status': 'TEXT',
        'availability_in_days': 'INTEGER',
        'current_location': 'TEXT',
        'pref_locations': 'TEXT',
        'current_client': 'TEXT',
        'domain': 'TEXT',
        'tier': 'TEXT',
        'certification_version': 'TEXT',
        'current_organization': 'TEXT',
        'email': 'TEXT',
        'phone': 'TEXT',
        'linkedin': 'TEXT',
        'email_message': 'TEXT',
        'formatted_json': 'TEXT',
        'sender_email': 'TEXT',
        'is_qualified': 'INTEGER DEFAULT 0',
        'is_approved': 'INTEGER DEFAULT 1',
        'created_by': "TEXT DEFAULT 'admin'",
        'file_bytes': 'BYTEA',
        'file_url': 'TEXT',
        # The only way to find out why a candidate ended up candidate_status
        # 'Error' was to have been watching stdout at the exact moment it
        # happened - logs aren't persisted to a file, and nothing was ever
        # stored on the row itself. Same str(e)[:200] resume_processing.py
        # already computed and threw away into a log line.
        'error_detail': 'TEXT'
    }
    for col, dtype in new_cols.items():
        if col not in existing:
            cur.execute(f"ALTER TABLE candidate_metadata ADD COLUMN {col} {dtype}")

    # Migration: add missing columns to jobs
    cur.execute("PRAGMA table_info(jobs)")
    existing_jobs = [c[1] for c in cur.fetchall()]
    new_jobs_cols = {
        'client_name': 'TEXT',
        'contact_name': 'TEXT',
        'client_phone': 'TEXT',
        'account_manager': 'TEXT',
        'assigned_recruiter': 'TEXT',
        'target_date': 'TEXT',
        'job_type': 'TEXT',
        'job_status': 'TEXT',
        'work_experience': 'TEXT',
        'industry': 'TEXT',
        'salary': 'TEXT',
        'required_skills': 'TEXT',
        'created_by': "TEXT DEFAULT 'admin'"
    }
    for col, dtype in new_jobs_cols.items():
        if col not in existing_jobs:
            cur.execute(f"ALTER TABLE jobs ADD COLUMN {col} {dtype}")

    # Migration: add missing columns to users
    # Wrapped in try/except because PostgreSQL raises an error if the column already exists
    cur.execute("PRAGMA table_info(users)")
    existing_users_cols = [c[1] for c in cur.fetchall()]
    users_migrate_cols = {
        'is_hr': 'INTEGER DEFAULT 0',
        'is_admin': 'INTEGER DEFAULT 0',
        'is_external': 'INTEGER DEFAULT 0',
        'hidden_fields': "TEXT DEFAULT ''",
        'email': 'TEXT',
        'is_approved': 'INTEGER DEFAULT 0',
        'full_name': 'TEXT',
    }
    for col, dtype in users_migrate_cols.items():
        if col not in existing_users_cols:
            try:
                cur.execute(f"ALTER TABLE users ADD COLUMN {col} {dtype}")
                conn.commit()
            except Exception:
                conn.rollback()

    # ── Indexes ──────────────────────────────────────────────────────────
    # None existed anywhere in the original schema. `WHERE LOWER(username) =
    # LOWER(?)` runs on nearly every authenticated request (is_user_approved/
    # get_user_role/is_admin_or_hr in app/services/auth.py, plus every login),
    # `WHERE LOWER(created_by) = LOWER(?)` gates most candidate/job rows to
    # their owner, `candidate_metadata` is sorted by `timestamp DESC` on every
    # GET /api/candidates, and `job_candidates` is looked up by `candidate_id`
    # alone (e.g. deleting/re-matching a candidate) as often as by `job_id`
    # (already the leading column of the table's composite PRIMARY KEY, so
    # only `candidate_id` needs its own index). A plain index on `username`/
    # `created_by` wouldn't be used by these queries at all -- the `LOWER(...)`
    # wrapper defeats a normal B-tree index -- so these are expression
    # indexes on the lowercased value instead. `CREATE INDEX IF NOT EXISTS`
    # and expression indexes are both supported by SQLite (3.9+) and
    # Postgres, and this statement shape doesn't trigger any of
    # postgres_adapter.py's query-rewriting rules, so no translation quirks
    # to worry about here.
    for index_sql in (
        "CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username))",
        "CREATE INDEX IF NOT EXISTS idx_candidate_metadata_created_by_lower ON candidate_metadata (LOWER(created_by))",
        "CREATE INDEX IF NOT EXISTS idx_candidate_metadata_timestamp ON candidate_metadata (timestamp)",
        "CREATE INDEX IF NOT EXISTS idx_jobs_created_by_lower ON jobs (LOWER(created_by))",
        "CREATE INDEX IF NOT EXISTS idx_job_candidates_candidate_id ON job_candidates (candidate_id)",
        # job_shares' PK is (job_id, username) - username is the TRAILING
        # column of that composite key, so it gets none of the leftmost-
        # prefix benefit job_id gets from the same PK. The external-user
        # "which jobs are shared with me" query filters on
        # LOWER(js.username) alone (jobs.py's list_jobs), which was a full
        # table scan without this.
        "CREATE INDEX IF NOT EXISTS idx_job_shares_username_lower ON job_shares (LOWER(username))",
        # activity_logs only ever grows and is queried as ORDER BY timestamp
        # DESC LIMIT N (the activity feed, polled every 30s while open) -
        # without this, Postgres sorts the whole table before applying the
        # limit, on every poll.
        "CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs (timestamp)",
    ):
        try:
            cur.execute(index_sql)
            conn.commit()
        except Exception:
            conn.rollback()

    # Seed default users if empty (do NOT wipe the table to preserve registered users!)
    cur.execute("SELECT COUNT(*) FROM users WHERE LOWER(username) = 'admin'")
    if cur.fetchone()[0] == 0:
        cur.execute("INSERT INTO users (full_name, username, password_hash, role, is_hr, is_admin, email, is_approved) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    ("System Admin", "admin", hashlib.sha256("admin".encode()).hexdigest(), "admin", 1, 1, "admin@gmail.com", 1))
    else:
        # Guarantee admin role/flags are set correctly
        try:
            cur.execute("UPDATE users SET role = 'admin', is_hr = 1, is_admin = 1, is_approved = 1 WHERE LOWER(username) = 'admin'")
        except Exception as e:
            print(f"Warning: could not update admin user flags: {e}")

    cur.execute("SELECT COUNT(*) FROM users WHERE LOWER(username) = 'user'")
    if cur.fetchone()[0] == 0:
        cur.execute("INSERT INTO users (full_name, username, password_hash, role, is_hr, is_admin, email, is_approved) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    ("Test User", "user", hashlib.sha256("user".encode()).hexdigest(), "user", 0, 0, "user@gmail.com", 1))

    # Seed the 4 recruiters in user management if they do not exist.
    # NOTE (unusual on purpose): each seeded recruiter's password is their own
    # username, sha256-hashed (e.g. user "Boopathi" / password "boopathi"). This
    # is legacy demo/seed-data behavior preserved verbatim from main.py, not a
    # recommendation — do not extend this pattern to real accounts.
    for m in ["Boopathi", "Praveen", "Harish", "Sabari"]:
        uname = m.lower()
        role = "admin" if uname == "sabari" else "user"
        is_admin_val = 1 if uname == "sabari" else 0
        is_hr_val = 1 if uname == "sabari" else 0
        cur.execute("SELECT COUNT(*) FROM users WHERE LOWER(username) = ?", (uname,))
        if cur.fetchone()[0] == 0:
            cur.execute("INSERT INTO users (full_name, username, password_hash, role, is_hr, is_admin, email, is_approved) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        (m, uname, hashlib.sha256(uname.encode()).hexdigest(), role, is_hr_val, is_admin_val, f"{uname}@gmail.com", 1))
        else:
            try:
                cur.execute("UPDATE users SET is_hr = ?, is_admin = ?, role = ?, is_approved = 1 WHERE LOWER(username) = ?", (is_hr_val, is_admin_val, role, uname))
            except Exception as e:
                print(f"Warning: could not update user {uname}: {e}")

    cur.execute("SELECT COUNT(*) FROM team_members")
    if cur.fetchone()[0] == 0:
        for m in ["Boopathi", "Praveen", "Harish", "Sabari"]:
            cur.execute("INSERT OR IGNORE INTO team_members (name) VALUES (?)", (m,))

    # Pre-approve seeded/default users. This hardcoded allowlist of seeded
    # usernames must stay in sync with the accounts inserted above and with
    # `is_user_approved`'s own allowlist in app/services/auth.py — both exist
    # so seeded accounts always work even if the `is_approved` column value
    # drifts (e.g. someone manually revokes it in the DB).
    try:
        cur.execute("UPDATE users SET is_approved = 1 WHERE LOWER(username) IN ('admin', 'user', 'boopathi', 'praveen', 'harish', 'sabari')")
    except Exception as e:
        print(f"Warning: could not pre-approve default users: {e}")

    # Fix emails of existing seeded/default users if they are NULL/empty
    for uname in ["admin", "user", "boopathi", "praveen", "harish", "sabari", "somasekhar9"]:
        try:
            cur.execute("UPDATE users SET email = ? WHERE LOWER(username) = ? AND (email IS NULL OR email = '')", (f"{uname}@gmail.com", uname))
        except Exception:
            pass

    # Create integrations_settings table
    cur.execute('''
    CREATE TABLE IF NOT EXISTS integrations_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email_enabled INTEGER DEFAULT 0,
        imap_host TEXT DEFAULT 'imap.gmail.com',
        imap_port INTEGER DEFAULT 993,
        smtp_host TEXT DEFAULT 'smtp.gmail.com',
        smtp_port INTEGER DEFAULT 587,
        email_user TEXT,
        email_pass TEXT,
        keywords TEXT DEFAULT 'resume,alamaticz,solution,job',
        drive_enabled INTEGER DEFAULT 0,
        reply_theme TEXT DEFAULT 'professional',
        reply_subject TEXT DEFAULT 'Re: {subject} (Ref: {ref})',
        reply_body_missing TEXT,
        reply_body_complete TEXT,
        gdrive_client_id TEXT,
        gdrive_client_secret TEXT,
        gdrive_refresh_token TEXT,
        gdrive_folder_id TEXT,
        gdrive_email TEXT,
        ms_client_id TEXT,
        ms_client_secret TEXT,
        ms_tenant_id TEXT DEFAULT 'common',
        gmail_enabled INTEGER DEFAULT 0,
        gmail_email TEXT,
        gmail_pass TEXT,
        outlook_enabled INTEGER DEFAULT 0,
        outlook_email TEXT,
        additional_emails TEXT DEFAULT '[]',
        theme_usage_counts TEXT DEFAULT '{}'
    )
    ''')

    # Check/add email template customization columns to integrations_settings (migration for existing DBs)
    cur.execute("PRAGMA table_info(integrations_settings)")
    existing_settings_cols = {c[1] for c in cur.fetchall()}
    if 'reply_theme' not in existing_settings_cols:
        cur.execute("ALTER TABLE integrations_settings ADD COLUMN reply_theme TEXT DEFAULT 'professional'")
    if 'theme_usage_counts' not in existing_settings_cols:
        cur.execute("ALTER TABLE integrations_settings ADD COLUMN theme_usage_counts TEXT DEFAULT '{}'")
    if 'reply_subject' not in existing_settings_cols:
        cur.execute("ALTER TABLE integrations_settings ADD COLUMN reply_subject TEXT DEFAULT 'Re: {subject} (Ref: {ref})'")
    if 'reply_body_missing' not in existing_settings_cols:
        cur.execute("ALTER TABLE integrations_settings ADD COLUMN reply_body_missing TEXT")
    if 'reply_body_complete' not in existing_settings_cols:
        cur.execute("ALTER TABLE integrations_settings ADD COLUMN reply_body_complete TEXT")
    if 'gdrive_client_id' not in existing_settings_cols:
        cur.execute("ALTER TABLE integrations_settings ADD COLUMN gdrive_client_id TEXT")
    if 'gdrive_client_secret' not in existing_settings_cols:
        cur.execute("ALTER TABLE integrations_settings ADD COLUMN gdrive_client_secret TEXT")
    if 'gdrive_refresh_token' not in existing_settings_cols:
        cur.execute("ALTER TABLE integrations_settings ADD COLUMN gdrive_refresh_token TEXT")
    if 'gdrive_folder_id' not in existing_settings_cols:
        cur.execute("ALTER TABLE integrations_settings ADD COLUMN gdrive_folder_id TEXT")
    if 'gdrive_email' not in existing_settings_cols:
        cur.execute("ALTER TABLE integrations_settings ADD COLUMN gdrive_email TEXT")
    if 'additional_emails' not in existing_settings_cols:
        cur.execute("ALTER TABLE integrations_settings ADD COLUMN additional_emails TEXT DEFAULT '[]'")
    if 'ms_client_id' not in existing_settings_cols:
        cur.execute("ALTER TABLE integrations_settings ADD COLUMN ms_client_id TEXT")
    if 'ms_client_secret' not in existing_settings_cols:
        cur.execute("ALTER TABLE integrations_settings ADD COLUMN ms_client_secret TEXT")
    if 'ms_tenant_id' not in existing_settings_cols:
        cur.execute("ALTER TABLE integrations_settings ADD COLUMN ms_tenant_id TEXT DEFAULT 'common'")
    if 'gmail_enabled' not in existing_settings_cols:
        cur.execute("ALTER TABLE integrations_settings ADD COLUMN gmail_enabled INTEGER DEFAULT 0")
    if 'gmail_email' not in existing_settings_cols:
        cur.execute("ALTER TABLE integrations_settings ADD COLUMN gmail_email TEXT")
    if 'gmail_pass' not in existing_settings_cols:
        cur.execute("ALTER TABLE integrations_settings ADD COLUMN gmail_pass TEXT")
    if 'outlook_enabled' not in existing_settings_cols:
        cur.execute("ALTER TABLE integrations_settings ADD COLUMN outlook_enabled INTEGER DEFAULT 0")
    if 'outlook_email' not in existing_settings_cols:
        cur.execute("ALTER TABLE integrations_settings ADD COLUMN outlook_email TEXT")
    if 'default_resume_template' not in existing_settings_cols:
        cur.execute("ALTER TABLE integrations_settings ADD COLUMN default_resume_template TEXT DEFAULT 'alamaticz'")

    # Seed integrations_settings if empty, loading from environment variables if present
    cur.execute("SELECT COUNT(*) FROM integrations_settings")
    if cur.fetchone()[0] == 0:
        env_user = os.getenv("SMTP_SENDER", "")
        env_pass = os.getenv("SMTP_PASSWORD", "")
        env_imap = os.getenv("IMAP_HOST", "imap.gmail.com")
        env_smtp = os.getenv("SMTP_HOST", "smtp.gmail.com")
        # IMAP_PORT/SMTP_PORT are documented in backend/.env.example (defaults
        # 993/587) but were previously ignored here in favor of hardcoded
        # literals, so setting them in the environment had no effect on the
        # seeded row. Read them the same way env_imap/env_smtp are read above.
        try:
            env_imap_port = int(os.getenv("IMAP_PORT", "993"))
        except ValueError:
            env_imap_port = 993
        try:
            env_smtp_port = int(os.getenv("SMTP_PORT", "587"))
        except ValueError:
            env_smtp_port = 587
        email_enabled = 1 if env_user and env_pass else 0
        cur.execute("""
        INSERT INTO integrations_settings (email_enabled, imap_host, imap_port, smtp_host, smtp_port, email_user, email_pass, keywords, drive_enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (email_enabled, env_imap, env_imap_port, env_smtp, env_smtp_port, env_user, env_pass, "resume,alamaticz,solution,job", 0))

    # Create processed_emails table
    cur.execute('''
    CREATE TABLE IF NOT EXISTS processed_emails (
        msg_uid TEXT PRIMARY KEY,
        processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    conn.commit()
    conn.close()
