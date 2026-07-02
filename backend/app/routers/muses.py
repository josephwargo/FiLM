from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..models.database import get_db
from ..models.schemas import Muse, MuseContext, Chat
from ..models.pydantic_models import (
    MuseCreate, MuseUpdate, MuseResponse,
    MuseContextCreate, MuseContextUpdate, MuseContextResponse,
)

router = APIRouter(prefix="/api/muses", tags=["muses"])


@router.get("", response_model=List[MuseResponse])
def list_muses(db: Session = Depends(get_db)):
    return db.query(Muse).order_by(Muse.created_at).all()


@router.post("", response_model=MuseResponse)
def create_muse(data: MuseCreate, db: Session = Depends(get_db)):
    muse = Muse(name=data.name, description=data.description, system_prompt=data.system_prompt)
    db.add(muse)
    db.commit()
    db.refresh(muse)
    return muse


@router.get("/{muse_id}", response_model=MuseResponse)
def get_muse(muse_id: str, db: Session = Depends(get_db)):
    muse = db.query(Muse).filter(Muse.id == muse_id).first()
    if not muse:
        raise HTTPException(status_code=404, detail="Muse not found")
    return muse


@router.patch("/{muse_id}", response_model=MuseResponse)
def update_muse(muse_id: str, data: MuseUpdate, db: Session = Depends(get_db)):
    muse = db.query(Muse).filter(Muse.id == muse_id).first()
    if not muse:
        raise HTTPException(status_code=404, detail="Muse not found")
    if data.name is not None:
        muse.name = data.name
    if data.description is not None:
        muse.description = data.description
    if data.system_prompt is not None:
        muse.system_prompt = data.system_prompt
    db.commit()
    db.refresh(muse)
    return muse


@router.delete("/{muse_id}")
def delete_muse(muse_id: str, db: Session = Depends(get_db)):
    muse = db.query(Muse).filter(Muse.id == muse_id).first()
    if not muse:
        raise HTTPException(status_code=404, detail="Muse not found")
    db.query(Chat).filter(Chat.muse_id == muse_id).update(
        {"muse_id": None}, synchronize_session="evaluate"
    )
    db.delete(muse)
    db.commit()
    return {"status": "deleted"}


# --- Pinned context endpoints ---

@router.get("/{muse_id}/context", response_model=List[MuseContextResponse])
def get_muse_context(muse_id: str, db: Session = Depends(get_db)):
    if not db.query(Muse).filter(Muse.id == muse_id).first():
        raise HTTPException(status_code=404, detail="Muse not found")
    return db.query(MuseContext).filter(MuseContext.muse_id == muse_id).all()


@router.post("/{muse_id}/context", response_model=MuseContextResponse)
def pin_context(muse_id: str, data: MuseContextCreate, db: Session = Depends(get_db)):
    if not db.query(Muse).filter(Muse.id == muse_id).first():
        raise HTTPException(status_code=404, detail="Muse not found")
    # Idempotent — return existing if already pinned
    existing = db.query(MuseContext).filter(
        MuseContext.muse_id == muse_id,
        MuseContext.source_type == data.source_type,
        MuseContext.source_id == data.source_id,
    ).first()
    if existing:
        existing.start_message_id = data.start_message_id
        existing.end_message_id = data.end_message_id
        db.commit()
        db.refresh(existing)
        return existing
    ctx = MuseContext(
        muse_id=muse_id,
        source_type=data.source_type,
        source_id=data.source_id,
        start_message_id=data.start_message_id,
        end_message_id=data.end_message_id,
    )
    db.add(ctx)
    db.commit()
    db.refresh(ctx)
    return ctx


@router.patch("/{muse_id}/context/{context_id}", response_model=MuseContextResponse)
def update_pinned_context(muse_id: str, context_id: str, data: MuseContextUpdate, db: Session = Depends(get_db)):
    ctx = db.query(MuseContext).filter(
        MuseContext.id == context_id,
        MuseContext.muse_id == muse_id,
    ).first()
    if not ctx:
        raise HTTPException(status_code=404, detail="Pinned context not found")
    updates = data.model_dump(exclude_unset=True)
    if "start_message_id" in updates:
        ctx.start_message_id = updates["start_message_id"]
    if "end_message_id" in updates:
        ctx.end_message_id = updates["end_message_id"]
    db.commit()
    db.refresh(ctx)
    return ctx


@router.delete("/{muse_id}/context/{context_id}")
def unpin_context(muse_id: str, context_id: str, db: Session = Depends(get_db)):
    ctx = db.query(MuseContext).filter(
        MuseContext.id == context_id,
        MuseContext.muse_id == muse_id,
    ).first()
    if not ctx:
        raise HTTPException(status_code=404, detail="Pinned context not found")
    db.delete(ctx)
    db.commit()
    return {"status": "deleted"}
