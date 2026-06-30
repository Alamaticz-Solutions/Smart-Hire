import requests

url = "http://127.0.0.1:8000/api/upload"
files = {'file': ('test.pdf', b'fake pdf content', 'application/pdf')}
headers = {'x-user-username': 'admin'}

try:
    response = requests.post(url, files=files, headers=headers)
    print("Status:", response.status_code)
    print("Response:", response.text)
except Exception as e:
    print("Error:", e)

