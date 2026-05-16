# FiLM — Local Setup Guide

## Prerequisites

- Python 3.12+
- Node.js 18+

---

## 1. Backend

```bash
cd backend
```

Create and activate a virtual environment:

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# Mac/Linux
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r package_requirements.txt
```

Set up your `.env` file in the `backend/` directory:

```
GEMINI_API_KEY=your_key_here
```

Get a Gemini API key at https://aistudio.google.com/app/apikey

Run the server:

```bash
uvicorn main:app --reload
```

Backend runs at `http://localhost:8000`

---

## 2. Frontend

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`

---

## Notes

- The SQLite database (`film.db`) and ChromaDB vector store (`chroma_data/`) are auto-created in `backend/` on first run.
- Uploaded files are stored in `backend/uploads/`.
- Both servers must be running at the same time for the app to work.
