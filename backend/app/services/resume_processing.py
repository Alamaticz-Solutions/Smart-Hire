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
from langchain_core.documents import Document
from langchain_core.messages import HumanMessage

from app.core.config import UPLOAD_DIR
from app.core.logging import get_logger
from app.db.engine import session_scope
from app.repositories import CandidateRepository, CustomColumnRepository
from app.services import vector_store
from app.services.completeness import derive_state
from app.services.ai_clients import _processing_lock, get_models
from app.services.json_parsing import parse_llm_json
from app.services.matching import match_candidate_to_all_jobs
from app.services.retry import retry_with_backoff
from app.services.rules_extract import extract_by_rules, fill_gaps

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


#: Fields never sent to the AI: defaults / recruiter notes, not resume content.
_NEVER_ASK_AI = {"candidate_interview_status", "source"}


def build_gap_prompt(text: str, rules_found: dict, custom_fields: str = "", custom_keys: Optional[list] = None) -> Optional[str]:
    """Short extraction prompt asking ONLY for the fields the rules could not read.

    Returns None when nothing is left to ask. The wording of each field comes from ``EXTRACT_PROMPT`` so
    the AI gets exactly the same instructions as before, just for fewer fields.
    """
    template = EXTRACT_PROMPT.replace("{{", "{").replace("}}", "}")
    head = template.split("\n{\n", 1)[0]
    rules_block = "Rules:" + template.split("Rules:", 1)[1].split("Resume and Email Content:", 1)[0]
    lines = {m.group(1): m.group(0).strip().rstrip(",") for m in re.finditer(r'^\s*"(\w+)":.*$', template, re.M)}
    covered = set(rules_found)
    if "notice_period" in covered:
        covered.add("availability_in_days")
    if "ctc" in covered and "expected_ctc" in covered:
        covered.add("percentage_hike")
    wanted = [line for key, line in lines.items() if key not in covered and key not in _NEVER_ASK_AI]
    for extra in (c.strip().lstrip(",").strip() for c in custom_fields.split(",\n") if c.strip()):
        wanted.append(extra.rstrip(","))
    if not wanted:
        return None
    note = f"\nThese fields were already read from the document and are NOT needed: {', '.join(sorted(covered))}.\n" if covered else ""
    return f"{head}\n{{\n" + ",\n".join(wanted) + f"\n}}\n{note}\n{rules_block}Resume and Email Content:\n{text}\n\nJSON:"


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
    """Insert a candidate (or update it when ``data`` carries an ``id``).

    Returns the candidate id. Unknown keys are ignored and blank strings are
    stored as NULL (see ``CandidateRepository``).
    """
    with session_scope() as session:
        candidates = CandidateRepository(session)
        existing_id = data.get("id")
        if existing_id is not None:
            candidates.update(existing_id, data)
            return existing_id
        return candidates.insert(data)


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
        with session_scope() as session:
            data["_source_hash"] = _source_hash(CandidateRepository(session).get_row(candidate_id) or {})

        with session_scope() as session:
            CandidateRepository(session).set_formatted_json(candidate_id, _json_dumps(data))
        logger.info(f"Successfully pre-formatted and cached resume for candidate ID {candidate_id}")
    except Exception as e:
        logger.warning(f"Failed to pre-format candidate resume ID {candidate_id} in background: {e}")


def _json_dumps(data: dict) -> str:
    import json

    return json.dumps(data)


# ── On-demand resume formatting for GET .../formatted-resume ──────────────

# ── Formatted-resume cache + data sheet ───────────────────────────────────
_HASHED_FIELDS = ("full_name", "total_experience", "pega_experience", "cdh_exp", "skills", "certifications", "current_organization",
                  "current_location", "pref_locations", "domain", "ctc", "expected_ctc", "notice_period", "linkedin", "email", "phone")


def _source_hash(candidate: dict) -> str:
    import hashlib
    import json

    return hashlib.md5(json.dumps([str(candidate.get(f) or "") for f in _HASHED_FIELDS]).encode()).hexdigest()[:12]


def _cache_is_current(cached: dict, candidate: dict) -> bool:
    """A cached formatted resume is reused unless the candidate's data changed since it was built.

    Resumes edited by hand (``_edited``) are always kept; legacy caches without a hash are kept too.
    """
    if cached.get("_edited"):
        return True
    stamp = cached.get("_source_hash")
    return stamp is None or stamp == _source_hash(candidate)


def _split(value) -> list[str]:
    return [part.strip() for part in str(value or "").split(",") if part.strip()]


def build_data_sheet(candidate: dict) -> dict:
    """The resume template filled ONLY with facts on file; everything else stays empty ("Not provided")."""
    years = candidate.get("total_experience")
    try:
        years = float(years or 0)
    except (TypeError, ValueError):
        years = 0.0
    parts = []
    if years > 0:
        parts.append(f"{years:g} years of experience")
    if candidate.get("pega_experience") and float(candidate.get("pega_experience") or 0) > 0:
        parts.append(f"{float(candidate['pega_experience']):g} years in Pega")
    organization = candidate.get("current_organization")
    return {
        "full_name": candidate.get("full_name") or "",
        "job_title": "",
        "profile_summary": ("; ".join(parts) + ".") if parts else "",
        "domain_skills": _split(candidate.get("skills"))[:6],
        "technical_skills": {},
        "education": [],
        "certifications": _split(candidate.get("certifications")),
        "work_experience": [{"company": organization, "dates": "", "role": "", "bullets": []}] if organization else [],
        "recognitions": [],
        "limited": True,   # the UI shows "only the details on file - no resume document to read"
        "_source_hash": _source_hash(candidate),
    }


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

    if cached_data and _cache_is_current(cached_data, candidate):
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

    # No readable document (e.g. imported from Excel): build a plain data sheet from what is on file.
    # The AI is NOT asked to write a resume from a few metadata fields - it would invent the rest.
    if not text:
        sheet = build_data_sheet(candidate)
        sheet["original_page_count"] = original_page_count
        try:
            with session_scope() as session:
                CandidateRepository(session).set_formatted_json(candidate_id, json.dumps(sheet))
        except Exception as e_cache:
            logger.error(f"Error caching data sheet: {e_cache}")
        return sheet

    _, llm = get_models()

    try:
        data = _invoke_resume_formatter(text, llm)
        data["original_page_count"] = original_page_count
        data["_source_hash"] = _source_hash(candidate)

        # Cache the result in DB.
        try:
            with session_scope() as session:
                CandidateRepository(session).set_formatted_json(candidate_id, json.dumps(data))
        except Exception as e_cache:
            logger.error(f"Error caching formatted resume: {e_cache}")

    except Exception as e:
        logger.error(f"Error parsing resume via LLM: {e}")
        # Never invent skills / roles when the model fails: show what is really on file.
        data = build_data_sheet(candidate)
        data["original_page_count"] = original_page_count
        return data

    return data



# ── Extraction helpers shared by import, follow-up and re-extraction ─────
class NotAResumeError(Exception):
    """The attachment is an invoice / visa paper / receipt etc., not a resume."""


class ExtractionRateLimited(Exception):
    """The AI provider rate-limited the request; callers should stop and try later."""


EXTRACTION_TEXT_LIMIT = 14000  # was 7000: long resumes lost their skills / certifications / location sections

_LOCATION_ALIASES = {
    "hyd": "Hyderabad", "hyderabad": "Hyderabad", "secunderabad": "Hyderabad", "blr": "Bangalore", "bangalore": "Bangalore",
    "bengaluru": "Bangalore", "blore": "Bangalore", "chn": "Chennai", "chennai": "Chennai", "madras": "Chennai",
    "pune": "Pune", "mumbai": "Mumbai", "bombay": "Mumbai", "delhi": "Delhi", "ncr": "Delhi NCR", "noida": "Noida",
    "gurgaon": "Gurgaon", "gurugram": "Gurgaon", "kolkata": "Kolkata", "calcutta": "Kolkata", "kochi": "Kochi",
    "cochin": "Kochi", "tvm": "Trivandrum", "trivandrum": "Trivandrum", "cbe": "Coimbatore", "coimbatore": "Coimbatore",
    "vizag": "Visakhapatnam", "vskp": "Visakhapatnam", "ahmedabad": "Ahmedabad", "jaipur": "Jaipur",
}


def normalize_location(value):
    """Expand short city codes ("hyd" -> "Hyderabad"); anything longer is returned as written."""
    text = str(value or "").strip()
    if not text:
        return text
    key = re.sub(r"[^a-z]", "", text.lower())
    return _LOCATION_ALIASES.get(key, text)


def normalize_extracted(data: dict) -> dict:
    """Clean the fields the model returned (phone digits, e-mail sanity, numbers, notice period, city codes)."""
    if data.get("phone"):
        data["phone"] = re.sub(r"[^\d+]", "", str(data["phone"]))
    if data.get("email") and "@" not in str(data["email"]):
        data["email"] = ""

    for exp_field in ("total_experience", "pega_experience", "cdh_exp"):
        if data.get(exp_field) not in (None, ""):
            try:
                match = re.search(r"\d+(\.\d+)?", str(data[exp_field]))
                # Unreadable text such as "six years" is "unknown", not "0 years" (0 would read as a fresher).
                data[exp_field] = float(match.group()) if match else None
            except Exception:
                data[exp_field] = None

    for num_field in ("notice_period", "availability_in_days"):
        if data.get(num_field) not in (None, ""):
            np_str = str(data[num_field]).lower()
            if "immediate" in np_str:
                data[num_field] = 0
            else:
                try:
                    match = re.search(r"\d+(\.\d+)?", np_str)
                    val = float(match.group()) if match else ""
                    if match and "month" in np_str:
                        val = val * 30
                    data[num_field] = int(round(val)) if match else ""
                except Exception:
                    data[num_field] = ""

    for key in ("skills", "certifications", "pref_locations"):  # the model sometimes returns a JSON list
        if isinstance(data.get(key), list):
            data[key] = ", ".join(str(item).strip() for item in data[key] if str(item).strip())
    for key in ("current_location", "pref_locations"):
        if data.get(key):
            data[key] = ", ".join(normalize_location(part) for part in str(data[key]).split(",") if part.strip())
    return data


_RESUME_WORDS = ("experience", "education", "skills", "projects", "summary", "objective", "certification", "employment",
                 "curriculum vitae", "resume", "responsibilities", "profile", "qualification")
_NOT_RESUME_FILENAME = ("invoice", "receipt", "visa", "i797", "i-797", "passport", "payslip", "bill", "statement",
                        "ticket", "boarding", "offer_letter", "offer letter", "certificate_of")


def looks_like_resume(filename: str, text: str) -> tuple[bool, str]:
    """Cheap gate so invoices, visa papers, receipts... are not imported as candidates."""
    name = (filename or "").lower()
    for token in _NOT_RESUME_FILENAME:
        if token in name:
            return False, f"File name suggests this is not a resume ('{token}')"
    body = (text or "").lower()
    if len(body.strip()) < 200:
        return True, ""  # scanned / image-only resumes have almost no text: do not reject them here
    hits = sum(1 for word in _RESUME_WORDS if word in body)
    if hits < 2:
        return False, "The document has no resume sections (experience / education / skills)"
    return True, ""


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
    ai_fallback = False
    try:
        _, llm = get_models()

        # Load document.
        if safe_name.lower().endswith(".pdf"):
            loader = SafePyMuPDFLoader(path)
        else:
            loader = Docx2txtLoader(path)
        docs = loader.load()
        text = "\n".join([d.page_content for d in docs])

        if not text.strip():
            # Image-only (scanned) file: an empty prompt only wastes tokens and yields an empty or invented
            # profile. Fail it visibly so a person can handle it.
            raise ValueError("The document has no readable text (it may be a scanned image) - needs OCR or manual entry")

        if username == "email_worker":
            is_resume, why = looks_like_resume(safe_name, text)
            if not is_resume:
                raise NotAResumeError(why)

        # Fetch custom columns for the prompt.
        with session_scope() as session:
            custom_cols = [
                (c.col_key, c.col_label, c.description) for c in CustomColumnRepository(session).list_all()
            ]

        custom_fields_str = ""
        if custom_cols:
            for col_key, col_label, desc in custom_cols:
                # Include the exact column heading / label and description to make extraction precise.
                desc_str = f"Extract data corresponding to column heading '{col_label}'"
                if desc:
                    desc_str += f" ({desc})"
                custom_fields_str += f',\n  "{col_key}": "<{desc_str}>"'

        combined_text = text[:EXTRACTION_TEXT_LIMIT]
        if email_message:
            combined_text += f"\n\n=== EMAIL MESSAGE BODY ===\n{email_message}\n=========================="

        # Rules first: read what regular expressions can read. The AI is then asked ONLY for the fields
        # that are still missing (shorter prompt, fewer tokens), and never overrides a rules-read value.
        rules_found = extract_by_rules(combined_text)
        if email_message:  # the e-mail is more recent than the resume for these three
            from_mail = extract_by_rules(email_message)
            rules_found.update({k: from_mail[k] for k in ("ctc", "expected_ctc", "notice_period") if k in from_mail})
        custom_keys = [c[0] for c in custom_cols]
        prompt_str = build_gap_prompt(combined_text, rules_found, custom_fields_str, custom_keys)

        # Retry mechanism for rate limits (was a hand-rolled loop at main.py
        # original lines 1841-1852: max_retries=5, sleep 20 + attempt*10,
        # retryable on "429" or "rate").
        try:
            if prompt_str is None:  # nothing left for the AI to fill
                ai_data = {}
            else:
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
                ai_data = parse_llm_json(resp.content, bracket="{")
        except Exception as ai_err:
            # Mailbox imports (username "email_worker") keep the old behaviour: fail, release the mail and
            # retry later, so the profile is filled properly. A person who uploaded a file gets a candidate
            # built from the rules-read fields instead of a failed row (it lands in "review"; the
            # "populate missing fields" repair fills the rest once the AI is available).
            rate_limited = "429" in str(ai_err) or "rate limit" in str(ai_err).lower()
            if username == "email_worker" or not rate_limited or not (rules_found.get("email") or rules_found.get("phone")):
                raise
            logger.warning(f"AI rate-limited for {safe_name}; creating the candidate from rules-read fields only")
            ai_data = {}
            ai_fallback = True

        # Safeguard against LLM placeholder hallucinations (e.g. John Doe).
        placeholder_names = {"john doe", "john doe's", "jane doe", "candidate name", "name of the candidate", "placeholder"}
        extracted_name = str(ai_data.get("full_name", "")).strip()
        if extracted_name.lower() in placeholder_names:
            ai_data["full_name"] = ""
            for field in ["email", "phone", "linkedin", "current_location", "pref_locations"]:
                val = str(ai_data.get(field, "")).lower()
                if "example.com" in val or "johndoe" in val or "123456" in val or "new york" in val:
                    ai_data[field] = ""

        # Rules-read values win; the AI supplies only what is still empty.
        data = dict(rules_found)
        filled_by_ai = fill_gaps(data, ai_data)
        data.setdefault("full_name", "")
        data.setdefault("source", "Resume Upload")
        logger.info(f"{safe_name}: read by rules: {', '.join(sorted(rules_found)) or '-'}; filled by AI: {', '.join(filled_by_ai) or '-'}")

        if username == "email_worker":
            data["source"] = "uploaded from mail"
        if email_message:
            data["email_message"] = email_message
        if sender_email:
            data["sender_email"] = sender_email

        normalize_extracted(data)


        # Attach to an existing candidate with the same filename (excluding the placeholder).
        external_url = file_url
        if not external_url:
            from app.services.storage import STORAGE_PROVIDER, upload_to_external_storage

            if STORAGE_PROVIDER != "local":
                url, err = upload_to_external_storage(path, safe_name)
                if not err:
                    external_url = url
                else:
                    logger.warning(f"External upload in background failed: {err}")
        file_url = external_url

        with session_scope() as session:
            candidates = CandidateRepository(session)
            match_id = candidates.find_by_filename(safe_name, exclude_id=placeholder_id)

            if match_id:
                placeholder = candidates.get_row(placeholder_id) if placeholder_id else None
                placeholder_bytes = placeholder.get("file_bytes") if placeholder else None
                placeholder_url = placeholder.get("file_url") if placeholder else None
                if placeholder_id:
                    candidates.delete(placeholder_id)  # the matched profile wins

                existing_row = candidates.get_row(match_id) or {}
                allowed_cols = candidates.column_names

                updates = {}
                for k, v in data.items():
                    if k in allowed_cols and k not in ("id", "filename", "file_bytes", "file_url"):
                        if v is not None and v != "":
                            existing_val = existing_row.get(k)
                            if (
                                username == "email_worker" or existing_val is None
                                or str(existing_val).strip() == "" or existing_val == 0.0 or existing_val == 0
                            ):
                                updates[k] = v
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

                candidates.update(match_id, updates)
                candidate_id = match_id
                logger.info(
                    f"Auto-attached uploaded resume {safe_name} to existing candidate profile ID {match_id} "
                    f"({data.get('full_name', '')})"
                )
            else:
                data["filename"] = safe_name
                data["candidate_status"] = "New"
                data["is_approved"] = is_approved
                data["created_by"] = username
                if file_url:
                    data["file_url"] = file_url
                    data["file_bytes"] = None  # stored externally: do not keep bytes in the DB
                if username == "email_worker":
                    data["source"] = "uploaded from mail"
                    if email_message:
                        data["email_message"] = email_message
                    if sender_email:
                        data["sender_email"] = sender_email
                if placeholder_id:
                    candidates.update(placeholder_id, data)
                    candidate_id = placeholder_id
                else:
                    candidate_id = candidates.insert(data)

    except NotAResumeError as not_resume:
        logger.info(f"{safe_name} is not a resume ({not_resume}) - not importing it")
        if placeholder_id:
            try:
                with session_scope() as session:
                    CandidateRepository(session).delete(placeholder_id)
            except Exception as db_err:
                logger.error(f"Could not remove placeholder for non-resume {safe_name}: {db_err}")
        return
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
            if placeholder_id:
                with session_scope() as session:
                    CandidateRepository(session).update(
                        placeholder_id,
                        {"full_name": safe_name, "candidate_status": "Error", "error_detail": error_detail},
                    )
        except Exception as db_err:
            logger.error(f"Error updating placeholder status in DB: {db_err}")
        return

    # Index the resume text for semantic search (best effort).
    vector_store.index_documents(docs, safe_name)

    # Automatically match this candidate to all active JDs in the database
    # (original main.py line 2085; `match_candidate_to_all_jobs` now lives
    # in `app.services.matching`, imported above). No try/except here,
    # matching the original's behavior of letting a match failure propagate.
    if candidate_id and is_approved == 1 and not ai_fallback:  # no more AI calls while rate-limited
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
        if placeholder_id:
            try:
                with session_scope() as session:
                    repo = CandidateRepository(session)
                    row = repo.get_row(placeholder_id)
                    if row:
                        repo.update(placeholder_id, {"record_state": derive_state(row)})
            except Exception as exc:
                logger.error(f"Could not set record state for candidate {placeholder_id}: {exc}")
    finally:
        try:
            if os.path.exists(path):
                os.remove(path)
        except Exception:
            pass


# ── Re-read a stored document and fill the fields that are still empty ────
FILLABLE_FIELDS = (
    "full_name", "email", "phone", "total_experience", "pega_experience", "cdh_exp", "skills", "certifications",
    "current_organization", "current_location", "pref_locations", "ctc", "expected_ctc", "notice_period", "linkedin",
    "domain", "tier", "certification_version", "current_client",
)
_ZERO_MEANS_EMPTY = ("total_experience", "pega_experience", "cdh_exp")


def _candidate_file_bytes(row: dict) -> Optional[bytes]:
    data = row.get("file_bytes")
    if data:
        return data.tobytes() if isinstance(data, memoryview) else bytes(data)
    filename, url = row.get("filename"), row.get("file_url")
    if not (filename and url):
        return None
    try:
        from app.services.storage import extract_gdrive_file_id, get_gdrive_file_bytes, get_s3_presigned_url, is_gdrive_url, is_s3_url

        if is_gdrive_url(url):
            drive_id = extract_gdrive_file_id(url)
            return get_gdrive_file_bytes(drive_id) if drive_id else None
        import requests

        response = requests.get((get_s3_presigned_url(filename) if is_s3_url(url) else None) or url, timeout=15)
        return response.content if response.status_code == 200 else None
    except Exception as exc:
        logger.warning(f"Could not fetch stored file for candidate {row.get('id')}: {exc}")
        return None


def _is_empty(field: str, value) -> bool:
    if value is None or str(value).strip() == "":
        return True
    if field in _ZERO_MEANS_EMPTY:
        try:
            return float(value) == 0
        except (TypeError, ValueError):
            return True
    return False


def populate_missing_fields(candidate_id: int) -> dict:
    """Read the candidate's document again and fill ONLY fields that are empty (never overwrites edits).

    Returns ``{"status": ..., "filled": [...]}`` with status ``ok`` / ``no_file`` / ``no_text`` / ``not_resume`` /
    ``missing``. Raises :class:`ExtractionRateLimited` when the AI provider says to slow down.
    """
    import tempfile

    from app.services.completeness import derive_state

    with session_scope() as session:
        row = CandidateRepository(session).get_row(candidate_id)
    if not row:
        return {"status": "missing", "filled": []}
    data = _candidate_file_bytes(row)
    if not data:
        return {"status": "no_file", "filled": []}

    suffix = os.path.splitext(row.get("filename") or "")[1].lower() or ".pdf"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
        handle.write(data)
        path = handle.name
    try:
        loader = SafePyMuPDFLoader(path) if suffix == ".pdf" else Docx2txtLoader(path)
        text = "\n".join(doc.page_content for doc in loader.load())
    except Exception as exc:
        logger.warning(f"Could not read document for candidate {candidate_id}: {exc}")
        text = ""
    finally:
        try:
            os.remove(path)
        except OSError:
            pass

    if len(text.strip()) < 80:
        return {"status": "no_text", "filled": []}  # scanned / image-only
    is_resume, _why = looks_like_resume(row.get("filename") or "", text)
    if not is_resume:
        return {"status": "not_resume", "filled": []}

    combined = text[:EXTRACTION_TEXT_LIMIT]
    if row.get("email_message"):
        combined += f"\n\n=== EMAIL MESSAGE BODY ===\n{str(row['email_message'])[:3000]}\n=========================="
    _, llm = get_models()
    prompt = EXTRACT_PROMPT.format(text=combined, custom_fields="")
    try:
        response = retry_with_backoff(
            lambda: llm.invoke([HumanMessage(content=prompt)]),
            max_retries=3, base_delay=5, retryable_markers=("429", "rate"), raise_on_exhaustion=True,
        )
    except Exception as exc:
        if "429" in str(exc) or "rate" in str(exc).lower():
            raise ExtractionRateLimited(str(exc)) from exc
        raise
    extracted = normalize_extracted(parse_llm_json(response.content, bracket="{"))

    updates: dict = {}
    for field in FILLABLE_FIELDS:
        new, old = extracted.get(field), row.get(field)
        if _is_empty(field, new):
            continue
        if field == "notice_period":
            if old is None or str(old).strip() == "":
                updates[field] = new
        elif _is_empty(field, old):
            updates[field] = new
    # "hyd" typed in an e-mail beats nothing, but the resume's full city name is better
    location = row.get("current_location")
    if location and not updates.get("current_location"):
        expanded = normalize_location(location)
        if expanded != location:
            updates["current_location"] = expanded
    if updates:
        with session_scope() as session:
            repo = CandidateRepository(session)
            repo.update(candidate_id, updates)
            repo.update(candidate_id, {"record_state": derive_state({**row, **updates})})
    return {"status": "ok", "filled": sorted(updates)}


def candidates_to_populate(limit: int = 25) -> list[int]:
    """Candidates with a stored document and at least one empty core field, oldest first."""
    from sqlalchemy import select as sa_select

    from app.models import Candidate
    from app.services.completeness import missing_fields

    with session_scope() as session:
        rows = session.execute(
            sa_select(Candidate).where(
                (Candidate.file_bytes.is_not(None)) | (Candidate.file_url.is_not(None)),
                Candidate.origin.in_(("mail", "resume")),
                Candidate.candidate_status != "Error",
            ).order_by(Candidate.id)
        ).scalars().all()
        wanted = []
        for candidate in rows:
            record = {c.name: getattr(candidate, c.name) for c in candidate.__table__.columns if c.name != "file_bytes"}
            missing = [m for m in missing_fields(record) if m not in ("Name",)]
            if missing and (record.get("record_state") or "active") != "failed":
                wanted.append(candidate.id)
            if len(wanted) >= limit:
                break
    return wanted
