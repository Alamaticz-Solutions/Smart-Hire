import os
import sys
from dotenv import load_dotenv

# Load env variables from backend/.env where the neon url is stored
load_dotenv('.env')

# Import main which automatically applies the postgres patch
import main

print("Running init_db()...")
try:
    main.init_db()
    print("Database tables initialized successfully!")
except Exception as e:
    print(f"Error initializing DB: {e}")
