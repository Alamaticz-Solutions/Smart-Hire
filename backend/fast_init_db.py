import os
import sqlite3
from dotenv import load_dotenv

load_dotenv('.env')

# Setup adapter
from postgres_adapter import patch_if_configured
patch_if_configured()

STATS_DB = os.getenv("STATS_DB_PATH", "stats.db")

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
            source               TEXT DEFAULT 'Manual',
            cdh_exp              REAL DEFAULT 0.0,
            expected_ctc         TEXT,
            percentage_hike      TEXT,
            candidate_interview_status TEXT DEFAULT 'Pending',
            availability_in_days INTEGER DEFAULT 0,
            current_location     TEXT,
            pref_locations       TEXT,
            current_client       TEXT,
            domain               TEXT,
            tier                 TEXT,
            certification_version TEXT,
            sender_email         TEXT,
            is_qualified         INTEGER DEFAULT 0,
            is_approved          INTEGER DEFAULT 0,
            file_url             TEXT
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS custom_columns (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            col_key  TEXT UNIQUE,
            col_name TEXT,
            col_type TEXT
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            location TEXT,
            requirements TEXT,
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'Open',
            salary_range TEXT
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS job_candidates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER,
            candidate_id INTEGER,
            status TEXT DEFAULT 'Applied',
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(job_id) REFERENCES jobs(id),
            FOREIGN KEY(candidate_id) REFERENCES candidate_metadata(id)
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            google_id TEXT,
            email TEXT
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS change_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            field_name TEXT,
            old_value TEXT,
            new_value TEXT,
            status TEXT DEFAULT 'Pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT,
            details TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS team_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            role TEXT,
            email TEXT
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS job_shares (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER,
            team_member_id INTEGER,
            shared_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(job_id) REFERENCES jobs(id),
            FOREIGN KEY(team_member_id) REFERENCES team_members(id)
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS masked_keywords (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            keyword TEXT UNIQUE NOT NULL
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS integrations_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT UNIQUE NOT NULL,
            api_key TEXT,
            webhook_url TEXT,
            is_active INTEGER DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS processed_emails (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            msg_uid TEXT UNIQUE NOT NULL,
            processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'success',
            candidate_id INTEGER
        )
    ''')
    
    # Check if admin user exists, insert if not
    cur.execute("SELECT * FROM users WHERE username = 'admin'")
    if not cur.fetchone():
        import hashlib
        pwd_hash = hashlib.sha256("admin".encode()).hexdigest()
        cur.execute("INSERT INTO users (username, password_hash, role) VALUES ('admin', ?, 'admin')", (pwd_hash,))
        
    conn.commit()
    conn.close()

if __name__ == "__main__":
    print("Running fast init_db()...")
    init_db()
    print("Done!")
