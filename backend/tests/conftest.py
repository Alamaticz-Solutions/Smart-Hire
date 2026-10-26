"""Shared fixtures: throw-away SQLite database, fake LLM, no network."""
from __future__ import annotations

import os
import tempfile

# Must be set BEFORE the application is imported (config reads env at import).
_TMP = tempfile.mkdtemp(prefix="hireai_tests_")
for _name in ("POSTGRES_DATABASE_URL", "POSTGRES_HOST", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"):
    os.environ[_name] = ""
os.environ["STATS_DB_PATH"] = os.path.join(_TMP, "stats.db")
os.environ["GROQ_API_KEY"] = "test-key"
os.environ["HF_TOKEN"] = ""
os.environ["EMBEDDINGS_PROVIDER"] = "off"
os.environ["ENVIRONMENT"] = "development"
os.environ["SESSION_SECRET"] = "unit-test-secret"
os.environ["ALLOW_OTP_IN_RESPONSE"] = "true"

# The application calls ``load_dotenv(..., override=True)`` which would replace
# the values above with the developer's real backend/.env (i.e. point the tests
# at the real Postgres database).  Neutralise it before anything is imported.
import dotenv  # noqa: E402

dotenv.load_dotenv = lambda *args, **kwargs: False  # type: ignore[assignment]

import sqlite3  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


def pytest_sessionstart(session):  # noqa: D401
    """Abort the whole run if the app would talk to a real database."""
    from app.core import config as _config

    if _config.IS_POSTGRES:  # pragma: no cover - safety net
        raise pytest.UsageError(
            "Refusing to run tests: PostgreSQL is configured. Tests must use the throw-away SQLite database."
        )


class _Reply:
    def __init__(self, content: str) -> None:
        self.content = content


class FakeChat:
    """Stand-in for ``ChatGroq``; behaviour is controlled via ``FakeChat.handler``."""

    handler = staticmethod(lambda prompt: "Hello! I am Hire AI.")
    prompts: list[str] = []

    def __init__(self, **_kwargs) -> None:
        pass

    def invoke(self, messages):
        prompt = messages[0].content if isinstance(messages, list) else str(messages)
        FakeChat.prompts.append(prompt)
        return _Reply(FakeChat.handler(prompt))


@pytest.fixture(scope="session")
def app():
    import app.services.ai_clients as ai_clients
    from app.main import app as fastapi_app

    ai_clients.ChatGroq = FakeChat  # type: ignore[assignment]
    return fastapi_app


@pytest.fixture()
def client(app):
    """Fresh database for every test."""
    import app.services.ai_clients as ai_clients
    from app.core.config import STATS_DB
    from app.db.engine import configure_engine, dispose_engine
    from app.db.init_db import init_db
    from app.repositories import invalidate_candidate_table_cache
    from app.services import auth, rate_limit

    dispose_engine()  # release the SQLite file so it can be deleted on Windows
    for suffix in ("", "-wal", "-shm"):
        try:
            os.remove(STATS_DB + suffix)
        except FileNotFoundError:
            pass
    configure_engine()
    invalidate_candidate_table_cache()
    auth.invalidate_user_cache()
    rate_limit._attempts.clear()
    ai_clients._llm = None
    ai_clients._embeddings = None
    FakeChat.handler = staticmethod(lambda prompt: "Hello! I am Hire AI.")
    FakeChat.prompts = []
    init_db()
    return TestClient(app)


def login(client: TestClient, username: str = "admin", password: str = "admin") -> dict[str, str]:
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return {"x-session-token": _token(response.json())}


def _token(body: dict) -> str:
    # Supports both the raw payload and an enveloped payload.
    data = body.get("data", body) if isinstance(body.get("data", None), dict) else body
    return data["token"]


@pytest.fixture()
def admin(client) -> dict[str, str]:
    return login(client)


def register_and_approve(client: TestClient, admin_headers: dict[str, str], username: str, password: str = "Passw0rd") -> dict[str, str]:
    """Create an approved ordinary user via the public API; return auth headers."""
    response = client.post(
        "/api/auth/register",
        json={"full_name": username.title(), "username": username, "password": password, "email": f"{username}@example.com"},
    )
    assert response.status_code in (200, 201), response.text
    rows = client.get("/api/admin/requests", headers=admin_headers).json()
    rows = rows.get("data", rows) if isinstance(rows, dict) else rows
    pending = next(r for r in rows if r["target_id"] == username and r["status"] == "pending")
    assert client.post(f"/api/admin/requests/{pending['id']}/approve", headers=admin_headers).status_code == 200
    return login(client, username, password)


def payload(response):
    """Unwrap an (optionally enveloped) JSON response body."""
    body = response.json()
    if isinstance(body, dict) and "success" in body and "data" in body:
        return body["data"]
    return body


def db_value(sql: str, params: tuple = ()):  # direct DB peek for assertions
    from sqlalchemy import text

    from app.db.engine import get_engine

    with get_engine().connect() as connection:
        bound = {f"p{i}": v for i, v in enumerate(params)}
        statement = text(sql.replace("?", ":p{}").format(*range(len(params)))) if params else text(sql)
        row = connection.execute(statement, bound).first()
        return row[0] if row else None
