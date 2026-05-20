import os
import json
import sqlite3

fp = r'c:\Users\sekhe\OneDrive\Documents\321\backend\main.py'
with open(fp, 'r', encoding='utf-8') as f:
    content = f.read()

custom_columns_schema = '''        CREATE TABLE IF NOT EXISTS custom_columns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            col_key TEXT UNIQUE,
            col_label TEXT,
            description TEXT
        )
    \''')'''

new_tables = '''
    cur.execute(\'''
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    \''')
    cur.execute(\'''
        CREATE TABLE IF NOT EXISTS job_candidates (
            job_id INTEGER,
            candidate_id INTEGER,
            ai_reason TEXT,
            status TEXT DEFAULT 'matched',
            PRIMARY KEY (job_id, candidate_id),
            FOREIGN KEY (job_id) REFERENCES jobs(id),
            FOREIGN KEY (candidate_id) REFERENCES candidate_metadata(id)
        )
    \''')
'''

if 'CREATE TABLE IF NOT EXISTS jobs' not in content:
    if custom_columns_schema in content:
        content = content.replace(custom_columns_schema, custom_columns_schema + new_tables)
    else:
        print('Could not find custom columns schema to insert jobs table.')

endpoints = '''
# ── Jobs & JDs ─────────────────────────────────────────────────────────────────
class JobCreate(BaseModel):
    title: str
    description: str

class JobStatusUpdate(BaseModel):
    status: str

@app.get("/api/jobs")
def get_jobs():
    conn = sqlite3.connect(STATS_DB, timeout=30.0)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT * FROM jobs ORDER BY created_at DESC")
    jobs = [dict(row) for row in cur.fetchall()]
    # Get candidate counts
    for job in jobs:
        cur.execute("SELECT status, COUNT(*) as cnt FROM job_candidates WHERE job_id = ? GROUP BY status", (job['id'],))
        counts = {r['status']: r['cnt'] for r in cur.fetchall()}
        job['matched_count'] = counts.get('matched', 0)
        job['selected_count'] = counts.get('selected', 0)
    conn.close()
    return jobs

@app.post("/api/jobs")
def create_job(job: JobCreate):
    conn = sqlite3.connect(STATS_DB, timeout=30.0)
    cur = conn.cursor()
    cur.execute("INSERT INTO jobs (title, description) VALUES (?, ?)", (job.title, job.description))
    job_id = cur.lastrowid
    conn.commit()
    conn.close()
    return {"id": job_id, "title": job.title, "description": job.description, "matched_count": 0, "selected_count": 0}

@app.delete("/api/jobs/{job_id}")
def delete_job(job_id: int):
    conn = sqlite3.connect(STATS_DB, timeout=30.0)
    cur = conn.cursor()
    cur.execute("DELETE FROM job_candidates WHERE job_id = ?", (job_id,))
    cur.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
    conn.commit()
    conn.close()
    return {"message": "Job deleted"}

@app.get("/api/jobs/{job_id}/candidates")
def get_job_candidates(job_id: int):
    conn = sqlite3.connect(STATS_DB, timeout=30.0)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("""
        SELECT c.*, jc.ai_reason, jc.status as job_status
        FROM candidate_metadata c
        JOIN job_candidates jc ON c.id = jc.candidate_id
        WHERE jc.job_id = ?
    """, (job_id,))
    candidates = [dict(row) for row in cur.fetchall()]
    conn.close()
    return candidates

@app.put("/api/jobs/{job_id}/candidates/{candidate_id}")
def update_job_candidate_status(job_id: int, candidate_id: int, update: JobStatusUpdate):
    if update.status not in ["matched", "selected"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    conn = sqlite3.connect(STATS_DB, timeout=30.0)
    cur = conn.cursor()
    cur.execute("UPDATE job_candidates SET status = ? WHERE job_id = ? AND candidate_id = ?", (update.status, job_id, candidate_id))
    conn.commit()
    conn.close()
    return {"message": "Status updated"}

@app.post("/api/jobs/{job_id}/match")
def match_candidates_for_job(job_id: int):
    # This endpoint finds matching candidates for a job and saves them to job_candidates
    conn = sqlite3.connect(STATS_DB, timeout=30.0)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT description FROM jobs WHERE id = ?", (job_id,))
    job = cur.fetchone()
    if not job:
        conn.close()
        raise HTTPException(status_code=404, detail="Job not found")
    
    jd = job['description']
    
    # Embed query and search Chroma
    emb, llm = get_models()
    try:
        vectorstore = Chroma(persist_directory=CHROMA_PATH, embedding_function=emb)
        docs = vectorstore.similarity_search(jd, k=20)
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Chroma error: {str(e)}")

    matched_sources = set()
    for d in docs:
        if 'source' in d.metadata:
            matched_sources.add(d.metadata['source'])
            
    if not matched_sources:
        conn.close()
        return {"message": "No matches found in vector store"}

    placeholders = ",".join("?" * len(matched_sources))
    cur.execute(f"SELECT id, full_name, filename, skills, total_experience FROM candidate_metadata WHERE filename IN ({placeholders})", list(matched_sources))
    db_rows = [dict(r) for r in cur.fetchall()]

    if not db_rows:
        conn.close()
        return {"message": "No candidates found in DB"}

    candidate_lines = []
    for r in db_rows:
        candidate_lines.append(f"Name: {r.get('full_name')} | Skills: {r.get('skills')} | Exp: {r.get('total_experience')} yrs")
    
    prompt = f"""You are an expert technical recruiter. Evaluate these candidates against the Job Description.
For EACH candidate, provide a 1-sentence explanation of why they are a good fit.
Format exactly as a JSON list:
[
  {{"name": "Candidate Name", "reason": "Reason..."}}
]

Job Description:
{jd[:2000]}

Candidates:
{chr(10).join(candidate_lines)}

JSON Response:"""

    try:
        resp = llm.invoke([HumanMessage(content=prompt)])
        raw = resp.content.strip()
        if "```json" in raw: raw = raw.split("```json")[1].split("```")[0].strip()
        elif "```" in raw: raw = raw.split("```")[1].split("```")[0].strip()
        start, end = raw.find('['), raw.rfind(']')
        if start != -1 and end != -1: raw = raw[start:end+1]
        ai_reasons = json.loads(raw)
        reason_map = {str(item.get("name", "")).strip().lower(): item.get("reason", "") for item in ai_reasons}
    except Exception:
        reason_map = {}

    matches_added = 0
    for r in db_rows:
        name = str(r.get('full_name', '')).strip().lower()
        reason = reason_map.get(name, "Matched based on resume content similarity.")
        if reason == "Matched based on resume content similarity.":
            for k, v in reason_map.items():
                if k in name or name in k:
                    reason = v
                    break
        
        # Upsert into job_candidates
        cur.execute("""
            INSERT INTO job_candidates (job_id, candidate_id, ai_reason, status) 
            VALUES (?, ?, ?, 'matched')
            ON CONFLICT(job_id, candidate_id) DO UPDATE SET ai_reason = excluded.ai_reason
        """, (job_id, r['id'], reason))
        matches_added += 1

    conn.commit()
    conn.close()
    return {"message": f"Successfully matched and added {matches_added} candidates to job"}

'''

if 'class JobCreate(BaseModel):' not in content:
    target = '# ── Reset ──────────────────────────────────────────────────────────────────────'
    if target in content:
        content = content.replace(target, endpoints + '\n' + target)
    else:
        print('Could not find Reset section to insert endpoints.')

with open(fp, 'w', encoding='utf-8') as f:
    f.write(content)
print('Done patching main.py')
