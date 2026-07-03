# ── Stage 1: build the frontend ──────────────────────────────────────────────
FROM node:22-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: backend + built frontend ─────────────────────────────────────────
FROM python:3.12-slim
WORKDIR /app

COPY backend/package_requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=frontend /build/dist ./static

# All persistent data (SQLite, ChromaDB, uploads) lives here — mount a volume at /data
ENV FILM_DATA_DIR=/data

EXPOSE 8000

# $PORT is injected by most hosts (Railway, Fly, Render); defaults to 8000
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
