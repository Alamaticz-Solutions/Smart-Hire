import sqlite3
db_path = "c:/Users/sekhe/OneDrive/Documents/321/backend/stats.db"
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Set is_external = 0, is_admin = 1, is_hr = 1, role = 'admin' for Somasekhar9 and sabari
cur.execute("""
    UPDATE users 
    SET is_external = 0, is_admin = 1, is_hr = 1, role = 'admin' 
    WHERE LOWER(username) IN ('somasekhar9', 'sabari')
""")
print(f"Updated rows: {cur.rowcount}")

conn.commit()

# Verify the changes
cur.execute("SELECT id, username, full_name, role, is_hr, is_admin, is_external FROM users")
for r in cur.fetchall():
    print(r)

conn.close()
