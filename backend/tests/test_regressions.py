"""Regression tests for bugs found in the full-application test pass."""
from __future__ import annotations

import io

import docx
from tests.conftest import FakeChat, login, payload


def _docx_bytes(text: str = "Carol Resume") -> bytes:
    document = docx.Document()
    document.add_paragraph(text)
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def _register(client, **overrides):
    body = {"full_name": "Weak User", "username": "weak", "password": "Passw0rd1", "email": "weak@example.com", **overrides}
    return client.post("/api/auth/register", json=body)


def test_registration_rejects_short_password_and_bad_email(client):
    assert _register(client, password="1").status_code == 400
    assert _register(client, password="short1").status_code == 400
    assert _register(client, email="not-an-email").status_code == 400
    assert _register(client, full_name="  ").status_code == 400
    assert _register(client).status_code == 200


def test_job_requires_title_and_description(client, admin):
    assert client.post("/api/jobs", headers=admin, json={"title": "", "description": ""}).status_code == 400
    assert client.post("/api/jobs", headers=admin, json={"title": "Pega LSA", "description": "  "}).status_code == 400
    assert client.post("/api/jobs", headers=admin, json={"title": "Pega LSA", "description": "JD"}).status_code == 200


def test_permissions_on_unknown_user_is_404(client, admin):
    response = client.put("/api/admin/users/99999/permissions", headers=admin, json={"is_hr": 1, "is_admin": 0})
    assert response.status_code == 404


def test_manual_candidate_ignores_system_set_mail_date(client, admin):
    """Typing into the (system-managed) Mail Received field used to crash with a 500."""
    response = client.post("/api/candidates", headers=admin, json={"full_name": "Dated", "mail_received_at": "yesterday"})
    assert response.status_code == 200
    rows = payload(client.get("/api/candidates", headers=admin))
    assert [r["full_name"] for r in rows] == ["Dated"] and not rows[0]["mail_received_at"]


def test_upload_rejects_empty_and_legacy_files(client, admin):
    docx_mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    assert client.post("/api/upload", headers=admin, files={"file": ("e.pdf", b"", "application/pdf")}).status_code == 400
    assert client.post("/api/upload", headers=admin, files={"file": ("old.doc", b"x", "application/msword")}).status_code == 400
    assert client.post("/api/upload", headers=admin, files={"file": ("old.xls", b"x", "application/vnd.ms-excel")}).status_code == 400
    assert client.post("/api/upload", headers=admin, files={"file": ("ok.docx", _docx_bytes(), docx_mime)}).status_code == 200


def test_csv_sheet_is_imported(client, admin):
    csv_bytes = b"full_name,email,total_experience\nDan CSV,dan@example.com,5\nEve CSV,eve@example.com,3\n"
    response = client.post("/api/upload", headers=admin, files={"file": ("people.csv", csv_bytes, "text/csv")})
    assert response.status_code == 200
    names = sorted(r["full_name"] for r in payload(client.get("/api/candidates", headers=admin)))
    assert names == ["Dan CSV", "Eve CSV"]


def test_failed_ai_match_keeps_existing_matches(client, admin, monkeypatch):
    import app.services.retry as retry

    monkeypatch.setattr(retry.time, "sleep", lambda *_: None)
    client.post("/api/candidates", headers=admin, json={"full_name": "Alice", "total_experience": 8, "pega_experience": 6})
    job = payload(client.post("/api/jobs", headers=admin, json={"title": "Pega LSA", "description": "JD"}))
    candidate_id = payload(client.get("/api/candidates", headers=admin))[0]["id"]
    assert client.post(f"/api/jobs/{job['id']}/candidates/{candidate_id}", headers=admin, json={"status": "matched"}).status_code in (200, 400)

    def rate_limited(prompt):
        raise RuntimeError("429 Rate limit reached")

    FakeChat.handler = staticmethod(rate_limited)
    before = payload(client.get(f"/api/jobs/{job['id']}/candidates", headers=admin))
    response = client.post(f"/api/jobs/{job['id']}/match", headers=admin)
    assert response.status_code == 503
    assert payload(client.get(f"/api/jobs/{job['id']}/candidates", headers=admin)) == before


def test_chat_table_rows_use_the_keys_the_page_reads(client, admin):
    from app.routers.chat import _rows_for_names

    rows = _rows_for_names([{"full_name": "Carol", "current_organization": "Acme", "email": "c@x.com"}], ["Carol"])
    assert rows[0]["full_name"] == "Carol" and rows[0]["current_organization"] == "Acme"


# ── Firebase sync must verify the caller ──────────────────────────────────────
def _fake_firebase(monkeypatch, uid="uid-1", email="new@example.com", verified=False):
    import app.routers.auth as auth

    monkeypatch.setattr(
        auth, "verify_firebase_token",
        lambda token: {"uid": uid, "email": email, "email_verified": verified} if token == "good-token" else None,
    )


def _sync(client, **body):
    payload_ = {"id_token": "good-token", "email": "new@example.com", "full_name": "N", "username": "newuser", **body}
    return client.post("/api/auth/firebase-sync", json=payload_)


def test_firebase_sync_cannot_take_over_an_account_without_a_token(client, monkeypatch):
    """Anyone used to be able to POST {username: "admin"} and receive an admin session."""
    assert client.post("/api/auth/firebase-sync", json={"email": "x@evil.com", "full_name": "x", "username": "admin"}).status_code == 422
    _fake_firebase(monkeypatch)
    assert _sync(client, id_token="forged", username="admin", email="admin@gmail.com").status_code == 401


def test_firebase_sync_rejects_a_token_for_another_email(client, monkeypatch):
    _fake_firebase(monkeypatch, email="attacker@evil.com")
    assert _sync(client, email="new@example.com").status_code == 401


def test_firebase_sync_cannot_claim_a_privileged_account_with_an_unverified_email(client, monkeypatch):
    _fake_firebase(monkeypatch, email="admin@gmail.com", verified=False)  # anyone can sign up to Firebase as this
    assert _sync(client, username="admin", email="admin@gmail.com").status_code == 401


def test_firebase_sync_creates_pending_user_and_binds_the_uid(client, monkeypatch):
    _fake_firebase(monkeypatch)
    assert _sync(client).status_code == 403  # created, awaiting approval
    _fake_firebase(monkeypatch, uid="someone-else")
    assert _sync(client).status_code == 401  # a different Firebase user cannot take over the bound account


def test_approving_through_permissions_closes_the_pending_request(client, admin):
    client.post("/api/auth/register", json={"full_name": "Pat", "username": "pat", "password": "Passw0rd1", "email": "pat@example.com"})
    users = payload(client.get("/api/admin/users", headers=admin))
    pat = next(u for u in users if u["username"] == "pat")
    client.put(f"/api/admin/users/{pat['id']}/permissions", headers=admin, json={"is_hr": 0, "is_admin": 0, "is_approved": 1})
    pending = [r for r in payload(client.get("/api/admin/requests", headers=admin)) if r["status"] == "pending" and r["target_id"] == "pat"]
    assert pending == []


def test_share_reports_unknown_usernames_and_formatted_resume_must_be_an_object(client, admin):
    job = payload(client.post("/api/jobs", headers=admin, json={"title": "T", "description": "D"}))
    shared = payload(client.post(f"/api/jobs/{job['id']}/share", headers=admin, json={"usernames": ["ghost"]}))
    assert shared["skipped_unknown"] == ["ghost"]

    client.post("/api/candidates", headers=admin, json={"full_name": "Fmt"})
    cid = payload(client.get("/api/candidates", headers=admin))[0]["id"]
    assert client.put(f"/api/candidates/{cid}/formatted-resume", headers=admin, json=["not", "an", "object"]).status_code == 400


def test_secrets_are_encrypted_at_rest_when_a_key_is_configured(client, admin, monkeypatch):
    from cryptography.fernet import Fernet
    from sqlalchemy import text

    from app.db.engine import session_scope
    from app.repositories import IntegrationSettingsRepository

    monkeypatch.setenv("SECRETS_KEY", Fernet.generate_key().decode())
    body = {"email_enabled": 0, "imap_host": "h", "imap_port": 993, "smtp_host": "s", "smtp_port": 587, "email_user": "u@x.com",
            "email_pass": "super-secret", "keywords": "k", "drive_enabled": 0, "ms_client_secret": "ms-secret"}
    assert client.post("/api/integrations", headers=admin, json=body).status_code == 200

    with session_scope() as session:
        raw = session.execute(text("select email_pass, ms_client_secret from integrations_settings")).one()
        assert raw[0].startswith("enc:v1:") and raw[1].startswith("enc:v1:") and "super-secret" not in raw[0]
    with session_scope() as session:  # the application still reads the real value
        row = IntegrationSettingsRepository(session).get()
        assert (row.email_pass, row.ms_client_secret) == ("super-secret", "ms-secret")
    read = payload(client.get("/api/integrations", headers=admin))
    assert read["email_pass"] == "****" and read["secrets_encrypted"] is True


def test_plain_text_secrets_are_encrypted_on_the_next_start(client, admin, monkeypatch):
    from cryptography.fernet import Fernet
    from sqlalchemy import text

    from app.db.engine import session_scope
    from app.db.init_db import init_db

    with session_scope() as session:
        session.execute(text("update integrations_settings set email_pass = 'legacy-plain'"))
    monkeypatch.setenv("SECRETS_KEY", Fernet.generate_key().decode())
    init_db()
    with session_scope() as session:
        assert session.execute(text("select email_pass from integrations_settings")).scalar().startswith("enc:v1:")
