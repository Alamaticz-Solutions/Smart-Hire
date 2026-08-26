"""Password hashing: PBKDF2-HMAC-SHA256 with a per-user salt, stdlib only.

Replaces the previous unsalted `hashlib.sha256(password).hexdigest()` scheme
(rainbow-table crackable if the DB is ever exposed). New hashes are written
as `pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>`.

Existing rows still hold bare 64-hex-char SHA-256 digests. `verify_password`
recognizes that legacy format and verifies against it directly, so no
migration script or forced password reset is needed - `login()` in
routers/auth.py re-hashes into the new format transparently the next time
each user successfully logs in.
"""
import hashlib
import hmac
import os

_LEGACY_HEX_LEN = 64
_ITERATIONS = 260_000


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _ITERATIONS)
    return f"pbkdf2_sha256${_ITERATIONS}${salt.hex()}${digest.hex()}"


def is_legacy_hash(stored_hash: str) -> bool:
    return bool(stored_hash) and len(stored_hash) == _LEGACY_HEX_LEN and all(c in "0123456789abcdef" for c in stored_hash.lower())


def verify_password(password: str, stored_hash: str) -> bool:
    if not stored_hash:
        return False

    if is_legacy_hash(stored_hash):
        candidate = hashlib.sha256(password.encode()).hexdigest()
        return hmac.compare_digest(candidate, stored_hash)

    try:
        algo, iterations_str, salt_hex, hash_hex = stored_hash.split("$")
        if algo != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations_str))
        return hmac.compare_digest(digest.hex(), hash_hex)
    except (ValueError, AttributeError):
        return False
