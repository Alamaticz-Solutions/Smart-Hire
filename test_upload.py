import requests

url = "http://localhost:8000/api/upload"
files = {'file': ('test.pdf', b'fake pdf content', 'application/pdf')}

try:
    response = requests.post(url, files=files)
    print("Status:", response.status_code)
    print("Response:", response.text)
except Exception as e:
    print("Error:", e)
