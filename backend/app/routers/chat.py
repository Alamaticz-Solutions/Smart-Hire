"""Conversational HR chat endpoint (POST /api/chat).

A three-stage funnel:

1. Conversational - short greeting-shaped messages get a direct LLM reply.
2. Structured query - the LLM extracts filters, they run against the
   candidates table, and a second LLM call turns the rows into a table/count.
3. RAG fallback - similarity search over the resume embeddings.
"""
from __future__ import annotations

import json
import threading

from fastapi import APIRouter, Depends, Request
from langchain_core.messages import HumanMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate
from langchain_core.runnables import RunnablePassthrough
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.core.responses import EnvelopeRoute
from app.db.engine import get_session
from app.repositories import CandidateRepository
from app.services import vector_store
from app.services.ai_clients import get_models, peek_models
from app.services.auth import get_user_info, is_admin_or_hr, is_user_approved

router = APIRouter(route_class=EnvelopeRoute)
logger = get_logger(__name__)

MAX_CONTEXT_CANDIDATES = 15

CONVERSATIONAL_KW = [
    "hi", "hello", "hey", "how are you", "what's up",
    "good morning", "good afternoon", "good evening",
    "thanks", "thank you", "bye", "goodbye", "who are you",
]
_DATA_KEYWORDS = [
    "candidate", "resume", "experience", "pega", "skill", "cert",
    "ctc", "notice", "company", "email", "phone", "show", "list",
    "find", "give", "who", "which", "how many", "count", "year",
    "join", "immediate", "work", "hire", "select",
]


class ChatRequest(BaseModel):
    message: str


def _is_conversational(message: str) -> bool:
    text = message.strip().lower()
    if text in CONVERSATIONAL_KW:
        return True
    return len(text.split()) <= 4 and not any(k in text for k in _DATA_KEYWORDS)


def extract_search_filters(prompt: str, llm) -> dict:
    instruction = f"""You are an HR database query assistant.
Extract search parameters from the following HR question into a JSON object.

HR Question: "{prompt}"

JSON Schema:
{{
  "name_query": "string or null (extract a candidate name if the user is asking about a specific person, e.g., 'Naresh' or 'Gopinath')",
  "skills_keywords": "array of strings or null (extract skills or certifications, e.g., ['pega', 'cssa', 'csa', 'lsa', 'clda'])",
  "min_pega_exp": "number or null (minimum years of Pega experience requested)",
  "min_total_exp": "number or null (minimum years of total experience requested)",
  "notice_period_max": "number or null (maximum notice period in days)",
  "current_location": "string or null (location name, e.g., 'Hyderabad')"
}}

Respond ONLY with the JSON object. Do not include any explanation or markdown formatting."""
    try:
        answer = llm.invoke([HumanMessage(content=instruction)]).content.strip()
        if answer.startswith("```json"):
            answer = answer[7:]
        if answer.endswith("```"):
            answer = answer[:-3]
        return json.loads(answer.strip())
    except Exception as exc:
        logger.error("Error extracting search filters: %s", exc)
        return {}


def _rows_for_names(rows: list, names: list) -> list:
    """Project the rows whose ``full_name`` matches one of ``names``."""
    wanted = [n.strip().lower() for n in names]
    matched = [r for r in rows if (r.get("full_name") or "").strip().lower() in wanted]
    if not matched:
        matched = [
            r for r in rows
            if any(
                w and (w in (r.get("full_name") or "").strip().lower() or (r.get("full_name") or "").strip().lower() in w)
                for w in wanted
            )
        ]
    return [
        {
            "name": r.get("full_name", ""),
            "total_experience": r.get("total_experience", 0),
            "pega_experience": r.get("pega_experience", 0),
            "skills": r.get("skills", ""),
            "certifications": r.get("certifications", ""),
            "ctc": r.get("ctc", ""),
            "notice_period": r.get("notice_period", ""),
            "organization": r.get("current_organization", ""),
            "email": r.get("email", ""),
            "phone": r.get("phone", ""),
        }
        for r in matched
    ]


def _text(answer: str) -> dict:
    return {"type": "text", "answer": answer}


@router.post("/api/chat")
def chat(body: ChatRequest, request: Request, session: Session = Depends(get_session)):
    username = request.headers.get("x-user-username")
    if not is_user_approved(username):
        return _text(
            "Your account access is currently pending administrator approval. Please contact your "
            "system administrator to view and query candidate data."
        )

    info = get_user_info(username)
    sees_all = bool(info and (info["is_admin"] == 1 or info["role"] == "admin" or is_admin_or_hr(username)))
    staff = is_admin_or_hr(username)

    embeddings, llm, loading = peek_models()
    if llm is None:
        if loading:
            return _text(
                "⏳ Hire AI is currently warming up and downloading models. This may take a few minutes "
                "depending on your internet connection. Please try again shortly!"
            )
        threading.Thread(target=get_models, daemon=True).start()
        return _text("⏳ Hire AI is starting its engines... Please try again in a few seconds.")

    prompt = body.message.strip()

    # ── 1. conversational ─────────────────────────────────────────────────
    if _is_conversational(prompt.lower()):
        reply = llm.invoke([HumanMessage(content=(
            "You are Hire AI, an intelligent HR recruitment assistant for Alamaticz Solutions. "
            "Respond warmly and professionally.\n\nUser: " + prompt
        ))])
        return _text(reply.content)

    # ── 2. structured query ───────────────────────────────────────────────
    try:
        candidates = CandidateRepository(session)
        owner = None if (staff or sees_all or not username) else username
        filters = extract_search_filters(prompt, llm)

        matched = candidates.search(filters, None if staff else (username or None))
        if not matched:
            matched = candidates.list_rows(owner)
        matched = matched[:MAX_CONTEXT_CANDIDATES]

        if matched:
            for row in matched:
                for column in ("total_experience", "pega_experience"):
                    if column in row:
                        try:
                            row[column] = float(row[column]) if str(row[column]).strip() != "" else 0
                        except Exception:
                            row[column] = 0

            lines = "\n".join(
                f"Name: {r.get('full_name') or '?'} | "
                f"Total Exp: {r.get('total_experience', 0)} yrs | "
                f"Pega Exp: {r.get('pega_experience', 0)} yrs | "
                f"Skills: {r.get('skills') or 'none'} | "
                f"Certifications: {r.get('certifications') or 'none'} | "
                f"CTC: {r.get('ctc') or '?'} | "
                f"Notice: {r.get('notice_period') or '?'} | "
                f"Company: {r.get('current_organization') or '?'} | "
                f"Email: {r.get('email') or '?'} | "
                f"Phone: {r.get('phone') or '?'}"
                for r in matched
            )
            total = len(candidates.list_rows(owner))

            question = f"""You are an expert HR data analyst. I have the following candidate database:

Total candidates in database: {total}

{lines}

HR question: "{prompt}"

            Instructions:
            1. Read the question carefully.
            2. If the question asks to LIST / SHOW / FIND candidates:
               - Return EXACTLY this JSON format (no other text before or after):
               MATCH_RESULT: {{"type":"table","matched_names":["Candidate Name 1", "Candidate Name 2"],"intro":"Here are the candidates:"}}
            3. If the question asks for a COUNT or YES/NO:
               - Return EXACTLY: MATCH_RESULT: {{"type":"count","answer":"There are 3 candidates matching your criteria."}}
            4. If the question is about a SPECIFIC candidate's detail:
               - Return EXACTLY: MATCH_RESULT: {{"type":"table","matched_names":["Candidate Name"],"intro":"Here are the details:"}}
            5. IMPORTANT: Use ONLY exact full_name values from the database above. Do NOT invent names.
            6. 'Pega Exp: 0 yrs' = ZERO Pega experience.

            Respond with ONLY the MATCH_RESULT line, nothing else."""

            answer = llm.invoke([HumanMessage(content=question)]).content.strip()
            if "MATCH_RESULT:" in answer:
                tail = answer.split("MATCH_RESULT:", 1)[1].strip()
                start, end = tail.find("{"), tail.rfind("}")
                if start != -1 and end != -1:
                    result = json.loads(tail[start:end + 1])
                    if result.get("type") == "count":
                        return _text(result.get("answer", answer))
                    if result.get("type") == "table":
                        intro = result.get("intro", "Here are the matching candidates:")
                        names = result.get("matched_names", [])
                        rows = _rows_for_names(matched, names) if names else []
                        if not rows:
                            rows = _rows_for_names(matched, [r["full_name"] for r in matched[:5] if r.get("full_name")])
                        if rows:
                            return {"type": "table", "answer": intro, "rows": rows}
                        return _text("No candidates match your query. Try a different filter.")
    except Exception as exc:
        logger.error("Structured chat route failed, falling back to RAG: %s", exc)

    # ── 3. RAG fallback ───────────────────────────────────────────────────
    if embeddings is None:
        return _text(
            "I can answer questions about candidate names, skills, experience, and status, but detailed "
            "resume-content search isn't configured on this server yet. Try asking in terms of skills, "
            "experience, or location instead."
        )
    if not vector_store.has_vectors():
        return _text("No resumes uploaded yet. Please upload resumes first.")

    try:
        retriever = vector_store.as_retriever(k=6)
        template = PromptTemplate.from_template("""You are Hire AI, an expert HR recruitment assistant.
Answer using ONLY the resume context below. Be specific and structured.

Resume Context:
{context}

HR Question: {question}

Answer:""")

        def format_docs(docs):
            return "\n\n".join(d.page_content for d in docs)

        chain = (
            {"context": retriever | format_docs, "question": RunnablePassthrough()}
            | template
            | llm
            | StrOutputParser()
        )
        return _text(chain.invoke(prompt))
    except Exception as exc:
        return _text(f"Search error: {exc}")
