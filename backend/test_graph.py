import sqlite3
import requests
import email
import json

conn = sqlite3.connect('stats.db')
cur = conn.cursor()
cur.execute('SELECT outlook_email, ms_client_id, ms_client_secret, ms_tenant_id FROM integrations_settings LIMIT 1')
row = cur.fetchone()
conn.close()

if not row:
    print("No settings found")
    exit()

email_user, ms_client_id, ms_client_secret, ms_tenant_id = row
print(f"Testing for {email_user}...")

token_url = f"https://login.microsoftonline.com/{ms_tenant_id}/oauth2/v2.0/token"
data = {
    "client_id": ms_client_id,
    "client_secret": ms_client_secret,
    "scope": "https://graph.microsoft.com/.default",
    "grant_type": "client_credentials"
}
token_res = requests.post(token_url, data=data)
access_token = token_res.json().get("access_token")

if not access_token:
    print("Failed to get token:", token_res.json())
    exit()

headers = {"Authorization": f"Bearer {access_token}"}
msg_url = f"https://graph.microsoft.com/v1.0/users/{email_user}/mailFolders/Inbox/messages?$top=5&$select=id,subject,hasAttachments"
msg_res = requests.get(msg_url, headers=headers)

if msg_res.status_code != 200:
    print("Failed to fetch messages:", msg_res.json())
    exit()

messages = msg_res.json().get('value', [])
for m in messages:
    print(f"\nMessage: {m.get('subject')} (HasAttachments: {m.get('hasAttachments')})")
    if m.get('hasAttachments'):
        m_id = m['id']
        mime_url = f"https://graph.microsoft.com/v1.0/users/{email_user}/messages/{m_id}/$value"
        mime_res = requests.get(mime_url, headers=headers)
        if mime_res.status_code == 200:
            msg = email.message_from_bytes(mime_res.content)
            attachments = []
            if msg.is_multipart():
                for part in msg.walk():
                    if part.get_filename():
                        attachments.append(part.get_filename())
            print(f"MIME Attachments parsed: {attachments}")
        else:
            print(f"Failed to fetch MIME: {mime_res.status_code}")
