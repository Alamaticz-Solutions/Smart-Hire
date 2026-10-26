"""Supporting tables: audit log, moderation queue, settings, processed mail."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(Text, nullable=False)
    action: Mapped[str] = mapped_column(Text, nullable=False)
    timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime, server_default=func.now())


class TeamMember(Base):
    __tablename__ = "team_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, server_default=func.now())


class MaskedKeyword(Base):
    __tablename__ = "masked_keywords"

    keyword: Mapped[str] = mapped_column(Text, primary_key=True)


class CustomColumn(Base):
    __tablename__ = "custom_columns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    col_key: Mapped[Optional[str]] = mapped_column(Text, unique=True)
    col_label: Mapped[Optional[str]] = mapped_column(Text)
    description: Mapped[Optional[str]] = mapped_column(Text)


class ChangeRequest(Base):
    __tablename__ = "change_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(Text, nullable=False)
    action_type: Mapped[str] = mapped_column(Text, nullable=False)
    target_id: Mapped[Optional[str]] = mapped_column(Text)
    payload: Mapped[Optional[str]] = mapped_column(Text)
    description: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[Optional[str]] = mapped_column(Text, default="pending", server_default="pending")
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, server_default=func.now())


class ProcessedEmail(Base):
    __tablename__ = "processed_emails"

    msg_uid: Mapped[str] = mapped_column(Text, primary_key=True)
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, server_default=func.now())


class IntegrationSettings(Base):
    """Single-row table with mailbox / storage integration settings."""

    __tablename__ = "integrations_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email_enabled: Mapped[Optional[int]] = mapped_column(Integer, default=0, server_default="0")
    imap_host: Mapped[Optional[str]] = mapped_column(Text, default="imap.gmail.com")
    imap_port: Mapped[Optional[int]] = mapped_column(Integer, default=993)
    smtp_host: Mapped[Optional[str]] = mapped_column(Text, default="smtp.gmail.com")
    smtp_port: Mapped[Optional[int]] = mapped_column(Integer, default=587)
    email_user: Mapped[Optional[str]] = mapped_column(Text)
    email_pass: Mapped[Optional[str]] = mapped_column(Text)
    keywords: Mapped[Optional[str]] = mapped_column(Text, default="resume,alamaticz,solution,job")
    drive_enabled: Mapped[Optional[int]] = mapped_column(Integer, default=0, server_default="0")
    reply_theme: Mapped[Optional[str]] = mapped_column(Text, default="professional")
    reply_subject: Mapped[Optional[str]] = mapped_column(Text, default="Re: {subject} (Ref: {ref})")
    reply_body_missing: Mapped[Optional[str]] = mapped_column(Text)
    reply_body_complete: Mapped[Optional[str]] = mapped_column(Text)
    gdrive_client_id: Mapped[Optional[str]] = mapped_column(Text)
    gdrive_client_secret: Mapped[Optional[str]] = mapped_column(Text)
    gdrive_refresh_token: Mapped[Optional[str]] = mapped_column(Text)
    gdrive_folder_id: Mapped[Optional[str]] = mapped_column(Text)
    gdrive_email: Mapped[Optional[str]] = mapped_column(Text)
    ms_client_id: Mapped[Optional[str]] = mapped_column(Text)
    ms_client_secret: Mapped[Optional[str]] = mapped_column(Text)
    ms_tenant_id: Mapped[Optional[str]] = mapped_column(Text, default="common")
    gmail_enabled: Mapped[Optional[int]] = mapped_column(Integer, default=0, server_default="0")
    gmail_email: Mapped[Optional[str]] = mapped_column(Text)
    gmail_pass: Mapped[Optional[str]] = mapped_column(Text)
    outlook_enabled: Mapped[Optional[int]] = mapped_column(Integer, default=0, server_default="0")
    outlook_email: Mapped[Optional[str]] = mapped_column(Text)
    additional_emails: Mapped[Optional[str]] = mapped_column(Text, default="[]")
    theme_usage_counts: Mapped[Optional[str]] = mapped_column(Text, default="{}")
    default_resume_template: Mapped[Optional[str]] = mapped_column(Text, default="alamaticz")
    # Mail import guards (UI: Connect page)
    auto_reply_enabled: Mapped[Optional[int]] = mapped_column(Integer, default=0, server_default="0")
    mail_import_from: Mapped[Optional[str]] = mapped_column(Text)   # YYYY-MM-DD, inclusive; empty = no lower bound
    mail_import_to: Mapped[Optional[str]] = mapped_column(Text)     # YYYY-MM-DD, inclusive; empty = no upper bound
    skip_automated_senders: Mapped[Optional[int]] = mapped_column(Integer, default=1, server_default="1")


class MailReply(Base):
    """One acknowledgement e-mail per imported message: pending until the
    auto-reply switch is on, then sent exactly once."""

    __tablename__ = "mail_replies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    msg_uid: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    candidate_id: Mapped[Optional[int]] = mapped_column(Integer)
    recipient: Mapped[str] = mapped_column(Text, nullable=False)
    original_subject: Mapped[Optional[str]] = mapped_column(Text)
    mailbox_email: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, default="pending", server_default="pending")  # pending|sent|skipped|failed
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_error: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, server_default=func.now())
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
