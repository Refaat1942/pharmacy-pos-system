# AGENTS.md

## Cursor Cloud specific instructions

Pharmacy POS web app: **FastAPI** backend (`backend/`) + **React/Vite** frontend (`frontend/`). PostgreSQL is required at runtime; local dev typically uses env vars from deployment docs.

### Services

| Service | Command | Notes |
|---------|---------|-------|
| Backend API | `cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000` | Schema self-heals on startup via `init_db.py` |
| Frontend dev | `cd frontend && npm run dev` | Vite on port 5000 |

### Lint / test / build

- **Frontend build (typecheck + bundle):** `cd frontend && npm run build`
- **Backend import smoke test:** `cd backend && python3 -c "import main"`
- No dedicated ESLint script in `package.json`; `tsc` runs as part of `npm run build`.

### Feature flags

Every module in `FEATURES_CATALOG` has sub-toggles in `FEATURE_OPTIONS_CATALOG` (Control Platform → tenant → **Inside each feature**). Pharmacy users must **log out and back in** after superadmin changes so `/api/auth/me` refreshes `feature_options`. Frontend maps live in `frontend/src/lib/featureGates.ts`.

### Production deploy

VPS deploy is **not** a bare `git pull`. Use the project deploy script (e.g. `sudo bash /opt/pharmapos/deploy/update.sh`) after merging to `main`.

### Integration branch

All feature PRs were combined on `cursor/all-features-96d6` for a single merge to `main`. Until that branch is merged and deployed, production will not show the new features.
