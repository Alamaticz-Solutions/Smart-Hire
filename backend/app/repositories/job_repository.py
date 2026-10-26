"""Data access for jobs, job-to-candidate links and job sharing."""
from __future__ import annotations

from typing import Any, Optional, Sequence

from sqlalchemy import delete, func, select, update

from app.models import Job, JobCandidate, JobShare
from app.repositories.base import BaseRepository, row_to_dict

STATUS_MATCHED = "matched"
STATUS_SELECTED = "selected"
VALID_LINK_STATUSES = (STATUS_MATCHED, STATUS_SELECTED)


class JobRepository(BaseRepository):
    # ── jobs ─────────────────────────────────────────────────────────────
    def get(self, job_id: int) -> Optional[Job]:
        return self.session.get(Job, job_id)

    def get_title(self, job_id: int) -> str:
        title = self.session.scalar(select(Job.title).where(Job.id == job_id))
        return title or f"ID {job_id}"

    def list_all(self) -> Sequence[Job]:
        return self.session.scalars(select(Job).order_by(Job.id.desc())).all()

    def list_by_owner(self, owner: str) -> Sequence[Job]:
        return self.session.scalars(
            select(Job).where(func.lower(Job.created_by) == owner.lower()).order_by(Job.id.desc())
        ).all()

    def list_shared_with(self, username: str) -> Sequence[Job]:
        return self.session.scalars(
            select(Job)
            .join(JobShare, Job.id == JobShare.job_id)
            .where(func.lower(JobShare.username) == username.lower())
            .order_by(Job.id.desc())
        ).all()

    def list_for_matching(self, owner: Optional[str] = None) -> list[dict[str, Any]]:
        stmt = select(Job.id, Job.title, Job.description)
        if owner:
            stmt = stmt.where(func.lower(Job.created_by) == owner.lower())
        return [row_to_dict(r) for r in self.session.execute(stmt)]

    def add(self, job: Job) -> Job:
        self.session.add(job)
        self.session.flush()
        return job

    def delete(self, job_id: int) -> None:
        self.session.execute(delete(JobCandidate).where(JobCandidate.job_id == job_id))
        self.session.execute(delete(JobShare).where(JobShare.job_id == job_id))
        self.session.execute(delete(Job).where(Job.id == job_id))

    def ids_created_by(self, owner: str) -> list[int]:
        return list(self.session.scalars(select(Job.id).where(func.lower(Job.created_by) == owner.lower())))

    def delete_many(self, job_ids: Sequence[int]) -> None:
        if not job_ids:
            return
        self.session.execute(delete(JobCandidate).where(JobCandidate.job_id.in_(job_ids)))
        self.session.execute(delete(JobShare).where(JobShare.job_id.in_(job_ids)))
        self.session.execute(delete(Job).where(Job.id.in_(job_ids)))

    # ── aggregates (single query for all jobs: no N+1) ───────────────────
    def link_counts(self, job_ids: Sequence[int]) -> dict[int, dict[str, int]]:
        if not job_ids:
            return {}
        rows = self.session.execute(
            select(JobCandidate.job_id, JobCandidate.status, func.count())
            .where(JobCandidate.job_id.in_(job_ids))
            .group_by(JobCandidate.job_id, JobCandidate.status)
        ).all()
        counts: dict[int, dict[str, int]] = {}
        for job_id, status, total in rows:
            counts.setdefault(job_id, {})[status] = total
        return counts

    def shares_for(self, job_ids: Sequence[int]) -> dict[int, list[str]]:
        if not job_ids:
            return {}
        rows = self.session.execute(
            select(JobShare.job_id, JobShare.username).where(JobShare.job_id.in_(job_ids))
        ).all()
        shares: dict[int, list[str]] = {}
        for job_id, username in rows:
            shares.setdefault(job_id, []).append(username)
        return shares

    # ── sharing ──────────────────────────────────────────────────────────
    def is_shared_with(self, job_id: int, username: str) -> bool:
        return self.session.scalar(
            select(JobShare.job_id).where(
                JobShare.job_id == job_id, func.lower(JobShare.username) == username.lower()
            )
        ) is not None

    def candidate_shared_with(self, candidate_id: int, username: str) -> bool:
        """True when ``candidate_id`` is linked to a job shared with ``username``."""
        return self.session.scalar(
            select(JobShare.job_id)
            .join(JobCandidate, JobCandidate.job_id == JobShare.job_id)
            .where(JobCandidate.candidate_id == candidate_id, func.lower(JobShare.username) == username.lower())
            .limit(1)
        ) is not None

    def replace_shares(self, job_id: int, usernames: Sequence[str]) -> None:
        self.session.execute(delete(JobShare).where(JobShare.job_id == job_id))
        for username in dict.fromkeys(usernames):  # de-duplicate, keep order
            self.session.add(JobShare(job_id=job_id, username=username))

    def delete_shares_for_user(self, username: str) -> None:
        self.session.execute(delete(JobShare).where(func.lower(JobShare.username) == username.lower()))


class JobCandidateRepository(BaseRepository):
    def get(self, job_id: int, candidate_id: int) -> Optional[JobCandidate]:
        return self.session.get(JobCandidate, (job_id, candidate_id))

    def exists(self, job_id: int, candidate_id: int) -> bool:
        return self.get(job_id, candidate_id) is not None

    def add(self, job_id: int, candidate_id: int, reason: str, status: str = STATUS_MATCHED) -> None:
        self.session.add(JobCandidate(job_id=job_id, candidate_id=candidate_id, ai_reason=reason, status=status))

    def upsert_match(self, job_id: int, candidate_id: int, reason: str) -> None:
        link = self.get(job_id, candidate_id)
        if link is None:
            self.add(job_id, candidate_id, reason)
        else:
            link.ai_reason = reason

    def set_status(self, job_id: int, candidate_id: int, status: str) -> None:
        self.session.execute(
            update(JobCandidate)
            .where(JobCandidate.job_id == job_id, JobCandidate.candidate_id == candidate_id)
            .values(status=status)
        )

    def set_reason(self, job_id: int, candidate_id: int, reason: str) -> None:
        self.session.execute(
            update(JobCandidate)
            .where(JobCandidate.job_id == job_id, JobCandidate.candidate_id == candidate_id)
            .values(ai_reason=reason)
        )

    def remove(self, job_id: int, candidate_id: int) -> None:
        self.session.execute(
            delete(JobCandidate).where(JobCandidate.job_id == job_id, JobCandidate.candidate_id == candidate_id)
        )

    def clear_matched_for_job(self, job_id: int) -> None:
        self.session.execute(
            delete(JobCandidate).where(JobCandidate.job_id == job_id, JobCandidate.status == STATUS_MATCHED)
        )

    def clear_matched_for_candidate(self, candidate_id: int) -> None:
        self.session.execute(
            delete(JobCandidate).where(
                JobCandidate.candidate_id == candidate_id, JobCandidate.status == STATUS_MATCHED
            )
        )

    def count_for_candidate(self, candidate_id: int) -> int:
        return int(self.session.scalar(
            select(func.count()).select_from(JobCandidate).where(JobCandidate.candidate_id == candidate_id)
        ) or 0)

    def jobs_for_candidate(self, candidate_id: int) -> list[dict[str, Any]]:
        rows = self.session.execute(
            select(Job, JobCandidate.status.label("match_status"), JobCandidate.ai_reason)
            .join(JobCandidate, Job.id == JobCandidate.job_id)
            .where(JobCandidate.candidate_id == candidate_id)
        ).all()
        result = []
        for job, match_status, reason in rows:
            item = {c.name: getattr(job, c.name) for c in Job.__table__.columns}
            item.update(match_status=match_status, ai_reason=reason)
            result.append(item)
        return result
