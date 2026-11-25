"""Repositories for the small supporting tables."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, Sequence

from sqlalchemy import DateTime, delete, func, select

from app.models import (
    ImportBatch,
    ImportItem,
    MailMessage,
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

    def resolve_pending_approvals(self, username: str, status: str = "approved") -> int:
        """Close any open "approve_user" request for ``username`` (e.g. approved through Permissions)."""
        rows = self.session.scalars(
            select(ChangeRequest).where(
                ChangeRequest.action_type == "approve_user",
                ChangeRequest.status == "pending",
                func.lower(ChangeRequest.target_id) == username.lower(),
            )
        ).all()
        for row in rows:
            row.status = status
        return len(rows)

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

    def existing(self, msg_uids: Sequence[str]) -> set[str]:
        """Which of these ids are already processed (one query per 500 instead of one per message)."""
        found: set[str] = set()
        uids = list(msg_uids)
        for start in range(0, len(uids), 500):
            chunk = uids[start:start + 500]
            found.update(self.session.scalars(select(ProcessedEmail.msg_uid).where(ProcessedEmail.msg_uid.in_(chunk))))
        return found

    def mark(self, msg_uid: str) -> None:
        if not self.exists(msg_uid):
            self.session.add(ProcessedEmail(msg_uid=msg_uid))
            self.session.flush()

    def unmark(self, msg_uid: str) -> None:
        """Forget a message so the next poll picks it up again."""
        self.session.execute(delete(ProcessedEmail).where(ProcessedEmail.msg_uid == msg_uid))

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

    def db_now(self) -> datetime:
        """The database clock as a naive datetime - the same clock ``created_at`` was stamped with."""
        value = self.session.scalar(select(func.now(type_=DateTime)))
        return value.replace(tzinfo=None) if value is not None else datetime.now(timezone.utc).replace(tzinfo=None)

    def failed(self, limit: int = 500) -> Sequence[MailReply]:
        return self.session.scalars(
            select(MailReply).where(MailReply.status == "failed").order_by(MailReply.id.desc()).limit(limit)
        ).all()

    def recent(self, limit: int = 25) -> Sequence[MailReply]:
        return self.session.scalars(select(MailReply).order_by(MailReply.id.desc()).limit(limit)).all()


class MailMessageRepository(BaseRepository):
    """The mail log: one row per message the poller (or the backfill) has seen."""

    def get(self, msg_uid: str) -> Optional[MailMessage]:
        return self.session.get(MailMessage, msg_uid)

    def upsert(self, msg_uid: str, **fields) -> MailMessage:
        row = self.get(msg_uid)
        if row is None:
            row = MailMessage(msg_uid=msg_uid)
            self.session.add(row)
        for key, value in fields.items():
            if value is not None:
                setattr(row, key, value)
        row.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        self.session.flush()
        return row

    def _filtered(self, stmt, outcome=None, search=None, date_from=None, date_to=None):
        if outcome:
            stmt = stmt.where(MailMessage.outcome.in_([o for o in outcome.split(",") if o]))
        if search:
            like = f"%{search.lower()}%"
            stmt = stmt.where(
                func.lower(func.coalesce(MailMessage.sender_email, "")).like(like)
                | func.lower(func.coalesce(MailMessage.subject, "")).like(like)
                | func.lower(func.coalesce(MailMessage.attachment_names, "")).like(like)
            )
        if date_from:
            stmt = stmt.where(MailMessage.received_at >= date_from)
        if date_to:
            stmt = stmt.where(MailMessage.received_at < date_to)
        return stmt

    def list(self, outcome=None, search=None, date_from=None, date_to=None, limit: int = 50, offset: int = 0):
        stmt = self._filtered(select(MailMessage), outcome, search, date_from, date_to)
        total = self.session.scalar(self._filtered(select(func.count()).select_from(MailMessage), outcome, search, date_from, date_to))
        rows = self.session.scalars(
            stmt.order_by(MailMessage.received_at.desc(), MailMessage.msg_uid).limit(limit).offset(offset)
        ).all()
        return rows, int(total or 0)

    def counts(self) -> dict[str, int]:
        rows = self.session.execute(select(MailMessage.outcome, func.count()).group_by(MailMessage.outcome)).all()
        return {outcome: total for outcome, total in rows}


class ImportBatchRepository(BaseRepository):
    def create(self, kind: str, name: str, created_by: str) -> ImportBatch:
        batch = ImportBatch(kind=kind, name=name, created_by=created_by, status="running")
        self.session.add(batch)
        self.session.flush()
        return batch

    def get(self, batch_id: int) -> Optional[ImportBatch]:
        return self.session.get(ImportBatch, batch_id)

    def add_item(self, batch_id: int, status: str, label: str = "", reason: Optional[str] = None,
                 candidate_id: Optional[int] = None, row_no: Optional[int] = None, sheet: Optional[str] = None) -> None:
        self.session.add(ImportItem(
            batch_id=batch_id, status=status, label=(label or "")[:200], reason=reason,
            candidate_id=candidate_id, row_no=row_no, sheet=sheet,
        ))

    def finish(self, batch_id: int, status: str = "done", note: Optional[str] = None) -> None:
        batch = self.get(batch_id)
        if batch is None:
            return
        counts = dict(self.session.execute(
            select(ImportItem.status, func.count()).where(ImportItem.batch_id == batch_id).group_by(ImportItem.status)
        ).all())
        batch.imported = counts.get("imported", 0)
        batch.updated = counts.get("updated", 0)
        batch.skipped = counts.get("skipped", 0)
        batch.errors = counts.get("error", 0)
        batch.total_rows = sum(counts.values())
        batch.status = status
        batch.note = note
        batch.finished_at = datetime.now(timezone.utc).replace(tzinfo=None)

    def list_recent(self, limit: int = 100) -> Sequence[ImportBatch]:
        return self.session.scalars(select(ImportBatch).order_by(ImportBatch.id.desc()).limit(limit)).all()

    def items(self, batch_id: int, status: Optional[str] = None) -> Sequence[ImportItem]:
        stmt = select(ImportItem).where(ImportItem.batch_id == batch_id)
        if status:
            stmt = stmt.where(ImportItem.status == status)
        return self.session.scalars(stmt.order_by(ImportItem.id)).all()
