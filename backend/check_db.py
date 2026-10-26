"""Print the five most recent candidates stuck in the ``Error`` state.

    cd backend && python check_db.py
"""
from sqlalchemy import select

from app.db.engine import session_scope
from app.models import Candidate

with session_scope() as session:
    rows = session.execute(
        select(Candidate.id, Candidate.filename, Candidate.candidate_status, Candidate.error_detail)
        .where(Candidate.candidate_status == "Error")
        .order_by(Candidate.id.desc())
        .limit(5)
    )
    for row in rows:
        print(tuple(row))
