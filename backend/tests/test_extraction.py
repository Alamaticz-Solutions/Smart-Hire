"""Reading documents: non-resumes are rejected, empty fields are filled from the file, nothing is overwritten."""
from __future__ import annotations

import io

import docx
import pytest
from tests.conftest import FakeChat, login, payload, register_and_approve
from tests.test_mail_worker import _reset, _run_worker  # noqa: F401  (autouse fixture reused)

LONG_RESUME = (
    "Asha Raman\nPega Senior System Architect\n\nSummary\nEight years of experience building Pega applications.\n\n"
    "Experience\nTCS 2018-2026 Pega developer working on case management and integrations. " * 4
    + "\n\nSkills\nPega PRPC, CDH, Java, SQL\n\nEducation\nB.Tech\n\nCertifications\nCSA, CSSA\n"
)


def _docx(text: str) -> bytes:
    document = docx.Document()
    for line in text.split("\n"):
        document.add_paragraph(line)
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


# ── pure helpers ──────────────────────────────────────────────────────────
def test_looks_like_resume():
    from app.services.resume_processing import looks_like_resume

    assert looks_like_resume("Invoice-0001.pdf", LONG_RESUME)[0] is False            # by file name
    assert looks_like_resume("I797B.pdf", LONG_RESUME)[0] is False
    assert looks_like_resume("asha_resume.pdf", LONG_RESUME)[0] is True
    receipt = "Invoice number FSEAPAKT-0011 Date of issue October 4 Amount due $20.00 " * 8
    assert looks_like_resume("scan001.pdf", receipt)[0] is False                      # by content
    assert looks_like_resume("scanned.pdf", "")[0] is True                            # image-only resumes are not rejected


def test_normalisation_expands_city_codes_and_flattens_lists():
    from app.services.resume_processing import normalize_extracted, normalize_location

    assert normalize_location("hyd") == "Hyderabad" and normalize_location("Nizamabad, Telangana") == "Nizamabad, Telangana"
    data = normalize_extracted({"skills": ["Pega", "CDH"], "current_location": "hyd", "phone": "+91 99-51", "notice_period": "2 months",
                                "total_experience": "4.5 yrs", "email": "not-an-email"})
    assert data["skills"] == "Pega, CDH" and data["current_location"] == "Hyderabad" and data["phone"] == "+9199" + "51"
    assert data["notice_period"] == 60 and data["total_experience"] == 4.5 and data["email"] == ""


# ── re-reading a stored document ──────────────────────────────────────────
def _add_candidate(**fields):
    from app.db.engine import session_scope
    from app.repositories import CandidateRepository

    base = {"full_name": "Asha", "filename": "asha_resume.docx", "file_bytes": _docx(LONG_RESUME), "origin": "mail",
            "candidate_status": "New"}
    with session_scope() as session:
        return CandidateRepository(session).insert({**base, **fields})


def _row(candidate_id):
    from app.db.engine import session_scope
    from app.repositories import CandidateRepository

    with session_scope() as session:
        return CandidateRepository(session).get_row(candidate_id)


EXTRACTED = ('{"full_name": "Asha Raman", "email": "asha@example.com", "skills": "Pega PRPC, CDH", "certifications": "CSA, CSSA", '
             '"current_location": "Hyderabad", "current_organization": "TCS", "total_experience": 8, "notice_period": 30}')


def test_populate_fills_only_empty_fields(client):
    from app.services.resume_processing import populate_missing_fields

    FakeChat.handler = staticmethod(lambda prompt: EXTRACTED)
    cid = _add_candidate(current_location="hyd", skills=None, current_organization="Own Edit Inc")
    result = populate_missing_fields(cid)
    row = _row(cid)
    assert result["status"] == "ok"
    assert row["skills"] == "Pega PRPC, CDH" and row["certifications"] == "CSA, CSSA" and row["email"] == "asha@example.com"
    assert row["current_organization"] == "Own Edit Inc"        # a value somebody already has is never overwritten
    assert row["notice_period"] == "30" or row["notice_period"] == 30
    assert row["full_name"] == "Asha"                           # name was present -> kept


def test_populate_expands_a_short_city_code_the_email_supplied(client):
    from app.services.resume_processing import populate_missing_fields

    FakeChat.handler = staticmethod(lambda prompt: '{"skills": "Pega"}')
    cid = _add_candidate(current_location="hyd")
    populate_missing_fields(cid)
    assert _row(cid)["current_location"] == "Hyderabad"


def test_populate_reports_why_it_cannot(client):
    from app.services.resume_processing import populate_missing_fields

    assert populate_missing_fields(_add_candidate(file_bytes=None))["status"] == "no_file"
    assert populate_missing_fields(_add_candidate(filename="invoice_1.docx"))["status"] == "not_resume"
    assert populate_missing_fields(999999)["status"] == "missing"


def test_populate_stops_on_rate_limit(client, monkeypatch):
    import app.services.retry as retry
    from app.services.resume_processing import ExtractionRateLimited, populate_missing_fields

    monkeypatch.setattr(retry.time, "sleep", lambda *_: None)

    def limited(prompt):
        raise RuntimeError("Error code: 429 - rate limit reached")

    FakeChat.handler = staticmethod(limited)
    with pytest.raises(ExtractionRateLimited):
        populate_missing_fields(_add_candidate())


def test_candidates_to_populate_picks_documents_with_gaps(client):
    from app.services.resume_processing import candidates_to_populate

    thin = _add_candidate(full_name="Thin")
    _add_candidate(full_name="Excel Person", file_bytes=None, origin="excel")
    full = _add_candidate(full_name="Full", email="f@x.com", phone="1", total_experience=5, skills="Pega",
                          current_location="Pune", current_organization="X", notice_period=30)
    ids = candidates_to_populate(10)
    assert thin in ids and full not in ids and len(ids) == 1


def test_re_extract_endpoints(client, admin):
    FakeChat.handler = staticmethod(lambda prompt: EXTRACTED)
    cid = _add_candidate()
    result = payload(client.post(f"/api/candidates/{cid}/re-extract", headers=admin))
    assert "skills" in result["filled"]
    assert client.post(f"/api/candidates/{_add_candidate(file_bytes=None)}/re-extract", headers=admin).status_code == 400

    other = register_and_approve(client, admin, "plainperson")
    assert client.post("/api/candidates/populate-missing", headers=other).status_code == 403
    queued = payload(client.post("/api/candidates/populate-missing", headers=admin))
    assert queued["queued"] >= 0


# ── import path ───────────────────────────────────────────────────────────
def test_invoice_attachment_is_logged_not_imported(client, monkeypatch):
    _run_worker(monkeypatch, filename="Invoice-0001.docx")
    assert payload(client.get("/api/candidates", headers=login(client))) == []
    row = payload(client.get("/api/mail/messages", headers=login(client)))["items"][0]
    assert row["outcome"] == "no_resume" and "not a resume" in row["reason"]


# ── resume template ───────────────────────────────────────────────────────
def _formatter(title):
    import json

    return staticmethod(lambda prompt: json.dumps({"full_name": "Asha", "job_title": title, "profile_summary": "s", "domain_skills": ["Pega"],
                                                  "technical_skills": {}, "education": [], "certifications": [], "work_experience": [], "recognitions": []})
                        if "expert resume formatter" in prompt else "{}")


def _formatted(client, admin, cid, **params):
    return payload(client.get(f"/api/candidates/{cid}/formatted-resume", headers=admin, params=params))


def test_template_without_a_document_shows_only_what_is_on_file(client, admin):
    FakeChat.handler = staticmethod(lambda prompt: pytest.fail("the AI must not be asked to write a resume from thin metadata"))
    cid = _add_candidate(file_bytes=None, filename="", origin="excel", full_name="Excel Person", skills="Pega, CDH",
                         current_organization="Acme", total_experience=6)
    data = _formatted(client, admin, cid)
    assert data["limited"] is True
    assert data["work_experience"] == [{"company": "Acme", "dates": "", "role": "", "bullets": []}]
    assert data["domain_skills"] == ["Pega", "CDH"] and data["technical_skills"] == {} and data["job_title"] == ""
    assert "Java" not in str(data) and "Git" not in str(data)       # nothing invented


def test_template_does_not_invent_content_when_the_ai_fails(client, admin):
    def broken(prompt):
        raise RuntimeError("model exploded")

    FakeChat.handler = staticmethod(broken)
    data = _formatted(client, admin, _add_candidate(skills="Pega"))
    assert data["limited"] is True and "Java" not in str(data) and "Pega Developer" not in str(data)


def test_template_is_rebuilt_when_the_candidate_changes_but_hand_edits_are_kept(client, admin):
    FakeChat.handler = _formatter("First")
    cid = _add_candidate(skills="Pega")
    assert _formatted(client, admin, cid)["job_title"] == "First"

    FakeChat.handler = _formatter("Second")
    assert _formatted(client, admin, cid)["job_title"] == "First"                      # nothing changed -> cached
    assert client.put(f"/api/candidates/{cid}", headers=admin, json={"skills": "Pega, CDH, Java"}).status_code == 200
    assert _formatted(client, admin, cid)["job_title"] == "Second"                     # data changed -> rebuilt

    edited = {**_formatted(client, admin, cid), "job_title": "Typed by a person"}
    assert client.put(f"/api/candidates/{cid}/formatted-resume", headers=admin, json=edited).status_code == 200
    client.put(f"/api/candidates/{cid}", headers=admin, json={"skills": "Something else"})
    FakeChat.handler = _formatter("Third")
    assert _formatted(client, admin, cid)["job_title"] == "Typed by a person"          # a hand edit survives
    assert _formatted(client, admin, cid, refresh="true")["job_title"] == "Third"      # unless Regenerate is pressed


def test_normalisation_numbers_are_not_silently_zeroed():
    from app.services.resume_processing import normalize_extracted

    assert normalize_extracted({"notice_period": "1.5 months"})["notice_period"] == 45
    assert normalize_extracted({"notice_period": "2 months"})["notice_period"] == 60
    assert normalize_extracted({"notice_period": "Immediate"})["notice_period"] == 0
    assert normalize_extracted({"total_experience": "4.5 yrs"})["total_experience"] == 4.5
    # unreadable text is "unknown", never "0 years"
    assert normalize_extracted({"total_experience": "six years"})["total_experience"] is None


# ── rules-first reading (no AI) ───────────────────────────────────────────
RULES_RESUME = """Priya Venkatesan
Senior Pega Developer
Email: priya.venkatesan@example.org | Mobile: +91 98765 43210
LinkedIn: linkedin.com/in/priya-venkatesan
Location: Hyderabad
Summary: 7 years of experience. Skills: Pega PRPC, Java, SQL, Kafka
Certifications: Pega CSA 8.6, CSSA
Experience: Infosys 2019-2026. Education: B.Tech. Projects: banking case management.
Current CTC: 14 LPA  Expected CTC: 18 LPA  Notice Period: 2 months
"""


def test_rules_extract_reads_structured_fields_without_ai():
    from app.services.rules_extract import extract_by_rules

    got = extract_by_rules(RULES_RESUME)
    assert got["email"] == "priya.venkatesan@example.org"
    assert got["phone"] == "+919876543210"
    assert got["linkedin"] == "https://www.linkedin.com/in/priya-venkatesan"
    assert got["notice_period"] == 60
    assert got["ctc"] == "14 LPA" and got["expected_ctc"] == "18 LPA"
    assert got["certifications"] == "CSA, CSSA"
    assert "Pega PRPC" in got["skills"] and "Kafka" in got["skills"]
    assert got["current_location"] == "Hyderabad" and got["full_name"] == "Priya Venkatesan"
    assert got["total_experience"] == 7.0
    # Pega / CDH years are never guessed by rules
    assert "pega_experience" not in got and "cdh_exp" not in got


def test_rules_extract_does_not_invent_values():
    from app.services.rules_extract import extract_by_rules, fill_gaps

    assert extract_by_rules("Fresh graduate. Projects: weather app. Education: B.E. Skills and Experience sections follow.") == {}
    assert "phone" not in extract_by_rules("Worked 2018-2026 at TCS, project code 20182026")
    data = {"email": "ai@x.com", "skills": ""}
    fill_gaps(data, {"email": "rules@x.com", "skills": "Pega"})
    assert data == {"email": "ai@x.com", "skills": "Pega"}      # AI value kept, empty one filled


def test_scanned_pdf_fails_visibly_instead_of_creating_an_empty_profile(client, admin):
    import fitz

    page_doc = fitz.open()
    page = page_doc.new_page()
    page.insert_text((50, 80), "scan", fontsize=20)
    pix = page.get_pixmap(dpi=40)
    image_pdf = fitz.open()
    target = image_pdf.new_page()
    target.insert_image(target.rect, pixmap=pix)
    FakeChat.prompts = []
    client.post("/api/upload", headers=admin, files={"file": ("scan.pdf", image_pdf.tobytes(), "application/pdf")})
    row = payload(client.get("/api/candidates", headers=admin))[0]
    assert row["candidate_status"] == "Error" and "no readable text" in row["error_detail"]
    assert FakeChat.prompts == []                                  # no tokens spent on an empty document


def test_manual_upload_survives_an_ai_rate_limit_but_mail_import_does_not(client, admin, monkeypatch):
    import app.services.retry as retry

    monkeypatch.setattr(retry.time, "sleep", lambda *_: None)

    def limited(prompt):
        raise RuntimeError("Error code: 429 - rate limit reached")

    FakeChat.handler = staticmethod(limited)
    resp = client.post("/api/upload", headers=admin, files={"file": ("priya.docx", _docx(RULES_RESUME))})
    assert resp.status_code == 200
    row = payload(client.get("/api/candidates", headers=admin))[0]
    assert row["candidate_status"] == "New" and row["email"] == "priya.venkatesan@example.org"
    assert not row["current_organization"]                         # the employer needs the AI: left blank, never guessed
    assert row["notice_period"] in (60, "60")

    from app.services.resume_processing import process_resume_logic
    from app.db.engine import session_scope
    from app.repositories import CandidateRepository
    import os, tempfile

    path = os.path.join(tempfile.mkdtemp(), "mail.docx")
    open(path, "wb").write(_docx(RULES_RESUME))
    with session_scope() as session:
        placeholder = CandidateRepository(session).insert({"full_name": "x", "filename": "mail.docx", "candidate_status": "Processing"})
    process_resume_logic("mail.docx", path, 1, "email_worker", None, None, None, placeholder)
    assert _row(placeholder)["candidate_status"] == "Error"        # mail keeps fail -> release -> retry later


def test_ai_is_asked_only_for_fields_the_rules_could_not_read(client, admin):
    from app.services.rules_extract import extract_by_rules
    from app.services.resume_processing import build_gap_prompt

    found = extract_by_rules(RULES_RESUME)
    prompt = build_gap_prompt(RULES_RESUME, found)
    for read_by_rules in ("email", "phone", "linkedin", "ctc", "expected_ctc", "certifications", "skills", "notice_period"):
        assert f'"{read_by_rules}":' not in prompt
    for ask_ai in ("current_organization", "pega_experience", "cdh_exp", "domain", "current_client"):
        assert f'"{ask_ai}":' in prompt
    assert len(prompt) < len(build_gap_prompt(RULES_RESUME, {}))          # shorter than asking for everything

    # end to end: the AI value for a rules-read field is ignored, an AI value for a missing one is used
    FakeChat.prompts = []
    FakeChat.handler = staticmethod(lambda p: '{"email": "wrong@ai.com", "current_organization": "Infosys", "pega_experience": 5}')
    client.post("/api/upload", headers=admin, files={"file": ("priya.docx", _docx(RULES_RESUME))})
    row = payload(client.get("/api/candidates", headers=admin))[0]
    assert row["email"] == "priya.venkatesan@example.org"
    assert row["current_organization"] == "Infosys" and row["pega_experience"] == 5
    assert '"email":' not in FakeChat.prompts[0].split("Resume and Email Content:")[0]
