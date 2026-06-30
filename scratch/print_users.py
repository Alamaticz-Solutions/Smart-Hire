import sqlite3
conn = sqlite3.connect("c:/Users/sekhe/OneDrive/Documents/321/backend/stats.db")
cur = conn.cursor()
cur.execute("SELECT id, username, full_name, role, is_hr, is_admin, is_external FROM users")
for r in cur.fetchall():
    print(r)
conn.close()
