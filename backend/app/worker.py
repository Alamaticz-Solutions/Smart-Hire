"""Stand-alone mailbox poller: ``python -m app.worker``.

Run this as its own service (see render.yaml) so a web restart, a slow request or a hung connection can never stop
mail pulling, and so scaling the web service to several instances does not run several pollers. Start the web
service with ``EMAIL_WORKER_ENABLED=false`` when you use it.
"""
from __future__ import annotations

import os
import sys

# Same env loading as the API (root .env, then backend/.env).
from dotenv import load_dotenv

_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(os.path.dirname(_BACKEND), ".env"), override=True)
load_dotenv(os.path.join(_BACKEND, ".env"), override=True)
sys.path.insert(0, _BACKEND)

from app.core.logging import get_logger  # noqa: E402
from app.db.init_db import init_db  # noqa: E402
from app.services.ai_clients import get_models  # noqa: E402
from app.services.email_worker import poll_emails_and_process  # noqa: E402

logger = get_logger("app.worker")


def main() -> None:
    init_db()
    try:
        get_models()  # warm the AI clients once
    except Exception as exc:
        logger.warning("AI clients not ready yet: %s", exc)
    logger.info("Mailbox poller started (stand-alone worker)")
    poll_emails_and_process()  # loops forever


if __name__ == "__main__":
    main()
