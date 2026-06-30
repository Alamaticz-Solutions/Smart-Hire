import sys
import os
import sqlite3
import json

sys.path.append(os.path.abspath('backend'))
from main import get_models, EXTRACT_PROMPT
from langchain_core.messages import HumanMessage
from langchain_community.document_loaders import Docx2txtLoader

def test_parsing():
    _, llm = get_models()
    
    # 1. Load Docx
    files = [f for f in os.listdir('backend/static') if 'vamshi' in f.lower()]
    if not files:
        print("Vamshi docx file not found.")
        return
    path = os.path.join('backend/static', files[0])
    loader = Docx2txtLoader(path)
    docs = loader.load()
    text = "\n".join([d.page_content for d in docs])
    
    # 2. Extract with resume + email body
    email_message = "Hi\n\nI have total of 7 years of experience and 5 yrs into pega"
    combined_text = text[:7000] + f"\n\n=== EMAIL MESSAGE BODY ===\n{email_message}\n=========================="
    prompt2 = EXTRACT_PROMPT.format(text=combined_text, custom_fields="")
    resp2 = llm.invoke([HumanMessage(content=prompt2)])
    print("\n=== RESUME + EMAIL EXTRACTION ===")
    print(resp2.content.strip())

if __name__ == '__main__':
    test_parsing()
