"""Resume/Excel upload entry point and JD document parsing endpoints.

Moved verbatim (same paths/methods/logic) from app/main.py:
  - POST /api/upload               (main.py ~2503-2540)
  - POST /api/jobs/parse-document  (main.py ~2543-2667)

Both routes hand off the actual resume/Excel parsing work to
app.services.resume_processing.process_resume and
app.services.excel_import.process_excel_file (main.py ~2478-2540 originally).

`POST /api/jobs/parse-document` does blocking file I/O + PyMuPDF parsing + a
synchronous LLM call, all inside an `async def` route, exactly as in the
original. That is a pre-existing performance characteristic, not something
introduced or fixed here -- left untouched per the refactor scope (async/sync
behavior changes are explicitly out of scope for this phase).

The hand-rolled `for attempt in range(max_retries): ... time.sleep(3) ...`
retry loop and the inline ```json fence-stripping / bracket-slicing JSON
parse that were duplicated inline in the original `parse_jd_document` body
have been swapped for the shared `retry_with_backoff` / `parse_llm_json`
helpers from Phase 1 (app.services.retry / app.services.json_parsing) --
same retry count (3), same flat 3s delay, same "429" retry marker, same
JSON-extraction behavior.
"""

import os
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from langchain_community.document_loaders import Docx2txtLoader
from langchain_core.messages import HumanMessage

from app.core.config import UPLOAD_DIR
from app.core.logging import get_logger
from app.db.session import get_db_connection
from app.dependencies import require_approved_user
from app.services.json_parsing import parse_llm_json
from app.services.retry import retry_with_backoff

from app.services.ai_clients import get_models
from app.services.resume_processing import SafePyMuPDFLoader, log_candidate, process_resume
from app.services.excel_import import process_excel_file

logger = get_logger(__name__)

router = APIRouter()


def _log_activity_db(username: str, action: str) -> None:
    """Insert one row into activity_logs. Mirrors main.py's log_activity_db."""
    if not username:
        username = "unknown"
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("INSERT INTO activity_logs (username, action) VALUES (?, ?)", (username, action))
            conn.commit()
    except Exception as e:
        logger.error(f"Error logging activity: {e}")


# ── Upload & Extract ────────────────────────────────────────────────────────────
@router.post("/api/upload")
async def upload_resume(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    username: str = Depends(require_approved_user),
):
    is_approved = 1

    # Save file
    safe_name = f"{uuid.uuid4().hex}_{file.filename}"
    path = os.path.join(UPLOAD_DIR, safe_name)
    with open(path, "wb") as f:
        content = await file.read()
        f.write(content)

    ext = os.path.splitext(safe_name.lower())[1]
    if ext in [".xlsx", ".xls", ".csv"]:
        _log_activity_db(username or "unknown", f"uploaded candidate excel sheet '{safe_name}'")
        background_tasks.add_task(process_excel_file, safe_name, path, username or "unknown")
        return {"status": "processing", "message": "Excel sheet uploaded and is processing in the background."}
    else:
        # Placeholder while processing in background
        # Note: We save file_bytes temporarily. The background task will upload it
        # to external storage (if configured) and clear file_bytes to save space.
        placeholder_id = log_candidate(
            {
                "filename": safe_name,
                "full_name": f"⏳ Processing: {safe_name}",
                "is_approved": is_approved,
                "created_by": username or "unknown",
                "file_bytes": content,
                "file_url": None,
            }
        )

        # Process asynchronously
        _log_activity_db(username or "unknown", f"uploaded resume '{safe_name}'")
        background_tasks.add_task(process_resume, safe_name, path, is_approved, username or "unknown", None, None, None, placeholder_id)

        return {"status": "processing", "message": "Resume uploaded and is processing in the background."}


@router.post("/api/jobs/parse-document")
async def parse_jd_document(file: UploadFile = File(...), username: str = Depends(require_approved_user)):
    # Save file temporarily in a temp folder under UPLOAD_DIR
    safe_name = file.filename
    temp_dir = os.path.join(UPLOAD_DIR, "temp_jds")
    os.makedirs(temp_dir, exist_ok=True)
    path = os.path.join(temp_dir, safe_name)

    try:
        with open(path, "wb") as f:
            content = await file.read()
            f.write(content)

        ext = os.path.splitext(safe_name.lower())[1]
        text = ""

        if ext == ".pdf":
            try:
                loader = SafePyMuPDFLoader(path)
                docs = loader.load()
                text = "\n".join([d.page_content for d in docs])
            except Exception as pdf_err:
                raise HTTPException(status_code=400, detail=f"Failed to parse PDF document: {str(pdf_err)}")
        elif ext in [".docx", ".doc"]:
            try:
                loader = Docx2txtLoader(path)
                docs = loader.load()
                text = "\n".join([d.page_content for d in docs])
            except Exception as docx_err:
                raise HTTPException(status_code=400, detail=f"Failed to parse Word document: {str(docx_err)}")
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Please upload a PDF or Word (.docx) document.")

        if not text.strip():
            raise HTTPException(status_code=400, detail="The uploaded document appears to be empty or unreadable.")

        # Extract fields using LLM
        _, llm = get_models()

        prompt = f"""You are an expert recruitment assistant. Extract details from the following Job Description document and structure them into the exact JSON template provided.
Make sure to fill all fields based on the actual document. If a field is not present or mentioned in the document, use an empty string "" (or default appropriately).

Template Structure:
{{
  "title": "<The job title, e.g., 'Pega CSSA', 'Pega Business Analyst'>",
  "description": "<The complete or summarized job description text>",
  "client_name": "<Client name if mentioned, else empty string>",
  "client_phone": "<Client phone number if mentioned, else empty string>",
  "contact_name": "<Client contact name if mentioned, else empty string>",
  "account_manager": "<Account manager if mentioned, else empty string>",
  "assigned_recruiter": "<Assigned recruiter if mentioned, else empty string>",
  "target_date": "<Target date formatted as YYYY-MM-DD if mentioned, else empty string>",
  "job_type": "<Must be one of: 'Full time', 'Part time', 'Contract', 'Temporary'. Map appropriately. Default to 'Full time' if not specified>",
  "job_status": "<Always set to 'In-progress'>",
  "work_experience": "<Must be exactly one of: 'None', 'Fresher', '1-3 years', '3-5 years', '5+ years'. Estimate/map from the requirements>",
  "industry": "<Must be exactly one of: 'None', 'IT', 'Finance', 'Healthcare', 'Telecom', 'Other'. Map appropriately>",
  "salary": "<Salary package or CTC budget if mentioned, e.g., '10 LPA', '15 - 20 LPA', else empty string>",
  "required_skills": "<Comma-separated list of required technical skills, e.g., 'Pega, CSSA, Java'>"
}}

Rules:
1. Return ONLY the valid JSON block. No explanation, no markdown backticks, no markdown blocks. Just raw valid JSON.
2. For multiple-choice fields (job_type, work_experience, industry), you MUST choose one of the allowed options. If you cannot determine, use the default.
3. Be as accurate and thorough as possible based on the text.

Job Description Text:
{text[:8000]}

JSON:"""

        # Same retry contract as the original inline loop: 3 attempts, flat 3s
        # delay, retry only on a "429" (rate limit) error, re-raise otherwise.
        resp = retry_with_backoff(lambda: llm.invoke([HumanMessage(content=prompt)]), max_retries=3, base_delay=3.0)

        if resp is None:
            raise Exception("Failed to get response from AI model")

        data = parse_llm_json(resp.content)

        # Clean up temporary file
        try:
            if os.path.exists(path):
                os.remove(path)
        except Exception:
            pass

        return data

    except HTTPException:
        try:
            if os.path.exists(path):
                os.remove(path)
        except Exception:
            pass
        raise
    except Exception as e:
        try:
            if os.path.exists(path):
                os.remove(path)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Failed to parse and extract JD: {str(e)}")
