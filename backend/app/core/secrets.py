"""Encryption of secrets stored in the database (mailbox passwords, Microsoft / Drive credentials).

Set ``SECRETS_KEY`` to a Fernet key (``python -m scripts.generate_secrets_key``) and every secret column is
encrypted at rest. Existing plain-text values keep working and are encrypted on the next start. Without a
key nothing is encrypted (and the Connect page says so). **Keep the key: without it the secrets are unreadable.**
"""
from __future__ import annotations

import os
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import Text
from sqlalchemy.types import TypeDecorator

from app.core.logging import get_logger

logger = get_logger(__name__)
PREFIX = "enc:v1:"


def _fernet() -> Optional[Fernet]:
    key = os.getenv("SECRETS_KEY", "").strip()
    if not key:
        return None
    try:
        return Fernet(key.encode())
    except Exception:
        logger.error("SECRETS_KEY is not a valid Fernet key - secrets are NOT being encrypted")
        return None


def encryption_enabled() -> bool:
    return _fernet() is not None


def encrypt(value: Optional[str]) -> Optional[str]:
    cipher = _fernet()
    if cipher is None or value is None or value == "" or value.startswith(PREFIX):
        return value
    return PREFIX + cipher.encrypt(value.encode()).decode()


def decrypt(value: Optional[str]) -> Optional[str]:
    if not value or not value.startswith(PREFIX):
        return value  # empty, or a legacy plain-text value
    cipher = _fernet()
    if cipher is None:
        logger.error("An encrypted secret was read but SECRETS_KEY is not set")
        return ""
    try:
        return cipher.decrypt(value[len(PREFIX):].encode()).decode()
    except InvalidToken:
        logger.error("Could not decrypt a stored secret (wrong SECRETS_KEY?)")
        return ""


class EncryptedText(TypeDecorator):
    """A text column that is transparently encrypted when SECRETS_KEY is configured."""

    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return encrypt(value)

    def process_result_value(self, value, dialect):
        return decrypt(value)
