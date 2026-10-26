"""Shared FastAPI dependencies / small auth helpers for router modules.

Extracted from two boilerplate patterns repeated throughout the main.py
monolith:

1. The "is this user approved" check, repeated at the top of ~16+ mutating
   routes as:

       username = request.headers.get("x-user-username")
       if not is_user_approved(username):
           raise HTTPException(status_code=403, detail="Access denied. Your account is pending admin approval.")

   `require_approved_user` below is a FastAPI dependency that replaces those
   two lines with a single `username: str = Depends(require_approved_user)`
   parameter. The exact error status/detail text is preserved so behavior
   (and anything the frontend matches against the message) is unchanged.

2. The "does this user own the row, or are they admin/hr" check, repeated
   ~15 times as:

       if not is_admin_or_hr(username):
           if created_by and created_by.lower() != username.lower():
               raise HTTPException(status_code=403, detail="Forbidden")

   `assert_owns_or_admin` below is a plain helper (not a FastAPI dependency)
   because `created_by` is only known once the route body has fetched the
   specific row -- it can't be derived from the request alone the way
   `require_approved_user` can.

Other router modules (candidates/jobs/matching/chat, integrations,
resume-processing/excel-import, etc.) import both names from this module,
so the function names/signatures here are a stable contract -- do not
rename without coordinating.
"""

from fastapi import HTTPException, Request

from app.services.auth import is_admin_or_hr, is_user_approved


def require_approved_user(request: Request) -> str:
    """FastAPI dependency: extract `x-user-username` and require the user be approved.

    Returns the username on success. Raises the same 403 the original
    inline checks raised on failure, so existing frontend error handling
    keeps working unchanged.
    """
    username = request.headers.get("x-user-username")
    if not is_user_approved(username):
        raise HTTPException(
            status_code=403,
            detail="Access denied. Your account is pending admin approval.",
        )
    return username


def assert_owns_or_admin(created_by: str, username: str) -> None:
    """Raise 403 Forbidden unless `username` is admin/hr or is the row's owner.

    Mirrors the original inline pattern exactly:
        if not is_admin_or_hr(username):
            if created_by and created_by.lower() != username.lower():
                raise HTTPException(status_code=403, detail="Forbidden")
    """
    if not is_admin_or_hr(username):
        if created_by and created_by.lower() != (username or "").lower():
            raise HTTPException(status_code=403, detail="Forbidden")
