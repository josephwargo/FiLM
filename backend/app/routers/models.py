from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..models.database import get_db
from ..models.schemas import ProviderCredential
from ..models.pydantic_models import CredentialPayload, ModelPrefUpdate
from ..services.llm import (
    PROVIDERS,
    STATIC_MODEL_IDS,
    credential_source,
    discover_ollama_models,
    full_catalog,
    list_models,
    set_model_enabled,
    validate_credential,
)

router = APIRouter(prefix="/api/models", tags=["models"])


def _provider_status(provider: str) -> dict:
    source = credential_source(provider)
    return {"configured": source is not None, "source": source}


@router.get("")
def get_models():
    return list_models()


@router.get("/catalog")
def get_catalog():
    providers = {p: _provider_status(p) for p in PROVIDERS}
    providers["ollama"]["models"] = [m["name"] for m in discover_ollama_models(force=True)]
    return {"models": full_catalog(), "providers": providers}


@router.put("/providers/{provider}/credential")
def save_credential(provider: str, payload: CredentialPayload, db: Session = Depends(get_db)):
    if provider not in PROVIDERS:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider}")
    value = payload.value.strip()
    if not value:
        raise HTTPException(status_code=400, detail="Credential cannot be empty")

    ok, error = validate_credential(provider, value)
    if not ok:
        raise HTTPException(status_code=400, detail=f"Validation failed: {error}")

    row = db.query(ProviderCredential).filter(ProviderCredential.provider == provider).first()
    if row:
        row.value = value
    else:
        db.add(ProviderCredential(provider=provider, value=value))
    db.commit()
    discover_ollama_models(force=True)
    return {"status": "saved", "provider": provider, **_provider_status(provider)}


@router.delete("/providers/{provider}/credential")
def delete_credential(provider: str, db: Session = Depends(get_db)):
    if provider not in PROVIDERS:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider}")
    db.query(ProviderCredential).filter(ProviderCredential.provider == provider).delete()
    db.commit()
    discover_ollama_models(force=True)
    return {"status": "deleted", "provider": provider, **_provider_status(provider)}


@router.patch("/{model_id}")
def update_model_pref(model_id: str, payload: ModelPrefUpdate, db: Session = Depends(get_db)):
    if model_id not in STATIC_MODEL_IDS:
        raise HTTPException(status_code=404, detail=f"Unknown model: {model_id}")
    set_model_enabled(model_id, payload.enabled)
    return {"id": model_id, "enabled": payload.enabled}
