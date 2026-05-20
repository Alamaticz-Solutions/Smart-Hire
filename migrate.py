import sqlite3
import os

db_path = r"c:\Users\sekhe\OneDrive\Documents\321\backend\stats.db"
conn = sqlite3.connect(db_path, timeout=30.0)
cur = conn.cursor()

try:
    cur.execute("ALTER TABLE candidate_metadata ADD COLUMN is_qualified INTEGER DEFAULT 0")
    conn.commit()
    print("Added is_qualified column")
except Exception as e:
    print("Error:", e)

conn.close()
