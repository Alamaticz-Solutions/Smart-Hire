# Hire AI - Technical Architecture & Logic

For the backend/frontend module structure (what lives where, and why), see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). This document instead walks through the
background-worker and AI-parsing *logic* — the pipeline described below, not the file layout.

## System Architecture Overview
The application is a full-stack solution utilizing a React (Vite) frontend and a Python (FastAPI) backend. 
- **Frontend**: React.js, React Router, Vite. Styling is plain hand-written CSS (`index.css`) plus inline styles — no Tailwind or other CSS framework is used.
- **Backend**: Python, FastAPI, SQLite (Relational Data), PostgreSQL + PGVector (Vector Embeddings).
- **AI/ML Layer**: LangChain, Groq LLM (for fast inference and parsing), HuggingFace Embeddings.

---

## Backend Logic & Data Flow

### 1. The Background Worker (`poll_emails_and_process`)
The core engine of the application is a background thread that starts when the FastAPI server initializes. 
- It loops infinitely with a `time.sleep(30)` interval.
- On every tick, it queries the `integrations_settings` table in SQLite to fetch active email credentials (IMAP/SMTP for Gmail, Graph API tokens for Outlook).
- It calls `process_single_mailbox()` for every configured account.

### 2. Email Fetching Logic (`process_single_mailbox`)
**Microsoft Graph API (Outlook/Office365):**
- Uses `client_credentials` grant type to get a Bearer token.
- Fetches all messages from the Inbox in batches of 100 using pagination (`@odata.nextLink`). 
- **Deduplication**: Extracts the `id` or `internetMessageId` and checks the `processed_emails` SQLite table. If the ID exists, the email is skipped.

**IMAP Fallback (Gmail/Others):**
- Connects via `imaplib`.
- Identifies the total number of messages (`total_msgs`).
- Iterates from message `1` to `total_msgs`, grabbing the headers.
- Hashes the headers or uses the `Message-ID` to check against `processed_emails`.

### 3. Attachment Extraction & Bounce Prevention
- Before downloading attachments, the system checks the sender and subject to prevent infinite auto-reply loops (e.g., ignoring `noreply@`, `mailer-daemon@`, `undeliverable:`).
- For valid emails, it extracts MIME parts. For Graph API, if attachments were stripped from the MIME body, it makes a secondary HTTP request to the `/attachments` endpoint.
- Attachments are temporarily saved to the local file system (in a `static/` uploads directory) with a secure, sanitized filename.

### 4. AI Resume Parsing (`process_resume_logic`)
This function handles the extraction of data from the raw document.
1. **Text Extraction**: Uses libraries like `pymupdf` (for PDFs) and `docx2txt` (for Word docs) to convert the binary resume into plain text.
2. **LLM Prompting**: The raw text is passed to the Groq LLM via LangChain. A strict JSON-formatting prompt instructs the model to extract fields: Name, Email, Phone, Skills, Experience, Location, etc.
3. **Robustness**: 
   - A `threading.Lock()` (`_processing_lock`) is used to ensure only one resume is sent to the LLM at a time. This prevents out-of-memory errors on smaller servers (like Render) and avoids hitting Groq API rate limits (HTTP 429).
   - If a rate limit is hit, the system implements an exponential backoff retry mechanism.
4. **Data Storage**: The parsed JSON is inserted into the `candidate_metadata` table in SQLite.
5. **Vector Embeddings**: The raw text of the resume is vectorized using HuggingFace Embeddings and inserted into a PostgreSQL database via `pgvector` to enable semantic "Job Matching" later.

### 5. Automated Follow-Ups (Auto-Responder)
After parsing, the system evaluates the extracted data.
- If the system admin configured "Missing Data" templates and the LLM failed to find a Phone Number or Location, the backend uses SMTP (or Graph API) to send an automated reply to the candidate requesting the missing data.
- The system listens for replies to these emails (by tracking the original Message-ID). If a candidate replies with "My phone number is X", the LLM parses the reply body and updates the database record automatically.

### 6. Reset & Maintenance
The `/api/reset` endpoint allows admins to wipe the `candidate_metadata`, `activity_logs`, and `processed_emails` tables. Clearing `processed_emails` forces the background worker to re-fetch and re-evaluate the entire inbox history on its next polling cycle.
