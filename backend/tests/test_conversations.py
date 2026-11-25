"""Candidates' questions, AI-drafted answers, approval, sending and the "already emailed" safety net."""
from __future__ import annotations

import json

import pytest
from tests.conftest import FakeChat, login, payload, register_and_approve
from tests.test_mail_worker import SmtpRecorder, _reset, _run_worker, _smtp_settings  # noqa: F401  (fixture reused)

QUESTION = "Hi, I have attached my resume. What is the notice period policy and is the role remote? Thanks."


def _llm(confident=True, is_question=True):
    """A fake AI that parses resumes and answers questions."""
    def handler(prompt):
        if "recruitment assistant of Alamaticz" in prompt:
            return json.dumps({"is_question": is_question, "question": "Asked about notice period and remote work",
                               "reply": "Our standard notice period is 30 days and the role is hybrid.", "confident": confident})
        if "expert resume and email parser" in prompt:
            return '{"full_name": "Asha Raman", "total_experience": 8, "email": "asha@example.com", "skills": "Pega"}'
        return "[]"
    return staticmethod(handler)


def _run(monkeypatch, body=QUESTION, **kw):
    import app.services.email_worker as worker

    return _run_worker(monkeypatch, body=body, llm=_llm(**kw))


def _set_mode(client, mode, faq="Notice period is 30 days. The role is hybrid."):
    admin = login(client)
    current = payload(client.get("/api/integrations", headers=admin))
    body = {k: current[k] for k in ("email_enabled", "imap_host", "imap_port", "smtp_host", "smtp_port", "email_user", "email_pass", "keywords", "drive_enabled")}
    body.update(ai_answers_mode=mode, company_faq=faq)
    assert client.post("/api/integrations", headers=admin, json=body).status_code == 200


def _rows(client, **params):
    return payload(client.get("/api/conversations", headers=login(client), params=params))["items"]


def test_a_question_becomes_an_ai_draft_waiting_for_approval(client, monkeypatch):
    _run(monkeypatch)
    row = _rows(client)[0]
    assert (row["kind"], row["status"], row["is_ai"]) == ("answer", "draft", True)
    assert row["question"] == "Asked about notice period and remote work"
    assert "30 days" in row["reply_body"] and row["reply_body"].startswith("Hi Asha Raman")
    assert "Please find" not in row["reply_body"]
    assert str(row["received_at"]).startswith("2025-06-10T09:00") and row["sender_email"] == "candidate@example.com"
    assert payload(client.get("/api/conversations/summary", headers=login(client)))["by_status"]["draft"] == 1


def test_a_plain_application_gets_the_normal_acknowledgement_not_an_ai_answer(client, monkeypatch):
    _run(monkeypatch, body="Please find my resume attached.")
    row = _rows(client)[0]
    assert (row["kind"], row["status"], row["is_ai"]) == ("acknowledgement", "pending", False)
    assert row["question"] is None and "Asha" in row["reply_body"]


def test_answers_can_be_switched_off_or_sent_automatically(client, monkeypatch):
    _set_mode(client, "off")
    _run(monkeypatch)
    assert _rows(client)[0]["kind"] == "acknowledgement"

    from app.db.engine import dispose_engine  # fresh start for the second scenario
    from app.repositories import invalidate_candidate_table_cache  # noqa: F401
    dispose_engine()


def test_auto_mode_queues_confident_answers_but_unsure_ones_still_wait(client, monkeypatch):
    _set_mode(client, "auto")
    _run(monkeypatch, confident=True)
    assert _rows(client)[0]["status"] == "pending"


def test_unsure_answer_waits_for_a_person(client, monkeypatch):
    _set_mode(client, "auto")
    _run(monkeypatch, confident=False)
    row = _rows(client)[0]
    assert row["status"] == "draft" and "get back to you" in row["reply_body"] and "30 days" not in row["reply_body"]


def test_edit_approve_send_and_never_twice(client, monkeypatch):
    import app.services.email_worker as worker

    sent = []
    monkeypatch.setattr(worker, "deliver_reply", lambda settings, mailbox, to, subject, body: sent.append((to, subject, body)))
    _run(monkeypatch)
    admin = login(client)
    reply_id = _rows(client)[0]["id"]

    assert client.put(f"/api/conversations/{reply_id}", headers=admin, json={"reply": "  "}).status_code == 400
    assert client.put(f"/api/conversations/{reply_id}", headers=admin, json={"reply": "Hello Asha, custom text."}).status_code == 200
    assert payload(client.post(f"/api/conversations/{reply_id}/approve", headers=admin))["status"] == "pending"
    assert client.post(f"/api/conversations/{reply_id}/approve", headers=admin).status_code == 400   # not a draft any more

    assert client.post(f"/api/conversations/{reply_id}/send", headers=admin).status_code == 200
    assert sent == [("candidate@example.com", sent[0][1], "Hello Asha, custom text.")]
    row = _rows(client)[0]
    assert row["status"] == "sent" and row["sent_by"] == "admin" and row["edited_by"] == "admin"
    assert client.post(f"/api/conversations/{reply_id}/send", headers=admin).status_code == 400       # never twice
    assert len(sent) == 1


def test_someone_already_emailed_from_sent_items_is_not_written_to_again(client, monkeypatch):
    import app.services.email_worker as worker

    sent = []
    monkeypatch.setattr(worker, "deliver_reply", lambda *a: sent.append(a))
    monkeypatch.setattr(worker, "already_emailed_note", lambda settings, mailbox, to: 'already emailed on 31 Aug 2026 ("Re: Application")')
    _run(monkeypatch, body="Please find my resume attached.")          # a standard acknowledgement
    admin = login(client)
    reply_id = _rows(client)[0]["id"]

    blocked = client.post(f"/api/conversations/{reply_id}/send", headers=admin)
    assert blocked.status_code == 409 and "already emailed" in blocked.json()["detail"] and sent == []
    assert client.post(f"/api/conversations/{reply_id}/send", headers=admin, json={"force": True}).status_code == 200
    assert len(sent) == 1


def test_if_sent_items_cannot_be_read_nothing_is_sent(client, monkeypatch):
    import app.services.email_worker as worker

    sent = []
    monkeypatch.setattr(worker, "deliver_reply", lambda *a: sent.append(a))

    def broken(settings, mailbox, to):
        raise RuntimeError("Sent Items could not be read (403)")

    monkeypatch.setattr(worker, "already_emailed_note", broken)
    _run(monkeypatch, body="Please find my resume attached.")
    admin = login(client)
    response = client.post(f"/api/conversations/{_rows(client)[0]['id']}/send", headers=admin)
    assert response.status_code == 400 and "nothing was sent" in response.json()["detail"] and sent == []

    worker.send_pending_replies(_smtp_settings(auto_reply_enabled=1))     # the automatic path also refuses and keeps it pending
    assert sent == [] and _rows(client)[0]["status"] in ("draft", "pending")


def test_batch_previews_first_and_needs_confirmation(client, monkeypatch):
    import app.services.email_worker as worker

    sent = []
    monkeypatch.setattr(worker, "deliver_reply", lambda settings, mailbox, to, subject, body: sent.append(to))
    _run_worker(monkeypatch, body="Please find my resume attached.")        # a queued acknowledgement, mail dated 2025-06-10
    admin = login(client)

    preview = payload(client.post("/api/conversations/send-batch", headers=admin, json={}))
    assert preview["dry_run"] is True and preview["would_send"] == 1 and sent == []
    assert payload(client.post("/api/conversations/send-batch", headers=admin, json={"dry_run": False}))["dry_run"] is True   # no confirm -> still a preview
    assert sent == []

    outside = payload(client.post("/api/conversations/send-batch", headers=admin, json={"date_from": "2025-07-01"}))
    assert outside["would_send"] == 0

    done = payload(client.post("/api/conversations/send-batch", headers=admin, json={"dry_run": False, "confirm": True, "date_to": "2025-06-10"}))
    assert done["sent"] == 1 and sent == ["asha@example.com"]
    again = payload(client.post("/api/conversations/send-batch", headers=admin, json={"dry_run": False, "confirm": True}))
    assert again["sent"] == 0 and sent == ["asha@example.com"]               # nothing is ever sent twice


def test_dismiss_and_staff_only(client, admin, monkeypatch):
    _run(monkeypatch)
    reply_id = _rows(client)[0]["id"]
    assert payload(client.post(f"/api/conversations/{reply_id}/dismiss", headers=admin))["status"] == "skipped"
    assert _rows(client, status="skipped")[0]["last_error"] == "dismissed by admin"
    other = register_and_approve(client, admin, "someoneelse")
    for path in ("/api/conversations", "/api/conversations/summary"):
        assert client.get(path, headers=other).status_code == 403
    assert client.post("/api/conversations/send-batch", headers=other, json={}).status_code == 403


def test_a_direct_answer_is_not_blocked_by_an_earlier_acknowledgement(client, monkeypatch):
    """Someone emailed from this mailbox before still gets an answer to a new question."""
    import app.services.email_worker as worker

    sent = []
    monkeypatch.setattr(worker, "deliver_reply", lambda *a: sent.append(a))
    monkeypatch.setattr(worker, "already_emailed_note", lambda *a: "already emailed on 31 Aug 2026")
    _run(monkeypatch)                                                   # a question -> kind "answer"
    assert client.post(f"/api/conversations/{_rows(client)[0]['id']}/send", headers=login(client)).status_code == 200
    assert len(sent) == 1
