"""Resume preview inside the profile: which candidates have a file, and what the preview shows."""
from __future__ import annotations

import fitz
from tests.conftest import FakeChat, login, payload
from tests.test_extraction import RULES_RESUME, _docx
from tests.test_mail_worker import _reset, _run_worker  # noqa: F401  (autouse fixture reused)


def _upload(client, headers, name, content):
    FakeChat.handler = staticmethod(lambda prompt: '{"current_organization": "Infosys"}')
    assert client.post("/api/upload", headers=headers, files={"file": (name, content)}).status_code == 200


def _pdf_bytes():
    doc = fitz.open()
    doc.new_page().insert_textbox(fitz.Rect(50, 50, 545, 790), RULES_RESUME, fontsize=10)
    return doc.tobytes()


def _rows(client, headers):
    return {r["filename"].split("_", 1)[-1] if r["filename"] else None: r for r in payload(client.get("/api/candidates", headers=headers))}


def test_list_tells_which_candidates_have_a_resume(client):
    headers = login(client)
    _upload(client, headers, "priya.docx", _docx(RULES_RESUME))
    client.post("/api/candidates", headers=headers, json={"full_name": "Manual Person"})
    rows = payload(client.get("/api/candidates", headers=headers))
    by_name = {r["full_name"]: r for r in rows}
    assert by_name["Priya Venkatesan"]["has_resume"] == 1
    assert by_name["Manual Person"]["has_resume"] == 0
    assert "file_bytes" not in rows[0]                       # the file itself is never in the list


def test_docx_resume_is_rendered_as_html_for_the_iframe(client):
    headers = login(client)
    _upload(client, headers, "priya.docx", _docx(RULES_RESUME))
    cid = next(r["id"] for r in payload(client.get("/api/candidates", headers=headers)))
    response = client.get(f"/api/candidates/{cid}/resume-preview", headers=headers)
    assert response.status_code == 200 and response.headers["content-type"].startswith("text/html")
    assert "Priya Venkatesan" in response.text and "<script" not in response.text
    assert "sandbox" in response.headers["content-security-policy"]


def test_pdf_resume_is_returned_as_a_pdf_and_may_be_framed_by_the_frontend(client):
    headers = login(client)
    _upload(client, headers, "priya.pdf", _pdf_bytes())
    cid = next(r["id"] for r in payload(client.get("/api/candidates", headers=headers)))
    response = client.get(f"/api/candidates/{cid}/resume-preview", headers=headers)
    assert response.status_code == 200 and response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")
    # the frontend is another origin: SAMEORIGIN would blank the iframe
    assert "x-frame-options" not in response.headers
    assert "frame-ancestors" in response.headers["content-security-policy"]
    # an ordinary API response keeps the protection
    assert client.get("/api/candidates", headers=headers).headers["x-frame-options"] == "SAMEORIGIN"


def test_preview_works_with_the_token_in_the_url_and_is_protected(client):
    headers = login(client)
    _upload(client, headers, "priya.docx", _docx(RULES_RESUME))
    cid = next(r["id"] for r in payload(client.get("/api/candidates", headers=headers)))
    assert client.get(f"/api/candidates/{cid}/resume-preview").status_code == 401
    assert client.get(f"/api/candidates/{cid}/resume-preview?token=bad").status_code == 401
    assert client.get(f"/api/candidates/{cid}/resume-preview?token={headers['x-session-token']}").status_code == 200


def test_candidate_without_a_file_gets_a_clear_404_page(client):
    headers = login(client)
    client.post("/api/candidates", headers=headers, json={"full_name": "Manual Person"})
    cid = next(r["id"] for r in payload(client.get("/api/candidates", headers=headers)))
    response = client.get(f"/api/candidates/{cid}/resume-preview", headers=headers)
    assert response.status_code == 404 and "No resume on file" in response.text
    assert client.get("/api/candidates/999999/resume-preview", headers=headers).status_code == 404
