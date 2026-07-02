"""
Shared fixtures for all FiLM API test suites.

Run from backend/ directory:
    pytest tests/

Requires:  pip install pytest httpx
"""
import os
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch

# ── Must be set before any app code is imported ──────────────────────────────
_TEST_DIR = Path(__file__).parent
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DIR / 'test_film.db'}"
os.environ.setdefault("GEMINI_API_KEY", "test-key-pytest")
os.environ.setdefault("CHROMA_PERSIST_DIR", str(_TEST_DIR / "test_chroma"))
# ─────────────────────────────────────────────────────────────────────────────

from fastapi.testclient import TestClient           # noqa: E402
from sqlalchemy.orm import sessionmaker             # noqa: E402

from app.models.schemas import Base                # noqa: E402
from app.models.database import engine, get_db     # noqa: E402
from main import app                               # noqa: E402

_TestSession = sessionmaker(bind=engine)


# ── Service mocks ─────────────────────────────────────────────────────────────

def _mock_chroma():
    m = MagicMock()
    m.add_message.return_value = None
    m.delete_message.return_value = None
    m.delete_chat_messages.return_value = None
    m.get_document_by_id.return_value = "Mock file content from vector store"
    return m


def _mock_gemini():
    m = MagicMock()
    m.generate_response.return_value = "Mock AI response"

    async def _stream(*args, **kwargs):
        yield "Mock "
        yield "AI "
        yield "response"

    m.generate_response_stream = _stream
    return m


# ── DB fixtures ───────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def reset_db():
    """Create fresh tables before each test; drop them after."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db(reset_db):
    session = _TestSession()
    try:
        yield session
    finally:
        session.close()


# ── Test client ───────────────────────────────────────────────────────────────

@pytest.fixture
def client(db):
    """
    FastAPI TestClient with:
    - DB overridden to isolated test session
    - gemini_service mocked (no real LLM calls)
    - chroma_service mocked (no real vector DB calls)
    """
    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db

    _llm = _mock_gemini()
    with patch("app.routers.chats.get_llm_service", lambda _model_id: _llm), \
         patch("app.routers.chats.chroma_service", _mock_chroma()), \
         patch("app.routers.context.chroma_service", _mock_chroma()):
        with TestClient(app) as c:
            yield c

    app.dependency_overrides.clear()
