"""
Password gate tests — AUTH-001 to AUTH-004.

FILM_PASSWORD is unset in the test environment, so every other suite runs
with auth disabled; these tests toggle it per-test via monkeypatch (the
middleware and auth router read the env var at request time).
"""

PASSWORD = "correct-horse"


# ── AUTH-001 ──────────────────────────────────────────────────────────────────

def test_auth_disabled_when_password_unset(client, monkeypatch):
    """AUTH-001 [P0 smoke]: With no FILM_PASSWORD, the API is open and status
    reports auth not required."""
    monkeypatch.delenv("FILM_PASSWORD", raising=False)

    assert client.get("/api/chats").status_code == 200

    status = client.get("/api/auth/status").json()
    assert status == {"auth_required": False, "authenticated": True}


# ── AUTH-002 ──────────────────────────────────────────────────────────────────

def test_api_locked_when_password_set(client, monkeypatch):
    """AUTH-002 [P0 smoke]: With FILM_PASSWORD set, API routes 401 without a
    session; auth endpoints stay reachable so login is possible."""
    monkeypatch.setenv("FILM_PASSWORD", PASSWORD)

    assert client.get("/api/chats").status_code == 401
    assert client.post("/api/chats", json={"title": "x"}).status_code == 401

    status = client.get("/api/auth/status")
    assert status.status_code == 200
    assert status.json() == {"auth_required": True, "authenticated": False}


# ── AUTH-003 ──────────────────────────────────────────────────────────────────

def test_login_flow(client, monkeypatch):
    """AUTH-003 [P0 smoke]: Wrong password 401s; correct password sets a session
    cookie that unlocks the API and flips status to authenticated."""
    monkeypatch.setenv("FILM_PASSWORD", PASSWORD)

    bad = client.post("/api/auth/login", json={"password": "wrong"})
    assert bad.status_code == 401
    assert client.get("/api/chats").status_code == 401

    good = client.post("/api/auth/login", json={"password": PASSWORD})
    assert good.status_code == 200
    assert "film_session" in client.cookies

    assert client.get("/api/chats").status_code == 200
    assert client.get("/api/auth/status").json() == {
        "auth_required": True,
        "authenticated": True,
    }


# ── AUTH-004 ──────────────────────────────────────────────────────────────────

def test_logout_and_forged_cookie(client, monkeypatch):
    """AUTH-004 [P1]: Logout clears the session; a forged cookie value is
    rejected."""
    monkeypatch.setenv("FILM_PASSWORD", PASSWORD)

    client.post("/api/auth/login", json={"password": PASSWORD})
    assert client.get("/api/chats").status_code == 200

    client.post("/api/auth/logout")
    assert client.get("/api/chats").status_code == 401

    client.cookies.set("film_session", "a" * 64)
    assert client.get("/api/chats").status_code == 401
