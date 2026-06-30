import sqlite3

db_path = "c:/Users/sekhe/OneDrive/Documents/321/backend/stats.db"
conn = sqlite3.connect(db_path)
cur = conn.cursor()

username = "admin"
cur.execute("SELECT role, is_admin FROM users WHERE LOWER(username) = LOWER(?)", (username,))
row = cur.fetchone()
print("Row for admin:", row)

if row:
    role, is_admin = row
    print("role:", role, "is_admin:", is_admin)
    if is_admin == 1 or role == "admin":
        print("Role is admin!")
    else:
        print("Role is NOT admin!")
else:
    print("User admin not found!")

conn.close()
