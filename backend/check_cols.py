import psycopg2, os
from dotenv import load_dotenv
load_dotenv('.env')

conn = psycopg2.connect(os.getenv('POSTGRES_DATABASE_URL'))
cur = conn.cursor()
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position")
print("Users table columns:", [r[0] for r in cur.fetchall()])
cur.close()
conn.close()
