"""Declarative base for every ORM model."""
from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """All tables register themselves on ``Base.metadata``."""
