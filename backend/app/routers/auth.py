import hashlib
import hmac
import os

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["auth"])

SESSION_COOKIE = "film_session"
_COOKIE_MAX_AGE = 60 * 60 * 24 * 30  # 30 days


def get_password() -> str | None:
    """The gate password; None disables auth entirely (local dev, tests)."""
    return os.getenv("FILM_PASSWORD") or None


def session_token(password: str) -> str:
    # Stateless: valid as long as the password doesn't change, and changing
    # the password invalidates every existing session at once.
    return hmac.new(password.encode(), b"film-session-v1", hashlib.sha256).hexdigest()


def is_authenticated(request: Request) -> bool:
    password = get_password()
    if not password:
        return True
    cookie = request.cookies.get(SESSION_COOKIE, "")
    return hmac.compare_digest(cookie, session_token(password))


class LoginPayload(BaseModel):
    password: str


@router.get("/status")
def auth_status(request: Request):
    return {
        "auth_required": get_password() is not None,
        "authenticated": is_authenticated(request),
    }


@router.post("/login")
def login(payload: LoginPayload, request: Request, response: Response):
    password = get_password()
    if not password:
        return {"status": "ok"}
    if not hmac.compare_digest(payload.password, password):
        raise HTTPException(status_code=401, detail="Incorrect password")
    response.set_cookie(
        SESSION_COOKIE,
        session_token(password),
        max_age=_COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https",
    )
    return {"status": "ok"}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(SESSION_COOKIE)
    return {"status": "ok"}
