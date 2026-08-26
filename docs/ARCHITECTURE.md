# Architecture

This document describes how the codebase is actually organized: the backend and frontend module
structure, the environment variables the backend reads, the external integrations it talks to,
and a short list of known issues that were identified during a structural cleanup but are
deliberately out of scope for that cleanup (so they don't get silently lost).

For the product-level pitch, see [BUSINESS_README.md](../BUSINESS_README.md). For the
background-worker/AI-parsing logic walkthrough, see [TECHNICAL_README.md](../TECHNICAL_README.md).

## Backend (`backend/app/`)

The backend used to be a single 6,479-line `main.py`. It is now split by responsibility:

```
app/
  main.py              Thin FastAPI app: env loading, the sqlite3->Postgres monkeypatch
                        (must run before anything touches the DB), CORS, static file
                        serving, router registration, the SPA fallback, and a `lifespan`
                        handler that runs init_db() and starts the two background threads
                        (model warm-up, email polling) at startup.

  core/
    config.py           Single source of truth for every env var the app reads (see
                         "Environment variables" below). Also computes BASE_DIR/DATA_DIR/
                         UPLOAD_DIR/STATS_DB and creates those directories at import time.
    logging.py           get_logger(name) - a standard `logging` setup that replaced the
                          codebase's previous ad hoc print()-based diagnostics.

  db/
    postgres_adapter.py   Monkey-patches `sqlite3.connect` to transparently route to a real
                           PostgreSQL connection when Postgres env vars are configured. This
                           is why the rest of the codebase still says "sqlite3"/"STATS_DB"
                           throughout - historically the app used local SQLite, and the
                           monkeypatch was added later to move to Postgres without rewriting
                           every call site. `patch_if_configured()` from this module MUST run
                           before any `sqlite3.connect(...)` call anywhere in the app.
    session.py             get_db_connection() - a context manager wrapping
                            sqlite3.connect(STATS_DB, timeout=30.0) that guarantees the
                            connection is closed even on exception. Not a connection pool
                            (see "Known issues / deliberately out of scope" below) - just a
                            single choke point that replaced ~98 duplicated open/close blocks
                            and fixed several connection leaks on error paths.
    init_db.py              Schema creation, ALTER TABLE migrations, and seed data. Must be
                             called explicitly (from main.py's lifespan handler) - it is not
                             a module-level side effect anymore.
    row_helpers.py           row_to_dict() / dict_row_factory() - converts a DB row to a
                              plain dict regardless of whether it's a sqlite3.Row or a
                              psycopg2 row.

  services/
    ai_clients.py          get_models() / peek_models() - the process-wide lazy-loaded Groq
                            LLM + optional HuggingFace embeddings client cache, plus
                            _processing_lock (serializes resume/Excel processing to avoid
                            OOM on small hosts and Groq rate limits). Every module that needs
                            an LLM or embeddings client imports from here - there is exactly
                            one cache, not one per module.
    auth.py                 is_user_approved, get_user_role, is_admin_or_hr,
                             get_user_hidden_fields/apply_user_hidden_fields.
    resume_processing.py     Resume text extraction + LLM-based structured extraction
                              (process_resume/process_resume_logic), the resume-formatting
                              prompt/LLM-invoke helpers, PGVector indexing.
    excel_import.py           Bulk candidate import from an uploaded Excel file, including
                               header-detection/column-name mapping and de-dup-by-email/phone
                               matching against existing candidates.
    matching.py                Candidate<->job matching (match_candidate_to_all_jobs,
                                match_candidates_for_job). Takes bare candidate/job IDs and
                                does its own DB lookups rather than accepting pre-loaded
                                objects from a caller, specifically so this module never needs
                                to import from the candidates router/service (avoids a
                                circular import, since candidate routes call into this module
                                as a background task after a candidate is edited).
    email_worker.py             process_single_mailbox (IMAP + Microsoft Graph mailbox
                                 polling, attachment extraction, auto-reply) and
                                 poll_emails_and_process (the polling loop, started from
                                 main.py's lifespan handler).
    storage.py                   External storage upload helpers (S3, OneDrive, Google
                                  Drive) - see STORAGE_PROVIDER below.
    integrations_test.py          Shared IMAP/Microsoft Graph connection-test probes, used by
                                   both the "test connection" and "connection status" admin
                                   routes (previously ~130 lines duplicated between them).
    retry.py                       retry_with_backoff() - consolidates what were ~5
                                    independently-parameterized retry loops around Groq LLM
                                    calls (HTTP 429 handling).
    json_parsing.py                 parse_llm_json() - consolidates what were ~7 duplicated
                                     "strip a ```json fence, slice between the outer brackets"
                                     implementations for parsing LLM responses.

  routers/                One module per feature area, each exposing an APIRouter as
                           `router` that main.py registers via app.include_router(). Pydantic
                           request models live inline in the router file that uses them
                           (e.g. JobCreate in routers/jobs.py) rather than a separate
                           cross-cutting models package.
    health.py                /api/health, /api/activity, /api/team-members
    candidates.py             /api/candidates*, /api/columns*
    upload.py                  /api/upload, /api/jobs/parse-document
    chat.py                     /api/chat
    matching.py                  /api/match-jd, /api/jobs/{id}/match
    jobs.py                       /api/jobs*, /api/jobs/{id}/candidates*, /api/jobs/{id}/share*
    auth.py                        /api/auth/*
    admin.py                        /api/admin/* (the change-request approve/reject dispatcher
                                     is a small action_type -> handler-function registry
                                     rather than a long if/elif chain)
    integrations.py                  /api/integrations*, /api/settings/test-email-template
    reset.py                          /api/reset (see "Fixes applied" below - this route now
                                       requires an authenticated admin/HR caller)

  dependencies.py          FastAPI Depends() helpers: require_approved_user (replaces the
                            "read x-user-username header, check is_user_approved, 403 if not"
                            block that used to be copy-pasted at the top of ~16 routes) and
                            assert_owns_or_admin (the ~15x-duplicated ownership-check block).
```

### Static file serving (a subtlety worth documenting explicitly)

`main.py` registers two things for `/static`:

1. `GET /static/{filename}` - an explicit route that looks the filename up in
   `candidate_metadata` and either redirects to `file_url` (set when a resume was uploaded to
   S3/OneDrive/Google Drive) or streams `file_bytes` from the DB.
2. `app.mount("/static", StaticFiles(directory=UPLOAD_DIR))` - serves whatever's physically on
   local disk.

Registration order matters: (1) is registered first, and Starlette matches an explicit `Route`
before a same-prefix `Mount` with no fallthrough on a non-match, so (1) handles every
single-segment `/static/<filename>` request. This is **not dead code** - it's required for any
deployment where `STORAGE_PROVIDER` isn't `local`, since those resumes have no corresponding
file under `UPLOAD_DIR` at all. Both are preserved, in this order, on purpose.

### Environment variables (`app/core/config.py`)

| Variable | Purpose |
|---|---|
| `GROQ_API_KEY` | Groq LLM API key (resume parsing, matching, chat) |
| `HF_TOKEN` | Optional - HuggingFace Inference API token for embeddings. If unset, embeddings/vector search are disabled (to avoid OOM on small hosts). |
| `STATS_DB_PATH` | Local SQLite file path, used only when Postgres isn't configured, or as the historical name of the "main" DB even when Postgres is active (see `postgres_adapter.py`). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SENDER`, `SMTP_PASSWORD` | Outbound mail (auto-replies, password reset) |
| `IMAP_HOST`, `IMAP_PORT` | Inbound mailbox polling (Gmail/generic IMAP) |
| `POSTGRES_DATABASE_URL` (or `POSTGRES_HOST`/`PORT`/`USER`/`PASSWORD`/`DB`) | Enables the sqlite3->Postgres monkeypatch; also the vector store for pgvector-based matching/chat |
| `STORAGE_PROVIDER` | `local` \| `s3` \| `onedrive` \| `google` - where uploaded resumes are stored |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_BUCKET_NAME` | S3 storage |
| `ONEDRIVE_CLIENT_ID`, `ONEDRIVE_CLIENT_SECRET`, `ONEDRIVE_REFRESH_TOKEN`, `ONEDRIVE_FOLDER_NAME` | OneDrive storage |
| `GDRIVE_SERVICE_ACCOUNT_JSON`, `GDRIVE_CLIENT_ID`, `GDRIVE_CLIENT_SECRET`, `GDRIVE_REFRESH_TOKEN`, `GDRIVE_FOLDER_ID` | Google Drive storage (two auth paths - service account JSON, or OAuth client/refresh-token) |

Most integration credentials (SMTP, Gmail, Microsoft Graph, Google Drive OAuth) can also be set
at runtime via the Admin > Integrations UI, stored in the `integrations_settings` table; the env
vars above are the fallback/seed values used on first run.

### External integrations

Groq (LLM) - PGVector/Postgres (vector search + primary datastore) - Gmail via IMAP/SMTP (app
password, no OAuth) - Microsoft Graph/Outlook (client-credentials OAuth) - Google Drive (service
account or OAuth) - OneDrive (refresh-token OAuth) - AWS S3 - Firebase (client-side auth only;
see "Known issues" below) - PyMuPDF/`python-docx`/`openpyxl` for document parsing/generation.

## Frontend (`frontend/src/`)

Vite + React, no TypeScript, no Tailwind (plain hand-written `index.css` plus inline styles -
see "Fixes applied" below for a stale doc claim this corrects).

```
api/client.js            Single axios instance (apiClient) with baseURL pre-configured from
                          VITE_API_URL, plus getStaticUrl(filename). Also carries a request
                          interceptor that attaches the x-user-username auth header from
                          localStorage['hire_ai_user'] on every request - see "Fixes applied".
utils/formatters.js       formatDate() - was copy-pasted across 3 pages.
hooks/
  useColumnConfig.js       Column width/visibility config, previously duplicated
                            byte-for-byte between JobsPage and UploadPage.
  useDraggableColumns.js    Column drag-to-reorder handlers, same duplication.
  useSessionCache.js         sessionStorage-backed useState, generalizing a pattern
                              reimplemented independently in 3 pages.
components/shared/
  Chip.jsx, ExpandableCell.jsx, CellTextModal.jsx, SkillBadges.jsx, ResumeEditor.jsx
                              Small pieces that were duplicated 2-3x across pages.
  CandidateDetailsModal.jsx    Merges what were 3 separate ~500-670 line implementations
                                (DashboardPage/JobsPage/UploadPage each had their own) into
                                one component with a prop surface covering the union of what
                                each page needs (editable, showExportDocx, showFormattedToggle,
                                onToggleStatus, onDeleteCandidate, etc). The single biggest
                                dedup in the frontend - about 1,600 duplicated lines collapsed
                                into one file.
pages/
  JobsPage.jsx               Orchestrating shell: owns all state/handlers/data-loading,
                              renders the components below plus the shared modals.
  jobs/                       Presentational children (props-driven, no state of their own):
                               JobSidebar, NewJobForm, JobDetailPanel, CandidatesTable,
                               JobsOverview, modals/{AddCandidateModal,EditCandidateModal,
                               EditJobModal,ShareModal}.
  UploadPage.jsx               Same shell pattern.
  upload/                       UploadDropzone, CandidatesTable, FilterModal,
                                 ResumeViewerModal.
  DashboardPage.jsx, ChatPage.jsx, ConnectPage.jsx, TemplatesPage.jsx, AdminPage.jsx,
  LoginPage.jsx                  Unchanged in structure; rewired to apiClient/shared
                                  components where they used to have their own copies.
```

**Design note on the `pages/jobs/` and `pages/upload/` split**: every child component is
presentational only - all `useState` and handler functions stay in the parent shell
(`JobsPage.jsx` / `UploadPage.jsx`) and get passed down as props. This was a deliberate choice
over lifting state into the children or introducing Context/a reducer: given how many sections
of the original pages read and wrote the *same* state (e.g. `selectedJob` affects the detail
panel, the candidates table, and several modals simultaneously), redistributing state ownership
would have been a much higher-risk change than a pure structural extraction. The trade-off is
verbose prop lists on some child components; that was accepted deliberately.

## Fixes applied during this cleanup

These were confirmed-broken code paths or clearly-scoped security fixes, not new behavior or
redesigns - each is called out here because "preserve existing behavior exactly" was otherwise
the rule for this pass:

- **`POST /api/candidates`** used to 500 unconditionally (`cur.pragma("table_info(...)")` isn't
  a real method on a DB cursor). Fixed by removing the dead line; the working
  `cur.execute("PRAGMA table_info(...)")` right after it was already correct.
- **`POST /api/reset`** had no auth check at all - any unauthenticated caller could wipe all
  candidate/change-request/activity-log/processed-email data. Now requires an approved,
  admin/HR-role caller.
- **Excel bulk import**: the "update existing candidate" branch was unreachable (`match_id` was
  hardcoded to `None` and never reassigned before the check), so every imported row always
  inserted a new candidate, never updated one, even though the surrounding code built the data
  needed to match. Fixed by wiring up the match-by-email/phone lookup the code was already set
  up for.
- **`DashboardPage.jsx`**: referenced a bare `API_URL` identifier that was never declared in
  that file - a `ReferenceError` waiting to fire whenever a formatted resume was viewed from
  the candidate modal. Fixed as part of moving every page onto the shared `apiClient` (which
  doesn't need any per-file base-URL constant at all).
- **`DashboardPage.jsx`**: was also missing the `useOutletContext()` call every sibling page
  (JobsPage/UploadPage/ChatPage) uses to read the logged-in `user` from `Layout.jsx`'s
  `<Outlet context={{ user, ... }} />` - so its one `user?.username` reference threw
  `ReferenceError: user is not defined` when deleting a candidate from the Dashboard. Fixed by
  adopting the same pattern the sibling pages already use.
- **`apiClient` auth header**: `App.jsx` sets `axios.defaults.headers.common['x-user-username']`
  on the *global* `axios` object whenever the logged-in user changes. `apiClient`
  (`axios.create(...)`) is a separate instance that snapshots `axios.defaults` only once at
  creation and never observes later mutations to the global instance - so switching every page
  from raw `axios` to `apiClient` would have silently dropped that header on nearly every
  request. Fixed with a request interceptor on `apiClient` that reads the same
  `localStorage['hire_ai_user']` value directly.
- **`AdminPage.jsx`**: `.trim().lower()` (Python syntax, not valid JavaScript - would throw a
  `TypeError` at runtime) fixed to `.trim().toLowerCase()`.
- Removed dead code: `send_otp_email` (zero callers - the actual forgot-password route returns
  the OTP directly instead), `is_similar_name`/`phones_match` helpers (zero callers), unused
  imports, ~15 sites of `role = get_user_role(username)` assigned and never read, the shadowed
  duplicate `GET /static/{filename}`... (see the static-serving note above - that one turned
  out **not** to be dead and was kept), an unused `xlsx` npm dependency (the app actually uses
  `exceljs`), an unused `assets/logo.png`, and a stray committed Vite build artifact.

## Post-cleanup bug fixes and performance work

Two follow-up passes after the structural cleanup above (see git log for full detail on each):

**Bug sweep** - a systematic hunt across the whole codebase (not limited to files the cleanup
itself touched) found and fixed: a `backend/backend/` phantom-directory bug (see the
`STATS_DB_PATH` note below), three DDL/SQL-injection sites where a user-controlled column
name/update-key was interpolated into raw SQL with no whitelist (`DELETE /api/columns/{col_key}`,
`admin._approve_delete_column`, `admin._approve_update_candidate`), Excel-import data corruption
(non-numeric experience values silently zeroed instead of extracted; a duplicate-header collision
that could blank an already-populated field), a manual-candidate-creation route with no numeric
validation (unlike its sibling update route) that fed the bug above, a seeded-settings row that
ignored the `IMAP_PORT`/`SMTP_PORT` env vars, a frontend race condition when switching jobs
quickly, and two double-submission bugs (Add Candidate in both Jobs and Upload). Left flagged
rather than guessed at: `matching.py`'s `is_qualified` flag counts all `job_candidates` rows
regardless of status (confirmed pre-existing, not a regression - its correctness depends on
intended status-vocabulary semantics this pass couldn't determine), and `REQUIRE_REAL_EMAIL` in
`.env.example` is documented but never read anywhere in the app.

**Performance**: the two highest-impact items from an earlier performance investigation were
implemented:

- **DB connection pooling** (`app/db/postgres_adapter.py`). `connect_pg()` used to open a brand
  new TCP+TLS+auth connection to Postgres on every single call - since every one of the ~99
  `get_db_connection()` call sites across the app routes through this function via the
  `sqlite3.connect` monkeypatch, nearly every API request paid a full connection handshake before
  doing any real work. Now backed by a `psycopg2.pool.ThreadedConnectionPool`
  (`POSTGRES_POOL_MIN`/`POSTGRES_POOL_MAX` env vars, default 1/10): `connect_pg()` borrows a
  connection from the pool, and `PGConnection.close()` rolls back any uncommitted work and returns
  it to the pool instead of tearing down the socket. This required no changes anywhere else in the
  app - every existing `get_db_connection()` call site benefits automatically. The pool is closed
  on app shutdown via `closeall_pool()`, called from `main.py`'s `lifespan` handler.
- **`STATS_DB_PATH` CWD bug** (`app/core/config.py`). `backend/.env`'s `STATS_DB_PATH="backend/stats.db"`
  is a repo-root-relative path, but the app always runs with its working directory already inside
  `backend/` (Dockerfile `WORKDIR`, README's `cd backend` step) - so it silently resolved against
  the process's CWD into a bogus nested `backend/backend/stats.db`, creating an empty
  `backend/backend/` directory as a side effect of `os.makedirs`. Now resolved against
  `PROJECT_ROOT` explicitly, independent of the process's working directory. (This is really a
  correctness bug, not a performance one, but it surfaced during the performance-fix work and is
  documented here alongside it.)
- **Frontend polling** (`frontend/src/pages/UploadPage.jsx`). The baseline candidate-list poll ran
  unconditionally every 5 seconds for as long as the Upload page stayed open, hitting
  `/api/candidates` (an unbounded, unpaginated query) and re-serializing the full list to
  `sessionStorage` on every tick regardless of whether anything had changed - the single heaviest,
  most constant load on that endpoint anywhere in the app. Slowed to 20s (the two *conditional*
  polls that actually need fast refresh - "a resume is processing," "a file just finished
  uploading" - are unchanged), and `load()` now skips the state update and `sessionStorage` write
  entirely when the response is byte-identical to what's already loaded.

**Dependency cleanup** (`backend/requirements.txt`) - `torch`, `sentence-transformers`, `langchain`
(the bare umbrella package), and `langchain-huggingface` were listed but never imported anywhere
in the codebase; the embeddings client (`services/ai_clients.py`) uses
`langchain_community.embeddings.HuggingFaceInferenceAPIEmbeddings`, which calls HuggingFace's
hosted Inference API over HTTP rather than loading a model locally, so no local ML runtime is
needed. Removing these four packages, along with the now-pointless
`--extra-index-url https://download.pytorch.org/whl/cpu` line that existed solely to fetch the
CPU-only PyTorch build, cuts the heaviest part of the backend's install/Docker-image size with no
code changes required. The remaining LangChain packages (`langchain-groq` for the `ChatGroq`
wrapper; `langchain-community` for `PGVector` and `Docx2txtLoader`; `langchain-core` for the
prompt/message/parser primitives used in `routers/chat.py`'s RAG chain; `langchain-text-splitters`
for `RecursiveCharacterTextSplitter`) are all genuinely used. Also fixed while auditing this:
`services/storage.py` called `os.getenv(...)` in its OneDrive and Google-Drive-OAuth upload paths
without ever importing `os` - a latent `NameError` that would fire the first time either
integration was used; now imported.

**Follow-up performance work** (same investigation, done in a later pass):

- **DB indexes** (`app/db/init_db.py`). None existed anywhere in the original schema. Added
  expression indexes on `users(LOWER(username))` and `candidate_metadata`/`jobs(LOWER(created_by))`
  (a plain index on the bare column wouldn't be used by the `WHERE LOWER(x) = LOWER(?)` queries
  used everywhere in this codebase - the function wrapper defeats a normal B-tree index), a plain
  index on `candidate_metadata(timestamp)` (every `GET /api/candidates` sorts by it), and one on
  `job_candidates(candidate_id)` (`job_id` is already the leading column of that table's composite
  primary key, so only `candidate_id` needed its own). All `CREATE INDEX IF NOT EXISTS`, so
  idempotent on every restart; verified end-to-end against a real temporary SQLite database.
- **Parallel batch matching** (`app/services/matching.py`). `match_candidates_for_job` evaluated
  candidate batches against a job description one at a time, with a `time.sleep(0.5)` between each
  - a purely sequential loop of independent LLM calls (batch N's prompt/response never depends on
    batch N-1's). Now runs through a `ThreadPoolExecutor(max_workers=3)`, the same pattern
  `routers/matching.py`'s `match_jd` already used for the identical shape of problem; a job with
  e.g. 150 candidates (6 batches) that used to take 6 sequential LLM round-trips plus 3s of pure
  waiting now takes roughly `ceil(6/3)` round-trips.
- **Frontend code-splitting** (`App.jsx`). Every page was a static import, so the whole app shipped
  as one ~2.2MB JS chunk regardless of which route a user opened first. Routes now load via
  `React.lazy()` + `Suspense`, splitting the build into ~20 independently-fetched chunks.

**Pagination and virtualization** (a later pass, after weighing the product tradeoffs with the
user rather than guessing):

- **`GET /api/candidates` pagination** (`app/routers/candidates.py`). Added optional `limit`/
  `offset` query params - omitting them (every caller before this change) preserves the exact
  original behavior of returning every visible candidate as a bare JSON array; passing them
  switches to `{"items": [...], "total": N}`. Purely additive, so nothing that doesn't opt in is
  affected. `frontend/src/pages/UploadPage.jsx` (the heaviest, continuously-polled consumer) now
  uses this: it fetches 200 candidates at a time with a "Load More" control instead of the full
  table on every load/poll. Chosen deliberately over classic numbered pages or a full
  server-side-search rework (both real options, discussed with the user before implementing):
  filters/search now only apply to whatever pages have been loaded so far, which is unchanged
  from the original behavior for the common case (fewer than 200 candidates) and a small,
  intentional UX difference beyond that. `DashboardPage.jsx`/`JobsPage.jsx` do not use pagination
  yet - they weren't the pages hit by continuous polling, so the unbounded-request cost there is
  materially lower.
- **Table virtualization** (`pages/upload/CandidatesTable.jsx`, `pages/jobs/CandidatesTable.jsx`).
  Both tables previously mounted one real `<tr>` per row in `filteredCandidates` regardless of how
  many were actually visible in the scrollable viewport. Both now use `@tanstack/react-virtual`:
  only the rows in or near view are mounted, represented by two spacer `<tr>`s before/after (the
  standard technique for virtualizing a real HTML `<table>`, since a `<tr>` can't be absolutely
  positioned the way a virtualized `<div>` list normally would); `measureElement` re-measures each
  row's actual height rather than trusting a fixed estimate, since a few columns allow text
  wrapping. `pages/jobs/CandidatesTable.jsx` had no internal scroll region at all before this (the
  whole page scrolled with it) - virtualization needs a bounded scrollable element to know what's
  in view, so it now has the same `maxHeight: '70vh'` internal scrollbar Upload's table already
  used, a deliberate, approved UX change made specifically to enable this. Verified with an
  isolated smoke-test harness (a throwaway component swapped into `main.jsx`, not committed)
  against 5,000 synthetic rows in a real browser: confirmed only ~15-25 rows ever mount regardless
  of scroll position, scrolling to an arbitrary offset shows the correct data at that position (no
  index drift/duplication), and variable-height rows are measured and laid out correctly.

## Bug fixes (dependency/config audit)

- **Postgres was silently made mandatory.** `postgres_adapter.py`'s `patch_if_configured()` used
  to `raise RuntimeError` (which `main.py` turns into `sys.exit(1)` at import time) whenever
  Postgres env vars weren't set, even though every doc here describes Postgres as optional and
  SQLite as the local fallback. Git history shows the very first Postgres-support commit was
  genuinely optional (`if IS_PG_CONFIGURED: patch; else: no-op`); a later, unrelated commit
  ("Configure Google Drive sync integration, setup guide and postgres support") changed the
  docstring to "enforce PostgreSQL" and added the hard failure, with no comment explaining a
  deliberate policy change - and the project's own maintained `backend/.env` still comments
  Postgres as `"(Optional - takes precedence if set)"`. Restored: `patch_if_configured()` now
  returns `False` and leaves `sqlite3.connect` untouched when Postgres isn't configured, so the
  app runs on local SQLite as originally intended. It still raises loudly when Postgres *was*
  configured but can't actually be used (missing `psycopg2`, unreachable server) - that's a real
  misconfiguration worth failing on, unlike "not configured at all."
- **`backend/.env.example` set `STORAGE_PROVIDER=google`** (requiring live Google Drive
  credentials) instead of `local`, and combined with the bug above meant the README's own Quick
  Start (`cp .env.example .env`, fill in only `GROQ_API_KEY`, run `uvicorn`) could not actually
  boot on a fresh clone. Changed the example default to `local`, which needs zero external
  credentials - `is_external_storage_enabled()` already correctly falls back to local disk when
  no DB-stored integration settings override it.

## Authentication rework (signed session tokens)

Previously every route trusted a client-supplied `x-user-username` header as-is, via
`dependencies.require_approved_user` and ~10 routes that read the header directly - any HTTP
client could set that header to any username, including an admin's, with zero verification.
Fixed with a stdlib-only signed-token scheme (no new dependencies):

- `app/services/passwords.py` - PBKDF2-HMAC-SHA256 password hashing with a per-user salt,
  replacing the previous unsalted SHA-256. `verify_password` still recognizes the old bare-hex
  format, so `login()` transparently upgrades a user's hash to the new format the next time they
  log in successfully - no migration script, no forced password reset.
- `app/services/session_tokens.py` - `create_session_token`/`verify_session_token`, an HMAC-SHA256
  signed, stateless token (7-day expiry). `SESSION_SECRET` should be set in production; if unset,
  a random per-process secret is generated (logged as a warning) and all sessions are invalidated
  on the next restart - consistent with this app's "boots with a blank `.env`" local-dev posture.
- `main.py`'s `verify_session_middleware` is now the *only* place that writes `x-user-username`:
  it verifies `x-session-token` and derives the trusted username from it, overwriting whatever the
  client sent. Every existing router/dependency that reads that header is protected without being
  touched individually. `x-acting-as` (the "admin acting as another user" persona feature -
  previously implemented by the frontend just lying about `x-user-username` directly) is only
  honored when the verified, signed-in user is actually admin/hr.
- `login`/`firebase-sync` now return a `token` field; the frontend (`App.jsx`, `api/client.js`)
  sends it back as `x-session-token` (and `x-acting-as` for an active persona) instead of a plain
  username header.

Not addressed by this change (separate, larger scope): Firebase login still has no server-side
token verification (see Known Issues below) - this rework protects every request *after* login,
not the Firebase login step itself.

## Known issues / deliberately out of scope

Flagged here rather than fixed, either because they're a different kind of task (performance,
not structure) or because they need a product/security decision this cleanup pass wasn't
positioned to make:

- **`backend/Client_secret.json`** (gitignored, present locally) contains real Google OAuth
  `client_id`/`client_secret` credentials but is not read by any code path - the actual runtime
  Google Drive auth path is `GDRIVE_SERVICE_ACCOUNT_JSON` or the OAuth env vars above. Appears
  to be a manual reference artifact. Left in place; not deleted, since it holds live secrets and
  that decision belongs to whoever manages those credentials.
- **Firebase auth**: `POST /api/auth/firebase-sync` trusts the client-submitted sync payload
  as-is - there's no Firebase Admin SDK server-side verification of the token. Worth a security
  review, not addressed here.
- **No frontend code-splitting.** `App.jsx` statically imports every page; the production build
  emits one ~2.2 MB JS chunk. Vite's build warns about this. Addressing it (route-based
  `React.lazy`) is a performance task, not a structure one.
- **No automated test suite** exists for either the backend or frontend. This cleanup was
  verified via: a static AST-based cross-module import checker (backend), a route-coverage diff
  against the original `main.py` (backend), and real `npm run build` runs after every frontend
  phase (frontend) - not via functional/unit tests, because none exist to run. A manual
  click-through smoke test (login, upload, jobs, matching, admin) against a real backend with
  real credentials is recommended before trusting this in production.
