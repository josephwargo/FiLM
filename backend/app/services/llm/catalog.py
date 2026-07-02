import time
from typing import Dict, List, Optional, Tuple

from ...models.database import SessionLocal
from ...models.schemas import ModelPref
from .base import LLMService
from .credentials import get_credential
from .gemini import GeminiService
from .anthropic_svc import AnthropicService
from .openai_svc import OpenAIService
from .ollama_svc import OllamaService

DEFAULT_MODEL_ID = "gemini-2.5-flash"

OLLAMA_PREFIX = "ollama:"

# Curated catalog. Google models are enabled by default (FiLM's zero-cost path);
# other providers' models are opt-in via the Model Manager.
STATIC_MODELS = [
    {
        "id": "gemini-2.5-flash",
        "name": "Gemini 2.5 Flash",
        "provider": "google",
        "description": "Fast, balanced default — generous free tier",
    },
    {
        "id": "gemini-2.5-pro",
        "name": "Gemini 2.5 Pro",
        "provider": "google",
        "description": "Strongest reasoning — slower, tighter free-tier limits",
    },
    {
        "id": "gemini-2.5-flash-lite",
        "name": "Gemini 2.5 Flash-Lite",
        "provider": "google",
        "description": "Fastest and lightest — quick lookups and simple tasks",
    },
    {
        "id": "claude-opus-4-7",
        "name": "Claude Opus 4.7",
        "provider": "anthropic",
        "description": "Anthropic's most capable model — deep reasoning and long-form work",
    },
    {
        "id": "claude-sonnet-4-6",
        "name": "Claude Sonnet 4.6",
        "provider": "anthropic",
        "description": "Strong all-rounder — great balance of quality and speed",
    },
    {
        "id": "claude-haiku-4-5-20251001",
        "name": "Claude Haiku 4.5",
        "provider": "anthropic",
        "description": "Fast and inexpensive — everyday tasks",
    },
    {
        "id": "gpt-5.5",
        "name": "GPT-5.5",
        "provider": "openai",
        "description": "OpenAI's flagship — strongest general capability",
    },
    {
        "id": "gpt-5.4-mini",
        "name": "GPT-5.4 mini",
        "provider": "openai",
        "description": "Fast and affordable — solid quality for routine work",
    },
    {
        "id": "gpt-5.4-nano",
        "name": "GPT-5.4 nano",
        "provider": "openai",
        "description": "Lightest and cheapest — quick, simple tasks",
    },
]

STATIC_MODEL_IDS = {m["id"] for m in STATIC_MODELS}

_ADAPTERS = {
    "google": GeminiService,
    "anthropic": AnthropicService,
    "openai": OpenAIService,
}


# ── Enabled state ─────────────────────────────────────────────────────────────

def _default_enabled(provider: str) -> bool:
    return provider == "google"


def _enabled_map() -> Dict[str, bool]:
    db = SessionLocal()
    try:
        return {p.model_id: p.enabled for p in db.query(ModelPref).all()}
    finally:
        db.close()


def _is_enabled(model: dict, prefs: Dict[str, bool]) -> bool:
    return prefs.get(model["id"], _default_enabled(model["provider"]))


# ── Ollama discovery ──────────────────────────────────────────────────────────

_OLLAMA_CACHE_TTL = 30.0
_ollama_cache: Tuple[float, List[dict]] = (0.0, [])


def discover_ollama_models(force: bool = False) -> List[dict]:
    """Live model list from the local Ollama server (cached briefly). Empty when unconfigured/unreachable."""
    global _ollama_cache
    cached_at, cached = _ollama_cache
    if not force and time.monotonic() - cached_at < _OLLAMA_CACHE_TTL:
        return cached

    base_url = get_credential("ollama")
    models: List[dict] = []
    if base_url:
        try:
            import httpx
            r = httpx.get(f"{base_url.rstrip('/')}/api/tags", timeout=2.0)
            r.raise_for_status()
            for m in r.json().get("models", []):
                tag = m["name"]
                models.append(
                    {
                        "id": f"{OLLAMA_PREFIX}{tag}",
                        "name": tag,
                        "provider": "ollama",
                        "description": "Local model via Ollama — free, fully offline",
                    }
                )
        except Exception:
            models = []
    _ollama_cache = (time.monotonic(), models)
    return models


# ── Catalog queries ───────────────────────────────────────────────────────────

def get_model_provider(model_id: str) -> Optional[str]:
    if model_id.startswith(OLLAMA_PREFIX):
        return "ollama"
    return next((m["provider"] for m in STATIC_MODELS if m["id"] == model_id), None)


def list_models() -> List[dict]:
    """Models for the picker: enabled static models + discovered Ollama models."""
    prefs = _enabled_map()
    result = [
        {
            **m,
            "available": bool(get_credential(m["provider"])),
            "is_default": m["id"] == DEFAULT_MODEL_ID,
        }
        for m in STATIC_MODELS
        if _is_enabled(m, prefs)
    ]
    result.extend(
        {**m, "available": True, "is_default": False}
        for m in discover_ollama_models()
    )
    return result


def full_catalog() -> List[dict]:
    """Every curated model with enabled + available flags — for the Model Manager."""
    prefs = _enabled_map()
    return [
        {
            **m,
            "enabled": _is_enabled(m, prefs),
            "available": bool(get_credential(m["provider"])),
            "is_default": m["id"] == DEFAULT_MODEL_ID,
        }
        for m in STATIC_MODELS
    ]


def set_model_enabled(model_id: str, enabled: bool) -> None:
    db = SessionLocal()
    try:
        pref = db.query(ModelPref).filter(ModelPref.model_id == model_id).first()
        if pref:
            pref.enabled = enabled
        else:
            db.add(ModelPref(model_id=model_id, enabled=enabled))
        db.commit()
    finally:
        db.close()


def resolve_model_id(model_id: Optional[str]) -> str:
    """Map a chat's stored model to a usable id. Unknown, retired, or disabled ids fall back to the default."""
    if not model_id:
        return DEFAULT_MODEL_ID
    if model_id.startswith(OLLAMA_PREFIX):
        if any(m["id"] == model_id for m in discover_ollama_models()):
            return model_id
        return DEFAULT_MODEL_ID
    prefs = _enabled_map()
    for m in STATIC_MODELS:
        if m["id"] == model_id and _is_enabled(m, prefs):
            return model_id
    return DEFAULT_MODEL_ID


# ── Adapter registry ──────────────────────────────────────────────────────────

_services: Dict[str, LLMService] = {}


def get_llm_service(model_id: str) -> LLMService:
    provider = get_model_provider(model_id)
    credential = get_credential(provider)
    # Cache keyed on the credential too, so saving a new key drops stale clients
    cache_key = f"{model_id}::{credential}"
    if cache_key not in _services:
        if provider == "ollama":
            _services[cache_key] = OllamaService(model_id[len(OLLAMA_PREFIX):], base_url=credential)
        else:
            _services[cache_key] = _ADAPTERS[provider](model_id, api_key=credential)
    return _services[cache_key]
