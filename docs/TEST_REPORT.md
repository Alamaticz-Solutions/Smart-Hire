# Full application test report (2026-11-24)

Scope: backend API (101 black-box checks + 72 automated tests), every page and button of the UI, and a
**read-only** pull from the careers@ Outlook mailbox. The UI and API checks ran against a throw-away
SQLite database. The real `hire_ai` database was only read. No mail was sent and nothing in the mailbox was changed.

## Outlook pull test

| Check | Result |
| --- | --- |
| Graph token with the saved tenant / client / secret | OK |
| Inbox read (1,480 messages, 836 unread) | OK |
| The app's own "Test Connection" function | OK |
| Dry-run import of mail since 19 Oct (real worker code, temp DB, local storage) | 11 messages seen, 5 automated senders skipped, 2 resumes parsed |
| Received date stored per candidate (`mail_received_at`) | OK (e.g. 2026-11-23 12:29 UTC) |
| Replies | Queued as `pending`; nothing sent (send path blocked in the test) |
| Server-side Graph date filter | Works live |

## Bugs fixed in this pass (covered by `tests/test_regressions.py`)

| # | Severity | Bug | Fix |
| --- | --- | --- | --- |
| 1 | High | Typing in "Mail Received" on Add Candidate returned **500** (my earlier column change) | Field hidden in the form, rejected server-side |
| 2 | High | Assistant tables showed a blank Name / Organization (API sent `name`/`organization`, page reads `full_name`/`current_organization`) | API now returns both |
| 3 | High | CSV uploads silently failed ("openpyxl does not support .csv") yet the API said "processing" | CSV is read natively; `full_name`-style headers accepted |
| 4 | Medium | `.doc` / `.xls` uploads accepted, then failed ("File is not a zip file") and left an Error candidate | Rejected up front with a clear message; dropzone text updated |
| 5 | Medium | Empty file upload accepted | 400 |
| 6 | Medium | Registration accepted a 1-character password and an invalid email | Min 8 chars, email format, non-blank names (also on password reset) |
| 7 | Medium | API created a job with empty title/description (the UI blocked it) | 400 |
| 8 | Medium | Admin permissions on a non-existent user returned 200 | 404 |
| 9 | High | Job match: when the AI was rate-limited it **wiped the job's existing matches** and still said "Successfully matched 0" | Existing matches kept, 503 with a retry message |
| 10 | Medium | No way to start the API without the mailbox poller (a local run on the shared DB starts importing and marking mail read) | `EMAIL_WORKER_ENABLED=false` |
| 11 | Low | Phone layout: top bar overflowed and the user menu / sign-out was off-screen | Bar wraps |

## Fixed in the second pass

| Severity | Issue | Fix |
| --- | --- | --- |
| **Critical** | `POST /api/auth/firebase-sync` issued a session token for **any username, including admin**, with no proof (an unauthenticated account takeover). | The server now verifies the Firebase ID token with Google, requires its email to match, binds each account to its Firebase user id, and requires a verified email before a first-time sync for admin/HR accounts (they otherwise use their password). The login page sends the token. |
| High | Registering through the Firebase path returned "pending approval" but the new account and its approval request were rolled back, so the request was silently lost. | Committed before the 403. |
| High | The importer had no pacing: a Groq 429 saved an Error candidate **and** marked the mail processed (681 lost imports). | A rate-limit now deletes the placeholder, releases the mail for retry and pauses imports for 15 min. Per-cycle caps (40 new messages, 15 resumes). All tunable by env (`MAIL_MAX_NEW_PER_CYCLE`, `MAIL_MAX_RESUMES_PER_CYCLE`, `MAIL_RATE_LIMIT_COOLDOWN_MINUTES`). |
| High | 385 queued replies would all be sent when auto-reply is turned on. | New setting "Only reply to mail received in the last N days" (default 7, 0 = no limit). Older queued replies are skipped, never sent. |
| Medium | Approving a user in Permissions left their request pending. | The request is closed. |
| Medium | Share-job silently ignored unknown usernames. | Response lists `skipped_unknown`. |
| Medium | Formatted-resume accepted any JSON. | Must be an object. |
| Medium | Legacy `.doc` / `.xls` mail attachments were dropped silently. | A warning is logged naming the file. (They cannot be parsed; ask senders for PDF/DOCX.) |
| Low | Candidates table spilled out of its card in short windows. | Card no longer shrinks below its content. |
| Low | `datetime.utcnow()` deprecation warnings. | Timezone-aware replacement. |
| Tooling | Recovering the 681 failed imports. | `python -m scripts.retry_failed_imports --dry-run` / `--limit 10`: re-parses a few at a time, waits between resumes and stops at the first new rate limit. |

## Still needs a person

| Item | Why |
| --- | --- |
| Run `scripts/retry_failed_imports` against the real DB | It calls Groq for each resume (cost / quota), so it is run deliberately. Set the import date window first. |
| Grant **Mail.Send** to the Outlook app in Azure | Only the HR admin can; needed before any reply can be sent. |
| Change the seeded passwords (`admin/admin`, ...) before deploying | Real credentials must be chosen by you (`scripts/set_password.py`). |
| `GET /api/auth/get-email` | Still returns the email on file (rate-limited to 20/min per IP) because the login page needs it to sign in to Firebase. It is no longer enough to take over an account. Removing it means dropping Firebase sign-in in favour of the app's own login. |
| Frontend linter | None is configured; adding one will report many pre-existing warnings, so it is a separate clean-up. |
