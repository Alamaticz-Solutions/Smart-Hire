import requests

url = "http://localhost:8000/api/match-jd"
try:
    resp = requests.post(url, json={"job_description": "pega with 3 years of experience"})
    print("Status:", resp.status_code)
    print("Response:", resp.text)
except Exception as e:
    print("Error:", e)
