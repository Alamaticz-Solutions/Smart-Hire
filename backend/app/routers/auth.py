"""Authentication endpoints: register/login/firebase-sync/status/forgot-password.

Moved verbatim (same paths/methods/logic) from app/main.py:
  - POST /api/auth/register                  (main.py ~3857-3899)
  - POST /api/auth/login                     (main.py ~3901-3924)
  - POST /api/auth/firebase-sync             (main.py ~3932-3995, model ~3926-3930)
  - GET  /api/auth/check-exists              (main.py ~3997-4018)
  - GET  /api/auth/get-email                 (main.py ~4022-4032)
  - GET  /api/auth/status                    (main.py ~4034-4058)
  - POST /api/auth/forgot-password/request   (main.py ~4138-4170, model ~4060-4061)
  - POST /api/auth/forgot-password/reset     (main.py ~4172-4206, model ~4063-4066)

NOT moved: `send_otp_email` (main.py ~4068-4136). Confirmed via grep across
main.py that it has zero call sites -- `request_otp` (forgot-password/request)
builds the OTP itself and returns it directly in the JSON response instead of
emailing it (see the `OTP SIMULATION` print + `res_data = {"message": ...,
"otp": otp}` in the original). It is dead code and has been omitted rather
than moved.

`OTP_STORE` was a module-level dict in main.py shared between the
forgot-password request/reset routes; it is recreated here as a
module-level dict for the same reason (in-memory OTP state, single-process
assumption unchanged from the original).

DB access adapted from raw `sqlite3.connect(STATS_DB, ...)` to the
`get_db_connection()` context manager so connections can't leak on an
exception path (several original handlers called `conn.close()` manually
and would skip it if an exception fired first).
"""

import hashlib
import random
import sqlite3
import time
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.core.logging import get_logger
from app.db.row_helpers import dict_row_factory
from app.db.session import get_db_connection

logger = get_logger(__name__)

router = APIRouter()

# In-memory OTP store: mobile -> {"otp": str, "expires_at": float, "username": str}
# Mirrors main.py's OTP_STORE exactly (single-process, in-memory, not persisted).
OTP_STORE: dict = {}


class RegisterRequest(BaseModel):
    full_name: str
    username: str
    password: str
    email: str


class LoginRequest(BaseModel):
    username: str
    password: str


class FirebaseSyncRequest(BaseModel):
    email: str
    full_name: str
    username: str
    mobile: Optional[str] = None


class ForgotPasswordRequest(BaseModel):
    mobile: str


class ResetPasswordRequest(BaseModel):
    mobile: str
    otp: str
    new_password: str


def _has_digit(s: str) -> bool:
    return any(c.isdigit() for c in s)


def _get_base_email(email: str) -> str:
    if not email:
        return ""
    email_str = str(email).strip().lower()
    if "@" in email_str:
        parts = email_str.split("@")
        local_part = parts[0].split("+")[0]
        return f"{local_part}@{parts[1]}"
    return email_str


def _log_activity_db(username: str, action: str) -> None:
    if not username:
        username = "unknown"
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("INSERT INTO activity_logs (username, action) VALUES (?, ?)", (username, action))
            conn.commit()
    except Exception as e:
        logger.error(f"Error logging activity: {e}")


_SEEDED_USERS = ("admin", "user", "boopathi", "praveen", "harish", "sabari")


@router.post("/api/auth/register")
def register(req: RegisterRequest):
    if not _has_digit(req.password):
        raise HTTPException(status_code=400, detail="Password must contain at least one digit")

    username_exists = False
    email_limit_exceeded = False
    with get_db_connection() as conn:
        cur = conn.cursor()
        try:
            cur.execute("SELECT 1 FROM users WHERE LOWER(username) = LOWER(?)", (req.username,))
            if cur.fetchone():
                username_exists = True
            else:
                base_email = _get_base_email(req.email)
                cur.execute("SELECT email FROM users")
                all_emails = [r[0] for r in cur.fetchall() if r[0]]
                same_email_count = sum(1 for e in all_emails if _get_base_email(e) == base_email)
                if same_email_count >= 5:
                    email_limit_exceeded = True
                else:
                    is_approved_val = 1 if req.username.lower() in _SEEDED_USERS else 0
                    cur.execute(
                        "INSERT INTO users (full_name, username, password_hash, email, role, is_approved) VALUES (?, ?, ?, ?, 'user', ?)",
                        (req.full_name, req.username, hashlib.sha256(req.password.encode()).hexdigest(), req.email, is_approved_val),
                    )
                    if is_approved_val == 0:
                        cur.execute(
                            """
                            INSERT INTO change_requests (username, action_type, target_id, payload, description, status)
                            VALUES (?, 'approve_user', ?, NULL, ?, 'pending')
                            """,
                            (req.username, req.username, f"Approve access request for registered user {req.full_name} (@{req.username})"),
                        )
                    conn.commit()
        except sqlite3.IntegrityError:
            username_exists = True
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    if username_exists:
        raise HTTPException(status_code=400, detail="Username already exists")
    if email_limit_exceeded:
        raise HTTPException(status_code=400, detail="Maximum of 5 accounts can be created with the same email address.")

    return {"status": "registered", "username": req.username}


@router.post("/api/auth/login")
def login(req: LoginRequest):
    with get_db_connection() as conn:
        conn.row_factory = dict_row_factory
        cur = conn.cursor()
        cur.execute(
            "SELECT * FROM users WHERE LOWER(username) = LOWER(?) AND password_hash = ?",
            (req.username, hashlib.sha256(req.password.encode()).hexdigest()),
        )
        user = cur.fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    user_dict = dict(user)
    if user_dict.get("is_approved", 0) == 0:
        raise HTTPException(status_code=403, detail="Access denied. Your account is pending admin approval.")
    return {
        "username": user_dict["username"],
        "full_name": user_dict["full_name"],
        "role": user_dict["role"],
        "is_hr": user_dict.get("is_hr", 0),
        "is_admin": user_dict.get("is_admin", 0),
        "is_external": user_dict.get("is_external", 0),
        "is_approved": user_dict.get("is_approved", 0),
        "email": user_dict.get("email", ""),
        "hidden_fields": user_dict.get("hidden_fields", ""),
    }


@router.post("/api/auth/firebase-sync")
def firebase_sync(req: FirebaseSyncRequest):
    with get_db_connection() as conn:
        conn.row_factory = dict_row_factory
        cur = conn.cursor()

        cur.execute("SELECT * FROM users WHERE LOWER(username) = LOWER(?)", (req.username,))
        user = cur.fetchone()

        if not user:
            base_email = _get_base_email(req.email)
            cur.execute("SELECT email FROM users")
            all_emails = [r[0] for r in cur.fetchall() if r[0]]
            same_email_count = sum(1 for e in all_emails if _get_base_email(e) == base_email)
            if same_email_count >= 5:
                raise HTTPException(status_code=400, detail="Maximum of 5 accounts can be created with the same email address.")

            try:
                is_approved_val = 1 if req.username.lower() in _SEEDED_USERS else 0
                cur.execute(
                    "INSERT INTO users (full_name, username, password_hash, email, mobile, role, is_approved) VALUES (?, ?, ?, ?, ?, 'user', ?)",
                    (req.full_name, req.username, hashlib.sha256("firebase_auth_managed".encode()).hexdigest(), req.email, req.mobile, is_approved_val),
                )
                if is_approved_val == 0:
                    cur.execute(
                        """
                        INSERT INTO change_requests (username, action_type, target_id, payload, description, status)
                        VALUES (?, 'approve_user', ?, NULL, ?, 'pending')
                        """,
                        (req.username, req.username, f"Approve access request for registered user {req.full_name} (@{req.username})"),
                    )
                conn.commit()

                cur.execute("SELECT * FROM users WHERE LOWER(username) = LOWER(?)", (req.username,))
                user = cur.fetchone()
                _log_activity_db(req.username, "registered an account via Firebase")
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Database synchronization error: {str(e)}")
        else:
            # User exists, let's make sure email is synced if it is missing
            try:
                user_dict = dict(user)
                if (not user_dict.get("email") or user_dict.get("email") == "") and req.email:
                    cur.execute("UPDATE users SET email = ? WHERE LOWER(username) = LOWER(?)", (req.email, req.username.lower()))
                    conn.commit()
                    cur.execute("SELECT * FROM users WHERE LOWER(username) = LOWER(?)", (req.username,))
                    user = cur.fetchone()
            except Exception as e:
                logger.error(f"Failed to update user email during firebase sync: {e}")

    user_dict = dict(user)
    if user_dict.get("is_approved", 0) == 0:
        raise HTTPException(status_code=403, detail="Access denied. Your account is pending admin approval.")
    return {
        "username": user_dict["username"],
        "full_name": user_dict["full_name"],
        "role": user_dict["role"],
        "is_hr": user_dict.get("is_hr", 0),
        "is_admin": user_dict.get("is_admin", 0),
        "is_external": user_dict.get("is_external", 0),
        "is_approved": user_dict.get("is_approved", 0),
        "email": user_dict.get("email", ""),
        "hidden_fields": user_dict.get("hidden_fields", ""),
    }


@router.get("/api/auth/check-exists")
def check_user_exists(username: str, email: str):
    with get_db_connection() as conn:
        cur = conn.cursor()

        cur.execute("SELECT 1 FROM users WHERE LOWER(username) = LOWER(?)", (username,))
        if cur.fetchone():
            return {"exists": True, "reason": "Username already exists."}

        base_email = _get_base_email(email)
        cur.execute("SELECT email FROM users")
        all_emails = [r[0] for r in cur.fetchall() if r[0]]
        same_email_count = sum(1 for e in all_emails if _get_base_email(e) == base_email)
        if same_email_count >= 5:
            return {"exists": True, "reason": "Maximum of 5 accounts can be created with the same email address."}

    return {"exists": False}


@router.get("/api/auth/get-email")
def get_email(username: str):
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT email FROM users WHERE LOWER(username) = LOWER(?)", (username,))
        row = cur.fetchone()
    if row and row[0]:
        return {"email": row[0]}
    # Fallback
    return {"email": f"{username.lower()}@hireai.local"}


@router.get("/api/auth/status")
def get_user_status(request: Request):
    username = request.headers.get("x-user-username")
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    with get_db_connection() as conn:
        conn.row_factory = dict_row_factory
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE LOWER(username) = LOWER(?)", (username,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    user_dict = dict(row)
    return {
        "username": user_dict["username"],
        "full_name": user_dict["full_name"],
        "role": user_dict["role"],
        "is_hr": user_dict.get("is_hr", 0),
        "is_admin": user_dict.get("is_admin", 0),
        "is_external": user_dict.get("is_external", 0),
        "is_approved": user_dict.get("is_approved", 0),
        "email": user_dict.get("email", ""),
        "hidden_fields": user_dict.get("hidden_fields", ""),
    }


@router.post("/api/auth/forgot-password/request")
def request_otp(req: ForgotPasswordRequest):
    mobile = req.mobile.strip()

    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT mobile, username FROM users")
        users = cur.fetchall()
    matching_users = [u for u in users if u[0] and str(u[0]).strip() == mobile]

    if not matching_users:
        raise HTTPException(status_code=404, detail="No registered account found with this mobile number.")

    username = matching_users[0][1]

    otp = f"{random.randint(100000, 999999)}"
    OTP_STORE[mobile] = {
        "otp": otp,
        "expires_at": time.time() + 300.0,
        "username": username,
    }

    logger.info(f"[OTP SIMULATION] Password reset OTP for mobile {mobile}: {otp}")

    msg = "Simulated OTP code returned for demonstration."
    res_data = {"message": msg, "otp": otp}

    return res_data


@router.post("/api/auth/forgot-password/reset")
def reset_password(req: ResetPasswordRequest):
    mobile = req.mobile.strip()
    otp_code = req.otp.strip()
    new_pass = req.new_password

    if not _has_digit(new_pass):
        raise HTTPException(status_code=400, detail="Password must contain at least one digit")

    if mobile not in OTP_STORE:
        raise HTTPException(status_code=400, detail="No active password reset request found for this mobile number.")

    stored = OTP_STORE[mobile]
    if time.time() > stored["expires_at"]:
        del OTP_STORE[mobile]
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")

    if stored["otp"] != otp_code:
        raise HTTPException(status_code=400, detail="Invalid OTP code. Please try again.")

    username = stored["username"]
    del OTP_STORE[mobile]

    with get_db_connection() as conn:
        cur = conn.cursor()
        new_hash = hashlib.sha256(new_pass.encode()).hexdigest()
        cur.execute("UPDATE users SET password_hash = ? WHERE username = ?", (new_hash, username))
        conn.commit()

    return {
        "status": "success",
        "message": "Password reset successfully. You can now log in with your new password.",
    }
