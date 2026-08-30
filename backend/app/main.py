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
from app.core.config import ENVIRONMENT, SHOW_ERROR_DETAIL  # noqa: E402
from app.services.ai_clients import get_models  # noqa: E402
from app.services.auth import get_user_info, is_admin_or_hr, is_user_approved  # noqa: E402
from app.services.email_worker import poll_emails_and_process  # noqa: E402
from app.services.session_tokens import verify_session_token  # noqa: E402

# Comma-separated list of allowed browser origins for cross-origin requests
# (needed only when the frontend is served from a different origin than the
# API, e.g. the Vite dev server on :5173 talking to the API on :8000).
# `allow_origins=["*"]` combined with `allow_credentials=True` is invalid/
# dangerous - browsers ignore the wildcard once credentials are involved and
# most proxies just reflect the request's Origin back, effectively allowing
# any site to make credentialed calls. Default to the common local dev
# origins so nothing breaks out of the box; production deploys should set
# CORS_ALLOWED_ORIGINS explicitly.
_default_cors_origins = "http://localhost:5173,http://127.0.0.1:5173"
CORS_ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv("CORS_ALLOWED_ORIGINS", _default_cors_origins).split(",") if o.strip()
]

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

if not PG_ACTIVE and ENVIRONMENT in ("production", "prod"):
    # Not a hard failure - a small deployment legitimately running on local
    # SQLite is possible - but this combination (ENVIRONMENT=production with
    # no POSTGRES_DATABASE_URL) is the "looks fine, but is actually writing
    # to ephemeral local storage on every restart/redeploy" trap flagged by
    # the production-readiness review. Loud and visible beats silent.
    logger.warning(
        "Running with ENVIRONMENT=production but POSTGRES_DATABASE_URL is not "
        "set - the app is using local SQLite storage, which does not survive "
        "a redeploy on most hosting platforms. Set POSTGRES_DATABASE_URL if "
        "this is unintentional."
    )


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
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def verify_session_middleware(request: Request, call_next):
    """Derive a trusted `x-user-username` from a signed session token.

    Previously every route (via `dependencies.require_approved_user` and
    ~10 routes that read the header directly) trusted whatever
    `x-user-username` value the client sent, with no verification at all -
    any HTTP client could impersonate any account, including an admin, by
    just setting that header. This middleware is now the ONLY place that
    writes a value into that header: it verifies `x-session-token` (issued
    by /api/auth/login and /api/auth/firebase-sync) and replaces whatever
    the client sent with the verified username, so every existing
    downstream call site is protected without having to touch each one.

    `x-acting-as` implements "admin acting as another user" (previously the
    frontend just lied about `x-user-username` directly for this - see
    AdminPage.jsx's persona switch). It's only honored when the verified,
    signed-in user is actually admin/hr; otherwise it's ignored.
    """
    token = request.headers.get("x-session-token")
    verified_username = verify_session_token(token) if token else None

    effective_username = None
    if verified_username:
        effective_username = verified_username
        acting_as = request.headers.get("x-acting-as")
        if acting_as and is_admin_or_hr(verified_username):
            effective_username = acting_as

    headers = [(k, v) for k, v in request.scope["headers"] if k != b"x-user-username"]
    if effective_username:
        headers.append((b"x-user-username", effective_username.encode()))
    request.scope["headers"] = headers

    return await call_next(request)


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
def serve_file_from_db(filename: str, request: Request, token: str | None = None):
    # Previously had zero permission check - anyone who knew or guessed a
    # filename (e.g. by watching network requests, or the sequential/
    # predictable names the upload flow produces) could pull any candidate's
    # resume directly, bypassing every ownership/role check enforced
    # everywhere else in the app. Require the same verified, approved
    # session every other data-bearing endpoint requires, and layer on the
    # same ownership rule used for candidate records: admin/hr sees
    # everything, everyone else only their own uploads or a job explicitly
    # shared with them.
    #
    # This route is hit directly by the browser (<iframe src>, download
    # links) via app.services... getStaticUrl(), not through the apiClient
    # axios instance - so the `x-session-token` header the auth middleware
    # looks for is never attached, and verify_session_middleware never
    # populates `x-user-username` for these requests. A `?token=` query
    # param carrying the same session token is verified here directly as a
    # fallback, and getStaticUrl() appends it precisely so this endpoint
    # keeps working after the auth requirement was added.
    username = request.headers.get("x-user-username")
    if not username and token:
        username = verify_session_token(token)
    if not username or not is_user_approved(username):
        raise HTTPException(status_code=401, detail="Not authenticated")

    conn = sqlite3.connect(STATS_DB, timeout=30.0)
    cur = conn.cursor()

    cur.execute("PRAGMA table_info(candidate_metadata)")
    existing_cols = {c[1] for c in cur.fetchall()}

    cur.execute("SELECT id, created_by FROM candidate_metadata WHERE filename = ? LIMIT 1", (filename,))
    owner_row = cur.fetchone()
    if not owner_row:
        conn.close()
        raise HTTPException(status_code=404, detail="File not found")
    candidate_id, created_by = owner_row

    user_info = get_user_info(username)
    is_privileged = bool(user_info) and (user_info["is_admin"] == 1 or user_info["role"] == "admin" or is_admin_or_hr(username))
    if not is_privileged and (created_by or "").lower() != username.lower():
        cur.execute(
            """
            SELECT 1 FROM job_candidates jc
            JOIN job_shares js ON js.job_id = jc.job_id
            WHERE jc.candidate_id = ? AND LOWER(js.username) = LOWER(?)
            """,
            (candidate_id, username),
        )
        if not cur.fetchone():
            conn.close()
            raise HTTPException(status_code=403, detail="Forbidden")

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
        from app.services.storage import extract_gdrive_file_id, get_gdrive_file_bytes, get_s3_presigned_url, is_gdrive_url, is_s3_url
        from fastapi.responses import RedirectResponse
        if is_s3_url(file_url):
            signed = get_s3_presigned_url(filename)
            if signed:
                return RedirectResponse(url=signed)
        elif is_gdrive_url(file_url):
            # Drive resumes are no longer shared publicly (see storage.py) -
            # there's no signed-URL equivalent for Drive, so the file is
            # fetched here, authenticated, and streamed straight through
            # instead of redirecting to what used to be a public link.
            drive_id = extract_gdrive_file_id(file_url)
            drive_bytes = get_gdrive_file_bytes(drive_id) if drive_id else None
            if drive_bytes:
                file_bytes = drive_bytes
                file_url = None
        if file_url:
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


@app.exception_handler(Exception)
async def catch_all_unhandled(request: Request, exc: Exception):
    """Last-resort handler for anything a route didn't already turn into an
    HTTPException. Without this, FastAPI's default behavior returns the raw
    exception message (and, depending on server config, a traceback) to the
    client - fine for local debugging, a real information-disclosure risk in
    production (DB error text can reveal schema/column names, file paths,
    library versions). Full detail still goes to the server log either way.
    """
    logger.error("Unhandled exception on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    if SHOW_ERROR_DETAIL:
        raise exc
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
