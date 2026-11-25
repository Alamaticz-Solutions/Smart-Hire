# Hire AI — Handoff (read this first)

Written 2026-11-25 so work can continue in another Claude account. It covers what the project is, everything that was
done, what is on the site, how to run it, the state of the real data, and what to do next.

> **Most important facts**
> 1. **Groq daily token limit is 200,000 tokens/day** (plus 8,000/minute and 1,000 requests/day) on `openai/gpt-oss-120b`.
>    One resume parse ≈ 5,000 tokens, so the free plan parses only **~40 resumes a day**. This is the real bottleneck and
>    the reason 675 imports are still failed. Fix = rules-first parsing (see §9) and/or a paid Groq plan.
> 2. **Auto-reply is OFF** and nothing has ever been sent by this work. 385 replies are queued (`pending`), none sent.
> 3. **Never start the real backend with the mailbox poller on by accident.** Use `EMAIL_WORKER_ENABLED=false` (see §3).
> 4. **Nothing is committed.** Branch `restructure-onto-main`, ~67 changed/new files. Commit only when the owner asks.
> 5. A backup of the real data is in `logs/backups/backup_20261125_104135.json` (taken before the migrations/backfills).

---

## 1. What the project is

**Hire AI** (Alamaticz Solutions): a recruitment tool. It pulls candidate resumes from a mailbox (Outlook
`careers@alamaticz.com`) and from uploads / Excel sheets, extracts structured data with an LLM, stores candidates,
matches them to jobs, exports formatted resumes, and can reply to candidates.

- **Backend:** FastAPI 0.142, SQLAlchemy 2.1 (ORM models + repositories), pydantic-settings, Postgres (psycopg2, pgvector)
  in real use, SQLite for tests. Python 3.12 venv in `backend/.venv`.
- **Frontend:** React + Vite (JS, no TypeScript), axios client, recharts, lucide icons. Dev server on 5174.
- **AI:** Groq (`openai/gpt-oss-120b` via langchain) for extraction, formatting, chat, matching, answers.
  Embeddings: `EMBEDDINGS_PROVIDER=auto|api|local|off` (hosted HF returns 402 → local sentence-transformers fallback; off in tests).
- **Mail:** Microsoft Graph (app-only client credentials) for Outlook; IMAP/SMTP also supported (a legacy Gmail IMAP
  mailbox `alamaticzsolutions@gmail.com` is enabled in the real DB — see §3 warning).
- **Auth:** signed session tokens (`x-session-token`, 7-day TTL), PBKDF2 passwords, Firebase sign-in (server now verifies
  the Firebase ID token), OTP password reset, rate limiting.
- **Response format:** every API returns an envelope `{success, message, data, meta, error, request_id}` (`EnvelopeRoute`);
  errors also keep `detail`. A frontend axios interceptor unwraps it.
- **Repo:** `C:\Users\MithunKumarNarayanan\OneDrive - Alamaticz Solutions\Desktop\Projects\Hire-AI` (Windows 11; use Git Bash
  or PowerShell). Teammate repo origin: Alamaticz-Solutions/Smart-Hire.

## 2. Environment, credentials, constraints

- Secrets live in `backend/.env` (gitignored). **Never print or commit secret values.** Variable names are in
  `backend/.env.example`. In `.env` there are: Groq key, HF token, Postgres URL (+ discrete vars), Google Drive OAuth,
  SMTP sender/app-password (alamaticzsolutions@gmail.com), `SESSION_SECRET`, `SECRETS_KEY`, etc. Microsoft/Outlook
  credentials (tenant, client id, client secret, mailbox) are stored **in the database** (Integrations page), not `.env`.
- **`SECRETS_KEY`** (Fernet) encrypts mailbox/Microsoft/Drive secrets in the DB. It was generated into the local `.env`.
  **Keep a copy; without it the stored secrets are unreadable; set the same value on every deployment that uses this DB.**
  The first start of the app/scripts against the real DB encrypts the existing plain-text secrets.
- **Groq key was rotated** during the work (old one returned 401). The current one works but is capped (see top).
- **Real database:** Postgres on the remote Postgres server (host in `backend/.env`), database `hire_ai` (user `postgres`). **Hard rule from the owner:
  never touch any other database on that server.** Tests must never use it (the test `conftest` aborts if Postgres is
  configured).
- Microsoft Graph app permissions currently granted (verified from the token): `Mail.Read`, `Mail.ReadWrite`, `Mail.Send`,
  `IdentityRiskyUser.Read.All`. Tenant ID is the org directory id ((see the Integrations page)), **not** `common`.
- Login for local use: `admin` / `admin` (seeded dev default; other seeded users `user, boopathi, praveen, harish, sabari`
  use their username as password in development). **Change before deploying** (`python -m scripts.set_password <user>`).
- Owner preferences to keep: mailbox is **pull-only**; auto-reply OFF by default and controllable from the UI; reply at most
  once; never commit unless asked; the app on the owner's machine runs at localhost:5174 (frontend) / 8010 (backend) —
  ports 8000 (MPTS Tax Collector) and 5173 (IdentifAI) belong to *other* projects.

## 3. How to run

```bash
# backend (from backend/)  — poller OFF (safe against the real DB)
EMAIL_WORKER_ENABLED=false ./.venv/Scripts/python -m uvicorn app.main:app --port 8010
# frontend (from frontend/)
npm run dev -- --port 5174 --strictPort        # frontend/.env has VITE_API_URL=http://localhost:8010
# tests (from backend/)  — uses a throw-away SQLite, 124 tests, ~7 minutes
./.venv/Scripts/python -m pytest tests -q
# frontend build check
cd frontend && npm run build
```
- Start-up takes ~1 minute against the remote DB (schema check). `init_db()` runs on every start: creates missing tables,
  adds missing columns (no migrations tool), seeds users/team/keywords, backfills `origin`/`record_state`, and encrypts secrets.
- **WARNING:** starting the backend *without* `EMAIL_WORKER_ENABLED=false` starts the poller. With the real DB it will pull
  mail, call Groq, and the legacy Gmail IMAP path marks messages as Seen. Outlook polling reads only (GET) and never
  sends unless auto-reply is ON.
- If the dashboard looks empty: the browser holds a login from a different server session. The app now signs out
  automatically on a 401; otherwise sign out and in.
- Deployment files: `render.yaml` (web + separate `hire-ai-mail-worker` service), `netlify.toml`,
  `frontend/public/_redirects`, `Dockerfile`, `.github/workflows/ci.yml`. The standalone poller is `python -m app.worker`
  (set `EMAIL_WORKER_ENABLED=false` on the web service).
- Isolated demo/test servers used during testing ran the real app on a throw-away SQLite file via helper scripts that
  neutralise `dotenv` (the app calls `load_dotenv(override=True)`, which otherwise points it at the real DB). If you need an
  isolated run: set the POSTGRES_* vars to empty, `STATS_DB_PATH` to a temp file, replace `dotenv.load_dotenv`, then import the app.

## 4. State of the real database (as of this handoff)

| Item | Value |
| --- | --- |
| Candidates | 928 total: ~253 usable (mail 185, Excel 59, resume 9, manual 0) + ~675 failed mail imports |
| Failed imports | ~675 `record_state=failed`, all `RateLimitError 429` (Groq). Resume files are stored (`file_bytes`) so they are recoverable. A few of the 681 originals were recovered (≈6) |
| Mail log (`mail_messages`) | ~1,479 rows = the whole Inbox (backfilled read-only from Outlook). Outcomes at backfill: imported 174, failed 678, no_resume 580, skipped_automated 46, not_pulled 2 |
| `processed_emails` | ~2,258 (includes the legacy Gmail mailbox) |
| `mail_replies` | 385 `pending` acknowledgements for 171 people; **none sent**. 157 of those people were already emailed from this mailbox in Aug 2026 by the old system |
| Integration settings | `outlook_enabled=1`, `email_enabled=1` (legacy Gmail IMAP), `auto_reply_enabled=0`, import window empty, `reply_max_age_days=7`, `skip_if_emailed_days` default 180, `ai_answers_mode` default `draft`, `company_faq` empty |
| Jobs | 1 job ("pega"); 27 job_candidates |
| Review state | `scripts.recompute_states` ran: 230 active, 17 review, 681→(675) failed |
| Background recovery | **Stopped** after repeated rate limits (Groq daily token cap). Re-run when quota is available (§9) |

Mailbox facts (read via Graph): Inbox 1,480 messages; Sent Items 1,565 (2024-11 → 2026-10, the old system's replies, many with
`(Ref: CAND-n)` subjects); Deleted Items 62; Archive 1; Drafts 5. **Sent Items was never read before this work except by the
new `sent_index` service.**

## 5. Everything that was done (by theme)

### 5.1 Setup, cleanup, data
- Pulled the teammate repo; cleaned the folder structure; wrote `.env` from the pasted credentials (Groq, HF, Postgres,
  Google Drive OAuth, SMTP app password). Created a **separate Postgres DB `hire_ai`** (no other DB touched).
- Restored the old data from a Neon database the teammate had (copied into `hire_ai`; test rows cleared first).
- Adopted the teammate's `cleanup/backend-frontend-restructure` branch (ORM, envelope, auth hardening) instead of the earlier
  from-scratch rewrite, then fixed what was missing (see tests).

### 5.2 Mail pulling (Outlook) — safety first
- Mailbox poller is **pull-only**; auto-reply switch lives in the DB (`integrations_settings.auto_reply_enabled`, default OFF),
  not an env flag. Saving settings can never trigger replies.
- Import controls on the Integrations page: **date window** (from/to, by received date; Graph `$filter` server-side, IMAP
  checks the Date header), **skip automated senders** (noreply/invoice/billing/newsletter/bounces), tenant validation.
- **Reply-once design:** replies are *queued* (`mail_replies`, unique per message) when mail is imported; they are sent only
  when auto-reply is ON (or a human clicks Send); never twice (`already_replied`), commit after each send; max 3 attempts;
  age limit `reply_max_age_days` (default 7, 0 = no limit); skips candidates in Error state.
- **Hardened Graph client** (`services/graph_client.py`): timeouts on every call, token cache, 401 refresh, retry on
  429/5xx honouring `Retry-After`, all failures logged and surfaced as poller health (`worker_heartbeat`, `worker_last_error`).
- **Pacing** (because of Groq limits): per cycle max 40 new messages / 15 resumes; on an AI rate limit the placeholder is
  removed, the mail is **released** (un-marked) for retry and imports pause 15 min (`MAIL_MAX_NEW_PER_CYCLE`,
  `MAIL_MAX_RESUMES_PER_CYCLE`, `MAIL_RATE_LIMIT_COOLDOWN_MINUTES`).
- Real **received time** (Graph `receivedDateTime`) stored per candidate (`mail_received_at`) and per mail.
- Non-resume attachments (invoice, visa, receipt…) are rejected by `looks_like_resume` (file name + content heuristics).
  `.doc`/`.xls` can't be parsed → logged ("legacy_file"), not silently dropped.

### 5.3 Data model additions
- `candidate_metadata`: `mail_received_at`, `origin` (mail/excel/resume/manual), `record_state` (active/review/failed),
  `import_batch_id`, `source_msg_uid`.
- New tables: `mail_messages` (mail log), `import_batches`, `import_items`; `mail_replies` gained `kind`, `inbound_text`,
  `question`, `ai_reply`, `edited_by`, `sent_by`; `integrations_settings` gained `worker_heartbeat`, `worker_last_error`,
  `reply_max_age_days`, `ai_answers_mode`, `company_faq`, `skip_if_emailed_days`, `auto_reply_enabled`, import-window fields.
- `users.firebase_uid`. `EncryptedText` column type for secrets (`core/secrets.py`).
- Profile completeness (`services/completeness.py`): 8 core fields; `<60%` ⇒ `review`.

### 5.4 Screens (what is on the site)
Sidebar (admin/HR see all): Dashboard, Jobs, Candidates, Mail Inbox, Excel Imports, Conversations, Assistant, Integrations,
Email Templates, Administration.

| Page (route) | What it does |
| --- | --- |
| **Dashboard** `/` | KPI cards, candidates by source, needs-attention counts, latest-mail table, pipeline chart, recent activity |
| **Candidates** `/upload` | Upload resumes / XLSX / CSV; table with columns incl. **Origin, Mail Received, Profile %**; **filter buttons** All / Emails / Excel / Resumes / Manual / Needs review / Failed (server-side, with counts; `?view=` preselects); add candidate, filters, column manager, Excel export, retry failed, edit cells |
| **Mail Inbox** `/mail` | Every mailbox message: received date, sender, subject, attachments, **outcome** (imported / follow-up / failed / will retry / skipped / no resume / legacy / not pulled) + reason, linked candidate, reply status; filters, search, date range, Excel export, **Retry** (re-queues for import); poller health banner |
| **Excel Imports** `/imports` | One row per uploaded sheet: counts (imported/updated/skipped/errors), notes (ignored columns), per-row results, report download, **Undo** (removes only created rows) |
| **Conversations** `/conversations` | What people asked (`They asked`), the AI draft or template (`We reply`), status; edit, **Approve**, **Send now**, Don't reply; **"Send the waiting replies up to a date"** with preview → confirm; filters by status/kind |
| **Jobs** `/jobs` | Create/edit jobs (JD upload parse), match candidates (LLM), shortlist/status, share with external users, candidate details modal, formatted resume (3 templates) with **Regenerate** |
| **Assistant** `/chat` | Natural-language candidate queries → tables (CSV export) |
| **Integrations** `/connect` | Gmail/Outlook/custom mailboxes (secrets masked), keywords, **import window**, **auto-reply switch (confirm dialog)**, reply age limit, **AI answers mode + company facts + "already emailed" days**, reply counts, failed-reply list + Excel, Drive OAuth, Test Connection |
| **Email Templates** `/templates` | Reply themes/templates, default resume template, Send Test |
| **Administration** `/admin` | Pending approvals, users/permissions, team members (persona switch), masked keywords |

### 5.5 API surface (all enveloped; staff = admin or HR)
Auth: `/api/auth/login|register*|status|check-exists|get-email|forgot-password/*|firebase-sync` (`*` closed in production
unless `ALLOW_LOCAL_REGISTRATION`). Candidates: `/api/candidates` (`?origin=&state=&limit=&offset=`), `/summary`,
`/{id}` PUT/DELETE, `/{id}/retry`, `/{id}/re-extract`, `/populate-missing`, `/bulk-delete`, `/{id}/formatted-resume`
(GET `?refresh=true`, PUT), `/{id}/export-docx`, `/{id}/jobs`, `/api/columns`. Jobs/matching: `/api/jobs*`, `/api/match-jd`.
Upload: `/api/upload`, `/api/jobs/parse-document`. Mail: `/api/mail/messages` (+`/retry`, `/export.xlsx`), `/api/mail/summary`.
Imports: `/api/imports`, `/{id}/items`, `/{id}/report.xlsx`, `/{id}/undo`. Conversations: `/api/conversations`
(+`/summary`, `/{id}` PUT, `/{id}/approve|dismiss|send`, `/send-batch`). Integrations: `/api/integrations`
(+`/status`, `/test`, `/replies`, `/replies/failed.xlsx`, `/gdrive/exchange`), `/api/settings/test-email-template`.
Admin/Chat/Health/Activity/Team: unchanged names. `/api/reset` closed in production unless `ALLOW_DATA_RESET`.
All 74 frontend calls were verified to match a backend route.

### 5.6 Extraction, templates, Q&A
- **Extraction fixes:** text window 7,000 → 14,000 chars; `normalize_extracted` (phone, e-mail, numbers, notice period,
  JSON-list skills, city codes like `hyd`→Hyderabad); `looks_like_resume` gate; the follow-up-email path previously
  swallowed an LLM failure and left candidates half-filled (root cause of many empty skills) — now logged and repairable.
  **`populate_missing_fields`** re-reads the stored document and fills **only empty fields** (never overwrites). Verified on real
  resumes (fills skills/certs/location/org; rejects invoices).
- **Templates:** removed the invented fallback (Java/SQL/Git/"Pega Developer"); `build_data_sheet` ("Not provided") when there is
  no document or the AI fails; formatted resume rebuilt when candidate data changes (`_source_hash`), hand edits kept
  (`_edited`), **Regenerate** button; "limited" notice in the UI.
- **Q&A / conversations (`services/answers.py`, `routers/conversations.py`):** if a mail contains a question (cheap keyword
  gate, then one LLM call) the AI drafts an answer **only from `company_faq`**, never promising offers/salary/dates; unsure ⇒
  "team will get back to you". Modes: `off` / `draft` (default; a person approves) / `auto` (confident answers queue and go
  out when auto-reply is ON). Missing profile details are appended as a polite ask. **FAQ box is empty — HR must fill it.**
- **Sent Items safety (`services/sent_index.py`):** before sending a standard *acknowledgement*, Sent Items (cached index) is
  checked; anyone emailed within `skip_if_emailed_days` (default 180) is skipped. Direct answers to a question are exempt.
  If Sent Items cannot be read, nothing is sent. Real preview result: of the first 300 waiting replies only **13** would be sent.

### 5.7 Security fixes
Firebase account takeover (any username → token) fixed with server-side ID-token verification + uid binding; secrets encrypted
at rest; tenant `common` rejected; `register`/`reset` closed in production; security headers; seeded users no longer reset on
every start; start-up no longer fails in-flight resumes; registration needs ≥8 chars + valid e-mail; login rate limit; stale
login auto-signs-out. Open: `get-email` still returns the email for any username (rate-limited), seeded passwords, session token
in `localStorage`.

### 5.8 Other bug fixes (from the full test pass)
Mail Received field caused 500 on manual add; chat table Name/Organization blank (key mismatch); CSV upload silently failed
(openpyxl can't read CSV); `.doc/.xls` accepted then failed; empty uploads; job with empty title; permissions on missing user →
404; AI failure wiped job matches; Excel duplicate rows overwrote data with blanks (and rows/columns were not reported);
Firebase registration lost the new account (rollback before the 403); phone top bar overflow; candidates table spilling out of its
card; approval request stayed pending after approving in Permissions; share-job reports unknown users; formatted-resume must be an object.

## 6. Code map

```
backend/app/
  main.py            app, middleware (request-id, security headers, session), router registration, lifespan (poller thread unless EMAIL_WORKER_ENABLED=false)
  worker.py          stand-alone poller entrypoint
  core/              config.py (env flags), responses.py (envelope), secrets.py (EncryptedText), logging.py
  db/                engine.py (get_session/session_scope), init_db.py (create_all, add columns, indexes, seeds, backfills, encrypt secrets)
  models/            candidate.py job.py user.py system.py (settings, replies, logs) imports.py (mail_messages, import_batches/items)
  repositories/      candidate_repository (reflected table for custom columns, filters/summary), system_repositories (MailReply/MailMessage/ImportBatch/...), job, user
  routers/           admin auth candidates chat conversations health inbox integrations jobs matching reset upload
  services/          email_worker.py (poll loop, process_single_mailbox, send_pending_replies, build/deliver_reply)  graph_client.py
                     sent_index.py answers.py completeness.py mail_filters.py resume_processing.py excel_import.py matching.py
                     ai_clients.py retry.py json_parsing.py storage.py vector_store.py auth.py passwords.py session_tokens.py rate_limit.py
  scripts/           see §7
  tests/             conftest.py (FakeChat LLM, throw-away SQLite) test_api test_data_layer test_envelope test_mail_worker
                     test_regressions test_inbox test_extraction test_conversations   (124 tests)
frontend/src/        App.jsx (routes), api/client.js+envelope.js, components/(Layout, DashboardInsights, shared/*), pages/*, utils/
docs/                ARCHITECTURE.md  AUDIT_AND_PLAN.md  TEST_REPORT.md      (+ this file at repo root)
```
`process_single_mailbox` (≈650 lines) is the god function in `email_worker.py`; splitting it (fetch → parse → import → reply) is a known refactor.

## 7. Scripts (`cd backend`, run with `./.venv/Scripts/python -m scripts.<name>`)

| Script | Purpose |
| --- | --- |
| `backup_data` | JSON snapshot of candidates (no files), processed mail, replies, jobs → `logs/backups/` |
| `backfill_mail_data` | Read-only Outlook listing → fills `mail_messages` + `mail_received_at`/`source_msg_uid` on candidates (already run once) |
| `recompute_states` | Score profiles → `record_state` (already run once) |
| `retry_failed_imports` | Re-parse failed (429) candidates from stored files. `--dry-run`, `--limit N`, `--delay S`, `--patient` (waits on rate limits, up to 5 in a row). Updates the mail log |
| `populate_fields` | Re-read stored resumes and fill **empty** fields only. `--dry-run`, `--limit`, `--delay`; stops at first rate limit |
| `mailbox_check` | Read-only IMAP/Graph lister |
| `set_password` | Reset a user's password |
| `generate_secrets_key` | Print a new `SECRETS_KEY` |

## 8. Testing history and numbers
- 124 backend tests pass (SQLite, fake LLM, no network). Frontend has **no tests and no linter**; `npm run build` passes.
- Black-box API sweep (~100 checks) and a page-by-page browser walkthrough were done on an isolated SQLite instance; findings are in
  `docs/TEST_REPORT.md`; the audit/plan is in `docs/AUDIT_AND_PLAN.md` (partly superseded by this file).
- Live verification done: Graph token + inbox read (1,480), dry-run import into a temp DB (2 resumes parsed, automated senders
  skipped, replies queued not sent), extraction on real resumes with the live AI, Sent Items index (715 recipients), batch preview.
- Not verified live: AI question answering with the real mailbox; actually sending any reply; Render/Netlify deploy.

## 9. What to do next (priority order)

1. **Fix the AI bottleneck (biggest value).** Build **rules-first parsing**: regex/keyword extraction for email, phone, LinkedIn,
   notice period, CTC, Pega certifications (CSA/CSSA/CPDC/CLSA…), skills (keyword list), city; call the LLM only for gaps
   (name/employer/years/summary) with a short prompt. Candidates must be created from the rules result even when the AI is
   rate-limited. Cuts tokens ~60–80%. In parallel consider a paid Groq plan (lifts 200k/day).
2. **Recover the 675 failed imports** once quota allows: `python -m scripts.retry_failed_imports --limit 30 --delay 30 --patient`
   (≈40 resumes/day on the free tier). Then `populate_fields` for the ~157 candidates with gaps.
3. **Fill the Company Facts (FAQ)** on the Integrations page so AI answers are useful; keep mode `draft`.
4. **Decide about replies:** use Conversations → "Send the waiting replies up to a date" (preview first; only 13 would go with the
   180-day check). Keep auto-reply OFF until HR is happy; turning it ON also needs a decision on the age limit.
5. Change seeded passwords; set `SESSION_SECRET`/`SECRETS_KEY` on every deployment; deploy with the separate worker service.
6. Smaller items: OCR for scanned PDFs (2 known; needs Tesseract), `get-email` disclosure, `.doc` attachments, frontend lint/tests,
   split `process_single_mailbox`, merge the two near-duplicate `CandidatesTable` components, per-mail "Send" link from Mail Inbox,
   legacy Gmail IMAP mailbox decision (it marks mail as Seen), commit/push when the owner says so.

## 10. Gotchas and things learned
- **Groq limits** (model `openai/gpt-oss-120b`): 8,000 tokens/min, 1,000 requests/day, **200,000 tokens/day**. Headers `x-ratelimit-*`
  show only minute/request limits; the daily token limit appears in the 429 message. Earlier statements in this engagement that the
  recovery would "fit in the 1,000 requests/day" were wrong because of the token cap.
- The app calls `load_dotenv(override=True)`; tests and isolated runs must neutralise it or they hit the real DB.
- Bash tool: big multi-line heredocs with quotes can fail — write scripts to files; Python patch scripts with `\n` inside strings
  need care (literal backslash-n vs newline).
- Windows: SQLite files can't be deleted while open (`dispose_engine()` in fixtures). Use absolute paths; cwd may drift.
- Dev server shows each API call twice (React StrictMode) — harmless.
- Graph `$filter` on `toRecipients` is **not supported** on this mailbox → Sent Items are indexed by paging instead.
- `get_session` commits after the endpoint; raising `HTTPException` after writes rolls them back (use `session.commit()` first).
- Failed *uploads* stay visible in the main list (so the uploader sees Retry); only failed *mail* imports are hidden.
- Pending replies are for Oct 26–27 imports; the old system had already replied (Aug 2026) to ~157 of the people.

## 11. Corrections to earlier statements
- "Mail.Send must be granted" → it **is** granted (verified).
- "Recovery running in background / will take about half a day" → it **stopped** after hitting the daily token cap (≈6 recovered).
- "1,000 requests/day is the daily ceiling" → the binding limit is **200k tokens/day**.

## 12. Update 2026-11-25 (later): rules-first parsing and test pass
- New `backend/app/services/rules_extract.py`: regex reading of email, phone, LinkedIn, notice period, CTC/ECTC, Pega certification codes,
  skills keywords, city, total experience, name guess. It never guesses Pega/CDH years, never overwrites an AI value, and never invents zeros.
- `process_resume_logic`: AI-empty fields are filled from the rules; a **manual upload** hit by a Groq 429 now creates the candidate from the
  rules fields (no matching/formatting AI calls) instead of failing. **Mailbox imports and `retry_failed_imports` keep fail -> release -> retry.**
- Fixed: "1.5 months" notice (was 30, now 45); unreadable experience ("six years") is now blank, not 0; scanned/image-only PDFs fail visibly
  ("needs OCR or manual entry") without spending tokens.
- 129 backend tests pass. Live PDF accuracy was 29/29 on two synthetic resumes before the Groq daily cap ran out; the other two were not run live.
- Isolated UI testing: `.claude/launch.json` (local only) starts a fake-AI backend on 8011 and the frontend on 5175; do not commit it.
- Known small items: phone with extension joins digits; unauthenticated GET /api/candidates returns an empty 200 instead of 401.
