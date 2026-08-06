import psycopg2
import os
from dotenv import load_dotenv

load_dotenv('.env')
url = os.getenv('POSTGRES_DATABASE_URL')
if not url:
    print("No database URL")
    exit(1)

conn = psycopg2.connect(url)
cur = conn.cursor()
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';")
tables = cur.fetchall()
print("Tables in public schema:")
if not tables:
    print("No tables found. The database is empty.")
for t in tables:
    table_name = t[0]
    cur.execute(f"SELECT COUNT(*) FROM {table_name}")
    count = cur.fetchone()[0]
    print(f"- {table_name}: {count} rows")

cur.close()
conn.close()
