# Hire AI

Hire AI is a full-stack application built with React/Vite (Frontend) and FastAPI (Backend).

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — backend/frontend module structure, env vars, external integrations
- [Technical notes](TECHNICAL_README.md) — background email worker, AI resume parsing, matching logic
- [Business overview](BUSINESS_README.md) — product pitch and feature summary

## Quick Start

### 1. Backend Setup
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate # Linux/Mac

pip install -r requirements.txt
cp .env.example .env
# Fill in your .env values

# Start the backend server (run from the backend/ directory)
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend Setup
```bash
cd frontend
npm install

# Start the frontend dev server
npm run dev
```

The application will be available at `http://localhost:5173`.
