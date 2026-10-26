"""Candidate (resume) model.

The physical table keeps its historical name ``candidate_metadata``.
Administrators can add *custom columns* at runtime; those exist only in the
database and are reached through table reflection in ``CandidateRepository``.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, Integer, LargeBinary, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Candidate(Base):
    __tablename__ = "candidate_metadata"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    filename: Mapped[Optional[str]] = mapped_column(Text)
    full_name: Mapped[Optional[str]] = mapped_column(Text)
    candidate_status: Mapped[Optional[str]] = mapped_column(Text, default="New", server_default="New")
    total_experience: Mapped[Optional[float]] = mapped_column(Float, default=0.0, server_default="0")
    pega_experience: Mapped[Optional[float]] = mapped_column(Float, default=0.0, server_default="0")
    skills: Mapped[Optional[str]] = mapped_column(Text)
    certifications: Mapped[Optional[str]] = mapped_column(Text)
    ctc: Mapped[Optional[str]] = mapped_column(Text)
    notice_period: Mapped[Optional[str]] = mapped_column(Text)
    current_organization: Mapped[Optional[str]] = mapped_column(Text)
    email: Mapped[Optional[str]] = mapped_column(Text)
    phone: Mapped[Optional[str]] = mapped_column(Text)
    linkedin: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(Text, default="admin", server_default="admin")
    timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime, server_default=func.now())
    file_bytes: Mapped[Optional[bytes]] = mapped_column(LargeBinary)
    source: Mapped[Optional[str]] = mapped_column(Text, default="Resume Upload", server_default="Resume Upload")
    cdh_exp: Mapped[Optional[float]] = mapped_column(Float, default=0.0, server_default="0")
    expected_ctc: Mapped[Optional[str]] = mapped_column(Text)
    percentage_hike: Mapped[Optional[str]] = mapped_column(Text)
    candidate_interview_status: Mapped[Optional[str]] = mapped_column(Text)
    availability_in_days: Mapped[Optional[int]] = mapped_column(Integer)
    current_location: Mapped[Optional[str]] = mapped_column(Text)
    pref_locations: Mapped[Optional[str]] = mapped_column(Text)
    current_client: Mapped[Optional[str]] = mapped_column(Text)
    domain: Mapped[Optional[str]] = mapped_column(Text)
    tier: Mapped[Optional[str]] = mapped_column(Text)
    certification_version: Mapped[Optional[str]] = mapped_column(Text)
    email_message: Mapped[Optional[str]] = mapped_column(Text)
    formatted_json: Mapped[Optional[str]] = mapped_column(Text)
    sender_email: Mapped[Optional[str]] = mapped_column(Text)
    is_qualified: Mapped[Optional[int]] = mapped_column(Integer, default=0, server_default="0")
    is_approved: Mapped[Optional[int]] = mapped_column(Integer, default=1, server_default="1")
    file_url: Mapped[Optional[str]] = mapped_column(Text)
    error_detail: Mapped[Optional[str]] = mapped_column(Text)
    mail_received_at: Mapped[Optional[datetime]] = mapped_column(DateTime)  # when the source e-mail arrived (UTC)


#: Columns returned by list endpoints (binary / large payloads excluded).
CANDIDATE_LIST_COLUMNS: tuple[str, ...] = (
    "id", "filename", "full_name", "candidate_status", "total_experience", "pega_experience",
    "skills", "certifications", "ctc", "notice_period", "current_organization", "email", "phone",
    "linkedin", "created_by", "timestamp", "source", "cdh_exp", "expected_ctc", "percentage_hike",
    "candidate_interview_status", "availability_in_days", "current_location", "pref_locations",
    "current_client", "domain", "tier", "certification_version",
    "sender_email", "is_qualified", "is_approved", "file_url", "error_detail", "mail_received_at",
)

#: Editing any of these re-triggers automatic job matching.
MATCH_RELATED_FIELDS: frozenset[str] = frozenset({
    "full_name", "total_experience", "pega_experience", "cdh_exp",
    "skills", "certifications", "current_location", "pref_locations",
})
