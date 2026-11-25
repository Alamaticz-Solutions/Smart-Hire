"""Re-read stored resumes and fill the fields that are still empty (skills, location, certifications, ...).

Never overwrites a value that is already there. Slow on purpose: one resume at a time, and it STOPS at the
first AI rate limit. Calls the AI provider (Groq) once per candidate.

    python -m scripts.populate_fields --dry-run          # how many candidates have gaps
    python -m scripts.populate_fields --limit 20         # fill the first 20
    python -m scripts.populate_fields --limit 100 --delay 4
"""
import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.resume_processing import ExtractionRateLimited, candidates_to_populate, populate_missing_fields  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--delay", type=float, default=3.0, help="seconds between resumes")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    ids = candidates_to_populate(100000 if args.dry_run else args.limit)
    print(f"{len(ids)} candidate(s) have a stored document and at least one empty field.")
    if args.dry_run:
        return 0
    summary: dict[str, int] = {}
    for position, candidate_id in enumerate(ids, 1):
        try:
            result = populate_missing_fields(candidate_id)
        except ExtractionRateLimited:
            print("AI rate limit reached - stopping. Run again later.")
            break
        except Exception as exc:
            print(f"[{position}/{len(ids)}] #{candidate_id}: error {exc}")
            continue
        summary[result["status"]] = summary.get(result["status"], 0) + 1
        print(f"[{position}/{len(ids)}] #{candidate_id}: {result['status']} {', '.join(result['filled'])}")
        time.sleep(args.delay)
    print("done:", summary)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
