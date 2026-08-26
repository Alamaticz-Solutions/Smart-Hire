"""Hire AI FastAPI application entrypoint.

This used to be a 6,479-line monolith holding every route, DB migration,
and integration in one file. It has been split into:

  - app/core/     - config (env vars) and logging setup
  - app/db/       - schema/migrations (init_db), the sqlite3->Postgres
                    monkeypatch adapter (postgres_adapter), and small row
                    helpers
  - app/services/ - business logic (resume processing, Excel import,
                    candidate<->job matching, email polling, external
                    storage, AI client lifecycle, retry/JSON-parsing
                    helpers)
  - app/routers/  - one module per feature area, each exposing a `router`
                    (APIRouter) that this file registers with `app`
  - app/dependencies.py - shared FastAPI Depends() for auth/ownership checks

This file itself now does only three things: required import-time setup
(env loading, the Postgres monkeypatch), FastAPI app/middleware/router
wiring, and startup-time initialization via `lifespan`. See
docs/ARCHITECTURE.md for the full module map and rationale.
"""

import os
import mimetypes
import sqlite3
import threading
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

# ── Env loading ──────────────────────────────────────────────────────────
# Load root .env first, then backend/.env to override/supplement it. This
# must happen before `app.core.config` (or anything else) reads os.getenv(),
# so it runs here, first, exactly as the original main.py did.
load_dotenv()
_backend_env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
if os.path.exists(_backend_env_path):
    load_dotenv(_backend_env_path, override=True)

from app.core.config import PROJECT_ROOT, STATS_DB, UPLOAD_DIR  # noqa: E402
from app.core.logging import get_logger  # noqa: E402
from app.db.init_db import init_db  # noqa: E402
from app.db.postgres_adapter import closeall_pool, patch_if_configured  # noqa: E402
from app.services.ai_clients import get_models  # noqa: E402
from app.services.email_worker import poll_emails_and_process  # noqa: E402

logger = get_logger(__name__)

# `patch_if_configured()` monkey-patches `sqlite3.connect` to transparently
# route every `sqlite3.connect(...)` call in the app (there are dozens,
# spread across app/routers/ and app/services/) to a real PostgreSQL
# connection instead. It MUST run before any code anywhere calls
# `sqlite3.connect` - including `init_db()` below, and including any router
# module that might do DB work as an import-time side effect. Doing this
# here, at main.py import time, before any router is imported, preserves
# that ordering guarantee exactly as the original monolith had it.
try:
    PG_ACTIVE = patch_if_configured()
except Exception as e:
    logger.critical(f"CRITICAL CONFIGURATION ERROR: {e}")
    import sys
    sys.exit(1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup-time initialization, run once when the app starts serving.

    Order matters: `init_db()` is the first real DB write and must run
    after `patch_if_configured()` above (already satisfied, since that runs
    at module import time, before `lifespan` ever executes). The original
    main.py ran `init_db()` as a bare module-level statement and started
    these two background threads from an `@app.on_event("startup")` hook;
    both are consolidated here into one explicit, ordered lifespan handler.
    """
    init_db()
    threading.Thread(target=get_models, daemon=True).start()
    threading.Thread(target=poll_emails_and_process, daemon=True).start()
    yield
    # Shutdown: release pooled Postgres connections so a reload/restart
    # doesn't leak sockets on the database server.
    closeall_pool()


app = FastAPI(title="Hire AI API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Static file serving ─────────────────────────────────────────────────
# There are two mechanisms here, and their REGISTRATION ORDER is load-bearing:
#
#   1. `GET /static/{filename}` (an explicit route, registered first) looks
#      the filename up in `candidate_metadata` and either redirects to its
#      `file_url` (set when a resume was uploaded to S3/OneDrive/Google
#      Drive - see app.services.storage) or streams `file_bytes` straight
#      from the DB.
#   2. `app.mount("/static", StaticFiles(directory=UPLOAD_DIR))` (registered
#      second) serves whatever's physically present on local disk under
#      UPLOAD_DIR.
#
# Starlette matches routes in registration order and does not fall through
# from a matched Route to a later Mount, so (1) handles every single-segment
# `/static/<filename>` request; (2) only ever gets used for extra path
# segments a plain `{filename}` route param can't capture. This means (1) is
# NOT dead code (an earlier read of this file mistakenly assumed the mount
# shadowed it, backwards) - it is required for any deployment where
# STORAGE_PROVIDER is s3/onedrive/gdrive rather than local, since those
# resumes have no corresponding file under UPLOAD_DIR at all. Both mechanisms
# are preserved here, in their original order, unchanged.
@app.get("/static/{filename}")
def serve_file_from_db(filename: str):
    conn = sqlite3.connect(STATS_DB, timeout=30.0)
    cur = conn.cursor()

    cur.execute("PRAGMA table_info(candidate_metadata)")
    existing_cols = {c[1] for c in cur.fetchall()}

    if "file_url" in existing_cols:
        cur.execute("SELECT file_url, file_bytes FROM candidate_metadata WHERE filename = ? LIMIT 1", (filename,))
        row = cur.fetchone()
        file_url = row[0] if row else None
        file_bytes = row[1] if row else None
    else:
        cur.execute("SELECT file_bytes FROM candidate_metadata WHERE filename = ? AND file_bytes IS NOT NULL LIMIT 1", (filename,))
        row = cur.fetchone()
        file_url = None
        file_bytes = row[0] if row else None

    conn.close()

    if file_url:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=file_url)

    if not file_bytes:
        raise HTTPException(status_code=404, detail="File not found")

    if isinstance(file_bytes, memoryview):
        file_bytes = file_bytes.tobytes()

    mime_type, _ = mimetypes.guess_type(filename)
    if not mime_type:
        mime_type = "application/octet-stream"

    return Response(
        content=file_bytes,
        media_type=mime_type,
        headers={"Content-Disposition": f"inline; filename={filename}"},
    )


app.mount("/static", StaticFiles(directory=UPLOAD_DIR), name="static")


# ── Routers ──────────────────────────────────────────────────────────────
from app.routers import (  # noqa: E402
    admin,
    auth,
    candidates,
    chat,
    health,
    integrations,
    jobs,
    matching,
    reset,
    upload,
)

for _router_module in (health, candidates, upload, chat, matching, jobs, auth, admin, integrations, reset):
    app.include_router(_router_module.router)


# ── Serve React frontend (production build) ─────────────────────────────
FRONTEND_DIST = os.path.join(PROJECT_ROOT, "frontend", "dist")
if os.path.exists(FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")


@app.exception_handler(StarletteHTTPException)
async def catch_all_spa_routes(request: Request, exc: StarletteHTTPException):
    """Serve the SPA's index.html for any non-API 404 so client-side routing works."""
    if exc.status_code == 404 and not request.url.path.startswith("/api/"):
        index_file = os.path.join(FRONTEND_DIST, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
