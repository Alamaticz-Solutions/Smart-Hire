"""Data access for users."""
from __future__ import annotations

from typing import Optional, Sequence

from sqlalchemy import delete, func, select

from app.models import User
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository):
    def get_by_id(self, user_id: int) -> Optional[User]:
        return self.session.get(User, user_id)

    def get_by_username(self, username: Optional[str]) -> Optional[User]:
        """Case-insensitive lookup."""
        if not username:
            return None
        return self.session.scalar(select(User).where(func.lower(User.username) == username.lower()))

    def username_exists(self, username: str) -> bool:
        return self.get_by_username(username) is not None

    def list_all(self) -> Sequence[User]:
        return self.session.scalars(select(User).order_by(User.id)).all()

    def list_emails(self) -> list[str]:
        return [e for e in self.session.scalars(select(User.email)).all() if e]

    def find_by_mobile(self, mobile: str) -> Optional[User]:
        for user in self.session.scalars(select(User).where(User.mobile.is_not(None))):
            if str(user.mobile).strip() == mobile:
                return user
        return None

    def add(self, user: User) -> User:
        self.session.add(user)
        self.session.flush()
        return user

    def delete(self, user: User) -> None:
        self.session.delete(user)

    def delete_by_username(self, username: str) -> None:
        self.session.execute(delete(User).where(func.lower(User.username) == username.lower()))
