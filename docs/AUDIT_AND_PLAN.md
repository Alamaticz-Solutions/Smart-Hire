# Project audit and plan (2026-11-25)

Verified = I ran it or read the exact code. "Likely" = read from code, not yet reproduced.

## 1. Structure and API contract

| Check | Result |
| --- | --- |
| Frontend calls vs backend routes | **74 of 74 match** a real route |
| Backend routes the UI never calls | `POST /api/reset` (wipes data), `POST /api/auth/register`, `POST /api/candidates/bulk-delete`, `POST /api/match-jd`, `DELETE /api/activity` |
| Layering (routers → repositories → models) | Clean. Raw SQL only in `vector_store.py` and the health check |
| Response format | Every endpoint uses the envelope |
| Automated tests | 82 backend tests pass. **Frontend: none.** No CI (`.github` missing), no linter |
| `email_worker.py` | 1,246 lines; `process_single_mailbox` is one ~600-line function mixing fetch, parse, import and reply |
| Frontend size | `ConnectPage` 1,187, `JobsPage` 1,002, `AdminPage` 998 lines; two near-duplicate `CandidatesTable` components (jobs/ and upload/) |
| Poller | Runs as a thread inside the web process; no heartbeat, nothing in the UI says whether it is alive |
| Migrations | Hand-written `ADD COLUMN` at startup; no versions, no type changes; start-up takes ~1 min on the remote DB |

## 2. Outlook / Graph pull (every API call)

| # | Severity | Problem | Status |
| --- | --- | --- | --- |
| 1 | High | **6 Graph calls have no timeout** (token, list, MIME, attachments, sendMail). One hung connection freezes the only poller thread forever | Verified |
| 2 | High | A failed token request or non-200 list response is **ignored silently** (`if access_token:` / `else: break`). The poller looks alive but imports nothing, and no log says why | Verified |
| 3 | High | No handling of Graph throttling (429/503, `Retry-After`) | Verified |
| 4 | Medium | With no date window, **every minute re-lists the whole inbox** (15 pages for 1,480 mails) and runs one DB lookup per message. Needs a "last seen" watermark | Verified |
| 5 | Medium | A new access token is requested every cycle instead of being cached for ~1 h | Verified |
| 6 | High | The date stored on candidates is the mail's `Date:` header, not the mailbox's **received time** (`receivedDateTime`, which Graph already returns) | Verified |
| 7 | Medium | Mail is claimed before processing, so any other crash loses it. There is no per-mail outcome and no Retry | Verified |
| 8 | Low | "Skip automated senders" switch cannot be turned off for `noreply@` (a separate bounce rule always catches it) | Verified |
| 9 | Low | Only the Inbox folder is read; mail in subfolders or Junk is missed | Verified |
| 10 | Low | Candidate filename uses only 8 hex chars of the mail-id hash (collision-prone; used to find the candidate later) | Verified |
| 11 | Medium | Tenant `common` can be saved with no warning (it is blocked by your org) | Verified |
| 12 | Medium | Replies need **Mail.Send**; `sendMail` has no timeout | Verified |

## 3. Security

| # | Severity | Problem | Status |
| --- | --- | --- | --- |
| 1 | **High** | **Secrets are stored in plain text** in the database (Microsoft client secret, mailbox passwords, Drive tokens), while the UI says "Stored encrypted" | Verified |
| 2 | Medium | `GET /api/auth/get-email` returns the email for any username without login | Verified |
| 3 | Medium | Seeded users have username-as-password in dev; **start-up resets roles/approval of seeded users every time** | Verified |
| 4 | Medium | `POST /api/auth/register` is public and unused by the UI (the UI registers through Firebase). `POST /api/reset` is dangerous and unused | Verified |
| 5 | Medium | `SESSION_SECRET` unset means random per-process secret: every restart logs everyone out | Verified (warning seen) |
| 6 | Medium | Session token and user profile kept in `localStorage` (readable by any XSS); no revocation on logout | Verified |
| 7 | Low | No security headers (CSP, HSTS, X-Frame-Options); rate limiter is per process only | Verified |
| 8 | Low | Resume links carry the session token in the URL (`?token=`) | Verified |

Fixed already: the Firebase account-takeover hole.

## 4. Data

| # | Severity | Problem | Status |
| --- | --- | --- | --- |
| 1 | **High** | 681 of 928 candidates are failed mail imports (Groq 429) | Verified |
| 2 | High | **65 mail candidates (and every older one) have no received date**; no record of which mail made which candidate | Verified |
| 3 | High | **Fields not populated:** 66 mail candidates have no skills; all 59 Excel candidates have no skills and no resume | Verified |
| 4 | Medium | 14 duplicate emails | Verified |
| 5 | Medium | Excel: rows without name/email/phone are skipped with no report; `.xls` unsupported; on a duplicate, empty cells may overwrite existing data | Likely (first two verified) |
| 6 | Medium | `_recover_interrupted_processing` runs at every start and flips *any* "Processing" row to Failed, even if another instance is mid-parse | Verified |
| 7 | Medium | Chat and matching load **all** candidates into memory and send them to the LLM; list filtering only covers the first 200 loaded rows | Verified |
| 8 | Medium | Matching is 100% LLM, so a rate limit means no matches (embeddings are off unless configured) | Verified |

## 5. Resume templates

| # | Problem |
| --- | --- |
| 1 | Fallback **invents** skills and roles ("Java, SQL", "Git, Jira", "Pega Developer") |
| 2 | Cached result goes stale when a candidate is edited |
| 3 | Excel candidates and thin profiles have nothing real to put in the template |
| 4 | Every view calls Groq, so it fails under rate limits |

## 6. Plan (in order)

| Phase | Work | Notes |
| --- | --- | --- |
| 0 Safety | Graph timeouts, logged failures, throttle retry, cached token; encrypt secrets and fix the UI text; remove/guard `reset` and `register`; poller heartbeat shown in UI | Do first: protects data and makes failures visible |
| 1 Data foundation | `origin`, `record_state`, mail log (`mail_messages`), import batches. **Written and tested (82 pass), not yet wired in** | Backfill origin for all existing rows; backfill received dates + mail log from Outlook (read-only) |
| 2 Screens | Mail Inbox (received date, outcome, Retry, reply status), Excel Imports (per-row results, undo), Candidates tabs and a Mail Received / Origin / Profile % column | Admin/HR only for the inboxes |
| 3 Populate fields | Profile completeness, "needs review" state, throttled re-parse for missing fields, duplicate merge flow | Excel rows keep "Not provided" for what the sheet lacks |
| 4 Templates | Remove invented fallback, refresh cache on edit, data-sheet layout for thin profiles | |
| 5 Quality | Split the worker, merge the duplicate tables, add a Graph **contract test** (fake Graph server: token failure, 429, paging, MIME, attachments), frontend lint + tests, CI | |

## 7. Decisions needed

1. Encrypt secrets with a new key in `.env` (you must keep that key safe), or move them to environment variables only?
2. Excel rows: straight into Candidates with a "needs review" badge (recommended), or wait for approval?
3. Duplicate emails: flag only (recommended) or auto-merge?
4. Should the poller become a separate service in `render.yaml`?

## Status after the build (2026-11-25)

Done and tested (113 backend tests pass, frontend builds):

- **Outlook / Graph:** one hardened client (timeouts, token cache, retry on throttling, every failure logged and shown as poller health); the real received time is stored; inbox listing no longer does one query per message.
- **Mail Inbox** (`/mail`): every mailbox message with received date, outcome, reason, linked candidate, reply status; filters, search, date range, Excel export, Retry. The 1,480 existing messages were backfilled from Outlook (read-only).
- **Excel Imports** (`/imports`): one row per uploaded file, per-row results, report download, undo. Blank cells no longer wipe existing data; sheets without recognised headings are reported.
- **Candidates:** buttons All / Emails / Excel / Resumes / Manual / Needs review / Failed (server-side, with counts), Origin, Mail Received and Profile % columns. Failed mail imports are out of the main list.
- **Extraction:** non-resumes (invoices, visa papers) are rejected; the resume window is 14,000 characters (was 7,000); city codes expanded; "Re-read documents" fills empty fields only (`/api/candidates/{id}/re-extract`, `/populate-missing`, `scripts/populate_fields.py`).
- **Templates:** no invented content, rebuilt when the candidate changes, hand edits kept, Regenerate button, data-sheet layout without a document.
- **Security:** secrets encrypted at rest (`SECRETS_KEY`), tenant `common` rejected, `register`/`reset` closed in production, security headers, seeded users no longer reset on every start, start-up no longer fails in-progress resumes.
- **Operations:** stand-alone poller (`python -m app.worker`, `render.yaml`), CI workflow, backup script.

Still open: OCR for scanned PDFs (no text layer), Mail.Send permission in Azure, seeded passwords, `get-email`, frontend lint/tests, splitting `email_worker.py`.
