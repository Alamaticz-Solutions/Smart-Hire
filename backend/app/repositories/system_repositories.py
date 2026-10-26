"""Repositories for the small supporting tables."""
from __future__ import annotations

from typing import Optional, Sequence

from sqlalchemy import delete, func, select

from app.models import (
    ActivityLog,
    ChangeRequest,
    CustomColumn,
    IntegrationSettings,
    MailReply,
    MaskedKeyword,
    ProcessedEmail,
    TeamMember,
)
from app.repositories.base import BaseRepository


class ActivityRepository(BaseRepository):
    def add(self, username: str, action: str) -> None:
        self.session.add(ActivityLog(username=username or "unknown", action=action))

    def list_recent_first(self, limit: Optional[int] = None) -> Sequence[ActivityLog]:
        stmt = select(ActivityLog).order_by(ActivityLog.timestamp.desc(), ActivityLog.id.desc())
        if limit:
            stmt = stmt.limit(limit)
        return self.session.scalars(stmt).all()

    def list_with_names(self) -> list[dict]:
        """Activity feed joined with the actor's display name (LEFT JOIN so
        entries of since-deleted users still appear)."""
        from app.models import User

        stmt = (
            select(
                ActivityLog.id, ActivityLog.username, ActivityLog.action,
                ActivityLog.timestamp, User.full_name,
            )
            .select_from(ActivityLog)
            .outerjoin(User, func.lower(User.username) == func.lower(ActivityLog.username))
            .order_by(ActivityLog.timestamp.desc(), ActivityLog.id.desc())
        )
        return [dict(r._mapping) for r in self.session.execute(stmt)]

    def clear(self) -> None:
        self.session.execute(delete(ActivityLog))

    def delete_for_user(self, username: str) -> None:
        self.session.execute(delete(ActivityLog).where(func.lower(ActivityLog.username) == username.lower()))


class TeamMemberRepository(BaseRepository):
    def list_all(self) -> Sequence[TeamMember]:
        return self.session.scalars(select(TeamMember).order_by(TeamMember.name.asc())).all()

    def get(self, member_id: int) -> Optional[TeamMember]:
        return self.session.get(TeamMember, member_id)

    def exists(self, name: str) -> bool:
        return self.session.scalar(select(TeamMember.id).where(TeamMember.name == name)) is not None

    def add(self, name: str) -> TeamMember:
        member = TeamMember(name=name)
        self.session.add(member)
        self.session.flush()
        return member

    def delete(self, member: TeamMember) -> None:
        self.session.delete(member)

    def delete_by_names(self, *names: str) -> None:
        lowered = [n.lower() for n in names if n]
        if lowered:
            self.session.execute(delete(TeamMember).where(func.lower(TeamMember.name).in_(lowered)))


class MaskedKeywordRepository(BaseRepository):
    def list_all(self) -> list[str]:
        return list(self.session.scalars(select(MaskedKeyword.keyword)))

    def add(self, keyword: str) -> None:
        if self.session.get(MaskedKeyword, keyword) is None:
            self.session.add(MaskedKeyword(keyword=keyword))

    def remove(self, keyword: str) -> None:
        self.session.execute(delete(MaskedKeyword).where(MaskedKeyword.keyword == keyword))


class CustomColumnRepository(BaseRepository):
    def list_all(self) -> Sequence[CustomColumn]:
        return self.session.scalars(select(CustomColumn).order_by(CustomColumn.id)).all()

    def get_by_key(self, key: str) -> Optional[CustomColumn]:
        return self.session.scalar(select(CustomColumn).where(CustomColumn.col_key == key))

    def add(self, key: str, label: str, description: str) -> None:
        if self.get_by_key(key) is None:
            self.session.add(CustomColumn(col_key=key, col_label=label, description=description))

    def remove(self, key: str) -> None:
        self.session.execute(delete(CustomColumn).where(CustomColumn.col_key == key))


class ChangeRequestRepository(BaseRepository):
    def get(self, request_id: int) -> Optional[ChangeRequest]:
        return self.session.get(ChangeRequest, request_id)

    def list_recent_first(self) -> Sequence[ChangeRequest]:
        return self.session.scalars(
            select(ChangeRequest).order_by(ChangeRequest.created_at.desc(), ChangeRequest.id.desc())
        ).all()

    def create(
        self,
        username: str,
        action_type: str,
        target_id: Optional[str] = None,
        payload: Optional[str] = None,
        description: Optional[str] = None,
    ) -> ChangeRequest:
        request = ChangeRequest(
            username=username, action_type=action_type, target_id=target_id,
            payload=payload, description=description, status="pending",
        )
        self.session.add(request)
        self.session.flush()
        return request

    def delete_involving_user(self, username: str) -> None:
        lowered = username.lower()
        self.session.execute(
            delete(ChangeRequest).where(
                (func.lower(ChangeRequest.username) == lowered) | (func.lower(ChangeRequest.target_id) == lowered)
            )
        )

    def delete_all(self) -> None:
        self.session.execute(delete(ChangeRequest))


class ProcessedEmailRepository(BaseRepository):
    def exists(self, msg_uid: str) -> bool:
        return self.session.get(ProcessedEmail, msg_uid) is not None

    def mark(self, msg_uid: str) -> None:
        if not self.exists(msg_uid):
            self.session.add(ProcessedEmail(msg_uid=msg_uid))
            self.session.flush()

    def delete_all(self) -> None:
        self.session.execute(delete(ProcessedEmail))


class IntegrationSettingsRepository(BaseRepository):
    def get(self) -> Optional[IntegrationSettings]:
        return self.session.scalar(select(IntegrationSettings).order_by(IntegrationSettings.id).limit(1))

    def get_or_create(self) -> IntegrationSettings:
        settings = self.get()
        if settings is None:
            settings = IntegrationSettings()
            self.session.add(settings)
            self.session.flush()
        return settings


class MailReplyRepository(BaseRepository):
    """Reply log: guarantees each message / recipient is acknowledged at most once."""

    MAX_ATTEMPTS = 3

    def get_by_msg(self, msg_uid: str) -> Optional[MailReply]:
        return self.session.scalar(select(MailReply).where(MailReply.msg_uid == msg_uid))

    def already_replied(self, recipient: str, candidate_id: Optional[int]) -> bool:
        stmt = select(MailReply.id).where(
            func.lower(MailReply.recipient) == recipient.lower(), MailReply.status == "sent"
        )
        if candidate_id:
            stmt = stmt.where(MailReply.candidate_id == candidate_id)
        return self.session.scalar(stmt.limit(1)) is not None

    def queue(
        self, msg_uid: str, candidate_id: Optional[int], recipient: str,
        original_subject: Optional[str], mailbox_email: str,
    ) -> MailReply:
        """Idempotent: a message is queued once, whatever happens later."""
        existing = self.get_by_msg(msg_uid)
        if existing is not None:
            return existing
        reply = MailReply(
            msg_uid=msg_uid, candidate_id=candidate_id, recipient=recipient,
            original_subject=original_subject, mailbox_email=mailbox_email, status="pending",
        )
        self.session.add(reply)
        self.session.flush()
        return reply

    def pending(self, limit: int = 25) -> Sequence[MailReply]:
        return self.session.scalars(
            select(MailReply)
            .where(MailReply.status == "pending", MailReply.attempts < self.MAX_ATTEMPTS)
            .order_by(MailReply.id)
            .limit(limit)
        ).all()

    def counts(self) -> dict[str, int]:
        rows = self.session.execute(select(MailReply.status, func.count()).group_by(MailReply.status)).all()
        return {status: total for status, total in rows}

    def failed(self, limit: int = 500) -> Sequence[MailReply]:
        return self.session.scalars(
            select(MailReply).where(MailReply.status == "failed").order_by(MailReply.id.desc()).limit(limit)
        ).all()

    def recent(self, limit: int = 25) -> Sequence[MailReply]:
        return self.session.scalars(select(MailReply).order_by(MailReply.id.desc()).limit(limit)).all()
