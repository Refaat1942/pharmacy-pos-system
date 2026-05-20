#!/bin/bash
set -e

echo "=== PharmaPOS v2.0 Starting ==="

# ── Install Python backend deps ──
echo "Installing backend dependencies..."
pip install -q fastapi uvicorn psycopg2-binary "python-jose[cryptography]" "passlib[bcrypt]" python-multipart requests 2>&1 | tail -3

# ── Initialize schema + seed ──
echo "Initializing database schema..."
cd backend
python init_db.py 2>&1 | tail -3 || true
echo "Seeding database..."
python seed.py 2>/dev/null || true
cd ..

# ── Start FastAPI backend (port 8000, background) ──
echo "Starting FastAPI backend on port 8000..."
cd backend
uvicorn main:app --host 127.0.0.1 --port 8000 --reload &
BACKEND_PID=$!
cd ..

# ── Install frontend deps if needed ──
cd frontend
if [ ! -d "node_modules" ]; then
  echo "Installing frontend dependencies..."
  npm install --legacy-peer-deps 2>&1 | tail -5
fi

# ── Start Vite dev server (port 5000, foreground) ──
echo "Starting Vite frontend on port 5000..."
npm run dev
