"""Schema bootstrap, light migrations and seed data.

Idempotent: safe to run on every start-up against a brand-new *or* an
existing database.  Missing tables are created from the ORM models, missing
columns are added, and default users / team members / keywords are seeded only
when absent.

Call :func:`init_db` explicitly from the application lifespan so start-up
ordering is deterministic and testable.
"""
from __future__ import annotations

import os
import secrets

from datetime import datetime, timedelta

from sqlalchemy import DateTime, Engine, func, inspect, select, text, update
from sqlalchemy.orm import Session

from app.core.config import DEBUG
from app.core.logging import get_logger
from app.db.engine import get_engine, session_scope
from app.models import (
    ActivityLog,
    Base,
    Candidate,
    IntegrationSettings,
    MaskedKeyword,
    TeamMember,
    User,
)
from app.services.passwords import hash_password

logger = get_logger(__name__)

DEFAULT_RECRUITERS = ("Boopathi", "Praveen", "Harish", "Sabari")
DEFAULT_USERNAMES = ("admin", "user", "boopathi", "praveen", "harish", "sabari")
DEFAULT_MASKED_KEYWORDS = ("CSSA", "LSA")
DEFAULT_KEYWORD_FILTER = "resume,alamaticz,solution,job"

_INDEXES = (
    "CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username))",
    "CREATE INDEX IF NOT EXISTS idx_candidate_metadata_created_by_lower ON candidate_metadata (LOWER(created_by))",
    "CREATE INDEX IF NOT EXISTS idx_candidate_metadata_timestamp ON candidate_metadata (timestamp)",
    "CREATE INDEX IF NOT EXISTS idx_jobs_created_by_lower ON jobs (LOWER(created_by))",
    "CREATE INDEX IF NOT EXISTS idx_job_candidates_candidate_id ON job_candidates (candidate_id)",
    "CREATE INDEX IF NOT EXISTS idx_job_shares_username_lower ON job_shares (LOWER(username))",
    "CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs (timestamp)",
    "CREATE INDEX IF NOT EXISTS idx_mail_messages_received_at ON mail_messages (received_at)",
    "CREATE INDEX IF NOT EXISTS idx_mail_messages_outcome ON mail_messages (outcome)",
    "CREATE INDEX IF NOT EXISTS idx_import_items_batch ON import_items (batch_id)",
    "CREATE INDEX IF NOT EXISTS idx_candidate_metadata_origin ON candidate_metadata (origin)",
    "CREATE INDEX IF NOT EXISTS idx_candidate_metadata_record_state ON candidate_metadata (record_state)",
)


def init_db(engine: Engine | None = None) -> None:
    """Create / migrate the schema and seed reference data."""
    engine = engine or get_engine()
    _repair_legacy_activity_logs(engine)
    Base.metadata.create_all(engine)
    _add_missing_columns(engine)
    _create_indexes(engine)
    with session_scope() as session:
        _recover_interrupted_processing(session)
        _backfill_candidate_origin(session)
        _seed_users(session)
        _seed_team_members(session)
        _seed_masked_keywords(session)
        _seed_integration_settings(session)
    _encrypt_existing_secrets()
    logger.info("Database initialised")


# ── schema ─────────────────────────────────────────────────────────────────
def _repair_legacy_activity_logs(engine: Engine) -> None:
    """Very old databases stored ``user_id`` instead of ``username``."""
    inspector = inspect(engine)
    if inspector.has_table("activity_logs"):
        columns = {c["name"] for c in inspector.get_columns("activity_logs")}
        if "username" not in columns:
            logger.warning("Rebuilding legacy activity_logs table")
            ActivityLog.__table__.drop(engine)


def _add_missing_columns(engine: Engine) -> None:
    """Add columns introduced after a table was first created."""
    inspector = inspect(engine)
    for table in Base.metadata.sorted_tables:
        if not inspector.has_table(table.name):
            continue
        existing = {c["name"] for c in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name in existing:
                continue
            ddl_type = column.type.compile(dialect=engine.dialect)
            with engine.begin() as connection:
                connection.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {ddl_type}'))
            logger.info("Added column %s.%s", table.name, column.name)


def _create_indexes(engine: Engine) -> None:
    for statement in _INDEXES:
        try:
            with engine.begin() as connection:
                connection.execute(text(statement))
        except Exception:
            logger.debug("Index statement skipped: %s", statement, exc_info=True)


def _encrypt_existing_secrets() -> None:
    """Encrypt secrets that were stored as plain text (runs only when SECRETS_KEY is configured)."""
    from sqlalchemy.orm.attributes import flag_modified

    from app.core.secrets import PREFIX, encryption_enabled

    if not encryption_enabled():
        logger.warning("SECRETS_KEY is not set: mailbox / Microsoft / Drive secrets are stored UNENCRYPTED in the database")
        return
    columns = ("email_pass", "gmail_pass", "ms_client_secret", "gdrive_client_secret", "gdrive_refresh_token", "additional_emails")
    with session_scope() as session:
        raw = session.execute(text("SELECT id, " + ", ".join(columns) + " FROM integrations_settings")).all()
        for record in raw:
            plain = [name for name, value in zip(columns, record[1:]) if value and not str(value).startswith(PREFIX)
                     and not (name == "additional_emails" and str(value).strip() in ("[]", ""))]
            if not plain:
                continue
            row = session.get(IntegrationSettings, record[0])
            for name in plain:
                flag_modified(row, name)  # rewriting the value encrypts it through the column type
            logger.info("Encrypted %d stored secret(s)", len(plain))


# ── seeding ────────────────────────────────────────────────────────────────
def _initial_password_hash(username: str) -> str:
    """Hash for a freshly seeded account.

    * ``ADMIN_INITIAL_PASSWORD`` (env) sets the ``admin`` password explicitly.
    * Development keeps the historical convenience password (== username).
    * Production never ships a guessable default: a random password is
      generated and logged once; change it afterwards with
      ``python -m scripts.set_password <username>``.
    """
    explicit = os.getenv("ADMIN_INITIAL_PASSWORD") if username == "admin" else None
    if explicit:
        return hash_password(explicit)
    if DEBUG:
        return hash_password(username)
    generated = secrets.token_urlsafe(12)
    logger.warning("Seeded account %r created with generated password: %s", username, generated)
    return hash_password(generated)


def _get_user(session: Session, username: str) -> User | None:
    return session.scalar(select(User).where(func.lower(User.username) == username.lower()))


def _recover_interrupted_processing(session: Session) -> None:
    """Mark placeholders left behind by an ungraceful shutdown as failed.

    Only rows older than 30 minutes: a freshly started instance must not fail a resume that another
    instance (or the poller) is parsing right now.
    """
    now = session.scalar(select(func.now(type_=DateTime)))
    cutoff = (now.replace(tzinfo=None) if now is not None else datetime.now()) - timedelta(minutes=30)
    session.execute(
        update(Candidate)
        .where(Candidate.full_name.like("%Processing%"), Candidate.timestamp < cutoff)
        .values(full_name=func.replace(Candidate.full_name, "⏳ Processing: ", "❌ Failed: "), candidate_status="Error",
                record_state="failed", error_detail="Processing was interrupted (the server restarted). Use Retry.")
    )


def _backfill_candidate_origin(session: Session) -> None:
    """Give rows created before ``origin`` / ``record_state`` existed a sensible value (cheap, idempotent)."""
    mail = func.lower(func.coalesce(Candidate.source, "")).in_(("uploaded from mail", "email", "mail"))
    session.execute(update(Candidate).where(Candidate.origin.is_(None), mail).values(origin="mail"))
    session.execute(update(Candidate).where(
        Candidate.origin.is_(None), func.lower(func.coalesce(Candidate.source, "")) == "excel import").values(origin="excel"))
    session.execute(update(Candidate).where(
        Candidate.origin.is_(None), func.lower(func.coalesce(Candidate.source, "")) == "manual entry").values(origin="manual"))
    session.execute(update(Candidate).where(Candidate.origin.is_(None)).values(origin="resume"))
    session.execute(update(Candidate).where(Candidate.record_state.is_(None), Candidate.candidate_status == "Error").values(record_state="failed"))
    session.execute(update(Candidate).where(Candidate.record_state.is_(None)).values(record_state="active"))


def _seed_users(session: Session) -> None:
    admin = _get_user(session, "admin")
    if admin is None:
        session.add(User(
            full_name="System Admin", username="admin", password_hash=_initial_password_hash("admin"),
            role="admin", is_hr=1, is_admin=1, email="admin@gmail.com", is_approved=1,
        ))
    else:
        admin.role, admin.is_hr, admin.is_admin, admin.is_approved = "admin", 1, 1, 1

    if _get_user(session, "user") is None:
        session.add(User(
            full_name="Test User", username="user", password_hash=_initial_password_hash("user"),
            role="user", is_hr=0, is_admin=0, email="user@gmail.com", is_approved=1,
        ))

    for name in DEFAULT_RECRUITERS:
        username = name.lower()
        lead = username == "sabari"
        role = "admin" if lead else "user"
        user = _get_user(session, username)
        if user is None:
            session.add(User(
                full_name=name, username=username, password_hash=_initial_password_hash(username),
                role=role, is_hr=int(lead), is_admin=int(lead), email=f"{username}@gmail.com", is_approved=1,
            ))
        # existing accounts are left alone: roles / approval changed by an admin must survive a restart

    session.flush()
    for username in (*DEFAULT_USERNAMES, "somasekhar9"):
        user = _get_user(session, username)
        if user is not None and not user.email:
            user.email = f"{username}@gmail.com"


def _seed_team_members(session: Session) -> None:
    if session.scalar(select(func.count()).select_from(TeamMember)):
        return
    session.add_all(TeamMember(name=name) for name in DEFAULT_RECRUITERS)


def _seed_masked_keywords(session: Session) -> None:
    if session.scalar(select(func.count()).select_from(MaskedKeyword)):
        return
    session.add_all(MaskedKeyword(keyword=kw) for kw in DEFAULT_MASKED_KEYWORDS)


def _seed_integration_settings(session: Session) -> None:
    if session.scalar(select(func.count()).select_from(IntegrationSettings)):
        return

    def _port(name: str, default: int) -> int:
        try:
            return int(os.getenv(name, str(default)))
        except ValueError:
            return default

    user = os.getenv("SMTP_SENDER", "")
    password = os.getenv("SMTP_PASSWORD", "")
    session.add(IntegrationSettings(
        email_enabled=int(bool(user and password)),
        imap_host=os.getenv("IMAP_HOST", "imap.gmail.com"),
        imap_port=_port("IMAP_PORT", 993),
        smtp_host=os.getenv("SMTP_HOST", "smtp.gmail.com"),
        smtp_port=_port("SMTP_PORT", 587),
        email_user=user,
        email_pass=password,
        keywords=DEFAULT_KEYWORD_FILTER,
        drive_enabled=0,
    ))
