"""Where data came from: one row per pulled mail, and one batch per uploaded spreadsheet."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

#: Outcomes recorded for every mail the poller looks at.
MAIL_OUTCOMES = (
    "imported",          # a candidate was created from the resume
    "follow_up",         # reply from an existing candidate; their profile was updated
    "failed",            # resume found but could not be processed
    "pending_retry",     # AI rate-limited: the mail was released and will be retried
    "skipped_automated", # noreply / invoice / newsletter / bounce
    "legacy_file",       # only .doc / .xls attachments (cannot be parsed)
    "no_resume",         # nothing that looks like a resume
    "not_pulled",        # in the mailbox but not imported yet (outside the window / over the cap)
)


class MailMessage(Base):
    __tablename__ = "mail_messages"

    msg_uid: Mapped[str] = mapped_column(Text, primary_key=True)
    mailbox_email: Mapped[Optional[str]] = mapped_column(Text)
    sender_email: Mapped[Optional[str]] = mapped_column(Text)
    sender_name: Mapped[Optional[str]] = mapped_column(Text)
    subject: Mapped[Optional[str]] = mapped_column(Text)
    received_at: Mapped[Optional[datetime]] = mapped_column(DateTime)  # UTC, when the mailbox received it
    has_attachments: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    attachment_names: Mapped[Optional[str]] = mapped_column(Text)  # comma separated
    outcome: Mapped[str] = mapped_column(Text, default="no_resume", server_default="no_resume")
    reason: Mapped[Optional[str]] = mapped_column(Text)
    candidate_id: Mapped[Optional[int]] = mapped_column(Integer)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, server_default=func.now())


class ImportBatch(Base):
    """One uploaded spreadsheet (or a mail run in future)."""

    __tablename__ = "import_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(Text, default="excel", server_default="excel")
    name: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, server_default=func.now())
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(Text, default="running", server_default="running")  # running|done|failed|undone
    total_rows: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    imported: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    updated: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    skipped: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    errors: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    note: Mapped[Optional[str]] = mapped_column(Text)


class ImportItem(Base):
    __tablename__ = "import_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    batch_id: Mapped[int] = mapped_column(Integer, nullable=False)
    sheet: Mapped[Optional[str]] = mapped_column(Text)
    row_no: Mapped[Optional[int]] = mapped_column(Integer)
    label: Mapped[Optional[str]] = mapped_column(Text)       # name / email of the row
    status: Mapped[str] = mapped_column(Text, default="imported", server_default="imported")  # imported|updated|skipped|error
    reason: Mapped[Optional[str]] = mapped_column(Text)
    candidate_id: Mapped[Optional[int]] = mapped_column(Integer)
