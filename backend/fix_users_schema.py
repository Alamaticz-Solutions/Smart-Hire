"""
Script to add missing columns to the PostgreSQL users table.
Run this once to fix the schema mismatch between SQLite and PostgreSQL.
"""
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv('.env')
url = os.getenv('POSTGRES_DATABASE_URL')
conn = psycopg2.connect(url)
cur = conn.cursor()

# Get existing columns
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'")
existing_cols = {r[0] for r in cur.fetchall()}
print(f"Existing columns: {existing_cols}")

# All columns that need to exist in the users table
required_cols = {
    'full_name': 'TEXT',
    'is_hr': 'INTEGER DEFAULT 0',
    'is_admin': 'INTEGER DEFAULT 0',
    'is_external': 'INTEGER DEFAULT 0',
    'hidden_fields': "TEXT DEFAULT ''",
    'is_approved': 'INTEGER DEFAULT 0',
}

for col, dtype in required_cols.items():
    if col not in existing_cols:
        try:
            cur.execute(f"ALTER TABLE users ADD COLUMN {col} {dtype}")
            conn.commit()
            print(f"  Added column: {col}")
        except Exception as e:
            conn.rollback()
            print(f"  Warning adding {col}: {e}")
    else:
        print(f"  Column already exists: {col}")

# Ensure admin user has correct flags
cur.execute("SELECT username FROM users WHERE LOWER(username) = 'admin'")
if cur.fetchone():
    cur.execute("UPDATE users SET role = 'admin', is_hr = 1, is_admin = 1, is_approved = 1 WHERE LOWER(username) = 'admin'")
    conn.commit()
    print("Admin user flags updated.")

cur.close()
conn.close()
print("\nDone! Users table schema is now correct.")
