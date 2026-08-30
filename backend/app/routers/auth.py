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

import random
import secrets
import smtplib
import sqlite3
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.core import config
from app.core.logging import get_logger
from app.db.row_helpers import dict_row_factory
from app.db.session import get_db_connection
from app.services.passwords import hash_password, is_legacy_hash, verify_password
from app.services.rate_limit import is_rate_limited
from app.services.session_tokens import create_session_token

logger = get_logger(__name__)

router = APIRouter()

# In-memory OTP store: lowercased username -> {"otp": str, "expires_at": float, "username": str}
# Single-process, in-memory, not persisted (unchanged from the original
# mobile-keyed version - only the key changed, see ForgotPasswordRequest).
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
    # Was `mobile` - looked up by scanning every user's mobile number, but
    # mobile is optional at registration and, checked against the real
    # database, not a single existing user actually has one set. Username
    # is mandatory and known to every user, so the reset flow now keys off
    # that instead - the mobile-based version was unreachable for 100% of
    # real accounts, not just an edge case.
    username: str


class ResetPasswordRequest(BaseModel):
    username: str
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


def _mask_email(email: str) -> str:
    """j***n@gmail.com - enough for a user to recognize their own address
    without handing a plaintext email to anyone who can read the response."""
    if not email or "@" not in email:
        return ""
    local, _, domain = email.partition("@")
    if len(local) <= 2:
        masked_local = local[0] + "*" if local else "*"
    else:
        masked_local = f"{local[0]}{'*' * (len(local) - 2)}{local[-1]}"
    return f"{masked_local}@{domain}"


def send_otp_email(to_email: str, otp: str) -> bool:
    """Actually deliver the password-reset OTP by email.

    This function existed once before (see the "Mobile OTP Forgot Password
    flow" commit) but was never wired up - request_otp built and returned
    the OTP directly in the API response instead of calling this, which is
    exactly the account-takeover hole closed elsewhere in this file. There
    is still no SMS provider configured anywhere in this app, so email -
    already required at registration, unlike mobile - is the only channel
    that actually exists. Sends via whichever mailbox is configured as the
    primary integration (Connect tab), falling back to the SMTP_* env vars
    if that's not set up.
    """
    smtp_host = smtp_port = smtp_sender = smtp_password = None
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT smtp_host, smtp_port, email_user, email_pass, email_enabled FROM integrations_settings LIMIT 1"
            )
            row = cur.fetchone()
        if row and row[4]:
            smtp_host, smtp_port, smtp_sender, smtp_password = row[0], row[1], row[2], row[3]
    except Exception as db_err:
        logger.error(f"[OTP email] Error fetching integration settings from DB: {db_err}")

    smtp_host = smtp_host or config.SMTP_HOST
    try:
        smtp_port = int(smtp_port or config.SMTP_PORT)
    except (TypeError, ValueError):
        smtp_port = 587
    smtp_sender = smtp_sender or config.SMTP_SENDER
    smtp_password = smtp_password or config.SMTP_PASSWORD

    if not smtp_sender or not smtp_password:
        logger.error("[OTP email] No SMTP credentials configured (neither integrations_settings nor SMTP_* env vars) - cannot deliver OTP.")
        return False

    subject = "Hire AI - Password Reset Code"
    body = f"Hi,\n\nYour 6-digit code to reset your Hire AI password is: {otp}\n\nThis code is valid for 5 minutes. If you didn't request this, you can safely ignore this email.\n\nHire AI"
    try:
        msg = MIMEMultipart()
        msg["From"] = smtp_sender
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        server = smtplib.SMTP(smtp_host, smtp_port, timeout=10.0)
        server.starttls()
        server.login(smtp_sender, smtp_password)
        server.sendmail(smtp_sender, to_email, msg.as_string())
        server.quit()
        logger.info(f"[OTP email] Sent password-reset code to {to_email}")
        return True
    except Exception as e:
        logger.error(f"[OTP email] Failed to send to {to_email}: {e}")
        return False


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
                        (req.full_name, req.username, hash_password(req.password), req.email, is_approved_val),
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
def login(req: LoginRequest, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    rl_key = f"login:{client_ip}:{req.username.lower()}"
    if is_rate_limited(rl_key, max_attempts=10, window_seconds=300):
        raise HTTPException(status_code=429, detail="Too many login attempts. Please try again in a few minutes.")

    with get_db_connection() as conn:
        conn.row_factory = dict_row_factory
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE LOWER(username) = LOWER(?)", (req.username,))
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid username or password")
        user_dict = dict(user)
        if not verify_password(req.password, user_dict.get("password_hash", "")):
            raise HTTPException(status_code=401, detail="Invalid username or password")

        # Transparent migration: a legacy unsalted-SHA256 hash that just
        # verified correctly gets upgraded to PBKDF2 now, with no separate
        # migration script and no forced password reset for the user.
        if is_legacy_hash(user_dict.get("password_hash", "")):
            cur.execute(
                "UPDATE users SET password_hash = ? WHERE LOWER(username) = LOWER(?)",
                (hash_password(req.password), req.username),
            )
            conn.commit()

    if user_dict.get("is_approved", 0) == 0:
        raise HTTPException(status_code=403, detail="Access denied. Your account is pending admin approval.")
    # Logged here, not by a follow-up client call: the frontend used to POST
    # /api/activity right after login, but that fires before axios has the
    # freshly-issued token attached (it's set by a React effect that only
    # runs after this response is handled) - now that /api/activity requires
    # an authenticated caller, that call 403'd on every single login. The
    # backend already knows who just authenticated, so log it directly.
    _log_activity_db(user_dict["username"], "logged in to the portal")
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
        "token": create_session_token(user_dict["username"]),
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
                    (req.full_name, req.username, hash_password(secrets.token_urlsafe(32)), req.email, req.mobile, is_approved_val),
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
    # See login()'s identical comment: logged server-side rather than via a
    # follow-up client call, which used to 403 (no session token attached yet).
    _log_activity_db(user_dict["username"], "logged in to the portal")
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
        "token": create_session_token(user_dict["username"]),
    }


@router.get("/api/auth/check-exists")
def check_user_exists(username: str, email: str, request: Request):
    # Both this and get-email below are load-bearing for the app's own
    # sign-up/login UX (uniqueness checks, username->email resolution for
    # Firebase auth) - closing the account-enumeration hole they represent
    # would need a redesign of that flow (e.g. moving Firebase auth
    # server-side so the client never needs a real email up front), not a
    # one-line patch, and is tracked separately. Rate limiting at least
    # bounds how fast an account list can actually be harvested through them.
    client_ip = request.client.host if request.client else "unknown"
    if is_rate_limited(f"check-exists:{client_ip}", max_attempts=20, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many requests. Please slow down.")

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
def get_email(username: str, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    if is_rate_limited(f"get-email:{client_ip}", max_attempts=20, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many requests. Please slow down.")

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
def request_otp(req: ForgotPasswordRequest, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    if is_rate_limited(f"otp-request:{client_ip}", max_attempts=5, window_seconds=300):
        raise HTTPException(status_code=429, detail="Too many requests. Please try again in a few minutes.")

    username_lookup = req.username.strip()

    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT username, email FROM users WHERE LOWER(username) = LOWER(?)", (username_lookup,))
        user_row = cur.fetchone()

    # Deliberately generic: whether or not this username is registered, the
    # response looks the same. Revealing "no account found" here lets an
    # attacker enumerate registered usernames pre-auth.
    generic_msg = "If this username is registered, a reset code has been sent to the email on file."

    if not user_row:
        return {"message": generic_msg}

    username, user_email = user_row[0], user_row[1]

    otp = f"{random.randint(100000, 999999)}"
    OTP_STORE[username.lower()] = {
        "otp": otp,
        "expires_at": time.time() + 300.0,
        "username": username,
    }

    # There's no SMS provider configured anywhere in this app - email
    # (required at registration) is the channel that actually exists, via
    # send_otp_email() above. This used to just log the OTP and echo it
    # back in the API response in every environment, which combined with
    # the enumeration fix above would still hand out a live OTP to anyone
    # who could reach this endpoint - a full unauthenticated account-
    # takeover chain. ALLOW_OTP_IN_RESPONSE stays as a local-dev escape
    # hatch (e.g. no SMTP configured locally), off by default regardless
    # of environment.
    emailed = False
    if user_email:
        emailed = send_otp_email(user_email, otp)
    if not emailed:
        logger.warning(f"[OTP email] Could not email OTP for username={username!r} - no email on file or send failed. OTP: {otp}")
        if config.REQUIRE_REAL_EMAIL:
            # Documented in .env.example but never wired up: without this,
            # a misconfigured mailbox meant every user saw a false "check
            # your email" with no way to actually complete a reset.
            del OTP_STORE[username.lower()]
            raise HTTPException(status_code=503, detail="Password reset email could not be sent right now. Please contact an administrator.")

    res_data = {"message": generic_msg}
    if user_email and emailed:
        res_data["email_hint"] = _mask_email(user_email)
    if config.ALLOW_OTP_IN_RESPONSE:
        res_data["otp"] = otp
    return res_data


@router.post("/api/auth/forgot-password/reset")
def reset_password(req: ResetPasswordRequest, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    username_lookup = req.username.strip().lower()
    # Bounds brute-forcing the 6-digit OTP itself (previously unlimited
    # attempts within the 5-minute OTP validity window).
    if is_rate_limited(f"otp-reset:{client_ip}:{username_lookup}", max_attempts=8, window_seconds=300):
        raise HTTPException(status_code=429, detail="Too many attempts. Please request a new code.")

    otp_code = req.otp.strip()
    new_pass = req.new_password

    if not _has_digit(new_pass):
        raise HTTPException(status_code=400, detail="Password must contain at least one digit")

    if username_lookup not in OTP_STORE:
        raise HTTPException(status_code=400, detail="No active password reset request found for this username.")

    stored = OTP_STORE[username_lookup]
    if time.time() > stored["expires_at"]:
        del OTP_STORE[username_lookup]
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")

    if stored["otp"] != otp_code:
        raise HTTPException(status_code=400, detail="Invalid OTP code. Please try again.")

    username = stored["username"]
    del OTP_STORE[username_lookup]

    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE users SET password_hash = ? WHERE username = ?", (hash_password(new_pass), username))
        conn.commit()

    return {
        "status": "success",
        "message": "Password reset successfully. You can now log in with your new password.",
    }
