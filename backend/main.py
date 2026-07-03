from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.models.database import Base, engine
from app.routers import chats, folders, context, muses, models

# Built frontend (copied here by the Dockerfile); absent in local dev
STATIC_DIR = Path(__file__).resolve().parent / "static"

# Create new tables (existing tables are not modified by create_all)
Base.metadata.create_all(bind=engine)

# Inline migrations — each is a no-op if the column already exists
_MIGRATIONS = [
    "ALTER TABLE uploaded_files ADD COLUMN file_folder_id VARCHAR REFERENCES file_folders(id)",
    "ALTER TABLE file_folders ADD COLUMN parent_id VARCHAR REFERENCES file_folders(id)",
    "ALTER TABLE chats ADD COLUMN muse_id VARCHAR REFERENCES muses(id)",
    "ALTER TABLE context_attachments ADD COLUMN start_message_id VARCHAR",
    "ALTER TABLE context_attachments ADD COLUMN end_message_id VARCHAR",
    "ALTER TABLE muse_contexts ADD COLUMN start_message_id VARCHAR",
    "ALTER TABLE muse_contexts ADD COLUMN end_message_id VARCHAR",
    "ALTER TABLE chats ADD COLUMN model VARCHAR",
    "ALTER TABLE messages ADD COLUMN model VARCHAR",
]
with engine.connect() as _conn:
    for _sql in _MIGRATIONS:
        try:
            _conn.execute(text(_sql))
            _conn.commit()
        except Exception:
            pass

app = FastAPI(
    title="FiLM API",
    description="File-based LLM Management - API for chat organization and RAG",
    version="0.1.0"
)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(chats.router)
app.include_router(folders.router)
app.include_router(context.router)
app.include_router(muses.router)
app.include_router(models.router)


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.get("/debug")
def debug_info():
    from app.models.database import DATABASE_URL, SessionLocal
    from app.models.schemas import UploadedFile
    import os

    db = SessionLocal()
    try:
        file_count = db.query(UploadedFile).count()
    finally:
        db.close()

    return {
        "database_url": str(DATABASE_URL),
        "cwd": os.getcwd(),
        "file_count": file_count
    }


if STATIC_DIR.is_dir():
    # Deployed mode: serve the built frontend at / (API routes above take precedence)
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
else:
    @app.get("/")
    def root():
        return {
            "name": "FiLM API",
            "version": "0.1.0",
            "status": "running"
        }
