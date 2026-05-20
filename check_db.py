import sqlite3
import json

conn = sqlite3.connect(r"c:\Users\sekhe\OneDrive\Documents\321\backend\stats.db")
cur = conn.cursor()
cur.execute("SELECT id, filename, full_name FROM candidate_metadata")
rows = cur.fetchall()
for row in rows:
    print(row)
conn.close()
