import os
import sqlite3
import json
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage

# Load env
load_dotenv()
STATS_DB = "backend/stats.db"
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

def get_candidates_list(username=None, role="admin") -> list:
    conn = sqlite3.connect(STATS_DB)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT * FROM candidate_metadata ORDER BY timestamp DESC")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

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
        ans = resp.content.strip()
        if ans.startswith("```json"):
            ans = ans[7:]
        if ans.endswith("```"):
            ans = ans[:-3]
        return json.loads(ans.strip())
    except Exception as e:
        print(f"Error extracting search filters: {e}")
        return {}

def query_candidates_by_filters(filters: dict, username: str, role: str) -> list:
    conn = sqlite3.connect(STATS_DB)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    query = "SELECT * FROM candidate_metadata WHERE 1=1"
    params = []
    
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
    cur.execute(query, params)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

def test_query(prompt):
    print(f"\n=====================================")
    print(f"Testing Query: {prompt}")
    
    llm = ChatGroq(temperature=0.1, model_name="llama-3.1-8b-instant", groq_api_key=GROQ_API_KEY)
    
    filters = extract_search_filters(prompt, llm)
    print("Extracted Filters:", json.dumps(filters, indent=2))
    
    matched_candidates = query_candidates_by_filters(filters, None, "admin")
    print(f"Database Query Matched: {len(matched_candidates)} candidates")
    
    # Slice to top 15 to fit in TPM budget
    limited_candidates = matched_candidates[:15]
    
    candidate_lines = []
    for r in limited_candidates:
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
    
    total_db_count = len(get_candidates_list())
    
    filter_prompt = f"""You are an expert HR data analyst. I have the following candidate database:

Total candidates in database: {total_db_count}

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
        ans = resp.content.strip()
        print("--- Raw LLM Response ---")
        print(ans)
        print("------------------------")
    except Exception as e:
        print(f"Error calling LLM for prompt: {e}")

if __name__ == "__main__":
    test_query("give me the full name of Naresh")
    test_query("can you give me candidate having with 4years of experience in pega")
