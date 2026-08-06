import os
import sqlite3
from dotenv import load_dotenv

load_dotenv('.env')

from postgres_adapter import patch_if_configured
patch_if_configured()

STATS_DB = os.getenv("STATS_DB_PATH", "stats.db")

conn = sqlite3.connect(STATS_DB, timeout=30.0)
cur  = conn.cursor()

print("Dropping incorrect integrations_settings table...")
cur.execute("DROP TABLE IF EXISTS integrations_settings")

print("Recreating integrations_settings with correct schema...")
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
        additional_emails TEXT DEFAULT '[]',
        theme_usage_counts TEXT DEFAULT '{}'
    )
''')

cur.execute("SELECT COUNT(*) FROM integrations_settings")
if cur.fetchone()[0] == 0:
    cur.execute("""
        INSERT INTO integrations_settings (
            email_enabled, imap_host, imap_port, smtp_host, smtp_port, email_user, email_pass, keywords, drive_enabled
        ) VALUES (0, 'imap.gmail.com', 993, 'smtp.gmail.com', 587, '', '', 'resume,alamaticz,solution,job', 0)
    """)

conn.commit()
conn.close()
print("Fixed successfully!")
