"""ORM models. Importing this package registers every table on ``Base``."""
from app.models.base import Base
from app.models.candidate import CANDIDATE_LIST_COLUMNS, MATCH_RELATED_FIELDS, Candidate
from app.models.job import Job, JobCandidate, JobShare
from app.models.system import (
    ActivityLog,
    ChangeRequest,
    CustomColumn,
    IntegrationSettings,
    MailReply,
    MaskedKeyword,
    ProcessedEmail,
    TeamMember,
)
from app.models.user import User

__all__ = [
    "ActivityLog",
    "Base",
    "CANDIDATE_LIST_COLUMNS",
    "Candidate",
    "ChangeRequest",
    "CustomColumn",
    "IntegrationSettings",
    "Job",
    "JobCandidate",
    "JobShare",
    "MATCH_RELATED_FIELDS",
    "MailReply",
    "MaskedKeyword",
    "ProcessedEmail",
    "TeamMember",
    "User",
]
