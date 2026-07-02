"""
Provider credential resolution and validation.

A "credential" is the API key for cloud providers, or the server base URL for
Ollama. Resolution order: value saved via the Model Manager (SQLite) first,
then the provider's .env variable.
"""
import os
from typing import Optional, Tuple

from dotenv import load_dotenv

from ...models.database import SessionLocal
from ...models.schemas import ProviderCredential

load_dotenv()

PROVIDERS = ["google", "anthropic", "openai", "ollama"]

_ENV_VARS = {
    "google": "GEMINI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "ollama": "OLLAMA_BASE_URL",
}


def get_credential(provider: str) -> Optional[str]:
    db = SessionLocal()
    try:
        row = db.query(ProviderCredential).filter(ProviderCredential.provider == provider).first()
        if row and row.value:
            return row.value
    finally:
        db.close()
    return os.getenv(_ENV_VARS.get(provider, "")) or None


def credential_source(provider: str) -> Optional[str]:
    """'db' if saved via the Model Manager, 'env' if from .env, None if unset."""
    db = SessionLocal()
    try:
        row = db.query(ProviderCredential).filter(ProviderCredential.provider == provider).first()
        if row and row.value:
            return "db"
    finally:
        db.close()
    return "env" if os.getenv(_ENV_VARS.get(provider, "")) else None


def validate_credential(provider: str, value: str) -> Tuple[bool, Optional[str]]:
    """Make a cheap live call against the provider to confirm the credential works."""
    try:
        if provider == "google":
            from google import genai
            client = genai.Client(api_key=value)
            client.models.list()
        elif provider == "anthropic":
            try:
                import anthropic
            except ImportError:
                return False, "The 'anthropic' package is not installed (pip install anthropic)"
            client = anthropic.Anthropic(api_key=value)
            client.models.list(limit=1)
        elif provider == "openai":
            try:
                import openai
            except ImportError:
                return False, "The 'openai' package is not installed (pip install openai)"
            client = openai.OpenAI(api_key=value)
            client.models.list()
        elif provider == "ollama":
            import httpx
            r = httpx.get(f"{value.rstrip('/')}/api/tags", timeout=3.0)
            r.raise_for_status()
        else:
            return False, f"Unknown provider: {provider}"
    except Exception as e:
        return False, str(e)
    return True, None
