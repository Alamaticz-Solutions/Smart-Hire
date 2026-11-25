"""AI-drafted answers to what candidates ask by e-mail.

Safe by design: the model may only answer from the HR-written company FAQ, must not promise offers, salary figures
or dates, and says "our team will get back to you" for anything not covered. Drafts wait for a person to approve
them unless the Connect page is set to send AI answers automatically.
"""
from __future__ import annotations

import re
from typing import Optional

from langchain_core.messages import HumanMessage

from app.core.logging import get_logger
from app.services.json_parsing import parse_llm_json
from app.services.retry import retry_with_backoff

logger = get_logger(__name__)

_QUESTION_WORDS = (
    "how ", "when ", "what ", "which ", "where ", "can you", "could you", "would you", "do you", "is there", "are there",
    "please let me know", "please confirm", "kindly", "any update", "status", "salary", "ctc", "package", "location",
    "remote", "work from home", "wfh", "interview", "opening", "vacancy", "requirement", "details", "clarify",
    "regarding", "follow up", "follow-up", "notice period", "relocat", "visa", "benefit",
)
_MAX_BODY = 1800


def clean_body(text: str) -> str:
    """The candidate's own words: drop quoted replies, signatures' noise and excess whitespace."""
    lines = []
    for line in (text or "").replace("\r", "").split("\n"):
        stripped = line.strip()
        if stripped.startswith(">") or re.match(r"^(on .+ wrote:|from:|sent:|-----original message)", stripped, re.I):
            break  # quoted history starts here
        lines.append(stripped)
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()[:_MAX_BODY]


def looks_like_question(text: str) -> bool:
    body = clean_body(text).lower()
    if len(body) < 15:
        return False
    return "?" in body or any(word in body for word in _QUESTION_WORDS)


def _prompt(question_text: str, candidate: Optional[dict], faq: str) -> str:
    who = (candidate or {}).get("full_name") or "the sender"
    return f"""You are the recruitment assistant of Alamaticz Solutions. A person e-mailed our careers mailbox.

Decide whether their message contains a question or request that needs an answer, and draft a short reply.

STRICT RULES
- Answer ONLY from the COMPANY FACTS below. If the answer is not there, do not guess: say the team will get back to them.
- Never promise a job, an offer, a salary, a joining date or an interview slot. Never quote figures that are not in the facts.
- Be polite, plain and under 110 words. Do not include a greeting line or a signature - they are added automatically.
- If the message is only an application / thanks / acknowledgement with NO question or request, set "is_question" to false.
- "confident" is true only when the facts fully answer the question.

COMPANY FACTS:
{faq.strip() or "(none provided)"}

MESSAGE FROM {who}:
\"\"\"
{question_text}
\"\"\"

Return ONLY raw JSON:
{{"is_question": true or false, "question": "<one-sentence summary of what they asked>", "reply": "<the answer text>", "confident": true or false}}"""


def draft_answer(body_text: str, candidate: Optional[dict], faq: str, llm) -> Optional[dict]:
    """Return ``{"question", "reply", "confident"}`` or None when there is nothing to answer / the AI is unavailable."""
    text = clean_body(body_text)
    if not looks_like_question(text):
        return None
    try:
        response = retry_with_backoff(
            lambda: llm.invoke([HumanMessage(content=_prompt(text, candidate, faq))]),
            max_retries=2, base_delay=4, retryable_markers=("429", "rate"), raise_on_exhaustion=True,
        )
        data = parse_llm_json(response.content, bracket="{")
    except Exception as exc:
        logger.warning("Could not draft an answer: %s", exc)
        return None
    if not data.get("is_question"):
        return None
    reply = str(data.get("reply") or "").strip()
    return {
        "question": str(data.get("question") or text[:160]).strip()[:300],
        "reply": reply,
        "confident": bool(data.get("confident")) and bool(reply),
        "text": text,
    }


def compose_email(name: str, answer: str, missing: list[str], signature: str = "Best regards,\n\nHR Team\nAlamaticz Solutions") -> str:
    """Greeting + the answer + (when profile details are missing) a polite ask + signature."""
    parts = [f"Hi {name or 'there'},", "", "Thank you for reaching out to Alamaticz Solutions."]
    if answer:
        parts += ["", answer.strip()]
    else:
        parts += ["", "Our team has noted your question and will get back to you shortly."]
    if missing:
        parts += ["", "To take your application forward, could you also please share:", "", *[f"* {m}" for m in missing]]
    parts += ["", signature]
    return "\n".join(parts)
