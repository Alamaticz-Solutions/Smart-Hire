import sqlite3
import json

conn = sqlite3.connect("backend/stats.db")
cur = conn.cursor()
cur.execute("SELECT id, filename, full_name FROM candidate_metadata")
rows = cur.fetchall()
for row in rows:
    row_str = str(row)
    safe_str = row_str.encode('ascii', errors='replace').decode('ascii')
    print(safe_str)
conn.close()
