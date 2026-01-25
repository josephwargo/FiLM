# FiLM - Setup Action Items

Complete these steps before running the application.

## Prerequisites

### Required Software
- [ ] **Python 3.10+** - [Download](https://www.python.org/downloads/)
- [ ] **Node.js 18+** - [Download](https://nodejs.org/)
- [ ] **Git** - [Download](https://git-scm.com/)

### Verify Installation
```bash
python --version   # Should show 3.10+
node --version     # Should show 18+
npm --version      # Should show 9+
```

---

## API Keys & Accounts

### 1. Google Gemini API Key (Required)
1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Sign in with your Google account
3. Click "Get API Key" in the left sidebar
4. Click "Create API Key"
5. Copy the key and save it securely

**Cost:** Free tier includes 1,500 requests/day

- [x] Obtained Gemini API key
- [x] Saved key to `.env` file as `GEMINI_API_KEY=your_key_here`

---

## Local Services (No Account Needed)

### 2. ChromaDB
ChromaDB runs locally - no account or setup needed. It will be installed via pip.

- [ ] Confirmed: No action needed (installed automatically)

### 3. SQLite
SQLite is built into Python - no installation needed.

- [ ] Confirmed: No action needed (built-in)

---

## Project Setup

### 4. Environment Variables
Create a `.env` file in the `backend/` folder:

```env
GEMINI_API_KEY=your_gemini_api_key_here
DATABASE_URL=sqlite:///./film.db
CHROMA_PERSIST_DIR=./chroma_data
```

- [x] Created `backend/.env` file
- [x] Added Gemini API key to `.env`

### 5. Install Backend Dependencies
```bash
cd backend
pip install -r requirements.txt
```

- [ ] Installed Python dependencies

### 6. Install Frontend Dependencies
```bash
cd frontend
npm install
```

- [x] Installed Node.js dependencies

---

## Running the Application

### Start Backend
```bash
cd backend
python -m uvicorn main:app --reload --port 8000
```

### Start Frontend
```bash
cd frontend
npm run dev
```

Frontend will be available at: http://localhost:5173
Backend API will be available at: http://localhost:8000

---

## Optional (Future)

### Deployment
- [ ] Vercel account for frontend hosting (free tier)
- [ ] Railway or Render account for backend hosting (free tier)

### User Authentication (v2)
- [ ] Auth0 or Clerk account for user management

---

## Troubleshooting

### "GEMINI_API_KEY not found"
- Ensure `.env` file exists in `backend/` folder
- Ensure key is formatted as `GEMINI_API_KEY=your_key` (no quotes)

### ChromaDB errors
- Delete `chroma_data/` folder and restart to reset the vector database

### Port already in use
- Backend: Change port with `--port 8001`
- Frontend: Vite will auto-increment to next available port
