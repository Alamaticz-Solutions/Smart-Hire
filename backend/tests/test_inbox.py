"""Mail log, import batches, source filters and the hardened Outlook (Graph) client."""
from __future__ import annotations

import base64
import io

import pytest
from tests.conftest import FakeChat, login, payload
from tests.test_mail_worker import FakeImap, _reset, _resume_email, _run_worker  # noqa: F401  (fixture reused)


def _mail(client, **params):
    return payload(client.get("/api/mail/messages", headers=login(client), params=params))


# ── mail log ──────────────────────────────────────────────────────────────
def test_every_pulled_mail_is_logged_with_its_received_date(client, monkeypatch):
    _run_worker(monkeypatch)
    page = _mail(client)
    assert page["total"] == 1
    row = page["items"][0]
    assert row["outcome"] == "imported" and row["candidate_name"] == "Asha Raman"
    assert str(row["received_at"]).startswith("2025-06-10T09:00")  # the mailbox received time, not "now"
    assert row["sender_email"] == "candidate@example.com" and "asha_resume.docx" in row["attachments"]

    candidate = payload(client.get("/api/candidates", headers=login(client)))[0]
    assert candidate["origin"] == "mail" and candidate["source_msg_uid"] == "unit-test-1@example.com"
    assert candidate["record_state"] in ("active", "review")

    summary = payload(client.get("/api/mail/summary", headers=login(client)))
    assert summary["by_outcome"] == {"imported": 1}


def test_skipped_automated_mail_is_logged_not_hidden(client, monkeypatch):
    _run_worker(monkeypatch, sender="invoice@vendor.com")
    row = _mail(client)["items"][0]
    assert row["outcome"] == "skipped_automated" and row["candidate_id"] is None


def test_mail_log_filters_search_and_dates(client, monkeypatch):
    _run_worker(monkeypatch)
    assert _mail(client, outcome="failed")["total"] == 0
    assert _mail(client, outcome="imported,failed")["total"] == 1
    assert _mail(client, search="asha")["total"] == 1 and _mail(client, search="nobody")["total"] == 0
    assert _mail(client, date_from="2025-06-10", date_to="2025-06-10")["total"] == 1
    assert _mail(client, date_from="2025-06-11")["total"] == 0
    assert client.get("/api/mail/messages", headers=login(client), params={"date_from": "bad"}).status_code == 400


def test_retry_puts_a_failed_mail_back_in_the_queue(client, monkeypatch):
    from app.db.engine import session_scope
    from app.repositories import MailMessageRepository, ProcessedEmailRepository

    _run_worker(monkeypatch)
    with session_scope() as session:
        MailMessageRepository(session).upsert("unit-test-1@example.com", outcome="failed", reason="boom")
    result = payload(client.post("/api/mail/messages/retry", headers=login(client), json={"msg_uids": ["unit-test-1@example.com", "unknown"]}))
    assert result == {"queued": 1, "skipped": 1}
    with session_scope() as session:
        assert not ProcessedEmailRepository(session).exists("unit-test-1@example.com")
    assert _mail(client)["items"][0]["outcome"] == "pending_retry"


def test_mail_log_is_staff_only(client, admin):
    from tests.conftest import register_and_approve

    other = register_and_approve(client, admin, "plainuser")
    assert client.get("/api/mail/messages", headers=other).status_code == 403
    assert client.get("/api/imports", headers=other).status_code == 403
    assert client.get("/api/mail/messages").status_code == 403


def test_mail_log_excel_export(client, monkeypatch):
    import openpyxl

    _run_worker(monkeypatch)
    response = client.get("/api/mail/messages/export.xlsx", headers=login(client))
    rows = list(openpyxl.load_workbook(io.BytesIO(response.content)).active.values)
    assert rows[0][0] == "Received (UTC)" and rows[1][1] == "candidate@example.com"


# ── Excel batches ─────────────────────────────────────────────────────────
SHEET = (b"Name,Email,Skills\n"
         b"Dan Sheet,dan@example.com,Pega\n"
         b"Existing Person,exists@example.com,\n"      # blank skills must not wipe the stored value
         b",,\n"                                       # blank identity -> reported as skipped
         b"Eve Sheet,eve@example.com,CDH\n")


def _upload_sheet(client, content=SHEET, name="people.csv"):
    return client.post("/api/upload", headers=login(client), files={"file": (name, content, "text/csv")})


def test_excel_import_is_tracked_as_a_batch(client):
    client.post("/api/candidates", headers=login(client),
                json={"full_name": "Existing Person", "email": "exists@example.com", "skills": "Pega LSA"})
    assert _upload_sheet(client).status_code == 200

    batch = payload(client.get("/api/imports", headers=login(client)))[0]
    assert (batch["name"], batch["status"]) == ("people.csv", "done")
    assert (batch["imported"], batch["updated"], batch["skipped"]) == (2, 1, 1)

    detail = payload(client.get(f"/api/imports/{batch['id']}/items", headers=login(client)))
    assert {i["status"] for i in detail["items"]} == {"imported", "updated", "skipped"}
    assert any("no name, email or phone" in (i["reason"] or "") for i in detail["items"])

    rows = {r["full_name"]: r for r in payload(client.get("/api/candidates", headers=login(client)))}
    assert rows["Existing Person"]["skills"] == "Pega LSA"          # not wiped by the blank cell
    assert rows["Dan Sheet"]["origin"] == "excel" and rows["Dan Sheet"]["record_state"] == "review"  # thin profile

    report = client.get(f"/api/imports/{batch['id']}/report.xlsx", headers=login(client))
    assert report.status_code == 200 and report.content[:2] == b"PK"


def test_undo_import_removes_only_what_it_created(client):
    client.post("/api/candidates", headers=login(client), json={"full_name": "Existing Person", "email": "exists@example.com"})
    _upload_sheet(client)
    batch_id = payload(client.get("/api/imports", headers=login(client)))[0]["id"]
    assert payload(client.post(f"/api/imports/{batch_id}/undo", headers=login(client)))["removed"] == 2
    names = sorted(r["full_name"] for r in payload(client.get("/api/candidates", headers=login(client))))
    assert names == ["Existing Person"]
    assert client.post(f"/api/imports/{batch_id}/undo", headers=login(client)).status_code == 400


def test_sheet_without_known_headings_is_reported(client):
    _upload_sheet(client, b"foo,bar\n1,2\n", "weird.csv")
    batch = payload(client.get("/api/imports", headers=login(client)))[0]
    items = payload(client.get(f"/api/imports/{batch['id']}/items", headers=login(client)))["items"]
    assert items and items[0]["status"] == "skipped" and "column headings" in items[0]["reason"]


# ── source filters ────────────────────────────────────────────────────────
def test_source_buttons_filter_the_candidate_list(client, monkeypatch):
    _run_worker(monkeypatch)                                           # 1 from mail
    _upload_sheet(client)                                              # 3 from Excel (incl. one updated? none exist) -> 3
    client.post("/api/candidates", headers=login(client), json={"full_name": "Manual Mary"})
    admin = login(client)

    def names(**p):
        return sorted(r["full_name"] for r in payload(client.get("/api/candidates", headers=admin, params=p)))

    assert names(origin="mail") == ["Asha Raman"]
    assert names(origin="excel") == ["Dan Sheet", "Eve Sheet", "Existing Person"]
    assert names(origin="manual") == ["Manual Mary"]
    assert len(names()) == 5 and len(names(origin="all")) == 5

    summary = payload(client.get("/api/candidates/summary", headers=admin))
    assert summary["by_origin"] == {"mail": 1, "excel": 3, "manual": 1} and summary["usable"] == 5


def test_failed_imports_are_hidden_from_the_main_list(client, monkeypatch):
    _run_worker(monkeypatch)
    from app.db.engine import session_scope
    from app.repositories import CandidateRepository

    with session_scope() as session:
        repo = CandidateRepository(session)
        repo.insert({"full_name": "Broken", "candidate_status": "Error", "record_state": "failed", "origin": "mail"})
    admin = login(client)
    assert "Broken" not in [r["full_name"] for r in payload(client.get("/api/candidates", headers=admin))]
    failed = payload(client.get("/api/candidates", headers=admin, params={"state": "failed"}))
    assert [r["full_name"] for r in failed] == ["Broken"]
    assert payload(client.get("/api/candidates/summary", headers=admin))["by_state"]["failed"] == 1


def test_candidate_rows_carry_profile_completeness(client):
    client.post("/api/candidates", headers=login(client), json={"full_name": "Thin"})
    row = payload(client.get("/api/candidates", headers=login(client)))[0]
    assert row["profile_completeness"] == 12 and "Email" in row["missing_fields"]


# ── Graph client + Graph pull ─────────────────────────────────────────────
class FakeResponse:
    def __init__(self, status=200, body=None, content=b"", headers=None):
        self.status_code, self._body, self.content, self.headers = status, body or {}, content, headers or {}
        self.text = str(body)

    def json(self):
        return self._body


@pytest.fixture()
def graph(monkeypatch):
    import app.services.graph_client as gc

    gc.clear_token_cache()
    monkeypatch.setattr(gc, "_sleep", lambda s: None)
    return gc


def test_graph_token_failure_is_reported(graph, monkeypatch):
    monkeypatch.setattr(graph.requests, "post", lambda *a, **k: FakeResponse(400, {"error_description": "AADSTS90002 tenant not found"}))
    with pytest.raises(graph.GraphError, match="AADSTS90002"):
        graph.get_token("t", "c", "s")


def test_graph_throttling_is_retried_and_timeouts_are_set(graph, monkeypatch):
    monkeypatch.setattr(graph.requests, "post", lambda *a, **k: FakeResponse(200, {"access_token": "tok", "expires_in": 3600}))
    calls = []

    def fake_request(method, url, **kwargs):
        calls.append(kwargs)
        return FakeResponse(429, headers={"Retry-After": "1"}) if len(calls) < 3 else FakeResponse(200, {"value": []})

    monkeypatch.setattr(graph.requests, "request", fake_request)
    response = graph.GraphSession("t", "c", "s").get("/users/x/mailFolders/Inbox/messages")
    assert response.status_code == 200 and len(calls) == 3
    assert all(c["timeout"] for c in calls)            # no call can hang forever


def test_graph_token_is_cached(graph, monkeypatch):
    posts = []
    monkeypatch.setattr(graph.requests, "post", lambda *a, **k: posts.append(1) or FakeResponse(200, {"access_token": "tok", "expires_in": 3600}))
    graph.get_token("t", "c", "s")
    graph.get_token("t", "c", "s")
    assert len(posts) == 1


def test_outlook_pull_uses_graph_received_time_and_pages(client, graph, monkeypatch):
    """Two list pages -> two mails; the stored date is Graph's receivedDateTime, not the (different) Date header."""
    import app.services.email_worker as worker

    mime = _resume_email("graph.sender@example.com")
    attachment = {"value": [{"@odata.type": "#microsoft.graph.fileAttachment", "name": "asha_resume.docx",
                             "contentBytes": base64.b64encode(b"unused").decode()}]}
    monkeypatch.setattr(graph.requests, "post", lambda *a, **k: FakeResponse(200, {"access_token": "tok", "expires_in": 3600}))

    def fake_request(method, url, **kwargs):
        if "/attachments" in url:
            return FakeResponse(200, {"value": []})
        if url.endswith("/$value"):
            return FakeResponse(200, content=mime)
        if "page2" in url:
            return FakeResponse(200, {"value": [{"id": "m2", "internetMessageId": "<unit-test-1@example.com>", "receivedDateTime": "2026-11-23T12:29:40Z"}]})
        return FakeResponse(200, {"value": [], "@odata.nextLink": "https://graph.microsoft.com/v1.0/page2"})

    monkeypatch.setattr(graph.requests, "request", fake_request)
    FakeChat.handler = staticmethod(lambda prompt: '{"full_name": "Asha Raman", "email": "asha@example.com", "skills": "Pega"}'
                                    if "expert resume and email parser" in prompt else "[]")
    worker.process_single_mailbox("careers@alamaticz.com", "x", "outlook.office365.com", 993, "smtp.office365.com", 587,
                                  "resume", "professional", None, None, None, "client-id", "secret", "tenant-id")

    row = _mail(client)["items"][0]
    assert row["outcome"] == "imported"
    assert str(row["received_at"]).startswith("2026-11-23T12:29")          # Graph time, not 2025-06-10 header
    candidate = payload(client.get("/api/candidates", headers=login(client)))[0]
    assert str(candidate["mail_received_at"]).startswith("2026-11-23T12:29")


def test_graph_failure_is_logged_and_reported_not_silent(client, graph, monkeypatch):
    import app.services.email_worker as worker

    monkeypatch.setattr(graph.requests, "post", lambda *a, **k: FakeResponse(400, {"error_description": "tenant blocked"}))
    worker.process_single_mailbox("careers@alamaticz.com", "x", "outlook.office365.com", 993, "smtp.office365.com", 587,
                                  "resume", "professional", None, None, None, "client-id", "secret", "tenant-id")
    summary = payload(client.get("/api/mail/summary", headers=login(client)))
    assert summary["total"] == 0
    assert "tenant blocked" in (summary["poller"]["last_error"] or "")
