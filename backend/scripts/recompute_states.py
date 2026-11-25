"""Score every candidate's profile and set ``record_state`` (active / review / failed). Safe to run again.

    python -m scripts.recompute_states --dry-run
    python -m scripts.recompute_states
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, update  # noqa: E402

from app.db.engine import session_scope  # noqa: E402
from app.models import Candidate  # noqa: E402
from app.services.completeness import derive_state  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    counts: dict[str, int] = {}
    changed = 0
    with session_scope() as session:
        rows = session.execute(select(Candidate)).scalars().all()
        for candidate in rows:
            record = {c.name: getattr(candidate, c.name) for c in candidate.__table__.columns if c.name != "file_bytes"}
            state = derive_state(record)
            counts[state] = counts.get(state, 0) + 1
            if (candidate.record_state or "active") != state:
                changed += 1
                if not args.dry_run:
                    session.execute(update(Candidate).where(Candidate.id == candidate.id).values(record_state=state))
    print(("would change" if args.dry_run else "changed"), changed, "| totals:", counts)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
