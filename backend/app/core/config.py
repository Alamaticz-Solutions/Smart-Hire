"""Single source of truth for env-var/config loading; previously duplicated (and silently divergent) between main.py and services/storage.py."""

import os

from dotenv import load_dotenv

# Load root .env first, then let backend/.env override/supplement it.
# This mirrors the exact two-step load main.py performed inline before this
# module existed (see git history of app/main.py, lines ~148-153).
load_dotenv()

# BASE_DIR must resolve to the `backend/` directory. This file lives at
# backend/app/core/config.py, three levels below `backend/`, so we walk up
# three dirname() calls. main.py (backend/app/main.py) walks up two, which
# is the same target directory -- both arrive at `backend/`.
#
# NOTE: services/storage.py historically computed its own BASE_DIR as just
# `dirname(abspath(storage.py))`, i.e. `backend/app/services/`, one level
# too shallow. That meant storage.py looked for `.env` and (in its
# STATS_DB_PATH fallback) `stats.db` inside `app/services/` instead of
# `backend/`. The two modules only ever agreed in practice because
# STATS_DB_PATH was set explicitly in the environment, masking the bug.
# Every path below is now computed once, correctly, here.
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PROJECT_ROOT = os.path.dirname(BASE_DIR)

_backend_env_path = os.path.join(BASE_DIR, ".env")
if os.path.exists(_backend_env_path):
    load_dotenv(_backend_env_path, override=True)

# Support a persistent volume directory /data (e.g. on Render) when writable;
# otherwise fall back to the backend directory.
DATA_DIR = "/data" if os.path.exists("/data") and os.access("/data", os.W_OK) else BASE_DIR

UPLOAD_DIR = os.path.join(DATA_DIR, "static")
STATS_DB = os.getenv("STATS_DB_PATH", os.path.join(DATA_DIR, "stats.db"))

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(os.path.dirname(STATS_DB), exist_ok=True)

# ── AI / LLM ─────────────────────────────────────────────────────────────────
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
HF_TOKEN = os.getenv("HF_TOKEN", "")

# ── Email (SMTP send / IMAP read) ───────────────────────────────────────────
SMTP_SENDER = os.getenv("SMTP_SENDER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = os.getenv("SMTP_PORT", "587")
IMAP_HOST = os.getenv("IMAP_HOST", "imap.gmail.com")

# ── External storage provider selection ─────────────────────────────────────
STORAGE_PROVIDER = os.getenv("STORAGE_PROVIDER", "local").lower()

# ── AWS S3 ───────────────────────────────────────────────────────────────────
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
AWS_BUCKET_NAME = os.getenv("AWS_BUCKET_NAME")

# ── OneDrive ─────────────────────────────────────────────────────────────────
ONEDRIVE_CLIENT_ID = os.getenv("ONEDRIVE_CLIENT_ID")
ONEDRIVE_CLIENT_SECRET = os.getenv("ONEDRIVE_CLIENT_SECRET")
ONEDRIVE_REFRESH_TOKEN = os.getenv("ONEDRIVE_REFRESH_TOKEN")
ONEDRIVE_FOLDER_NAME = os.getenv("ONEDRIVE_FOLDER_NAME", "Hire-AI-Resumes")

# ── Google Drive ─────────────────────────────────────────────────────────────
GDRIVE_FOLDER_ID = os.getenv("GDRIVE_FOLDER_ID")
GDRIVE_SERVICE_ACCOUNT_JSON = os.getenv("GDRIVE_SERVICE_ACCOUNT_JSON")
GDRIVE_CLIENT_ID = os.getenv("GDRIVE_CLIENT_ID")
GDRIVE_CLIENT_SECRET = os.getenv("GDRIVE_CLIENT_SECRET")
GDRIVE_REFRESH_TOKEN = os.getenv("GDRIVE_REFRESH_TOKEN")

# ── PostgreSQL (see app/db/postgres_adapter.py, which monkey-patches
#    sqlite3.connect to route to Postgres when these are configured) ────────
POSTGRES_DATABASE_URL = os.getenv("POSTGRES_DATABASE_URL")
POSTGRES_HOST = os.getenv("POSTGRES_HOST")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
POSTGRES_USER = os.getenv("POSTGRES_USER")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD")
POSTGRES_DB = os.getenv("POSTGRES_DB")
