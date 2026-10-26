"""Repository layer: the only code that talks to the database."""
from app.repositories.candidate_repository import CandidateRepository, invalidate_candidate_table_cache
from app.repositories.job_repository import (
    STATUS_MATCHED,
    STATUS_SELECTED,
    VALID_LINK_STATUSES,
    JobCandidateRepository,
    JobRepository,
)
from app.repositories.system_repositories import (
    ActivityRepository,
    ChangeRequestRepository,
    CustomColumnRepository,
    IntegrationSettingsRepository,
    MailReplyRepository,
    MaskedKeywordRepository,
    ProcessedEmailRepository,
    TeamMemberRepository,
)
from app.repositories.user_repository import UserRepository

__all__ = [
    "ActivityRepository",
    "CandidateRepository",
    "ChangeRequestRepository",
    "CustomColumnRepository",
    "IntegrationSettingsRepository",
    "JobCandidateRepository",
    "JobRepository",
    "MailReplyRepository",
    "MaskedKeywordRepository",
    "ProcessedEmailRepository",
    "STATUS_MATCHED",
    "STATUS_SELECTED",
    "TeamMemberRepository",
    "UserRepository",
    "VALID_LINK_STATUSES",
    "invalidate_candidate_table_cache",
]
