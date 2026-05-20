import requests

url = "http://localhost:8000/api/upload"
headers = {
    "Origin": "http://localhost:5173",
    "Access-Control-Request-Method": "POST"
}
try:
    resp = requests.options(url, headers=headers)
    print("OPTIONS Status:", resp.status_code)
    print("OPTIONS Headers:", resp.headers)
    
    # Also test actual POST with Origin
    files = {'file': ('test.pdf', b'fake pdf content', 'application/pdf')}
    post_headers = {"Origin": "http://localhost:5173"}
    resp2 = requests.post(url, headers=post_headers, files=files)
    print("POST Status:", resp2.status_code)
    print("POST Response:", resp2.text)
except Exception as e:
    print("Error:", e)
