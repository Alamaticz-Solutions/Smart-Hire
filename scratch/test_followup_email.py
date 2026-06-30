import sys
import os
import sqlite3
import json

sys.path.append(os.path.abspath('backend'))
from main import get_models
from langchain_core.messages import HumanMessage

def run_test():
    db_path = 'backend/stats.db'
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    # 1. Create a clean mock candidate profile with missing values
    test_email = 'testcandidate_12345@example.com'
    cur.execute("DELETE FROM candidate_metadata WHERE email = ?", (test_email,))
    conn.commit()
    
    cur.execute("""
        INSERT INTO candidate_metadata (full_name, email, ctc, pref_locations, total_experience)
        VALUES ('Test Candidate Name', ?, NULL, NULL, 3.0)
    """, (test_email,))
    conn.commit()
    
    # Fetch row id
    cur.execute("SELECT id, ctc, pref_locations, total_experience FROM candidate_metadata WHERE email = ?", (test_email,))
    row = cur.fetchone()
    cand_id = row[0]
    print(f"Created candidate ID: {cand_id}")
    print(f"Values before: CTC={row[1]}, Pref Locations={row[2]}, Total Exp={row[3]}")
    
    # 2. Mock incoming email follow-up response
    body_text = """
    Here are the requested details:
    * Current CTC: 12 LPA
    * Preferred work location(s): Bangalore, Hyderabad
    * Total years of experience: 6 years
    """
    
    # 3. Simulate parsing logic
    _, llm = get_models()
    parse_prompt = f"""You are an expert HR assistant. A candidate has sent a follow-up email response containing their profile details.
Extract and update the following fields from the email text:
- total_experience: number of years (e.g. 5, or 7.5. Must be a number)
- pega_experience: number of years of Pega experience (must be a number)
- cdh_exp: number of CDH experience years (must be a number)
- ctc: current CTC string (e.g. "8 LPA" or "800000")
- expected_ctc: expected CTC string (e.g. "12 LPA")
- notice_period: notice period string (e.g. "Immediate" or "30 days")
- current_location: current location name
- pref_locations: preferred locations (comma separated if multiple)
- linkedin: LinkedIn profile URL

Rules:
1. Return ONLY a valid JSON object. No explanation, no markdown.
2. If a field is not present or not mentioned, return null.

Email Text:
{body_text}

JSON:"""
    
    print("Invoking LLM to parse follow-up details...")
    resp = llm.invoke([HumanMessage(content=parse_prompt)])
    raw_resp = resp.content.strip()
    if "```json" in raw_resp:
        raw_resp = raw_resp.split("```json")[1].split("```")[0].strip()
    elif "```" in raw_resp:
        raw_resp = raw_resp.split("```")[1].split("```")[0].strip()
    start_idx, end_idx = raw_resp.find('{'), raw_resp.rfind('}')
    if start_idx != -1 and end_idx != -1:
        raw_resp = raw_resp[start_idx:end_idx+1]
    parsed_data = json.loads(raw_resp)
    print("Parsed Data from LLM:", parsed_data)
    
    # 4. Perform SQLite update
    updates = {}
    allowed_keys = [
        'total_experience', 'pega_experience', 'cdh_exp', 'ctc', 
        'expected_ctc', 'notice_period', 'current_location', 
        'pref_locations', 'linkedin'
    ]
    for k in allowed_keys:
        val = parsed_data.get(k)
        if val is not None and str(val).strip() not in ("", "null", "None"):
            updates[k] = val
            
    if updates:
        set_clause = ", ".join(f"{col}=?" for col in updates)
        cur.execute(f"UPDATE candidate_metadata SET {set_clause} WHERE id=?", list(updates.values()) + [cand_id])
        conn.commit()
        print("Updated candidate row successfully.")
        
    # 5. Fetch and verify updated fields
    cur.execute("SELECT id, ctc, pref_locations, total_experience FROM candidate_metadata WHERE id = ?", (cand_id,))
    updated_row = cur.fetchone()
    print(f"Values after: CTC={updated_row[1]}, Pref Locations={updated_row[2]}, Total Exp={updated_row[3]}")
    
    # Assertions
    assert updated_row[1] == "12 LPA", f"Expected CTC '12 LPA', got {updated_row[1]}"
    assert "Bangalore" in updated_row[2], f"Expected 'Bangalore' in pref locations, got {updated_row[2]}"
    assert float(updated_row[3]) == 6.0, f"Expected total experience 6.0, got {updated_row[3]}"
    print("SUCCESS: Mock candidate follow-up update assertion verified!")
    
    # Cleanup
    cur.execute("DELETE FROM candidate_metadata WHERE email = ?", (test_email,))
    conn.commit()
    conn.close()

if __name__ == '__main__':
    run_test()
