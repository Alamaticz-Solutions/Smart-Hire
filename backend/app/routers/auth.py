"""Authentication endpoints: register, login, Firebase sync, profile, password reset."""
import re
import random
import secrets
import smtplib
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core import config
from app.core.logging import get_logger
from app.core.responses import EnvelopeRoute
from app.db.engine import get_session, session_scope
from app.models import User
from app.repositories import ActivityRepository, ChangeRequestRepository, IntegrationSettingsRepository, UserRepository
from app.services.auth import SEEDED_USERNAMES, invalidate_user_cache
from app.services.passwords import hash_password, is_legacy_hash, verify_password
from app.services.rate_limit import is_rate_limited
from app.services.session_tokens import create_session_token

logger = get_logger(__name__)

router = APIRouter(route_class=EnvelopeRoute)

OTP_STORE: dict = {}
MAX_ACCOUNTS_PER_EMAIL = 5
OTP_TTL_SECONDS = 300.0


# ── schemas ────────────────────────────────────────────────────────────────
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")


class RegisterRequest(BaseModel):
    full_name: str
    username: str
    password: str
    email: str


class LoginRequest(BaseModel):
    username: str
    password: str


class FirebaseSyncRequest(BaseModel):
    id_token: str  # Firebase ID token proving the caller really signed in
    email: str
    full_name: str
    username: str
    mobile: Optional[str] = None


class ForgotPasswordRequest(BaseModel):
    username: str


class ResetPasswordRequest(BaseModel):
    username: str
    otp: str
    new_password: str


# ── helpers ────────────────────────────────────────────────────────────────
def _has_digit(value: str) -> bool:
    return any(ch.isdigit() for ch in value)


def _base_email(email: str) -> str:
    """Collapse ``name+tag@host`` aliases to ``name@host``."""
    if not email:
        return ""
    value = str(email).strip().lower()
    if "@" not in value:
        return value
    local, _, host = value.partition("@")
    return f"{local.split('+')[0]}@{host}"


def _mask_email(email: str) -> str:
    """``j***n@gmail.com`` - recognisable to its owner, useless to anyone else."""
    if not email or "@" not in email:
        return ""
    local, _, domain = email.partition("@")
    if len(local) <= 2:
        masked = (local[0] + "*") if local else "*"
    else:
        masked = f"{local[0]}{'*' * (len(local) - 2)}{local[-1]}"
    return f"{masked}@{domain}"


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _email_quota_used(users: UserRepository, email: str) -> int:
    base = _base_email(email)
    return sum(1 for existing in users.list_emails() if _base_email(existing) == base)


def _profile(user: User, *, with_token: bool = False) -> dict:
    data = {
        "username": user.username,
        "full_name": user.full_name,
        "role": user.role,
        "is_hr": user.is_hr or 0,
        "is_admin": user.is_admin or 0,
        "is_external": user.is_external or 0,
        "is_approved": user.is_approved or 0,
        "email": user.email or "",
        "hidden_fields": user.hidden_fields or "",
    }
    if with_token:
        data["token"] = create_session_token(user.username)
    return data


def _request_approval(session: Session, full_name: str, username: str) -> None:
    ChangeRequestRepository(session).create(
        username,
        "approve_user",
        target_id=username,
        description=f"Approve access request for registered user {full_name} (@{username})",
    )


def send_otp_email(to_email: str, otp: str) -> bool:
    """Deliver the password-reset OTP through the configured mailbox.

    Uses the primary mailbox from the Connect tab, falling back to the
    ``SMTP_*`` environment variables.
    """
    smtp_host = smtp_port = smtp_sender = smtp_password = None
    try:
        with session_scope() as session:
            row = IntegrationSettingsRepository(session).get()
            if row is not None and row.email_enabled:
                smtp_host, smtp_port = row.smtp_host, row.smtp_port
                smtp_sender, smtp_password = row.email_user, row.email_pass
    except Exception as exc:
        logger.error("[OTP email] Could not read integration settings: %s", exc)

    smtp_host = smtp_host or config.SMTP_HOST
    try:
        smtp_port = int(smtp_port or config.SMTP_PORT)
    except (TypeError, ValueError):
        smtp_port = 587
    smtp_sender = smtp_sender or config.SMTP_SENDER
    smtp_password = smtp_password or config.SMTP_PASSWORD

    if not smtp_sender or not smtp_password:
        logger.error("[OTP email] No SMTP credentials configured - cannot deliver OTP.")
        return False

    body = (
        f"Hi,\n\nYour 6-digit code to reset your Hire AI password is: {otp}\n\n"
        "This code is valid for 5 minutes. If you didn't request this, you can safely ignore this email.\n\nHire AI"
    )
    try:
        message = MIMEMultipart()
        message["From"], message["To"], message["Subject"] = smtp_sender, to_email, "Hire AI - Password Reset Code"
        message.attach(MIMEText(body, "plain"))
        server = smtplib.SMTP(smtp_host, smtp_port, timeout=10.0)
        try:
            server.starttls()
            server.login(smtp_sender, smtp_password)
            server.sendmail(smtp_sender, to_email, message.as_string())
        finally:
            server.quit()
        logger.info("[OTP email] Sent password-reset code to %s", to_email)
        return True
    except Exception as exc:
        logger.error("[OTP email] Failed to send to %s: %s", to_email, exc)
        return False


# ── endpoints ──────────────────────────────────────────────────────────────
@router.post("/api/auth/register")
def register(req: RegisterRequest, session: Session = Depends(get_session)):
    if not config.ALLOW_LOCAL_REGISTRATION:
        raise HTTPException(status_code=403, detail="Registration is handled through the sign-up page.")
    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")
    if not _has_digit(req.password):
        raise HTTPException(status_code=400, detail="Password must contain at least one digit")
    if not _EMAIL_RE.match(req.email.strip()):
        raise HTTPException(status_code=400, detail="Please enter a valid email address")
    if not req.username.strip() or not req.full_name.strip():
        raise HTTPException(status_code=400, detail="Name and username are required")

    users = UserRepository(session)
    if users.username_exists(req.username):
        raise HTTPException(status_code=400, detail="Username already exists")
    if _email_quota_used(users, req.email) >= MAX_ACCOUNTS_PER_EMAIL:
        raise HTTPException(status_code=400, detail="Maximum of 5 accounts can be created with the same email address.")

    approved = int(req.username.lower() in SEEDED_USERNAMES)
    users.add(User(
        full_name=req.full_name, username=req.username, password_hash=hash_password(req.password),
        email=req.email, role="user", is_approved=approved,
    ))
    if not approved:
        _request_approval(session, req.full_name, req.username)
    return {"status": "registered", "username": req.username}


@router.post("/api/auth/login")
def login(req: LoginRequest, request: Request, session: Session = Depends(get_session)):
    key = f"login:{_client_ip(request)}:{req.username.lower()}"
    if is_rate_limited(key, max_attempts=10, window_seconds=300):
        raise HTTPException(status_code=429, detail="Too many login attempts. Please try again in a few minutes.")

    user = UserRepository(session).get_by_username(req.username)
    if user is None or not verify_password(req.password, user.password_hash or ""):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if is_legacy_hash(user.password_hash or ""):  # transparently upgrade old SHA-256 hashes
        user.password_hash = hash_password(req.password)

    if not user.is_approved:
        raise HTTPException(status_code=403, detail="Access denied. Your account is pending admin approval.")
    ActivityRepository(session).add(user.username, "logged in to the portal")
    return _profile(user, with_token=True)


def verify_firebase_token(id_token: str) -> Optional[dict]:
    """Ask Google to validate a Firebase ID token. Returns ``{uid, email, email_verified}`` or ``None``."""
    import requests

    try:
        response = requests.post(
            f"https://identitytoolkit.googleapis.com/v1/accounts:lookup?key={config.FIREBASE_API_KEY}",
            json={"idToken": id_token}, timeout=10,
        )
        users = response.json().get("users") if response.status_code == 200 else None
    except Exception as exc:
        logger.error("Firebase token verification failed: %s", exc)
        return None
    if not users:
        return None
    user = users[0]
    return {"uid": user.get("localId"), "email": (user.get("email") or "").lower(), "email_verified": bool(user.get("emailVerified"))}


@router.post("/api/auth/firebase-sync")
def firebase_sync(req: FirebaseSyncRequest, session: Session = Depends(get_session)):
    """Create / sign in the local account for a Firebase user.

    The caller must present a Firebase ID token that Google confirms; without it anyone could
    request a session for any username (including an admin) just by naming it.
    """
    identity = verify_firebase_token(req.id_token)
    if identity is None or not identity["uid"] or identity["email"] != req.email.strip().lower():
        raise HTTPException(status_code=401, detail="Could not verify your sign-in. Please sign in again.")

    users = UserRepository(session)
    user = users.get_by_username(req.username)

    if user is None:
        if _email_quota_used(users, req.email) >= MAX_ACCOUNTS_PER_EMAIL:
            raise HTTPException(status_code=400, detail="Maximum of 5 accounts can be created with the same email address.")
        approved = int(req.username.lower() in SEEDED_USERNAMES)
        user = users.add(User(
            full_name=req.full_name, username=req.username,
            # Authentication is delegated to Firebase: an unguessable local password.
            password_hash=hash_password(secrets.token_urlsafe(32)),
            email=req.email, mobile=req.mobile, role="user", is_approved=approved, firebase_uid=identity["uid"],
        ))
        if not approved:
            _request_approval(session, req.full_name, req.username)
        ActivityRepository(session).add(req.username, "registered an account via Firebase")
    else:
        if user.firebase_uid:
            if user.firebase_uid != identity["uid"]:
                raise HTTPException(status_code=401, detail="Could not verify your sign-in. Please sign in again.")
        else:
            # First Firebase sign-in for an existing account: the token must belong to the e-mail on file,
            # and privileged accounts additionally need a verified address (Firebase lets anyone sign up
            # with any unverified e-mail), otherwise they keep using their password.
            if user.email and user.email.strip().lower() != identity["email"]:
                raise HTTPException(status_code=401, detail="Could not verify your sign-in. Please sign in again.")
            if (user.is_admin or user.is_hr) and not identity["email_verified"]:
                raise HTTPException(status_code=401, detail="Please sign in with your password.")
            user.firebase_uid = identity["uid"]
        if not user.email and req.email:
            user.email = req.email

    if not user.is_approved:
        session.commit()  # keep the new account + its approval request: raising rolls the session back
        raise HTTPException(status_code=403, detail="Access denied. Your account is pending admin approval.")
    ActivityRepository(session).add(user.username, "logged in to the portal")
    return _profile(user, with_token=True)


@router.get("/api/auth/check-exists")
def check_user_exists(username: str, email: str, request: Request, session: Session = Depends(get_session)):
    if is_rate_limited(f"check-exists:{_client_ip(request)}", max_attempts=20, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many requests. Please slow down.")

    users = UserRepository(session)
    if users.username_exists(username):
        return {"exists": True, "reason": "Username already exists."}
    if _email_quota_used(users, email) >= MAX_ACCOUNTS_PER_EMAIL:
        return {"exists": True, "reason": "Maximum of 5 accounts can be created with the same email address."}
    return {"exists": False}


@router.get("/api/auth/get-email")
def get_email(username: str, request: Request, session: Session = Depends(get_session)):
    if is_rate_limited(f"get-email:{_client_ip(request)}", max_attempts=20, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many requests. Please slow down.")
    user = UserRepository(session).get_by_username(username)
    if user and user.email:
        return {"email": user.email}
    return {"email": f"{username.lower()}@hireai.local"}


@router.get("/api/auth/status")
def get_user_status(request: Request, session: Session = Depends(get_session)):
    username = request.headers.get("x-user-username")
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = UserRepository(session).get_by_username(username)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return _profile(user)


@router.post("/api/auth/forgot-password/request")
def request_otp(req: ForgotPasswordRequest, request: Request, session: Session = Depends(get_session)):
    if is_rate_limited(f"otp-request:{_client_ip(request)}", max_attempts=5, window_seconds=300):
        raise HTTPException(status_code=429, detail="Too many requests. Please try again in a few minutes.")

    generic = "If this username is registered, a reset code has been sent to the email on file."
    user = UserRepository(session).get_by_username(req.username.strip())
    if user is None:
        return {"message": generic}  # do not reveal which usernames exist

    username, user_email = user.username, user.email
    otp = f"{random.SystemRandom().randint(100000, 999999)}"
    OTP_STORE[username.lower()] = {"otp": otp, "expires_at": time.time() + OTP_TTL_SECONDS, "username": username}

    emailed = bool(user_email) and send_otp_email(user_email, otp)
    if not emailed:
        logger.warning("[OTP email] Could not email OTP for username=%r (no address on file or send failed)", username)
        if config.REQUIRE_REAL_EMAIL:
            OTP_STORE.pop(username.lower(), None)
            raise HTTPException(
                status_code=503,
                detail="Password reset email could not be sent right now. Please contact an administrator.",
            )

    response = {"message": generic}
    if user_email and emailed:
        response["email_hint"] = _mask_email(user_email)
    if config.ALLOW_OTP_IN_RESPONSE:
        response["otp"] = otp
    return response


@router.post("/api/auth/forgot-password/reset")
def reset_password(req: ResetPasswordRequest, request: Request, session: Session = Depends(get_session)):
    lookup = req.username.strip().lower()
    if is_rate_limited(f"otp-reset:{_client_ip(request)}:{lookup}", max_attempts=8, window_seconds=300):
        raise HTTPException(status_code=429, detail="Too many attempts. Please request a new code.")
    if len(req.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")
    if not _has_digit(req.new_password):
        raise HTTPException(status_code=400, detail="Password must contain at least one digit")

    stored = OTP_STORE.get(lookup)
    if stored is None:
        raise HTTPException(status_code=400, detail="No active password reset request found for this username.")
    if time.time() > stored["expires_at"]:
        del OTP_STORE[lookup]
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")
    if not secrets.compare_digest(stored["otp"], req.otp.strip()):
        raise HTTPException(status_code=400, detail="Invalid OTP code. Please try again.")

    del OTP_STORE[lookup]
    user = UserRepository(session).get_by_username(stored["username"])
    if user is not None:
        user.password_hash = hash_password(req.new_password)
        invalidate_user_cache(user.username)
    return {
        "status": "success",
        "message": "Password reset successfully. You can now log in with your new password.",
    }
