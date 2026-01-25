from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.models.database import Base, engine
from app.routers import chats, folders, context

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="FiLM API",
    description="File-based LLM Management - API for chat organization and RAG",
    version="0.1.0"
)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(chats.router)
app.include_router(folders.router)
app.include_router(context.router)


@app.get("/")
def root():
    return {
        "name": "FiLM API",
        "version": "0.1.0",
        "status": "running"
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}
