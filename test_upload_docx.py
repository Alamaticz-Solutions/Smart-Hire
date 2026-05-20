import requests
import os

url = "http://localhost:8000/api/upload"
path = r"c:\Users\sekhe\OneDrive\Documents\321\backend\static\Sekhar Resume (2) (2).docx"
with open(path, "rb") as f:
    files = {'file': ('Sekhar Resume (2) (2).docx', f.read(), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')}

try:
    response = requests.post(url, files=files)
    print("Status:", response.status_code)
    print("Response:", response.text)
except Exception as e:
    print("Error:", e)
