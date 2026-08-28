"""Conversational HR chat endpoint.

Moved from app/main.py: POST /api/chat (original lines 2832-3010), plus its
private helpers `_is_conversational`, `extract_search_filters`,
`query_candidates_by_filters`, and `_find_matching_rows` (original lines
2673-2830), which only /api/chat calls.

The route is a 3-stage funnel:
  1. Conversational  - short greeting-shaped messages get a canned LLM reply.
  2. Structured query - the LLM extracts filter params from the question,
     which are run against `candidate_metadata` directly (SQLite/Postgres),
     then a second LLM call turns the filtered rows into a table/count answer.
  3. RAG fallback - if (2) raised or found nothing usable, fall back to a
     PGVector similarity search over resume embeddings.
"""

from __future__ import annotations

import json
import os
import threading

from fastapi import APIRouter, Request
from langchain_community.vectorstores import PGVector
from langchain_core.messages import HumanMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate
from langchain_core.runnables import RunnablePassthrough
from pydantic import BaseModel

from app.core.logging import get_logger
from app.db.row_helpers import dict_row_factory
from app.db.session import get_db_connection
from app.services.auth import get_user_info, is_admin_or_hr, is_user_approved
from app.services.ai_clients import get_models, peek_models

router = APIRouter()
logger = get_logger(__name__)


class ChatRequest(BaseModel):
    message: str


CONVERSATIONAL_KW = [
    "hi", "hello", "hey", "how are you", "what's up",
    "good morning", "good afternoon", "good evening",
    "thanks", "thank you", "bye", "goodbye", "who are you",
]


def _is_conversational(msg: str) -> bool:
    m = msg.strip().lower()
    if m in CONVERSATIONAL_KW:
        return True
    # Short messages (<=4 words) with no data keywords -> conversational.
    data_kw = [
        "candidate", "resume", "experience", "pega", "skill", "cert",
        "ctc", "notice", "company", "email", "phone", "show", "list",
        "find", "give", "who", "which", "how many", "count", "year",
        "join", "immediate", "work", "hire", "select",
    ]
    if len(m.split()) <= 4 and not any(k in m for k in data_kw):
        return True
    return False


def extract_search_filters(prompt: str, llm) -> dict:
    filter_extraction_prompt = f"""You are an HR database query assistant.
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
        resp = llm.invoke([HumanMessage(content=filter_extraction_prompt)])
        # parse_llm_json isn't a drop-in here: the original only strips a
        # leading ```json / trailing ``` fence (no bracket-slice), so it's
        # kept as its own small idiom rather than forced through the shared
        # helper and risking a behavior change on malformed LLM output.
        ans = resp.content.strip()
        if ans.startswith("```json"):
            ans = ans[7:]
        if ans.endswith("```"):
            ans = ans[:-3]
        return json.loads(ans.strip())
    except Exception as e:
        logger.error("Error extracting search filters: %s", e)
        return {}


def query_candidates_by_filters(filters: dict, username: str, role: str) -> list:
    with get_db_connection() as conn:
        conn.row_factory = dict_row_factory
        cur = conn.cursor()

        cols_to_select = (
            "id, filename, full_name, candidate_status, total_experience, pega_experience, "
            "skills, certifications, ctc, notice_period, current_organization, email, phone, "
            "linkedin, created_by, timestamp, source, cdh_exp, expected_ctc, percentage_hike, "
            "candidate_interview_status, availability_in_days, current_location, pref_locations, "
            "current_client, domain, tier, certification_version, "
            "sender_email, is_qualified, is_approved, file_url"
        )
        query = f"SELECT {cols_to_select} FROM candidate_metadata WHERE 1=1"
        params = []

        # Non-admins and non-HRs can only see their own candidates.
        if not is_admin_or_hr(username) and username:
            query += " AND LOWER(created_by) = LOWER(?)"
            params.append(username)

        name_q = filters.get("name_query")
        if name_q:
            query += " AND (full_name LIKE ? OR current_organization LIKE ? OR email LIKE ?)"
            params.append(f"%{name_q}%")
            params.append(f"%{name_q}%")
            params.append(f"%{name_q}%")

        skills = filters.get("skills_keywords")
        if skills and isinstance(skills, list):
            for sk in skills:
                if sk.strip():
                    query += " AND (skills LIKE ? OR certifications LIKE ?)"
                    params.append(f"%{sk.strip()}%")
                    params.append(f"%{sk.strip()}%")

        min_pega = filters.get("min_pega_exp")
        if min_pega is not None:
            try:
                query += " AND pega_experience >= ?"
                params.append(float(min_pega))
            except ValueError:
                pass

        min_tot = filters.get("min_total_exp")
        if min_tot is not None:
            try:
                query += " AND total_experience >= ?"
                params.append(float(min_tot))
            except ValueError:
                pass

        max_notice = filters.get("notice_period_max")
        if max_notice is not None:
            try:
                query += " AND (CAST(notice_period AS INTEGER) <= ? OR notice_period LIKE '%immediate%')"
                params.append(int(max_notice))
            except ValueError:
                pass

        loc = filters.get("current_location")
        if loc:
            query += " AND (current_location LIKE ? OR pref_locations LIKE ?)"
            params.append(f"%{loc}%")
            params.append(f"%{loc}%")

        query += " ORDER BY timestamp DESC"

        try:
            cur.execute(query, params)
            rows = [dict(r) for r in cur.fetchall()]
        except Exception as e:
            logger.error("Error running database query: %s", e)
            rows = []
    return rows


def _find_matching_rows(rows: list, names: list) -> list:
    """Return matching exact DB rows for the given candidate names."""
    lower_names = [n.strip().lower() for n in names]

    matched = [r for r in rows if r.get("full_name", "").strip().lower() in lower_names]

    if not matched:
        matched = []
        for r in rows:
            fn_lower = r.get("full_name", "").strip().lower()
            if any((ln in fn_lower or fn_lower in ln) and ln != "" for ln in lower_names):
                matched.append(r)

    records = []
    for r in matched:
        records.append(
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
        )
    return records


def _get_candidates_list(username: str = None, role: str = "user") -> list:
    """Duplicated from main.py's get_candidates_list (~line 683).

    Only the subset of behavior /api/chat actually relies on (username/role
    driven visibility, ordered by timestamp) is reproduced. Inlined here for
    the same reason as jobs.py's helper duplicates - a candidates-owned
    service module doesn't exist yet, and this router must not import
    routers/candidates.py or an as-yet-unbuilt services.candidates to avoid a
    cross-vertical/circular import. A future consolidation pass can dedupe
    this against the candidates vertical's equivalent.
    """
    with get_db_connection() as conn:
        conn.row_factory = dict_row_factory
        cur = conn.cursor()
        try:
            is_hr_or_admin = is_admin_or_hr(username) if username else False
            cols_to_select = (
                "id, filename, full_name, candidate_status, total_experience, pega_experience, "
                "skills, certifications, ctc, notice_period, current_organization, email, phone, "
                "linkedin, created_by, timestamp, source, cdh_exp, expected_ctc, percentage_hike, "
                "candidate_interview_status, availability_in_days, current_location, pref_locations, "
                "current_client, domain, tier, certification_version, "
                "sender_email, is_qualified, is_approved, file_url"
            )
            if role == "admin" or is_hr_or_admin or not username:
                cur.execute(f"SELECT {cols_to_select} FROM candidate_metadata ORDER BY timestamp DESC")
            else:
                cur.execute(
                    f"SELECT {cols_to_select} FROM candidate_metadata WHERE LOWER(created_by) = LOWER(?) ORDER BY timestamp DESC",
                    (username,),
                )
            rows = [dict(r) for r in cur.fetchall()]
        except Exception as e:
            logger.error("Error in _get_candidates_list: %s", e)
            rows = []
    return rows


@router.post("/api/chat")
def chat(body: ChatRequest, request: Request):
    username = request.headers.get("x-user-username")
    if not is_user_approved(username):
        return {
            "type": "text",
            "answer": "Your account access is currently pending administrator approval. Please contact your system administrator to view and query candidate data.",
        }

    user_row = get_user_info(username)
    is_user_admin = False
    if user_row:
        is_user_admin = (user_row["is_admin"] == 1 or user_row["role"] == "admin" or is_admin_or_hr(username))

    embeddings, llm, loading = peek_models()
    if embeddings is None or llm is None:
        if loading:
            return {"type": "text", "answer": "⏳ Hire AI is currently warming up and downloading models. This may take a few minutes depending on your internet connection. Please try again shortly!"}
        else:
            threading.Thread(target=get_models, daemon=True).start()
            return {"type": "text", "answer": "⏳ Hire AI is starting its engines... Please try again in a few seconds."}

    prompt = body.message.strip()
    p_lower = prompt.lower()

    # ── Route 1: Conversational ──────────────────────────────────────────────
    if _is_conversational(p_lower):
        resp = llm.invoke([HumanMessage(content=(
            "You are Hire AI, an intelligent HR recruitment assistant for Alamaticz Solutions. "
            "Respond warmly and professionally.\n\nUser: " + prompt
        ))])
        return {"type": "text", "answer": resp.content}

    # ── Route 2: Structured (SQLite) — always try this first ─────────────────
    try:
        filters = extract_search_filters(prompt, llm)

        user_role = "admin" if is_user_admin else "user"
        matched_candidates = query_candidates_by_filters(filters, username, user_role)

        # Fall back to all candidates if query returned nothing, but limit to top 15.
        if not matched_candidates:
            all_candidates = _get_candidates_list(username, role=user_role)
            matched_candidates = all_candidates[:15]
        else:
            matched_candidates = matched_candidates[:15]

        if matched_candidates:
            for r in matched_candidates:
                for col in ["total_experience", "pega_experience"]:
                    if col in r:
                        try:
                            r[col] = float(r[col]) if str(r[col]).strip() != "" else 0
                        except Exception:
                            r[col] = 0

            candidate_lines = []
            for r in matched_candidates:
                line = (
                    f"Name: {r.get('full_name','?')} | "
                    f"Total Exp: {r.get('total_experience',0)} yrs | "
                    f"Pega Exp: {r.get('pega_experience',0)} yrs | "
                    f"Skills: {r.get('skills','') or 'none'} | "
                    f"Certifications: {r.get('certifications','') or 'none'} | "
                    f"CTC: {r.get('ctc','') or '?'} | "
                    f"Notice: {r.get('notice_period','') or '?'} | "
                    f"Company: {r.get('current_organization','') or '?'} | "
                    f"Email: {r.get('email','') or '?'} | "
                    f"Phone: {r.get('phone','') or '?'}"
                )
                candidate_lines.append(line)
            candidates_text = "\n".join(candidate_lines)

            total_db_count = len(_get_candidates_list(username, role=user_role))

            filter_prompt = f"""You are an expert HR data analyst. I have the following candidate database:

Total candidates in database: {total_db_count}

{candidates_text}

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

            resp = llm.invoke([HumanMessage(content=filter_prompt)])
            ans = resp.content.strip()

            if "MATCH_RESULT:" in ans:
                json_str = ans.split("MATCH_RESULT:")[1].strip()
                s, e = json_str.find("{"), json_str.rfind("}")
                if s != -1 and e != -1:
                    result = json.loads(json_str[s : e + 1])

                    if result.get("type") == "count":
                        return {"type": "text", "answer": result.get("answer", ans)}

                    if result.get("type") == "table":
                        names = result.get("matched_names", [])
                        intro = result.get("intro", "Here are the matching candidates:")
                        if names:
                            matched_rows = _find_matching_rows(matched_candidates, names)
                            if matched_rows:
                                return {"type": "table", "answer": intro, "rows": matched_rows}
                        if matched_candidates:
                            fallback_rows = _find_matching_rows(matched_candidates, [r["full_name"] for r in matched_candidates[:5]])
                            if fallback_rows:
                                return {"type": "table", "answer": intro, "rows": fallback_rows}
                        return {"type": "text", "answer": "No candidates match your query. Try a different filter."}
    except Exception as e:
        logger.error("Route 2 error, falling back to RAG: %s", e)
        pass  # Fall through to RAG

    # ── Route 3: RAG (PGVector) — for very specific resume content ────────────
    has_vectors = False
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM langchain_pg_embedding")
            has_vectors = (cur.fetchone()[0] > 0)
    except Exception:
        has_vectors = False

    if not has_vectors:
        return {"type": "text", "answer": "No resumes uploaded yet. Please upload resumes first."}

    try:
        db = PGVector(
            connection_string=os.getenv("POSTGRES_DATABASE_URL"),
            embedding_function=embeddings,
            collection_name="resume_embeddings",
        )
        retriever = db.as_retriever(search_kwargs={"k": 6})
        qa_prompt = PromptTemplate.from_template("""You are Hire AI, an expert HR recruitment assistant.
Answer using ONLY the resume context below. Be specific and structured.

Resume Context:
{context}

HR Question: {question}

Answer:""")

        def format_docs(docs):
            return "\n\n".join(d.page_content for d in docs)

        rag_chain = (
            {"context": retriever | format_docs, "question": RunnablePassthrough()}
            | qa_prompt
            | llm
            | StrOutputParser()
        )
        ans = rag_chain.invoke(prompt)
        return {"type": "text", "answer": ans}
    except Exception as e:
        return {"type": "text", "answer": f"Search error: {e}"}
