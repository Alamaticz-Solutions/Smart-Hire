"""End-to-end API tests (routers + services + database; LLM faked)."""
from __future__ import annotations

import pytest

from tests.conftest import FakeChat, db_value, login, payload, register_and_approve


def create_job(client, headers, title="Pega Architect", **extra):
    response = client.post(
        "/api/jobs",
        json={"title": title, "description": "Needs 5+ years Pega", "required_skills": "Pega", **extra},
        headers=headers,
    )
    assert response.status_code in (200, 201), response.text
    return payload(response)


def create_candidate(client, headers, **fields):
    fields.setdefault("full_name", "Asha K")
    response = client.post("/api/candidates", json=fields, headers=headers)
    assert response.status_code in (200, 201), response.text
    return response


def candidate_id_by_name(client, headers, name):
    rows = payload(client.get("/api/candidates", headers=headers))
    return next(r["id"] for r in rows if r["full_name"] == name)


# ── system / auth ──────────────────────────────────────────────────────────
def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert payload(response)["status"] == "ok"


def test_login_returns_signed_token(client):
    response = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    data = payload(response)
    assert response.status_code == 200
    assert data["username"] == "admin" and data["is_admin"] == 1 and data["token"]


def test_login_rejects_wrong_password(client):
    response = client.post("/api/auth/login", json={"username": "admin", "password": "nope"})
    assert response.status_code == 401


def test_header_spoofing_is_ignored(client):
    """Sending only x-user-username must NOT grant admin access."""
    assert client.get("/api/admin/users", headers={"x-user-username": "admin"}).status_code in (401, 403)
    assert client.get("/api/admin/users", headers=login(client)).status_code == 200


def test_forged_token_is_rejected(client):
    forged = {"x-session-token": "YWRtaW58OTk5OTk5OTk5OQ.deadbeef"}
    assert client.get("/api/admin/users", headers=forged).status_code in (401, 403)


def test_registration_requires_approval(client, admin):
    body = {"full_name": "New Hire", "username": "newhire", "password": "Passw0rd", "email": "n@example.com"}
    assert client.post("/api/auth/register", json=body).status_code in (200, 201)
    pending = client.post("/api/auth/login", json={"username": "newhire", "password": "Passw0rd"})
    assert pending.status_code == 403

    headers = register_and_approve(client, admin, "second")  # full flow helper
    assert client.get("/api/auth/status", headers=headers).status_code == 200


def test_password_must_contain_digit(client):
    response = client.post(
        "/api/auth/register",
        json={"full_name": "A", "username": "nodigit", "password": "NoDigits", "email": "a@example.com"},
    )
    assert response.status_code == 400


def test_duplicate_username_rejected(client):
    response = client.post(
        "/api/auth/register",
        json={"full_name": "A", "username": "admin", "password": "Passw0rd", "email": "a@example.com"},
    )
    assert response.status_code == 400


def test_legacy_sha256_hash_is_upgraded_on_login(client):
    import hashlib

    from sqlalchemy import text

    from app.db.engine import get_engine

    with get_engine().begin() as connection:
        connection.execute(
            text("UPDATE users SET password_hash = :h WHERE username = 'user'"),
            {"h": hashlib.sha256(b"user").hexdigest()},
        )
    assert client.post("/api/auth/login", json={"username": "user", "password": "user"}).status_code == 200
    assert db_value("SELECT password_hash FROM users WHERE username = 'user'").startswith("pbkdf2_sha256$")


# ── authorisation ──────────────────────────────────────────────────────────
def test_admin_endpoints_forbidden_for_normal_user(client, admin):
    headers = register_and_approve(client, admin, "regular")
    for path in ("/api/admin/requests", "/api/integrations", "/api/admin/masked-keywords"):
        assert client.get(path, headers=headers).status_code == 403, path


def test_reset_requires_admin(client, admin):
    headers = register_and_approve(client, admin, "regular")
    assert client.post("/api/reset", headers=headers).status_code == 403
    assert client.post("/api/reset").status_code in (401, 403)


# ── jobs ───────────────────────────────────────────────────────────────────
def test_job_lifecycle(client, admin):
    job = create_job(client, admin)
    assert job["title"] == "Pega Architect"

    listed = payload(client.get("/api/jobs", headers=admin))
    assert [j["id"] for j in listed] == [job["id"]]
    assert listed[0]["matched_count"] == 0 and listed[0]["shared_with"] == []

    updated = client.put(f"/api/jobs/{job['id']}", json={"title": "Pega Lead", "description": "Updated"}, headers=admin)
    assert payload(updated)["title"] == "Pega Lead"

    assert client.delete(f"/api/jobs/{job['id']}", headers=admin).status_code == 200
    assert payload(client.get("/api/jobs", headers=admin)) == []


def test_job_owner_isolation(client, admin):
    alice = register_and_approve(client, admin, "alice")
    bob = register_and_approve(client, admin, "bob")
    job = create_job(client, alice, "Alice job")

    assert payload(client.get("/api/jobs", headers=bob)) == []
    assert client.delete(f"/api/jobs/{job['id']}", headers=bob).status_code == 403
    assert client.get(f"/api/jobs/{job['id']}/candidates", headers=bob).status_code == 403
    assert len(payload(client.get("/api/jobs", headers=admin))) == 1


def test_missing_job_is_404(client, admin):
    assert client.get("/api/jobs/9999/candidates", headers=admin).status_code == 404


def test_attach_select_and_detach_candidate(client, admin):
    job = create_job(client, admin)
    create_candidate(client, admin, full_name="Asha K", skills="Pega")
    cid = candidate_id_by_name(client, admin, "Asha K")

    assert client.post(f"/api/jobs/{job['id']}/candidates/{cid}", headers=admin).status_code in (200, 201)
    assert client.post(f"/api/jobs/{job['id']}/candidates/{cid}", headers=admin).status_code == 400
    assert client.put(f"/api/jobs/{job['id']}/candidates/{cid}", json={"status": "bogus"}, headers=admin).status_code == 400
    assert client.put(f"/api/jobs/{job['id']}/candidates/{cid}", json={"status": "selected"}, headers=admin).status_code == 200

    jobs = payload(client.get("/api/jobs", headers=admin))
    assert jobs[0]["selected_count"] == 1
    linked = payload(client.get(f"/api/jobs/{job['id']}/candidates", headers=admin))
    assert linked[0]["full_name"] == "Asha K" and linked[0]["job_status"] == "selected"

    assert client.delete(f"/api/jobs/{job['id']}/candidates/{cid}", headers=admin).status_code == 200
    assert payload(client.get(f"/api/jobs/{job['id']}/candidates", headers=admin)) == []


def test_share_job_with_external_user(client, admin):
    job = create_job(client, admin)
    assert client.post(f"/api/jobs/{job['id']}/share", json={"usernames": ["user"]}, headers=admin).status_code == 200
    assert payload(client.get(f"/api/jobs/{job['id']}/shares", headers=admin)) == ["user"]


# ── candidates ─────────────────────────────────────────────────────────────
def test_candidate_crud_and_validation(client, admin):
    create_candidate(client, admin, full_name="Ravi", skills="Java")
    cid = candidate_id_by_name(client, admin, "Ravi")

    assert client.post("/api/candidates", json={"skills": "Java"}, headers=admin).status_code == 400
    assert client.put(f"/api/candidates/{cid}", json={"total_experience": "abc"}, headers=admin).status_code == 400
    assert client.put(f"/api/candidates/{cid}", json={"total_experience": "4.5"}, headers=admin).status_code == 200

    row = next(c for c in payload(client.get("/api/candidates", headers=admin)) if c["id"] == cid)
    assert row["total_experience"] == 4.5

    assert client.delete(f"/api/candidates/{cid}", headers=admin).status_code == 200
    assert client.delete(f"/api/candidates/{cid}", headers=admin).status_code == 404


def test_non_staff_sees_only_own_candidates_masked(client, admin):
    recruiter = register_and_approve(client, admin, "recruiter")
    create_candidate(client, recruiter, full_name="Mine", certifications="CSSA", skills="LSA expert")
    create_candidate(client, admin, full_name="Theirs", certifications="CSSA")

    rows = payload(client.get("/api/candidates", headers=recruiter))
    assert [r["full_name"] for r in rows] == ["Mine"]
    assert rows[0]["certifications"] == "[HIDDEN]"
    assert "LSA" not in rows[0]["skills"] and "****" in rows[0]["skills"]

    staff_rows = payload(client.get("/api/candidates", headers=admin))
    assert {r["full_name"] for r in staff_rows} == {"Mine", "Theirs"}


def test_bulk_delete_skips_unauthorised(client, admin):
    carol = register_and_approve(client, admin, "carol")
    create_candidate(client, carol, full_name="C1")
    create_candidate(client, admin, full_name="C2")
    ids = [candidate_id_by_name(client, admin, "C1"), candidate_id_by_name(client, admin, "C2")]

    response = client.post("/api/candidates/bulk-delete", json={"ids": ids}, headers=carol)
    assert payload(response)["count"] == 1
    assert [c["full_name"] for c in payload(client.get("/api/candidates", headers=admin))] == ["C2"]


def test_custom_columns(client, admin):
    added = client.post(
        "/api/columns", json={"col_key": "Team Lead", "col_label": "Team Lead", "description": "Name"}, headers=admin
    )
    assert added.status_code in (200, 201)
    assert payload(added)["col_key"] == "team_lead"
    assert client.post(
        "/api/columns", json={"col_key": "team_lead", "col_label": "x", "description": ""}, headers=admin
    ).status_code == 400

    columns = payload(client.get("/api/columns", headers=admin))
    assert [c["col_key"] for c in columns["custom"]] == ["team_lead"]
    assert client.delete("/api/columns/team_lead", headers=admin).status_code == 200


def test_candidate_jobs_and_unmatched(client, admin):
    job = create_job(client, admin)
    create_candidate(client, admin, full_name="Zed")
    cid = candidate_id_by_name(client, admin, "Zed")
    unmatched = payload(client.get(f"/api/jobs/{job['id']}/unmatched-candidates", headers=admin))
    assert [c["full_name"] for c in unmatched] == ["Zed"]
    client.post(f"/api/jobs/{job['id']}/candidates/{cid}", headers=admin)
    assert payload(client.get(f"/api/jobs/{job['id']}/unmatched-candidates", headers=admin)) == []
    assert len(payload(client.get(f"/api/candidates/{cid}/jobs", headers=admin))) == 1


# ── admin ──────────────────────────────────────────────────────────────────
def test_masked_keywords_and_activity_feed(client, admin):
    assert client.post("/api/admin/masked-keywords", json={"keyword": " SECRET "}, headers=admin).status_code in (200, 201)
    assert "SECRET" in payload(client.get("/api/admin/masked-keywords", headers=admin))
    assert client.post("/api/admin/masked-keywords", json={"keyword": " "}, headers=admin).status_code == 400
    client.delete("/api/admin/masked-keywords/SECRET", headers=admin)
    assert "SECRET" not in payload(client.get("/api/admin/masked-keywords", headers=admin))

    feed = payload(client.get("/api/activity", headers=admin))
    assert any("SECRET" in item["action"] for item in feed)


def test_team_members(client, admin):
    assert client.post("/api/team-members", json={"name": "Meera"}, headers=admin).status_code in (200, 201)
    assert client.post("/api/team-members", json={"name": "Meera"}, headers=admin).status_code == 400
    members = payload(client.get("/api/team-members", headers=admin))
    member_id = next(m["id"] for m in members if m["name"] == "Meera")
    assert client.delete(f"/api/team-members/{member_id}", headers=admin).status_code == 200


def test_delete_user_cascades_and_blocks_self_delete(client, admin):
    leaver = register_and_approve(client, admin, "leaver")
    create_candidate(client, leaver, full_name="Orphan")
    users = payload(client.get("/api/admin/users", headers=admin))
    me = next(u for u in users if u["username"] == "admin")
    assert client.delete(f"/api/admin/users/{me['id']}", headers=admin).status_code == 400

    target = next(u for u in users if u["username"] == "leaver")
    assert client.delete(f"/api/admin/users/{target['id']}", headers=admin).status_code == 200
    assert "Orphan" not in [c["full_name"] for c in payload(client.get("/api/candidates", headers=admin))]


def test_permissions_update(client, admin):
    register_and_approve(client, admin, "promoted")
    users = payload(client.get("/api/admin/users", headers=admin))
    target = next(u for u in users if u["username"] == "promoted")
    response = client.put(
        f"/api/admin/users/{target['id']}/permissions", json={"is_hr": 1, "is_admin": 0}, headers=admin
    )
    assert response.status_code == 200
    refreshed = next(u for u in payload(client.get("/api/admin/users", headers=admin)) if u["username"] == "promoted")
    assert refreshed["is_hr"] == 1


# ── chat ───────────────────────────────────────────────────────────────────
def test_chat_small_talk(client, admin):
    FakeChat.handler = staticmethod(lambda prompt: "Hi there!")
    # models load lazily; the first call may report "warming up"
    for _ in range(3):
        data = payload(client.post("/api/chat", json={"message": "hello"}, headers=admin))
        if "warming" not in data["answer"] and "engines" not in data["answer"]:
            break
    assert data["type"] == "text"


def test_chat_requires_approved_user(client):
    response = client.post("/api/chat", json={"message": "list candidates"})
    assert response.status_code in (200, 401, 403)
    if response.status_code == 200:
        assert "approval" in payload(response)["answer"].lower() or "pending" in payload(response)["answer"].lower()


# ── database bootstrap ─────────────────────────────────────────────────────
def test_init_db_is_idempotent(client):
    from app.db.init_db import init_db

    init_db()
    init_db()
    assert db_value("SELECT COUNT(*) FROM users WHERE username = 'admin'") == 1
    assert db_value("SELECT COUNT(*) FROM masked_keywords") >= 2
