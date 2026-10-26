"""Contract tests for the uniform response envelope."""
from __future__ import annotations

from tests.conftest import login

ENVELOPE_KEYS = {"success", "message", "data", "meta", "error", "request_id"}


def test_success_responses_are_enveloped(client):
    response = client.get("/api/health")
    body = response.json()
    assert ENVELOPE_KEYS <= body.keys()
    assert body["success"] is True and body["error"] is None
    assert body["data"]["status"] == "ok"
    assert body["request_id"] == response.headers["X-Request-ID"]


def test_list_payload_is_wrapped_not_altered(client):
    admin = login(client)
    body = client.get("/api/jobs", headers=admin).json()
    assert body["success"] is True and body["data"] == []


def test_message_is_lifted_from_payload(client):
    admin = login(client)
    job = client.post("/api/jobs", json={"title": "T", "description": "D"}, headers=admin).json()["data"]
    body = client.delete(f"/api/jobs/{job['id']}", headers=admin).json()
    assert body["success"] is True and body["message"] == "Job deleted"


def test_http_errors_use_error_envelope(client):
    admin = login(client)
    response = client.get("/api/jobs/9999/candidates", headers=admin)
    body = response.json()
    assert response.status_code == 404
    assert body["success"] is False and body["data"] is None
    assert body["error"]["code"] == "not_found"
    assert body["message"] == body["detail"] == "Job not found"


def test_validation_errors_use_error_envelope(client):
    admin = login(client)
    response = client.post("/api/jobs", json={}, headers=admin)
    body = response.json()
    assert response.status_code == 422
    assert body["error"]["code"] == "validation_error"
    assert any(item["field"] == "title" for item in body["error"]["details"])


def test_inline_json_error_responses_are_converted(client):
    """candidates.py returns JSONResponse(400, {"detail": ...}) directly."""
    admin = login(client)
    client.post("/api/candidates", json={"full_name": "Ravi"}, headers=admin)
    cid = client.get("/api/candidates", headers=admin).json()["data"][0]["id"]
    response = client.put(f"/api/candidates/{cid}", json={"total_experience": "abc"}, headers=admin)
    body = response.json()
    assert response.status_code == 400
    assert body["success"] is False and "number" in body["message"]


def test_binary_download_is_not_enveloped(client):
    admin = login(client)
    client.post("/api/candidates", json={"full_name": "Doc Person"}, headers=admin)
    cid = client.get("/api/candidates", headers=admin).json()["data"][0]["id"]
    response = client.get(f"/api/candidates/{cid}/export-docx", headers=admin)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/vnd.openxmlformats")
    assert response.content[:2] == b"PK"  # a .docx is a zip


def test_request_id_is_echoed(client):
    response = client.get("/api/health", headers={"x-request-id": "trace-123"})
    assert response.headers["X-Request-ID"] == "trace-123"
    assert response.json()["request_id"] == "trace-123"
