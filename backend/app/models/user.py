"""User account."""
from __future__ import annotations

from typing import Optional

from sqlalchemy import Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    full_name: Mapped[Optional[str]] = mapped_column(Text)
    username: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[Optional[str]] = mapped_column(Text, default="user", server_default="user")
    is_hr: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_admin: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_external: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    hidden_fields: Mapped[Optional[str]] = mapped_column(Text, default="", server_default="")
    email: Mapped[Optional[str]] = mapped_column(Text)
    mobile: Mapped[Optional[str]] = mapped_column(Text)
    is_approved: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
