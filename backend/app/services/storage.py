import os
import mimetypes
import json
from typing import Optional, Tuple
from dotenv import load_dotenv

# Load root .env first
load_dotenv()
# Explicitly load backend/.env to override/supplement configuration
_backend_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.exists(_backend_env_path):
    load_dotenv(_backend_env_path, override=True)

STORAGE_PROVIDER = os.getenv("STORAGE_PROVIDER", "local").lower()

def get_db_integrations_settings():
    try:
        import sqlite3
        base_dir = os.path.dirname(os.path.abspath(__file__))
        data_dir = "/data" if os.path.exists("/data") and os.access("/data", os.W_OK) else base_dir
        stats_db = os.getenv("STATS_DB_PATH", os.path.join(data_dir, "stats.db"))
        
        conn = sqlite3.connect(stats_db, timeout=30.0)
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(integrations_settings)")
        cols = {c[1] for c in cur.fetchall()}
        
        if 'gdrive_client_id' in cols:
            cur.execute("""
                SELECT drive_enabled, gdrive_client_id, gdrive_client_secret, gdrive_refresh_token, gdrive_folder_id 
                FROM integrations_settings LIMIT 1
            """)
            row = cur.fetchone()
            conn.close()
            if row:
                return {
                    "drive_enabled": row[0],
                    "gdrive_client_id": row[1],
                    "gdrive_client_secret": row[2],
                    "gdrive_refresh_token": row[3],
                    "gdrive_folder_id": row[4]
                }
        else:
            conn.close()
    except Exception as e:
        print(f"ERROR: Failed to fetch integrations settings from database: {e}")
    return {}

def is_external_storage_enabled() -> bool:
    if STORAGE_PROVIDER != "local":
        return True
    db_settings = get_db_integrations_settings()
    return db_settings.get("drive_enabled", 0) == 1

# Configure S3
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
AWS_BUCKET_NAME = os.getenv("AWS_BUCKET_NAME")

# Lazy import / initialization helpers to avoid crashes if SDKs are missing when not in use
_s3_client = None
_s3_initialized = False

def get_s3_client():
    global _s3_client, _s3_initialized
    if not _s3_initialized:
        _s3_initialized = True
        if STORAGE_PROVIDER == "s3":
            try:
                import boto3
                if AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY:
                    _s3_client = boto3.client(
                        "s3",
                        aws_access_key_id=AWS_ACCESS_KEY_ID,
                        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
                        region_name=AWS_REGION
                    )
                else:
                    print("WARNING: AWS credentials missing in environment.")
            except ImportError:
                print("WARNING: boto3 package is not installed. Run pip install boto3.")
            except Exception as e:
                print(f"ERROR: Failed to initialize S3 client: {e}")
    return _s3_client

# ── OneDrive Helper ───────────────────────────────────────────────────────────
def get_onedrive_access_token(client_id, client_secret, refresh_token):
    url = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
    data = {
        "client_id": client_id,
        "redirect_uri": "http://localhost",
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token"
    }
    import requests
    resp = requests.post(url, data=data, timeout=15)
    if resp.status_code == 200:
        return resp.json().get("access_token"), None
    return None, f"Failed to get OneDrive access token: {resp.text}"

def upload_to_onedrive(file_path: str, filename: str) -> Tuple[Optional[str], Optional[str]]:
    client_id = os.getenv("ONEDRIVE_CLIENT_ID")
    client_secret = os.getenv("ONEDRIVE_CLIENT_SECRET")
    refresh_token = os.getenv("ONEDRIVE_REFRESH_TOKEN")
    folder_name = os.getenv("ONEDRIVE_FOLDER_NAME", "Hire-AI-Resumes")
    
    if not all([client_id, client_secret, refresh_token]):
        return None, "OneDrive credentials (ID, Secret, Refresh Token) are not set in environment."
        
    import requests
    token, err = get_onedrive_access_token(client_id, client_secret, refresh_token)
    if err:
        return None, err
        
    # Upload to OneDrive folder
    upload_url = f"https://graph.microsoft.com/v1.0/me/drive/root:/{folder_name}/{filename}:/content"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/octet-stream"
    }
    
    try:
        with open(file_path, "rb") as f:
            file_data = f.read()
            
        resp = requests.put(upload_url, headers=headers, data=file_data, timeout=30)
        if resp.status_code not in [200, 201]:
            return None, f"OneDrive PUT failed: {resp.status_code} - {resp.text}"
            
        item_id = resp.json().get("id")
        
        # Request downloadUrl
        item_resp = requests.get(f"https://graph.microsoft.com/v1.0/me/drive/items/{item_id}", headers=headers, timeout=10)
        if item_resp.status_code == 200:
            direct_url = item_resp.json().get("@microsoft.graph.downloadUrl")
            if direct_url:
                print(f"INFO: Successfully uploaded {filename} to OneDrive: {direct_url}")
                return direct_url, None
        
        # Fallback to shareable link
        link_url = f"https://graph.microsoft.com/v1.0/me/drive/items/{item_id}/createLink"
        link_headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        link_data = {
            "type": "view",
            "scope": "anonymous"
        }
        link_resp = requests.post(link_url, headers=link_headers, json=link_data, timeout=15)
        if link_resp.status_code in [200, 201]:
            share_url = link_resp.json().get("link", {}).get("webUrl")
            print(f"INFO: Successfully uploaded {filename} to OneDrive: {share_url}")
            return share_url, None
        else:
            return None, f"Failed to create OneDrive shareable link: {link_resp.text}"
            
    except Exception as e:
        return None, f"OneDrive upload exception: {str(e)}"

# ── Google Drive Helper ────────────────────────────────────────────────────────
def get_gdrive_access_token(service_account_json_path):
    try:
        from google.oauth2 import service_account
        import google.auth.transport.requests
        
        scopes = ['https://www.googleapis.com/auth/drive.file']
        creds = service_account.Credentials.from_service_account_file(service_account_json_path, scopes=scopes)
        auth_req = google.auth.transport.requests.Request()
        creds.refresh(auth_req)
        return creds.token, None
    except Exception as e:
        return None, f"Failed to load Google Service Account: {str(e)}"

def get_gdrive_oauth_token(client_id, client_secret, refresh_token):
    try:
        url = "https://oauth2.googleapis.com/token"
        data = {
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token"
        }
        import requests
        resp = requests.post(url, data=data, timeout=15)
        if resp.status_code == 200:
            return resp.json().get("access_token"), None
        return None, f"Failed to get Google access token: {resp.text}"
    except Exception as e:
        return None, f"Network exception when getting Google token: {str(e)}"

def upload_to_google_drive(file_path: str, filename: str) -> Tuple[Optional[str], Optional[str]]:
    db_settings = get_db_integrations_settings()
    folder_id = db_settings.get("gdrive_folder_id") or os.getenv("GDRIVE_FOLDER_ID")
    json_path = os.getenv("GDRIVE_SERVICE_ACCOUNT_JSON")
    
    client_id = db_settings.get("gdrive_client_id") or os.getenv("GDRIVE_CLIENT_ID")
    client_secret = db_settings.get("gdrive_client_secret") or os.getenv("GDRIVE_CLIENT_SECRET")
    refresh_token = db_settings.get("gdrive_refresh_token") or os.getenv("GDRIVE_REFRESH_TOKEN")
    
    # Clean quotes and whitespace
    if client_id: client_id = client_id.strip('"\' ')
    if client_secret: client_secret = client_secret.strip('"\' ')
    if refresh_token: refresh_token = refresh_token.strip('"\' ')
    if folder_id: folder_id = folder_id.strip('"\' ')
    
    import requests
    
    token = None
    err = None
    
    is_oauth_configured = (
        client_id and client_id != "your_gdrive_client_id_here" and
        client_secret and client_secret != "your_gdrive_client_secret_here" and
        refresh_token and refresh_token != "your_gdrive_refresh_token_here"
    )
    
    if json_path and os.path.exists(json_path):
        token, err = get_gdrive_access_token(json_path)
    elif is_oauth_configured:
        token, err = get_gdrive_oauth_token(client_id, client_secret, refresh_token)
    else:
        return None, "Google Drive configuration is incomplete or contains placeholder values."
        
    if err or not token:
        return None, err or "Google Drive authentication token is empty."
        
    headers = {
        "Authorization": f"Bearer {token}"
    }
    
    try:
        content_type, _ = mimetypes.guess_type(filename)
        if not content_type:
            content_type = "application/octet-stream"
            
        # Check if file exists
        import urllib.parse
        search_query = f"name='{filename}' and trashed=false"
        if folder_id and folder_id != "your_gdrive_folder_id_here":
            search_query += f" and '{folder_id}' in parents"
        
        search_url = f"https://www.googleapis.com/drive/v3/files?q={urllib.parse.quote(search_query)}"
        search_resp = requests.get(search_url, headers=headers, timeout=15)
        
        existing_file_id = None
        if search_resp.status_code == 200:
            files_found = search_resp.json().get('files', [])
            if files_found:
                existing_file_id = files_found[0]['id']
                
        if existing_file_id:
            upload_url = f"https://www.googleapis.com/upload/drive/v3/files/{existing_file_id}?uploadType=multipart"
            req_method = requests.patch
            metadata = {} # name and parents are already set
        else:
            upload_url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart"
            req_method = requests.post
            metadata = {"name": filename}
            if folder_id and folder_id != "your_gdrive_folder_id_here":
                metadata["parents"] = [folder_id]
            
        with open(file_path, 'rb') as f_in:
            files = {
                'data': ('metadata', json.dumps(metadata), 'application/json; charset=UTF-8'),
                'file': (filename, f_in, content_type)
            }
            resp = req_method(upload_url, headers=headers, files=files, timeout=30)
            
        if resp.status_code not in (200, 201):
            return None, f"Google Drive upload failed: {resp.status_code} - {resp.text}"
            
        file_id = resp.json().get("id")
        
        # Share the file (make public so it can be downloaded via link)
        perm_url = f"https://www.googleapis.com/drive/v3/files/{file_id}/permissions"
        perm_data = {
            "role": "reader",
            "type": "anyone"
        }
        requests.post(perm_url, headers=headers, json=perm_data, timeout=10)
        
        direct_url = f"https://drive.google.com/uc?export=download&id={file_id}"
        print(f"INFO: Successfully uploaded {filename} to Google Drive: {direct_url}")
        return direct_url, None
        
    except Exception as e:
        return None, f"Google Drive upload exception: {str(e)}"

# ── Main Storage Router ───────────────────────────────────────────────────────
def upload_to_external_storage(file_path: str, filename: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Uploads a file to the configured external storage provider.
    Returns: (file_url, error_message)
    """
    db_settings = get_db_integrations_settings()
    is_drive_enabled = db_settings.get("drive_enabled", 0) == 1
    
    active_provider = STORAGE_PROVIDER
    if is_drive_enabled:
        active_provider = "google_drive"

    if active_provider == "s3":
        client = get_s3_client()
        if not client:
            return None, "AWS S3 client is not initialized or boto3 is not installed."
        if not AWS_BUCKET_NAME:
            return None, "AWS_BUCKET_NAME is not set in environment."
        
        try:
            content_type, _ = mimetypes.guess_type(filename)
            extra_args = {}
            if content_type:
                extra_args["ContentType"] = content_type
            
            try:
                client.upload_file(
                    file_path,
                    AWS_BUCKET_NAME,
                    filename,
                    ExtraArgs={**extra_args, "ACL": "public-read"}
                )
            except Exception as acl_err:
                print(f"Info: Failed to upload with public-read ACL, retrying without ACL: {acl_err}")
                client.upload_file(
                    file_path,
                    AWS_BUCKET_NAME,
                    filename,
                    ExtraArgs=extra_args
                )
            
            url = f"https://{AWS_BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com/{filename}"
            print(f"INFO: Successfully uploaded {filename} to AWS S3: {url}")
            return url, None
        except Exception as e:
            return None, f"S3 upload failed: {str(e)}"
            
    elif active_provider == "onedrive":
        return upload_to_onedrive(file_path, filename)
        
    elif active_provider == "google_drive" or active_provider == "google":
        return upload_to_google_drive(file_path, filename)
        
    # Default/local storage
    return None, None
