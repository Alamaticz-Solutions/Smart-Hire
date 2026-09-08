from app.db.session import get_db_connection
with get_db_connection() as conn:
    cur = conn.cursor()
    cur.execute("SELECT id, filename, candidate_status, error_detail FROM candidate_metadata WHERE candidate_status='Error' ORDER BY id DESC LIMIT 5")
    for row in cur.fetchall():
        print(row)
