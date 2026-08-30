"""S3 / OneDrive / Google Drive upload helpers for candidate resume files.

Config (STORAGE_PROVIDER, AWS_*, and STATS_DB) is now imported from
app.core.config instead of being computed independently in this file. This
fixes a real path-divergence bug: this module used to compute its own
`.env` path and its own STATS_DB fallback path via
`dirname(abspath(__file__))`, i.e. `backend/app/services/` -- one directory
level too shallow versus main.py's `backend/`. That meant this file's
`.env` load and its `stats.db` fallback silently pointed at the wrong
directory whenever STATS_DB_PATH wasn't set explicitly in the environment
(which is what masked the bug in practice). app.core.config is now the
single source of truth for both, computed once, correctly. See
app/core/config.py's own comment for the full path-depth explanation.
"""
import mimetypes
import json
import os
import re
from typing import Optional, Tuple

from app.core.config import STORAGE_PROVIDER, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_BUCKET_NAME
from app.core.logging import get_logger
from app.db.session import get_db_connection

logger = get_logger(__name__)


def get_db_integrations_settings():
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("PRAGMA table_info(integrations_settings)")
            cols = {c[1] for c in cur.fetchall()}

            if 'gdrive_client_id' in cols:
                cur.execute("""
                    SELECT drive_enabled, gdrive_client_id, gdrive_client_secret, gdrive_refresh_token, gdrive_folder_id
                    FROM integrations_settings LIMIT 1
                """)
                row = cur.fetchone()
                if row:
                    return {
                        "drive_enabled": row[0],
                        "gdrive_client_id": row[1],
                        "gdrive_client_secret": row[2],
                        "gdrive_refresh_token": row[3],
                        "gdrive_folder_id": row[4]
                    }
    except Exception as e:
        logger.error(f"Failed to fetch integrations settings from database: {e}")
    return {}

def is_external_storage_enabled() -> bool:
    if STORAGE_PROVIDER != "local":
        return True
    db_settings = get_db_integrations_settings()
    return db_settings.get("drive_enabled", 0) == 1

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
                    logger.warning("AWS credentials missing in environment.")
            except ImportError:
                logger.warning("boto3 package is not installed. Run pip install boto3.")
            except Exception as e:
                logger.error(f"Failed to initialize S3 client: {e}")
    return _s3_client


def get_s3_presigned_url(filename: str, expires_in: int = 300) -> Optional[str]:
    """Short-lived signed URL for a private S3 object. Resumes are no longer
    uploaded with a public-read ACL (see upload_to_external_storage below) -
    every consumer of an S3-backed file_url needs to go through this instead
    of hitting the permanent https://<bucket>.s3.<region>.amazonaws.com/<key>
    URL directly, which now 403s for anyone without bucket credentials."""
    client = get_s3_client()
    if not client or not AWS_BUCKET_NAME:
        return None
    try:
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": AWS_BUCKET_NAME, "Key": filename},
            ExpiresIn=expires_in,
        )
    except Exception as e:
        logger.error(f"Failed to generate S3 presigned URL for {filename}: {e}")
        return None


def is_s3_url(url: str) -> bool:
    return bool(url) and bool(AWS_BUCKET_NAME) and f"{AWS_BUCKET_NAME}.s3." in url

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
                logger.info(f"Successfully uploaded {filename} to OneDrive: {direct_url}")
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
            logger.info(f"Successfully uploaded {filename} to OneDrive: {share_url}")
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

def _get_gdrive_bearer_token() -> Tuple[Optional[str], Optional[str]]:
    """Shared by upload_to_google_drive() and get_gdrive_file_bytes() - same
    credential resolution (DB settings override env, service account takes
    priority over OAuth) either way."""
    db_settings = get_db_integrations_settings()
    json_path = os.getenv("GDRIVE_SERVICE_ACCOUNT_JSON")

    client_id = db_settings.get("gdrive_client_id") or os.getenv("GDRIVE_CLIENT_ID")
    client_secret = db_settings.get("gdrive_client_secret") or os.getenv("GDRIVE_CLIENT_SECRET")
    refresh_token = db_settings.get("gdrive_refresh_token") or os.getenv("GDRIVE_REFRESH_TOKEN")

    if client_id: client_id = client_id.strip('"\' ')
    if client_secret: client_secret = client_secret.strip('"\' ')
    if refresh_token: refresh_token = refresh_token.strip('"\' ')

    is_oauth_configured = (
        client_id and client_id != "your_gdrive_client_id_here" and
        client_secret and client_secret != "your_gdrive_client_secret_here" and
        refresh_token and refresh_token != "your_gdrive_refresh_token_here"
    )

    if json_path and os.path.exists(json_path):
        return get_gdrive_access_token(json_path)
    elif is_oauth_configured:
        return get_gdrive_oauth_token(client_id, client_secret, refresh_token)
    return None, "Google Drive configuration is incomplete or contains placeholder values."


def is_gdrive_url(url: str) -> bool:
    return bool(url) and "drive.google.com" in url


def extract_gdrive_file_id(url: str) -> Optional[str]:
    if not url:
        return None
    m = re.search(r"[?&]id=([^&]+)", url)
    return m.group(1) if m else None


def get_gdrive_file_bytes(file_id: str) -> Optional[bytes]:
    """Read a resume's bytes via an authenticated Drive API call instead of
    the public download link the file used to be shared with (see the
    comment in upload_to_google_drive) - this is what makes it safe for
    Drive files to no longer be public."""
    token, err = _get_gdrive_bearer_token()
    if err or not token:
        logger.error(f"Failed to get Drive token for file {file_id}: {err}")
        return None
    try:
        import requests
        resp = requests.get(
            f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media",
            headers={"Authorization": f"Bearer {token}"},
            timeout=30,
        )
        if resp.status_code == 200:
            return resp.content
        logger.error(f"Drive file download failed for {file_id}: {resp.status_code} - {resp.text[:200]}")
        return None
    except Exception as e:
        logger.error(f"Drive file download exception for {file_id}: {e}")
        return None


def upload_to_google_drive(file_path: str, filename: str) -> Tuple[Optional[str], Optional[str]]:
    db_settings = get_db_integrations_settings()
    folder_id = db_settings.get("gdrive_folder_id") or os.getenv("GDRIVE_FOLDER_ID")
    if folder_id: folder_id = folder_id.strip('"\' ')

    import requests

    token, err = _get_gdrive_bearer_token()
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

        # Resumes contain PII (name, phone, email) - the file is NOT shared
        # publicly. It used to be granted role="reader", type="anyone" here,
        # making every resume downloadable by anyone with the link. The
        # `direct_url` below is kept only as a stable identifier (it embeds
        # the Drive file id, which get_gdrive_file_bytes()/is_gdrive_url()
        # parse back out) - reading the actual file now always goes through
        # an authenticated Drive API call using the same service-account/
        # OAuth credentials this upload used, never a public link.
        direct_url = f"https://drive.google.com/uc?export=download&id={file_id}"
        logger.info(f"Successfully uploaded {filename} to Google Drive: {direct_url}")
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
            
            # Resumes contain PII (name, phone, email) - upload privately.
            # This used to request ACL="public-read", making every resume
            # world-readable via a guessable/enumerable URL as soon as it
            # was uploaded. The stored `url` below is kept as a stable
            # identifier (candidates.py/main.py key lookups match on the
            # filename portion), but reading the object now always requires
            # a short-lived signed URL via get_s3_presigned_url().
            client.upload_file(
                file_path,
                AWS_BUCKET_NAME,
                filename,
                ExtraArgs=extra_args,
            )

            url = f"https://{AWS_BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com/{filename}"
            logger.info(f"Successfully uploaded {filename} to AWS S3: {url}")
            return url, None
        except Exception as e:
            return None, f"S3 upload failed: {str(e)}"
            
    elif active_provider == "onedrive":
        return upload_to_onedrive(file_path, filename)
        
    elif active_provider == "google_drive" or active_provider == "google":
        return upload_to_google_drive(file_path, filename)
        
    # Default/local storage
    return None, None
