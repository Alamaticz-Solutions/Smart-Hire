"""Job description, candidate-to-job link and sharing models."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    client_name: Mapped[Optional[str]] = mapped_column(Text)
    contact_name: Mapped[Optional[str]] = mapped_column(Text)
    client_phone: Mapped[Optional[str]] = mapped_column(Text)
    account_manager: Mapped[Optional[str]] = mapped_column(Text)
    assigned_recruiter: Mapped[Optional[str]] = mapped_column(Text)
    target_date: Mapped[Optional[str]] = mapped_column(Text)
    job_type: Mapped[Optional[str]] = mapped_column(Text)
    job_status: Mapped[Optional[str]] = mapped_column(Text)
    work_experience: Mapped[Optional[str]] = mapped_column(Text)
    industry: Mapped[Optional[str]] = mapped_column(Text)
    salary: Mapped[Optional[str]] = mapped_column(Text)
    required_skills: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(Text, default="admin", server_default="admin")
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, server_default=func.now())


class JobCandidate(Base):
    __tablename__ = "job_candidates"

    job_id: Mapped[int] = mapped_column(Integer, ForeignKey("jobs.id"), primary_key=True)
    candidate_id: Mapped[int] = mapped_column(Integer, ForeignKey("candidate_metadata.id"), primary_key=True)
    ai_reason: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[Optional[str]] = mapped_column(Text, default="matched", server_default="matched")


class JobShare(Base):
    __tablename__ = "job_shares"

    job_id: Mapped[int] = mapped_column(Integer, ForeignKey("jobs.id"), primary_key=True)
    username: Mapped[str] = mapped_column(Text, ForeignKey("users.username"), primary_key=True)
