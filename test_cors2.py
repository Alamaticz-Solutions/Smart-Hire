import requests

url = "http://localhost:8000/api/upload"
headers = {
    "Origin": "http://192.168.0.101:5173",
    "Access-Control-Request-Method": "POST"
}
try:
    resp = requests.options(url, headers=headers)
    print("OPTIONS Status:", resp.status_code)
    print("OPTIONS Headers:", resp.headers)
except Exception as e:
    print("Error:", e)
