"""Resume ingestion / LLM-extraction service.

Moved verbatim (with the fixes noted below) out of `app/main.py`:

  - `EXTRACT_PROMPT`                    (main.py original lines 1661-1704)
  - `pre_format_candidate_resume`       (main.py original lines 1707-1802)
  - `process_resume_logic`              (main.py original lines 1805-2090)
  - `process_resume`                    (main.py original lines 2489-2500)
  - the resume-formatting LLM logic that used to live inline inside the
    `GET /api/candidates/{id}/formatted-resume` route
    (`get_formatted_resume_data`, main.py original lines 1302-1529)

`main.py` itself is left untouched; this module is additive.

DEDUP FIX (approved): the ~55-line "resume formatter" prompt template and
the ```json fence-stripping/bracket-slicing idiom that followed it were
copy-pasted verbatim in two places in main.py - inside
`get_formatted_resume_data` (original lines ~1420-1487) and inside
`pre_format_candidate_resume` (original lines ~1722-1789). Both are
consolidated here into one prompt builder (`_build_resume_format_prompt`)
and one LLM-invoke-and-parse helper (`_invoke_resume_formatter`), which
`format_candidate_resume` (used by the route logic) and
`pre_format_candidate_resume` (used by the background pre-warm path) both
call.

INTEGRATION NOTE for the `routers/candidates.py` owner: main.py's
`GET /api/candidates/{id}/formatted-resume` route
(`get_formatted_resume_data`, original lines 1302-1529) was NOT a thin
wrapper - the DB fetch + auth/role checks (original lines 1304-1323) are
request-scoped and belong in the router, but everything after that
(cache check, temp-file/text loading, LLM formatting, fallback data,
caching the result back to `formatted_json`) has been extracted here as
`format_candidate_resume(candidate: dict, candidate_id: int) -> dict`. The
route should do: fetch+auth-check the candidate row, then
`return format_candidate_resume(candidate, candidate_id)`.

Job re-matching: `process_resume_logic` calls `match_candidate_to_all_jobs`
after a successful insert/update (originally main.py line 2085), imported
from `app.services.matching` (that module owns the function; see its
docstring for why it takes a bare candidate_id rather than a pre-loaded
object).
"""

from __future__ import annotations

import os
import re
from typing import Optional

from langchain_community.document_loaders import Docx2txtLoader
from langchain_community.vectorstores import PGVector
from langchain_core.documents import Document
from langchain_core.messages import HumanMessage
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.core.config import STATS_DB, UPLOAD_DIR
from app.core.logging import get_logger
from app.db.row_helpers import row_to_dict
from app.db.session import get_db_connection
from app.services.ai_clients import _processing_lock, get_models
from app.services.json_parsing import parse_llm_json
from app.services.matching import match_candidate_to_all_jobs
from app.services.retry import retry_with_backoff

logger = get_logger(__name__)


# ── PDF loader ────────────────────────────────────────────────────────────
# Duplicated from main.py (original lines 116-135) rather than imported,
# since main.py is left untouched and this tiny fitz-backed loader is used
# by several verticals (upload, resume formatting, JD parsing) that don't
# have an obvious single owner yet. Safe to consolidate into a shared
# `app.services.documents` module in a later pass.
class SafePyMuPDFLoader:
    def __init__(self, file_path: str):
        self.file_path = file_path

    def load(self):
        import fitz

        docs = []
        try:
            doc = fitz.open(self.file_path)
            for page_num, page in enumerate(doc):
                text = page.get_text()
                metadata = {
                    "source": self.file_path,
                    "page": page_num,
                }
                docs.append(Document(page_content=text, metadata=metadata))
            doc.close()
        except Exception as e:
            logger.error(f"Error loading PDF {self.file_path} with fitz: {e}")
            raise e
        return docs


# ── Candidate-extraction prompt (main.py original lines 1661-1704) ────────
EXTRACT_PROMPT = """You are an expert resume and email parser. Extract EVERY piece of information from the resume and the email message (if provided) below.
Be extremely thorough — search all sections: Summary, Experience, Skills, Education, Certifications, Contact, Headers, Footers, and the email body.

Map the extracted data according to the database keys and their corresponding column headings/labels.

Return ONLY a valid JSON object with these exact keys (no extra text, no markdown, just raw JSON):

{{
  "full_name": "<Full name of the candidate. STRICT RULE: You MUST extract this ONLY from the resume document. NEVER extract it from the email body or headers. If no name is explicitly stated in the resume, leave this completely empty. Matching column heading: 'Name'>",
  "total_experience": <number — total years of professional work experience. MUST be extracted from the resume document itself (do not take this from the email body). Calculate if needed. 0 if fresher. Matching column heading: 'Total Exp'>,
  "pega_experience": <number — years of Pega PRPC/BPM experience specifically. If the email body specifies Pega experience (e.g. '5 yrs into pega'), MUST extract this value from the email body. 0 if none. Matching column heading: 'Pega Exp'>,
  "cdh_exp": <number — years of Pega Customer Decision Hub (CDH) experience specifically. If the email body specifies CDH experience, take that. Otherwise, calculate it from the resume (look at durations of CDH-related projects or roles). 0 if none. Matching column heading: 'CDH Exp'>,
  "ctc": "<Current CTC / current salary / current package. E.g. '8 LPA', '10.5 Lacs', '900000'. Look for salary, CTC, package, LPA, Lakhs. Empty if not found. Matching column heading: 'Current CTC'>",
  "expected_ctc": "<Expected CTC / expected salary / expected package. E.g. '12 LPA', '15 Lacs'. Look for expected CTC, ECTC, expected salary, expected package, expectation. Empty if not found. Matching column heading: 'Exp CTC'>",
  "percentage_hike": "<Expected percentage hike. Calculate if both current and expected CTC are present, else empty. Matching column heading: 'Percentage Hike'>",
  "candidate_interview_status": "<Default to empty string '' unless resume has recruiter notes on status. Matching column heading: 'Candidate Interview Status'>",
  "availability_in_days": <number — integer representing days until available. e.g. for 'immediate' use 0, '1 month' use 30. Return null if not found. Matching column heading: 'Availability in Days'>,
  "notice_period": "<Notice period in integer DAYS ONLY. E.g. for 'Immediate' return 0. For '1 month' return 30. ONLY output digits, no text. Matching column heading: 'Notice Period'>",
  "phone": "<Phone number with country code. Include only digits and + sign. Matching column heading: 'Phone No'>",
  "email": "<Email address. Matching column heading: 'Email'>",
  "linkedin": "<Full LinkedIn profile URL if found, else empty string. Matching column heading: 'LinkedIn'>",
  "current_location": "<Current city/location. Matching column heading: 'Current Location'>",
  "pref_locations": "<Preferred locations to work. Matching column heading: 'Pref Locations'>",
  "current_organization": "<Current or most recent employer name. Matching column heading: 'Current Employment'>",
  "current_client": "<Current client working for, if mentioned. Otherwise empty. Matching column heading: 'Current Client'>",
  "domain": "<Domain of expertise, e.g. Banking, Telecom, Healthcare. Extract from recent projects. Matching column heading: 'Domain'>",
  "tier": "<Tier1, Tier2, or Tier3 based on their college/university or companies. Guess if possible, or empty. Matching column heading: 'Tier (Tier1 Tier2 Tier3)'>",
  "certification_version": "<Version of Pega certifications, e.g. 8.6, 8.8. Empty if not found. Matching column heading: 'Certification Version'>",
  "skills": "<All technical skills comma-separated. Matching column heading: 'Skills'>",
  "certifications": "<All certifications and courses comma-separated. Matching column heading: 'Certifications'>",
  "source": "<Extract source of candidate profile if mentioned in resume, e.g. 'LinkedIn', 'Naukri', 'Resume Upload'. If none is found, return 'Resume Upload'. Matching column heading: 'Source'>"{custom_fields}
}}

Rules:
- cdh_exp, pega_experience, total_experience: Must be purely numerical floats or 0.
- notice_period: Must be strictly an integer (0, 15, 30, 60). No strings.
- availability_in_days: Integer number of days.
- If a field is not found, use an empty string "" (or null for numbers). Do not invent data.
- If both a resume and an email message are provided, extract and merge the details. The email message may contain more recent or specific details (such as current/expected CTC, notice period, or Pega/CDH experience); prioritize information from the email message in case of conflict. However, the total_experience (total years of experience) MUST always be extracted from the resume document itself (not the email body), as the resume lists the full work history.

Resume and Email Content:
{text}

JSON:"""


# ── Shared resume-formatter prompt/invoke helpers (dedup) ─────────────────
# Consolidates the identical ~55-line prompt template and identical
# fence-stripping/json.loads idiom that were previously copy-pasted between
# `get_formatted_resume_data` (main.py original ~1420-1487) and
# `pre_format_candidate_resume` (main.py original ~1722-1789).
def _build_resume_format_prompt(text: str) -> str:
    return f"""You are an expert resume formatter. Extract details from the candidate resume text below and structure them into the exact JSON template provided.
Make sure to fill all fields based on the candidate's actual data. If a field is not present in the resume text, leave it blank or default appropriately.

Template Structure:
{{
  "full_name": "Name of the candidate",
  "job_title": "Determine a standard job designation based on their experience and skills, e.g. 'PEGA - CERTIFIED SENIOR SYSTEM ANALYST', 'Pega Lead Business Architect', or similar. If they are a Pega certified system architect, use a format like 'PEGA - CERTIFIED SENIOR SYSTEM ARCHITECT' or 'PEGA - CERTIFIED SYSTEM ARCHITECT'",
  "profile_summary": "A professional profile summary. You MUST format this summary using the exact wording layout: '[X]+ years of experience in [domain/industry] with a proven track record of [key achievement]. Expertise in [Skill 1], [Skill 2], [Skill 3], and [Skill 4]. Experienced in [tools/platforms] and capable of [key capability]. Adept at working with [stakeholders] to deliver [outcomes].' Fill in the bracketed placeholders using the candidate's actual data. Do not leave brackets in the output, resolve them completely.",
  "domain_skills": [
    "A concise list of 4-6 specific domain or functional skill areas, e.g. 'Pega PRPC', 'Decisioning (CDH)', 'Integration Services', 'Data Modeling', 'Agile Methodologies'"
  ],
  "technical_skills": {{
    "primary": "Primary Tool/Platform: [list primary tool(s) and version(s) if known, e.g. 'Pega PRPC: v8.x, v7.x']",
    "languages": "Languages: [list programming/database languages, e.g. 'Java, SQL, XML']",
    "frontend": "Frontend: [list frontend technologies, e.g. 'HTML5, CSS3, JavaScript, React']",
    "others": "Others: [list other tools and platforms, e.g. 'Git, Jira, Azure, Maven']"
  }},
  "education": [
    {{
      "degree": "Degree name (e.g. 'B.E.', 'MCA', 'B.Tech')",
      "field": "Field of study (e.g. 'Computer Science & Engineering')",
      "school": "University or College Name",
      "years": "Year Start - Year End or Year of Completion (e.g. '2015 - 2019')"
    }}
  ],
  "certifications": [
    "List of certifications found, e.g. 'Pega Certified Senior System Architect (CSSA)', 'Certified System Architect (CSA)', 'Certified Pega Decisioning Consultant (CPDC)'"
  ],
  "work_experience": [
    {{
      "company": "Company Name",
      "dates": "Start Date - End Date (e.g. 'Jul 2019 - Present')",
      "role": "Role or Job Title",
      "bullets": [
        "Accomplishment or key responsibility bullet point (limit to 3-5 high-impact bullets per job)"
      ]
    }}
  ],
  "recognitions": [
    {{
      "date": "Month Year / Year (e.g. '2022' or 'Dec 2021')",
      "description": "Award title or recognition detail (e.g. 'Star of the Quarter for excellent project delivery')"
    }}
  ]
}}

Rules:
1. Return ONLY the valid JSON block. No explanation, no markdown backticks, no markdown blocks. Just raw valid JSON.
2. If certifications are empty, extract them from the text (do not use "[HIDDEN]").
3. All fields must be clean strings, numbers, arrays, or objects as defined in the template.
4. Formatting & Corrections: You MUST find and correct any spelling, grammatical, typographical, or indentation/alignment mistakes in the summary and experience bullets. Format the text block into professional, cohesive paragraphs and bullet lists.

Resume Text:
{text[:8000]}

JSON:"""


def _invoke_resume_formatter(text: str, llm) -> dict:
    """Call the LLM with the shared formatter prompt and parse its JSON reply."""
    prompt = _build_resume_format_prompt(text)
    resp = llm.invoke([HumanMessage(content=prompt)])
    return parse_llm_json(resp.content, bracket="{")


def log_candidate(data: dict) -> Optional[int]:
    """Insert/update a `candidate_metadata` row.

    Local copy of main.py's `log_candidate` (original lines 761-801), which
    is a general candidate-persistence helper owned by whichever agent ends
    up owning `routers/candidates.py`. Duplicated here (rather than
    importing from main.py, which would re-run the whole app module) so
    `process_resume_logic` keeps working standalone; safe to delete once a
    shared `app.services.candidates` module exists and this call site is
    repointed at it.
    """
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(candidate_metadata)")
        existing_cols = {c[1] for c in cur.fetchall()}

        cols = [c for c in data.keys() if c in existing_cols and c != "id"]
        vals = []
        for c in cols:
            val = data.get(c)
            if c == "file_bytes":
                vals.append(val)
            else:
                if val == "" or val is None:
                    vals.append(None)
                elif isinstance(val, (dict, list)):
                    import json

                    vals.append(json.dumps(val))
                else:
                    vals.append(val)

        existing_id = data.get("id")

        if existing_id is not None:
            new_id = existing_id
            if cols:
                set_clause = ", ".join([f"{c} = ?" for c in cols])
                cur.execute(f"UPDATE candidate_metadata SET {set_clause} WHERE id = ?", vals + [existing_id])
        else:
            new_id = None
            if cols:
                cur.execute(
                    f"INSERT INTO candidate_metadata ({','.join(cols)}) VALUES ({','.join(['?'] * len(cols))})",
                    vals,
                )
                new_id = cur.lastrowid
        conn.commit()
        return new_id


# ── Background resume pre-formatting (main.py original lines 1707-1802) ───
def pre_format_candidate_resume(candidate_id: int, text: str, filename: str):
    """Pre-compute and cache the formatted-resume JSON for a candidate, best-effort.

    Called from `process_resume_logic` right after a resume is
    ingested/matched, so the "Formatted Resume" view doesn't have to pay
    LLM latency on first request.
    """
    original_page_count = 1
    if filename:
        path = os.path.join(UPLOAD_DIR, filename)
        if os.path.exists(path) and filename.lower().endswith(".pdf"):
            try:
                import fitz

                doc = fitz.open(path)
                original_page_count = len(doc)
                doc.close()
            except Exception:
                pass


    _, llm = get_models()

    try:
        data = _invoke_resume_formatter(text, llm)
        data["original_page_count"] = original_page_count

        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute(
                "UPDATE candidate_metadata SET formatted_json = ? WHERE id = ?",
                (_json_dumps(data), candidate_id),
            )
            conn.commit()
        logger.info(f"Successfully pre-formatted and cached resume for candidate ID {candidate_id}")
    except Exception as e:
        logger.warning(f"Failed to pre-format candidate resume ID {candidate_id} in background: {e}")


def _json_dumps(data: dict) -> str:
    import json

    return json.dumps(data)


# ── On-demand resume formatting for GET .../formatted-resume ──────────────
def format_candidate_resume(candidate: dict, candidate_id: int) -> dict:
    """Build (or return cached) formatted-resume JSON for one candidate.

    Extracted from `get_formatted_resume_data` (main.py original lines
    1302-1529). The auth/role checks and the initial DB row fetch (original
    lines 1304-1323) are request-scoped and stay in the router; the caller
    is expected to have already fetched `candidate` as a dict (e.g. via
    `row_to_dict`) and to pass it in here alongside its `id`.
    """
    import json

    # Check cache first.
    cached_data = None
    if candidate.get("formatted_json"):
        try:
            cached_data = json.loads(candidate.get("formatted_json"))
        except Exception:
            pass

    filename = candidate.get("filename", "")
    file_bytes = candidate.get("file_bytes")
    file_url = candidate.get("file_url")

    if isinstance(file_bytes, memoryview):
        file_bytes = file_bytes.tobytes()

    if filename and not file_bytes and file_url:
        import requests
        from app.services.storage import extract_gdrive_file_id, get_gdrive_file_bytes, get_s3_presigned_url, is_gdrive_url, is_s3_url

        # Neither S3 nor Drive resumes are public anymore (see storage.py) -
        # a bare GET against the stored file_url now 403s for both, so each
        # needs its own authenticated fetch instead of a plain requests.get.
        if is_gdrive_url(file_url):
            drive_id = extract_gdrive_file_id(file_url)
            file_bytes = get_gdrive_file_bytes(drive_id) if drive_id else None
            if file_bytes:
                logger.info(f"Successfully fetched resume bytes from Drive ({file_url}) for formatting")
            else:
                logger.warning(f"Failed to fetch resume bytes from Drive: {file_url}")
        else:
            fetch_url = get_s3_presigned_url(filename) if is_s3_url(file_url) else file_url
            fetch_url = fetch_url or file_url
            try:
                resp = requests.get(fetch_url, timeout=15)
                if resp.status_code == 200:
                    file_bytes = resp.content
                    logger.info(f"Successfully fetched resume bytes from {file_url} for formatting")
                else:
                    logger.warning(f"Failed to fetch resume bytes from {file_url}: status {resp.status_code}")
            except Exception as fetch_err:
                logger.error(f"Error fetching resume bytes from {file_url}: {fetch_err}")

    temp_path = None
    if filename and file_bytes:
        import tempfile

        suffix = os.path.splitext(filename)[1]
        try:
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp.write(file_bytes)
                temp_path = tmp.name
        except Exception as e:
            logger.error(f"Error creating temp file for formatting: {e}")

    path = temp_path if temp_path else (os.path.join(UPLOAD_DIR, filename) if filename else None)

    # Calculate original page count if PDF.
    original_page_count = 1
    if filename and path and os.path.exists(path) and filename.lower().endswith(".pdf"):
        try:
            import fitz

            doc = fitz.open(path)
            original_page_count = len(doc)
            doc.close()
        except Exception:
            pass

    if cached_data:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
        cached_data["original_page_count"] = original_page_count
        return cached_data

    # Try to load original text.
    text = ""
    if filename and path and os.path.exists(path) and not filename.lower().endswith((".xlsx", ".xls", ".csv")):
        try:
            if filename.lower().endswith(".pdf"):
                loader = SafePyMuPDFLoader(path)
            else:
                loader = Docx2txtLoader(path)
            docs = loader.load()
            text = "\n".join([d.page_content for d in docs])
        except Exception as e:
            logger.error(f"Error loading resume file: {e}")

    if temp_path and os.path.exists(temp_path):
        try:
            os.remove(temp_path)
        except Exception:
            pass

    # Fallback to metadata if file text couldn't be loaded.
    if not text:
        text = f"""
        Name: {candidate.get('full_name')}
        Experience: {candidate.get('total_experience')} years (Pega: {candidate.get('pega_experience')} years, CDH: {candidate.get('cdh_exp')} years)
        Current Employment: {candidate.get('current_organization')}
        Location: {candidate.get('current_location')}
        Skills: {candidate.get('skills')}
        Certifications: {candidate.get('certifications')}
        Preferred Location: {candidate.get('pref_locations')}
        CTC: {candidate.get('ctc')}
        Expected CTC: {candidate.get('expected_ctc')}
        """


    _, llm = get_models()

    try:
        data = _invoke_resume_formatter(text, llm)
        data["original_page_count"] = original_page_count

        # Cache the result in DB.
        try:
            with get_db_connection() as conn:
                cur = conn.cursor()
                cur.execute(
                    "UPDATE candidate_metadata SET formatted_json = ? WHERE id = ?",
                    (json.dumps(data), candidate_id),
                )
                conn.commit()
        except Exception as e_cache:
            logger.error(f"Error caching formatted resume: {e_cache}")

    except Exception as e:
        logger.error(f"Error parsing resume via LLM: {e}")
        # Return fallback structured data.
        data = {
            "full_name": candidate.get("full_name"),
            "job_title": "Pega Professional",
            "profile_summary": f"{candidate.get('total_experience', 0)} years of experience in IT with skills in {candidate.get('skills', '')}.",
            "domain_skills": [s.strip() for s in str(candidate.get("skills", "")).split(",") if s.strip()][:4],
            "technical_skills": {
                "primary": "Primary Tool/Platform: Pega",
                "languages": "Languages: Java, SQL",
                "frontend": "Frontend: HTML, CSS, JavaScript",
                "others": "Others: Git, Jira",
            },
            "education": [],
            "certifications": [c.strip() for c in str(candidate.get("certifications", "")).split(",") if c.strip()],
            "work_experience": [
                {
                    "company": candidate.get("current_organization") or "Current Employer",
                    "dates": "N/A",
                    "role": "Pega Developer",
                    "bullets": ["Contributed to application development and configuration."],
                }
            ],
            "recognitions": [],
        }

    return data


# ── Core resume ingestion (main.py original lines 1805-2090) ──────────────
def process_resume_logic(
    safe_name: str,
    path: str,
    is_approved: int = 1,
    username: str = "unknown",
    email_message: str = None,
    sender_email: str = None,
    file_url: str = None,
    placeholder_id: Optional[int] = None,
):
    import json


    docs = None
    text = ""
    candidate_id = None
    try:
        _, llm = get_models()
        embeddings, _ = get_models()

        # Load document.
        if safe_name.lower().endswith(".pdf"):
            loader = SafePyMuPDFLoader(path)
        else:
            loader = Docx2txtLoader(path)
        docs = loader.load()
        text = "\n".join([d.page_content for d in docs])

        # Fetch custom columns for the prompt.
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT col_key, col_label, description FROM custom_columns")
            custom_cols = cur.fetchall()

        custom_fields_str = ""
        if custom_cols:
            for col_key, col_label, desc in custom_cols:
                # Include the exact column heading / label and description to make extraction precise.
                desc_str = f"Extract data corresponding to column heading '{col_label}'"
                if desc:
                    desc_str += f" ({desc})"
                custom_fields_str += f',\n  "{col_key}": "<{desc_str}>"'

        combined_text = text[:7000]
        if email_message:
            combined_text += f"\n\n=== EMAIL MESSAGE BODY ===\n{email_message}\n=========================="

        prompt_str = EXTRACT_PROMPT.format(text=combined_text, custom_fields=custom_fields_str)

        # Retry mechanism for rate limits (was a hand-rolled loop at main.py
        # original lines 1841-1852: max_retries=5, sleep 20 + attempt*10,
        # retryable on "429" or "rate").
        resp = retry_with_backoff(
            lambda: llm.invoke([HumanMessage(content=prompt_str)]),
            max_retries=5,
            base_delay=20,
            delay_increment=10,
            retryable_markers=("429", "rate"),
            raise_on_exhaustion=True,
        )

        if resp is None:
            raise Exception("Failed to get response from AI model")

        # JSON extraction (was fence-stripping + bracket-slicing at main.py
        # original lines 1859-1867).
        data = parse_llm_json(resp.content, bracket="{")

        # Safeguard against LLM placeholder hallucinations (e.g. John Doe).
        placeholder_names = {"john doe", "john doe's", "jane doe", "candidate name", "name of the candidate", "placeholder"}
        extracted_name = str(data.get("full_name", "")).strip()
        if not extracted_name or extracted_name.lower() in placeholder_names:
            data["full_name"] = ""

        if extracted_name.lower() in placeholder_names:
            for field in ["email", "phone", "linkedin", "current_location", "pref_locations"]:
                val = str(data.get(field, "")).lower()
                if "example.com" in val or "johndoe" in val or "123456" in val or "new york" in val:
                    data[field] = ""

        if username == "email_worker":
            data["source"] = "uploaded from mail"
        if email_message:
            data["email_message"] = email_message
        if sender_email:
            data["sender_email"] = sender_email

        # -- Start Data Validation & Normalization --

        # Phone: Keep only digits and +.
        if "phone" in data and data["phone"]:
            data["phone"] = re.sub(r"[^\d+]", "", str(data["phone"]))

        # Email: Basic validation.
        if "email" in data and data["email"]:
            if "@" not in str(data["email"]):
                data["email"] = ""

        # Experience: Force float.
        for exp_field in ["total_experience", "pega_experience", "cdh_exp"]:
            if exp_field in data and data[exp_field] not in [None, ""]:
                try:
                    match = re.search(r"\d+(\.\d+)?", str(data[exp_field]))
                    data[exp_field] = float(match.group()) if match else 0.0
                except Exception:
                    data[exp_field] = 0.0

        # Integer fields.
        for num_field in ["notice_period", "availability_in_days"]:
            if num_field in data and data[num_field] not in [None, ""]:
                np_str = str(data[num_field]).lower()
                if "immediate" in np_str:
                    data[num_field] = 0
                else:
                    try:
                        match = re.search(r"\d+", np_str)
                        val = int(match.group()) if match else ""
                        if match and "month" in np_str:
                            val = val * 30
                        data[num_field] = val
                    except Exception:
                        data[num_field] = ""
        # -- End Data Validation & Normalization --

        # Only match if a candidate with the same filename already exists (excluding the current placeholder).
        with get_db_connection() as conn:
            cur = conn.cursor()
            match_id = None
            if placeholder_id:
                cur.execute("SELECT id FROM candidate_metadata WHERE filename = ? AND id != ? LIMIT 1", (safe_name, placeholder_id))
            else:
                cur.execute("SELECT id FROM candidate_metadata WHERE filename = ? LIMIT 1", (safe_name,))
            row = cur.fetchone()
            if row:
                match_id = row[0]

            # Ensure file is uploaded to external storage if provider is configured and file_url not provided.
            if not file_url:
                from app.services.storage import STORAGE_PROVIDER, upload_to_external_storage

                if STORAGE_PROVIDER != "local":
                    url, err = upload_to_external_storage(path, safe_name)
                    if not err:
                        file_url = url
                    else:
                        logger.warning(f"External upload in background failed: {err}")

            if match_id:
                # Match found! Retrieve the file_bytes and file_url from the placeholder first.
                cur.execute("PRAGMA table_info(candidate_metadata)")
                allowed_cols = {c[1] for c in cur.fetchall()}

                placeholder_bytes = None
                placeholder_url = None

                if "file_url" in allowed_cols:
                    if placeholder_id:
                        cur.execute("SELECT file_bytes, file_url FROM candidate_metadata WHERE id = ? LIMIT 1", (placeholder_id,))
                    else:
                        cur.execute("SELECT file_bytes, file_url FROM candidate_metadata WHERE filename = ? LIMIT 1", (safe_name,))
                    placeholder_row = cur.fetchone()
                    if placeholder_row:
                        placeholder_bytes = placeholder_row[0]
                        placeholder_url = placeholder_row[1]
                else:
                    if placeholder_id:
                        cur.execute("SELECT file_bytes FROM candidate_metadata WHERE id = ? LIMIT 1", (placeholder_id,))
                    else:
                        cur.execute("SELECT file_bytes FROM candidate_metadata WHERE filename = ? LIMIT 1", (safe_name,))
                    placeholder_row = cur.fetchone()
                    if placeholder_row:
                        placeholder_bytes = placeholder_row[0]

                # Match found! Delete the placeholder record we created in upload_resume.
                if placeholder_id:
                    cur.execute("DELETE FROM candidate_metadata WHERE id = ?", (placeholder_id,))

                # Fetch the existing candidate metadata to merge values.
                cur.execute("SELECT * FROM candidate_metadata WHERE id = ?", (match_id,))
                existing_row = row_to_dict(cur.fetchone(), cursor=cur)

                updates = {}
                for k, v in data.items():
                    if k in allowed_cols and k != "id" and k != "filename" and k != "file_bytes" and k != "file_url":
                        if v is not None and v != "":
                            existing_val = existing_row.get(k)
                            if username == "email_worker" or existing_val is None or str(existing_val).strip() == "" or existing_val == 0.0 or existing_val == 0:
                                updates[k] = v
                # Always update or attach the filename to the matched candidate.
                updates["filename"] = safe_name
                if placeholder_bytes and not file_url:
                    updates["file_bytes"] = placeholder_bytes

                if file_url:
                    updates["file_url"] = file_url
                elif placeholder_url:
                    updates["file_url"] = placeholder_url

                if username == "email_worker":
                    updates["source"] = "uploaded from mail"
                    if email_message:
                        updates["email_message"] = email_message
                    if sender_email:
                        updates["sender_email"] = sender_email

                if updates:
                    set_clause = ", ".join(f"{k}=?" for k in updates)
                    cur.execute(f"UPDATE candidate_metadata SET {set_clause} WHERE id=?", list(updates.values()) + [match_id])

                candidate_id = match_id
                logger.info(f"Auto-attached uploaded resume {safe_name} to existing candidate profile ID {match_id} ({data.get('full_name', '')})")
                conn.commit()
            else:
                data["filename"] = safe_name
                data["candidate_status"] = "New"
                data["is_approved"] = is_approved
                data["created_by"] = username
                if file_url:
                    data["file_url"] = file_url

                # If we uploaded externally, don't store bytes in DB.
                if file_url:
                    data["file_bytes"] = None

                if username == "email_worker":
                    data["source"] = "uploaded from mail"
                    if email_message:
                        data["email_message"] = email_message
                    if sender_email:
                        data["sender_email"] = sender_email
                if placeholder_id:
                    data["id"] = placeholder_id
                candidate_id = log_candidate(data)

    except Exception as e:
        import traceback

        traceback.print_exc()
        error_msg = str(e)[:200]
        # Same string that used to only ever reach the log line below (which
        # nothing persists - stdout only, no log file) - now also stored on
        # the row itself, since there was previously no way to answer "why
        # did this fail" after the fact without having watched the terminal
        # at the exact moment it happened.
        error_detail = f"{type(e).__name__}: {error_msg}"[:500]
        logger.error(f"Error processing resume {safe_name}: {error_msg}")
        # Instead of deleting the placeholder (which makes the candidate disappear),
        # update it with a failed status so the user can see it failed and retry.
        try:
            with get_db_connection() as conn:
                cur = conn.cursor()
                if placeholder_id:
                    # Was "❌ Processing Failed: {safe_name}" packed into the
                    # name field itself - redundant now that the frontend
                    # renders a real "Error" status chip plus this
                    # error_detail text, and it truncated mid-sentence in the
                    # table's ~180px name column. Just the filename now, same
                    # as any other candidate row.
                    cur.execute(
                        "UPDATE candidate_metadata SET full_name = ?, candidate_status = ?, error_detail = ? WHERE id = ?",
                        (safe_name, "Error", error_detail, placeholder_id),
                    )
                    conn.commit()
        except Exception as db_err:
            logger.error(f"Error updating placeholder status in DB: {db_err}")
        return

    # Add to PGVector.
    try:
        # First, remove old embeddings for this resume to prevent duplicates.
        try:
            with get_db_connection() as conn:
                cur = conn.cursor()
                cur.execute("DELETE FROM langchain_pg_embedding WHERE cmetadata->>'source' = ?", (safe_name,))
                conn.commit()
        except Exception as embed_err:
            logger.error(f"Failed to delete old embeddings: {embed_err}")

        for d in docs:
            d.metadata["source"] = safe_name
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
        chunks = splitter.split_documents(docs)
        PGVector.from_documents(
            documents=chunks,
            embedding=embeddings,
            connection_string=os.getenv("POSTGRES_DATABASE_URL"),
            collection_name="resume_embeddings",
        )
    except Exception:
        pass

    # Automatically match this candidate to all active JDs in the database
    # (original main.py line 2085; `match_candidate_to_all_jobs` now lives
    # in `app.services.matching`, imported above). No try/except here,
    # matching the original's behavior of letting a match failure propagate.
    if candidate_id and is_approved == 1:
        match_candidate_to_all_jobs(candidate_id)
        # Pre-format resume in background to avoid on-the-fly LLM latency.
        try:
            pre_format_candidate_resume(candidate_id, text, safe_name)
        except Exception as format_err:
            logger.warning(f"Background resume formatting failed: {format_err}")


def process_resume(
    safe_name: str,
    path: str,
    is_approved: int = 1,
    username: str = "unknown",
    email_message: str = None,
    sender_email: str = None,
    file_url: str = None,
    placeholder_id: Optional[int] = None,
):
    """Serialize resume processing behind the app's global processing lock, then clean up the temp file.

    Moved from main.py original lines 2489-2500. The `_processing_lock`
    (defined in main.py as a module-level `threading.Lock()` shared by both
    resume and Excel processing, to avoid Render OOM / Groq rate limits /
    SQLite locks) still lives in main.py; it's imported lazily here to avoid
    importing the whole app module at import time.
    """

    try:
        with _processing_lock:
            process_resume_logic(safe_name, path, is_approved, username, email_message, sender_email, file_url, placeholder_id)
    finally:
        try:
            if os.path.exists(path):
                os.remove(path)
        except Exception:
            pass
