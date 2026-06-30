import sqlite3

conn = sqlite3.connect('backend/stats.db')
conn.row_factory = sqlite3.Row
cur = conn.cursor()
cur.execute('SELECT * FROM users WHERE LOWER(username) = ?', ('somasekhar7',))
row = cur.fetchone()
if row:
    print("User somasekhar7 record:")
    print(dict(row))
else:
    print("User somasekhar7 not found")
conn.close()
