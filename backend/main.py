import os
import json
import sqlite3
import shutil
import re
import gc
import threading
from typing import Optional
from datetime import datetime


from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv

# LangChain / AI
from langchain_community.document_loaders import PyMuPDFLoader, Docx2txtLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate

# ── Config ────────────────────────────────────────────────────────────────────
load_dotenv()
BASE_DIR     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROMA_PATH  = os.path.join(BASE_DIR, "chroma_db")
UPLOAD_DIR   = os.path.join(BASE_DIR, "static")
STATS_DB     = os.path.join(BASE_DIR, "stats.db")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

os.makedirs(UPLOAD_DIR, exist_ok=True)

# ── FastAPI App ────────────────────────────────────────────────────────────────
app = FastAPI(title="Hire AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded resumes
app.mount("/static", StaticFiles(directory=UPLOAD_DIR), name="static")

# ── Models (loaded once) ───────────────────────────────────────────────────────
_embeddings = None
_llm        = None
_models_loading = False
_model_lock = threading.Lock()

def get_models():
    global _embeddings, _llm, _models_loading
    with _model_lock:
        _models_loading = True
        if _embeddings is None:
            _embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
        if _llm is None:
            _llm = ChatGroq(temperature=0.1, model_name="llama-3.1-8b-instant", groq_api_key=GROQ_API_KEY)
        _models_loading = False
    return _embeddings, _llm

@app.on_event("startup")
def load_models_in_background():
    threading.Thread(target=get_models, daemon=True).start()

# ── DB Helpers ─────────────────────────────────────────────────────────────────
def init_db():
    conn = sqlite3.connect(STATS_DB, timeout=30.0)
    cur  = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS candidate_metadata (
            id                   INTEGER PRIMARY KEY AUTOINCREMENT,
            filename             TEXT,
            full_name            TEXT,
            total_experience     REAL DEFAULT 0.0,
            pega_experience      REAL DEFAULT 0.0,
            skills               TEXT,
            certifications       TEXT,
            ctc                  TEXT,
            notice_period        TEXT,
            current_organization TEXT,
            email                TEXT,
            phone                TEXT,
            linkedin             TEXT,
            timestamp            DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS custom_columns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            col_key TEXT UNIQUE,
            col_label TEXT,
            description TEXT
        )
    ''')
    # Migration: add missing columns
    cur.execute("PRAGMA table_info(candidate_metadata)")
    existing = [c[1] for c in cur.fetchall()]
    for col in ['current_organization', 'email', 'phone', 'linkedin']:
        if col not in existing:
            cur.execute(f"ALTER TABLE candidate_metadata ADD COLUMN {col} TEXT")
    conn.commit()
    conn.close()

def get_candidates_list() -> list:
    conn = sqlite3.connect(STATS_DB, timeout=30.0)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM candidate_metadata ORDER BY timestamp DESC")
        rows = [dict(r) for r in cur.fetchall()]
    except Exception:
        rows = []
    conn.close()
    return rows

def log_candidate(data: dict):
    conn = sqlite3.connect(STATS_DB, timeout=30.0)
    cur  = conn.cursor()
    
    cur.execute("PRAGMA table_info(candidate_metadata)")
    existing_cols = {c[1] for c in cur.fetchall()}
    
    # Filter data to only valid columns
    cols = [c for c in data.keys() if c in existing_cols and c != 'id']
    vals = [str(data.get(c, '')) if data.get(c) is not None else '' for c in cols]
    
    cur.execute("DELETE FROM candidate_metadata WHERE filename = ?", (data.get('filename', ''),))
    
    if cols:
        cur.execute(
            f"INSERT INTO candidate_metadata ({','.join(cols)}) VALUES ({','.join(['?']*len(cols))})",
            vals
        )
    conn.commit()
    conn.close()

init_db()

# ═══════════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

# ── Health ─────────────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return {"status": "ok"}

# ── Candidates ─────────────────────────────────────────────────────────────────
@app.get("/api/candidates")
def list_candidates():
    rows = get_candidates_list()
    # Replace None values with empty string
    for row in rows:
        for k, v in row.items():
            if v is None:
                row[k] = ""
    return rows

class CustomColumn(BaseModel):
    col_key: str
    col_label: str
    description: str

@app.post("/api/columns")
def add_column(col: CustomColumn):
    conn = sqlite3.connect(STATS_DB, timeout=30.0)
    cur = conn.cursor()
    clean_key = re.sub(r'[^a-zA-Z0-9_]', '', col.col_key.replace(' ', '_')).lower()
    
    cur.execute("PRAGMA table_info(candidate_metadata)")
    existing = [c[1] for c in cur.fetchall()]
    if clean_key in existing:
        conn.close()
        raise HTTPException(status_code=400, detail="Column already exists")
        
    try:
        cur.execute(f"ALTER TABLE candidate_metadata ADD COLUMN {clean_key} TEXT")
        cur.execute("INSERT INTO custom_columns (col_key, col_label, description) VALUES (?, ?, ?)", 
                    (clean_key, col.col_label, col.description))
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))
    conn.close()
    return {"status": "added", "col_key": clean_key}

@app.get("/api/columns")
def get_columns():
    conn = sqlite3.connect(STATS_DB, timeout=30.0)
    cur = conn.cursor()
    cur.execute("SELECT col_key, col_label FROM custom_columns")
    customs = [{"col_key": row[0], "col_label": row[1]} for row in cur.fetchall()]
    conn.close()
    
    base_cols = [
        {"col_key": "full_name", "col_label": "Name"},
        {"col_key": "total_experience", "col_label": "Total Exp"},
        {"col_key": "pega_experience", "col_label": "Pega Exp"},
        {"col_key": "skills", "col_label": "Skills"},
        {"col_key": "certifications", "col_label": "Certifications"},
        {"col_key": "ctc", "col_label": "CTC"},
        {"col_key": "notice_period", "col_label": "Notice Period"},
        {"col_key": "current_organization", "col_label": "Organization"},
        {"col_key": "email", "col_label": "Email"},
        {"col_key": "phone", "col_label": "Phone"},
        {"col_key": "linkedin", "col_label": "LinkedIn"}
    ]
    return {"base": base_cols, "custom": customs}

@app.delete("/api/columns/{col_key}")
def delete_column(col_key: str):
    conn = sqlite3.connect(STATS_DB, timeout=30.0)
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM custom_columns WHERE col_key=?", (col_key,))
        try:
            cur.execute(f"ALTER TABLE candidate_metadata DROP COLUMN {col_key}")
        except Exception:
            pass # older sqlite versions might not support drop column
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))
    conn.close()
    return {"status": "deleted"}

@app.put("/api/candidates/{candidate_id}")
async def update_candidate(candidate_id: int, request: Request):
    body = await request.json()
    conn = sqlite3.connect(STATS_DB, timeout=30.0)
    cur  = conn.cursor()
    cur.execute("PRAGMA table_info(candidate_metadata)")
    allowed_cols = [c[1] for c in cur.fetchall()]
    updates = {k: v for k, v in body.items() if k in allowed_cols and k != 'id' and v is not None}
    
    if not updates:
        conn.close()
        return {"status": "no changes"}
    set_clause = ", ".join(f"{k}=?" for k in updates)
    cur.execute(
        f"UPDATE candidate_metadata SET {set_clause} WHERE id=?",
        list(updates.values()) + [candidate_id]
    )
    conn.commit()
    conn.close()
    return {"status": "updated"}

@app.delete("/api/candidates/{candidate_id}")
def delete_candidate(candidate_id: int):
    conn = sqlite3.connect(STATS_DB, timeout=30.0)
    cur  = conn.cursor()
    cur.execute("DELETE FROM candidate_metadata WHERE id=?", (candidate_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

# ── Upload & Extract ────────────────────────────────────────────────────────────
EXTRACT_PROMPT = """You are an expert resume parser. Extract EVERY piece of information from the resume below.
Be thorough — search all sections: Summary, Experience, Skills, Education, Certifications, Contact.

Return ONLY a valid JSON object with these exact keys (no extra text, no markdown, just raw JSON):

{{
  "full_name": "<Full name from top of resume>",
  "total_experience": <number — total years of professional work experience. Calculate from date ranges if not stated explicitly. Use 0 if fresher>,
  "pega_experience": <number — years of Pega PRPC/BPM experience specifically. Use 0 if none>,
  "skills": "<All technical skills comma-separated. Be exhaustive — include programming languages, frameworks, tools, databases, cloud, methodologies>",
  "certifications": "<All certifications and courses comma-separated. Include issuer if mentioned. Empty string if none>",
  "ctc": "<Current CTC or expected CTC as stated. Include currency and frequency, e.g. '12 LPA', '₹15,00,000 per annum'. Empty if not found>",
  "notice_period": "<Notice period as stated, e.g. 'Immediate', '30 days', '60 days', '3 months'. Empty if not found>",
  "current_organization": "<Current or most recent employer name>",
  "email": "<Email address>",
  "phone": "<Phone number with country code if available>",
  "linkedin": "<Full LinkedIn profile URL if found, else empty string>"{custom_fields}
}}

Rules:
- total_experience: if the resume says '4 years', use 4. If it shows date ranges like 'Jan 2020 - Present (2024)', calculate the total.
- pega_experience: count only Pega PRPC/BPM/Platform work specifically.
- skills: list every technology mentioned — tools, languages, frameworks, databases, cloud services, etc.
- certifications: include Pega certifications (CSA, CSSA, CPRSA, CPDC), IT certs, and online courses.
- If a field is truly not present anywhere in the resume, use an empty string "" (not null, not N/A).

Resume Text:
{text}

JSON:"""


def process_resume(safe_name: str, path: str):
    _, llm = get_models()
    embeddings, _ = get_models()

    # Load document
    try:
        if safe_name.lower().endswith(".pdf"):
            loader = PyMuPDFLoader(path)
        else:
            loader = Docx2txtLoader(path)
        docs = loader.load()
        text = "\n".join([d.page_content for d in docs])
    except Exception as e:
        data = {"filename": safe_name, "full_name": f"Error loading file: {safe_name}"}
        log_candidate(data)
        return

    # LLM extraction
    try:
        # Fetch custom columns for the prompt
        conn = sqlite3.connect(STATS_DB, timeout=30.0)
        cur = conn.cursor()
        cur.execute("SELECT col_key, description FROM custom_columns")
        custom_cols = cur.fetchall()
        conn.close()
        
        custom_fields_str = ""
        if custom_cols:
            for col_key, desc in custom_cols:
                custom_fields_str += f',\n  "{col_key}": "<{desc}>"'
                
        prompt_str = EXTRACT_PROMPT.format(text=text[:7000], custom_fields=custom_fields_str)
        resp = llm.invoke([HumanMessage(content=prompt_str)])
        raw  = resp.content.strip()

        if "```json" in raw:
            raw = raw.split("```json")[1].split("```")[0].strip()
        elif "```" in raw:
            raw = raw.split("```")[1].split("```")[0].strip()
        start, end = raw.find('{'), raw.rfind('}')
        if start != -1 and end != -1:
            raw = raw[start:end+1]

        data = json.loads(raw)
        data['filename'] = safe_name
        log_candidate(data)
    except Exception as e:
        data = {"filename": safe_name, "full_name": f"Processing Error: {safe_name}"}
        log_candidate(data)

    # Add to ChromaDB
    try:
        for d in docs:
            d.metadata['source'] = safe_name
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
        chunks   = splitter.split_documents(docs)
        Chroma.from_documents(chunks, embeddings, persist_directory=CHROMA_PATH)
    except Exception:
        pass


@app.post("/api/upload")
async def upload_resume(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    # Save file
    safe_name = file.filename
    path = os.path.join(UPLOAD_DIR, safe_name)
    with open(path, "wb") as f:
        content = await file.read()
        f.write(content)

    # Placeholder while processing in background
    log_candidate({"filename": safe_name, "full_name": f"⏳ Processing: {safe_name}"})
    
    # Process asynchronously
    background_tasks.add_task(process_resume, safe_name, path)

    return {"status": "processing", "message": "Resume uploaded and is processing in the background."}

# ── Chat ──────────────────────────────────────────────────────────────────────
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
    # Short messages (≤4 words) with no data keywords → conversational
    data_kw = ["candidate", "resume", "experience", "pega", "skill", "cert",
               "ctc", "notice", "company", "email", "phone", "show", "list",
               "find", "give", "who", "which", "how many", "count", "year",
               "join", "immediate", "work", "hire", "select"]
    if len(m.split()) <= 4 and not any(k in m for k in data_kw):
        return True
    return False

def _find_matching_rows(rows: list, names: list) -> list:
    """Return matching exact DB rows for the given candidate names."""
    lower_names = [n.strip().lower() for n in names]
    
    # Try exact match first
    matched = [r for r in rows if r.get('full_name', '').strip().lower() in lower_names]
    
    if not matched:
        # Try partial match
        matched = []
        for r in rows:
            fn_lower = r.get('full_name', '').strip().lower()
            if any((ln in fn_lower or fn_lower in ln) and ln != '' for ln in lower_names):
                matched.append(r)
                
    records = []
    for r in matched:
        records.append({
            "name":             r.get("full_name", ""),
            "total_experience": r.get("total_experience", 0),
            "pega_experience":  r.get("pega_experience", 0),
            "skills":           r.get("skills", ""),
            "certifications":   r.get("certifications", ""),
            "ctc":              r.get("ctc", ""),
            "notice_period":    r.get("notice_period", ""),
            "organization":     r.get("current_organization", ""),
            "email":            r.get("email", ""),
            "phone":            r.get("phone", ""),
        })
    return records

@app.post("/api/chat")
def chat(body: ChatRequest):
    global _embeddings, _llm, _models_loading
    if _embeddings is None or _llm is None:
        if _models_loading:
            return {"type": "text", "answer": "⏳ Hire AI is currently warming up and downloading models. This may take a few minutes depending on your internet connection. Please try again shortly!"}
        else:
            threading.Thread(target=get_models, daemon=True).start()
            return {"type": "text", "answer": "⏳ Hire AI is starting its engines... Please try again in a few seconds."}

    embeddings, llm = _embeddings, _llm
    prompt  = body.message.strip()
    p_lower = prompt.lower()

    # ── Route 1: Conversational ──────────────────────────────────────────────
    if _is_conversational(p_lower):
        resp = llm.invoke([HumanMessage(content=(
            "You are Hire AI, an intelligent HR recruitment assistant for Alamaticz Solutions. "
            "Respond warmly and professionally.\n\nUser: " + prompt
        ))])
        return {"type": "text", "answer": resp.content}

    # ── Route 2: Structured (SQLite) — always try this first ─────────────────
    rows = get_candidates_list()
    if rows:
        for r in rows:
            for col in ['total_experience', 'pega_experience']:
                if col in r:
                    try:
                        r[col] = float(r[col]) if str(r[col]).strip() != "" else 0
                    except:
                        r[col] = 0

        # Build a compact summary of each candidate for the LLM
        candidate_lines = []
        for r in rows:
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

        filter_prompt = f"""You are an expert HR data analyst. I have the following candidate database:

{candidates_text}

HR question: "{prompt}"

Instructions:
1. Read the question carefully.
2. If the question asks to LIST / SHOW / FIND candidates:
   - Return EXACTLY this JSON format (no other text before or after):
   MATCH_RESULT: {{"type":"table","matched_names":[<exact full_name values>],"intro":"<one sentence intro>"}}
3. If the question asks for a COUNT or YES/NO:
   - Return EXACTLY: MATCH_RESULT: {{"type":"count","answer":"<direct answer>"}}
4. If the question is about a SPECIFIC candidate's detail:
   - Return EXACTLY: MATCH_RESULT: {{"type":"table","matched_names":[<that candidate's name>],"intro":"Here are the details:"}}
5. IMPORTANT: Use ONLY exact full_name values from the database above. Do NOT invent names.
6. 'Pega Exp: 0 yrs' = ZERO Pega experience.

Respond with ONLY the MATCH_RESULT line, nothing else."""

        try:
            resp = llm.invoke([HumanMessage(content=filter_prompt)])
            ans  = resp.content.strip()

            if "MATCH_RESULT:" in ans:
                json_str = ans.split("MATCH_RESULT:")[1].strip()
                # Extract JSON object
                s, e = json_str.find('{'), json_str.rfind('}')
                if s != -1 and e != -1:
                    result = json.loads(json_str[s:e+1])

                    if result.get("type") == "count":
                        return {"type": "text", "answer": result.get("answer", ans)}

                    if result.get("type") == "table":
                        names = result.get("matched_names", [])
                        intro = result.get("intro", "Here are the matching candidates:")
                        if names:
                            matched_rows = _find_matching_rows(rows, names)
                            if matched_rows:
                                return {"type": "table", "answer": intro, "rows": matched_rows}
                        # No matches found
                        return {"type": "text", "answer": "No candidates match your query. Try a different filter."}
        except Exception:
            pass  # Fall through to RAG

    # ── Route 3: RAG (ChromaDB) — for very specific resume content ────────────
    if not os.path.exists(CHROMA_PATH):
        return {"type": "text", "answer": "No resumes uploaded yet. Please upload resumes first."}

    try:
        db        = Chroma(persist_directory=CHROMA_PATH, embedding_function=embeddings)
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


# ── Reset ──────────────────────────────────────────────────────────────────────
@app.post("/api/reset")
def reset_all():
    conn = sqlite3.connect(STATS_DB, timeout=30.0)
    conn.execute("DELETE FROM candidate_metadata")
    conn.commit()
    conn.close()
    try:
        if os.path.exists(CHROMA_PATH):
            shutil.rmtree(CHROMA_PATH)
    except Exception:
        pass
    return {"status": "reset complete"}

# ── Serve React Frontend ───────────────────────────────────────────────────────
FRONTEND_DIST = os.path.join(BASE_DIR, "frontend", "dist")
if os.path.exists(FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")

