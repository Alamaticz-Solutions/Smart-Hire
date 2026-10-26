"""Candidate CRUD, custom columns, formatted resume and DOCX export."""
import io
import json
import os
import re
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import UPLOAD_DIR
from app.core.logging import get_logger
from app.core.responses import EnvelopeRoute
from app.db.engine import get_session
from app.dependencies import assert_owns_or_admin, require_approved_user
from app.models import MATCH_RELATED_FIELDS
from app.repositories import (
    ActivityRepository,
    CandidateRepository,
    CustomColumnRepository,
    JobCandidateRepository,
    MaskedKeywordRepository,
    ProcessedEmailRepository,
)
from app.services import columns as column_service
from app.services import vector_store
from app.services.auth import apply_user_hidden_fields, get_user_info, is_admin_or_hr, is_user_approved
from app.services.matching import match_candidate_to_all_jobs
from app.services.resume_processing import format_candidate_resume, process_resume

logger = get_logger(__name__)

router = APIRouter(route_class=EnvelopeRoute)

HIDDEN = "[HIDDEN]"
INTEGER_FIELDS = ("notice_period", "availability_in_days")
FLOAT_FIELDS = ("total_experience", "pega_experience", "cdh_exp")

#: Built-in fields an editor may change (custom columns are added dynamically).
EDITABLE_CANDIDATE_FIELDS = frozenset({
    "full_name", "candidate_status", "total_experience", "pega_experience",
    "skills", "certifications", "ctc", "notice_period", "current_organization",
    "email", "phone", "linkedin", "source", "cdh_exp", "expected_ctc",
    "percentage_hike", "candidate_interview_status", "availability_in_days",
    "current_location", "pref_locations", "current_client", "domain", "tier",
    "certification_version", "sender_email", "is_qualified", "is_approved",
})

BASE_COLUMNS = [
    {"col_key": "full_name", "col_label": "Name"},
    {"col_key": "candidate_status", "col_label": "Candidate Status"},
    {"col_key": "source", "col_label": "Source"},
    {"col_key": "mail_received_at", "col_label": "Mail Received"},
    {"col_key": "total_experience", "col_label": "Total Exp"},
    {"col_key": "pega_experience", "col_label": "Pega Exp"},
    {"col_key": "cdh_exp", "col_label": "CDH Exp"},
    {"col_key": "ctc", "col_label": "Current CTC"},
    {"col_key": "expected_ctc", "col_label": "Exp CTC"},
    {"col_key": "percentage_hike", "col_label": "Percentage Hike"},
    {"col_key": "candidate_interview_status", "col_label": "Candidate Interview Status"},
    {"col_key": "availability_in_days", "col_label": "Availability in Days"},
    {"col_key": "notice_period", "col_label": "Notice Period"},
    {"col_key": "phone", "col_label": "Phone No"},
    {"col_key": "email", "col_label": "Email"},
    {"col_key": "linkedin", "col_label": "LinkedIn"},
    {"col_key": "current_location", "col_label": "Current Location"},
    {"col_key": "pref_locations", "col_label": "Pref Locations"},
    {"col_key": "current_organization", "col_label": "Current Employment"},
    {"col_key": "current_client", "col_label": "Current Client"},
    {"col_key": "domain", "col_label": "Domain"},
    {"col_key": "tier", "col_label": "Tier (Tier1 Tier2 Tier3)"},
    {"col_key": "certification_version", "col_label": "Certification Version"},
    {"col_key": "skills", "col_label": "Skills"},
    {"col_key": "certifications", "col_label": "Certifications"},
    {"col_key": "notescomments", "col_label": "Notes / Comments"},
]


# ── schemas ────────────────────────────────────────────────────────────────
class CustomColumn(BaseModel):
    col_key: str
    col_label: str
    description: str


class BulkDeleteRequest(BaseModel):
    ids: list[int]


# ── masking helpers ────────────────────────────────────────────────────────
_PATTERN_CACHE: dict = {}


def mask_text_with_keywords(text: str, keywords: list) -> str:
    if not text or not keywords:
        return text
    result = str(text)
    for keyword in keywords:
        keyword = keyword.strip()
        if not keyword:
            continue
        if keyword not in _PATTERN_CACHE:
            _PATTERN_CACHE[keyword] = re.compile(re.escape(keyword), re.IGNORECASE)
        result = _PATTERN_CACHE[keyword].sub("****", result)
    return result


def mask_candidate_record(candidate: dict, keywords: list) -> dict:
    return {
        k: (mask_text_with_keywords(v, keywords) if isinstance(v, str) else v) for k, v in candidate.items()
    }


def _coerce_numbers(values: dict, *, strict_status: bool) -> Optional[JSONResponse]:
    """Validate numeric fields in place; returns an error response on failure."""
    for column in INTEGER_FIELDS:
        if column in values and values[column] != "":
            try:
                values[column] = int(float(values[column]))
            except (ValueError, TypeError):
                return _bad(f"{column} must be an integer", strict_status)
    for column in FLOAT_FIELDS:
        if column in values and values[column] != "":
            try:
                values[column] = float(values[column])
            except (ValueError, TypeError):
                return _bad(f"{column} must be a number", strict_status)
    return None


def _bad(message: str, as_exception: bool):
    if as_exception:
        raise HTTPException(status_code=400, detail=message)
    return JSONResponse(status_code=400, content={"detail": message})


def _get_candidate_or_404(session: Session, candidate_id: int) -> dict:
    row = CandidateRepository(session).get_row(candidate_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return row


def _purge_candidate(session: Session, candidate_id: int, filename: Optional[str]) -> None:
    """Delete a candidate, its embeddings, and stop its source e-mail re-importing."""
    if filename:
        vector_store.delete_by_source(filename)
        if filename.startswith("mail_"):
            ProcessedEmailRepository(session).mark(f"deleted_cand_{candidate_id}")
    CandidateRepository(session).delete(candidate_id)


# ── candidates ─────────────────────────────────────────────────────────────
@router.get("/api/candidates")
def list_candidates(
    request: Request,
    limit: Optional[int] = None,
    offset: int = 0,
    session: Session = Depends(get_session),
):
    username = request.headers.get("x-user-username")

    is_admin_role = is_external = staff = False
    if username:
        info = get_user_info(username)
        if info:
            is_external = info["is_external"] == 1
            staff = info["is_admin"] == 1 or info["is_hr"] == 1
            is_admin_role = info["is_admin"] == 1 or info["role"] == "admin" or staff
            if is_external:
                raise HTTPException(status_code=403, detail="Forbidden")

    if not is_user_approved(username):
        return {"items": [], "total": 0} if limit is not None else []

    owner = None if (is_admin_role or staff or not username) else username
    candidates = CandidateRepository(session)
    rows = candidates.list_rows(owner, limit=limit, offset=offset)

    for row in rows:
        row.pop("file_bytes", None)
        for key, value in row.items():
            if value is None:
                row[key] = ""

    if not staff:
        keywords = MaskedKeywordRepository(session).list_all()
        for row in rows:
            row["certifications"] = HIDDEN
        rows = [mask_candidate_record(row, keywords) for row in rows]
    rows = apply_user_hidden_fields(rows, username)

    if limit is not None:
        return {"items": rows, "total": candidates.count(owner)}
    return rows


@router.post("/api/candidates")
def add_candidate_manually(body: dict, username: str = Depends(require_approved_user), session: Session = Depends(get_session)):
    candidates = CandidateRepository(session)
    valid = candidates.column_names - {"id", "timestamp"}
    record = {k: v for k, v in body.items() if k in valid}
    record["source"] = record.get("source") or "Manual Entry"
    record["candidate_status"] = record.get("candidate_status") or "New"
    record["created_by"] = username or "admin"

    if not record.get("full_name"):
        raise HTTPException(status_code=400, detail="Candidate Name is required")
    _coerce_numbers(record, strict_status=True)

    candidates.insert(record)
    ActivityRepository(session).add(username or "unknown", f"manually added candidate '{record.get('full_name')}'")
    return {"status": "success", "message": "Candidate added successfully"}


@router.put("/api/candidates/{candidate_id}")
async def update_candidate(
    candidate_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
    username: str = Depends(require_approved_user),
    session: Session = Depends(get_session),
):
    body = await request.json()
    row = _get_candidate_or_404(session, candidate_id)
    assert_owns_or_admin(row.get("created_by"), username)

    editable = EDITABLE_CANDIDATE_FIELDS | {c.col_key for c in CustomColumnRepository(session).list_all()}
    updates = {k: v for k, v in body.items() if k in editable and v is not None and v != HIDDEN}

    failure = _coerce_numbers(updates, strict_status=False)
    if failure is not None:
        return failure
    if not updates:
        return {"status": "no changes"}

    candidates = CandidateRepository(session)
    candidates.update(candidate_id, updates)
    ActivityRepository(session).add(
        username or "unknown", f"updated candidate '{candidates.get_name(candidate_id)}' details"
    )

    if MATCH_RELATED_FIELDS & set(updates):
        session.commit()  # the background task must see the new values
        background_tasks.add_task(match_candidate_to_all_jobs, candidate_id)
    return {"status": "updated"}


@router.delete("/api/candidates/{candidate_id}")
def delete_candidate(
    candidate_id: int, username: str = Depends(require_approved_user), session: Session = Depends(get_session)
):
    row = _get_candidate_or_404(session, candidate_id)
    assert_owns_or_admin(row.get("created_by"), username)
    _purge_candidate(session, candidate_id, row.get("filename"))
    ActivityRepository(session).add(username or "unknown", f"deleted candidate '{row.get('full_name')}'")
    return {"status": "deleted"}


@router.post("/api/candidates/{candidate_id}/retry")
def retry_candidate_processing(
    candidate_id: int,
    background_tasks: BackgroundTasks,
    username: str = Depends(require_approved_user),
    session: Session = Depends(get_session),
):
    """Re-run processing for a candidate stuck in the "Error" state."""
    row = _get_candidate_or_404(session, candidate_id)
    assert_owns_or_admin(row.get("created_by"), username)

    filename, status, file_bytes = row.get("filename"), row.get("candidate_status"), row.get("file_bytes")
    if status != "Error":
        raise HTTPException(status_code=400, detail="Only candidates in the Error state can be retried.")
    if not file_bytes:
        raise HTTPException(status_code=400, detail="The original file is no longer available - please re-upload.")
    if isinstance(file_bytes, memoryview):
        file_bytes = file_bytes.tobytes()

    CandidateRepository(session).update(
        candidate_id,
        {"full_name": f"⏳ Retrying: {filename}", "candidate_status": "Processing", "error_detail": None},
    )
    path = os.path.join(UPLOAD_DIR, filename)
    with open(path, "wb") as handle:
        handle.write(file_bytes)

    ActivityRepository(session).add(username or "unknown", f"retried processing for '{filename}'")
    session.commit()
    background_tasks.add_task(process_resume, filename, path, 1, username or "unknown", None, None, None, candidate_id)
    return {"status": "retrying"}


@router.post("/api/candidates/bulk-delete")
def bulk_delete_candidates(
    req: BulkDeleteRequest, username: str = Depends(require_approved_user), session: Session = Depends(get_session)
):
    candidates = CandidateRepository(session)
    staff = is_admin_or_hr(username)
    deleted: list[str] = []
    for candidate_id in req.ids:
        row = candidates.get_row(candidate_id)
        if not row:
            continue
        owner = row.get("created_by")
        if not staff and owner and owner.lower() != (username or "").lower():
            continue  # silently skip rows the caller may not delete
        _purge_candidate(session, candidate_id, row.get("filename"))
        deleted.append(row.get("full_name") or f"ID {candidate_id}")

    if deleted:
        ActivityRepository(session).add(
            username or "unknown", f"bulk deleted {len(deleted)} candidates: {', '.join(deleted[:5])}"
        )
    return {"status": "deleted", "count": len(deleted)}


@router.get("/api/candidates/{candidate_id}/jobs")
def get_candidate_jobs(
    candidate_id: int, username: str = Depends(require_approved_user), session: Session = Depends(get_session)
):
    row = _get_candidate_or_404(session, candidate_id)
    assert_owns_or_admin(row.get("created_by"), username)
    return JobCandidateRepository(session).jobs_for_candidate(candidate_id)


@router.get("/api/candidates/{candidate_id}/formatted-resume")
def get_formatted_resume_data(
    candidate_id: int, username: str = Depends(require_approved_user), session: Session = Depends(get_session)
):
    candidate = _get_candidate_or_404(session, candidate_id)
    assert_owns_or_admin(candidate.get("created_by"), username)
    session.commit()  # release the transaction: formatting may call the LLM for seconds
    return format_candidate_resume(candidate, candidate_id)


@router.put("/api/candidates/{candidate_id}/formatted-resume")
async def update_formatted_resume_data(
    candidate_id: int,
    request: Request,
    username: str = Depends(require_approved_user),
    session: Session = Depends(get_session),
):
    body = await request.json()
    row = _get_candidate_or_404(session, candidate_id)
    assert_owns_or_admin(row.get("created_by"), username)

    candidates = CandidateRepository(session)
    candidates.set_formatted_json(candidate_id, json.dumps(body))
    ActivityRepository(session).add(
        username or "unknown", f"updated formatted resume for candidate '{candidates.get_name(candidate_id)}'"
    )
    return {"status": "updated"}


@router.get("/api/candidates/{candidate_id}/export-docx")
def export_candidate_docx(
    candidate_id: int, username: str = Depends(require_approved_user), session: Session = Depends(get_session)
):
    try:
        from docx import Document
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from docx.shared import Pt
    except ImportError:
        raise HTTPException(status_code=500, detail="python-docx library not installed. Please try again in a few seconds.")

    candidate = _get_candidate_or_404(session, candidate_id)
    assert_owns_or_admin(candidate.get("created_by"), username)

    document = Document()
    title = document.add_heading(candidate.get("full_name") or "Candidate Resume", 0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER

    contact = [str(candidate[k]) for k in ("email", "phone", "linkedin", "current_location") if candidate.get(k)]
    if contact:
        paragraph = document.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraph.add_run(" | ".join(contact)).font.size = Pt(10)

    document.add_heading("Summary", level=1)
    document.add_paragraph(f"Total Experience: {candidate.get('total_experience') or 'N/A'}")
    if candidate.get("pega_experience"):
        document.add_paragraph(f"Pega Experience: {candidate['pega_experience']}")
    for heading, key in (("Skills", "skills"), ("Certifications", "certifications")):
        if candidate.get(key):
            document.add_heading(heading, level=1)
            document.add_paragraph(str(candidate[key]))

    document.add_heading("Additional Details", level=1)
    for label, key in (
        ("Current Organization", "current_organization"), ("Current CTC", "ctc"),
        ("Expected CTC", "expected_ctc"), ("Notice Period", "notice_period"),
    ):
        if candidate.get(key):
            document.add_paragraph(f"{label}: {candidate[key]}")

    buffer = io.BytesIO()
    document.save(buffer)
    buffer.seek(0)
    safe_name = str(candidate.get("full_name") or "Candidate").replace(" ", "_")
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f'attachment; filename="Alamaticz_Resume_{safe_name}.docx"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


# ── custom columns ─────────────────────────────────────────────────────────
@router.get("/api/columns")
def get_columns(username: str = Depends(require_approved_user), session: Session = Depends(get_session)):
    custom = [{"col_key": c.col_key, "col_label": c.col_label} for c in CustomColumnRepository(session).list_all()]
    return {"base": BASE_COLUMNS, "custom": custom}


@router.post("/api/columns")
def add_column(
    col: CustomColumn,
    request: Request,
    username: str = Depends(require_approved_user),
    session: Session = Depends(get_session),
):
    try:
        key = column_service.add_custom_column(session, col.col_key, col.col_label, col.description)
    except column_service.ColumnExistsError:
        raise HTTPException(status_code=400, detail="Column already exists")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"status": "added", "col_key": key}


@router.delete("/api/columns/{col_key}")
def delete_column(
    col_key: str,
    request: Request,
    username: str = Depends(require_approved_user),
    session: Session = Depends(get_session),
):
    column_service.remove_custom_column(session, col_key)
    return {"status": "deleted"}
