import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import sqlite3
from dotenv import load_dotenv

# Load env variables
load_dotenv()

# Define paths relative to the script location
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATS_DB = os.path.join(BASE_DIR, "stats.db")
UPLOAD_DIR = os.path.join(BASE_DIR, "static")

# Check and patch PostgreSQL if configured
from postgres_adapter import patch_if_configured
PG_ACTIVE = patch_if_configured()

def cleanup():
    # If using Postgres, we don't require the local STATS_DB path to exist
    if not PG_ACTIVE and not os.path.exists(STATS_DB):
        print(f"Database not found at {STATS_DB}")
        return
        
    if PG_ACTIVE:
        print("Connecting to remote PostgreSQL database...")
    else:
        print(f"Connecting to local database: {STATS_DB}")
    conn = sqlite3.connect(STATS_DB)
    cur = conn.cursor()
    
    # Query all candidates that have "Processing Error:" in their name
    cur.execute("SELECT id, filename, full_name FROM candidate_metadata WHERE full_name LIKE 'Processing Error:%'")
    rows = cur.fetchall()
    
    print(f"Found {len(rows)} entries with processing errors.")
    
    deleted_files_count = 0
    deleted_rows_count = 0
    
    for cand_id, filename, full_name in rows:
        print(f"Processing candidate ID {cand_id}: '{full_name}' (file: '{filename}')")
        
        # 1. Clean up the physical file
        if filename:
            file_path = os.path.join(UPLOAD_DIR, filename)
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                    print(f"  Deleted file: {file_path}")
                    deleted_files_count += 1
                except Exception as e:
                    print(f"  Error deleting file {file_path}: {e}")
            else:
                print(f"  File not found on disk: {file_path}")
                
        # 2. Delete matched jobs associations
        try:
            cur.execute("DELETE FROM job_candidates WHERE candidate_id = ?", (cand_id,))
        except Exception as e:
            print(f"  Error deleting job_candidates associations: {e}")
            
        # 3. Delete candidate metadata row
        try:
            cur.execute("DELETE FROM candidate_metadata WHERE id = ?", (cand_id,))
            deleted_rows_count += 1
            print(f"  Deleted database record for candidate ID {cand_id}")
        except Exception as e:
            print(f"  Error deleting candidate record: {e}")
            
    conn.commit()
    conn.close()
    
    print(f"Cleanup completed. Deleted {deleted_files_count} files and {deleted_rows_count} database records.")

if __name__ == "__main__":
    cleanup()
