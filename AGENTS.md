# AGENTS.md

## Cursor Cloud specific instructions

### Product

Fratelanza ERP / PharmaPOS v2.0 — multi-tenant pharmacy POS and ERP (React + FastAPI + PostgreSQL). Authoritative ops docs: `HANDOVER.md`. Local dev orchestration reference: `start.sh`.

### Services (local dev)

| Service | Port | Start command |
|---------|------|---------------|
| PostgreSQL 16 | 5432 | `sudo service postgresql start` |
| FastAPI backend | 8000 | `cd backend && uvicorn main:app --host 127.0.0.1 --port 8000 --reload` |
| Vite frontend | 5000 | `cd frontend && npm run dev` |

Use separate tmux sessions for backend and frontend (Vite proxies `/api` → `:8000`).

### Environment variables

Export before running backend scripts or uvicorn:

```bash
export PGDATABASE=pharmacy PGUSER=postgres PGPASSWORD=postgres PGHOST=localhost PGPORT=5432
export PATH="$HOME/.local/bin:$PATH"
```

`backend/db.py` defaults to database `pharmacy` on `localhost:5432` if unset.

### First-time database setup (fresh VM)

PostgreSQL is a system package (not in the update script). On a new VM:

1. `sudo service postgresql start`
2. Create DB and set postgres password (if not already done):
   ```bash
   sudo -u postgres psql -c "CREATE DATABASE pharmacy;"  # ignore if exists
   sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
   ```
3. `cd backend && python3 init_db.py`
4. Bootstrap platform + seed users (backend startup also runs `bootstrap_platform()`):
   ```bash
   python3 -c "from platform_db import bootstrap_platform; bootstrap_platform()"
   ```
   Then insert demo users (see `backend/seed.py`). **Note:** `seed.py` currently fails on product inserts because `ON CONFLICT (barcode)` no longer matches the composite `UNIQUE(barcode, branch_id)` constraint — seed branch/users manually or fix `seed.py` before running it end-to-end.

### Dev login credentials

- Tenant slug: `fratelanza`
- Admin: `admin` / `admin123`
- Platform super-admin: `superadmin` / `super123` (after `bootstrap_platform()`)

### Lint / test / build

No pytest, ESLint, or Playwright configs in this repo. Useful checks:

| Check | Command |
|-------|---------|
| Frontend production build (includes `tsc`) | `cd frontend && npm run build` |
| Python syntax | `cd backend && python3 -m compileall -q .` |
| API smoke test | `curl -X POST http://127.0.0.1:8000/api/auth/login -H 'Content-Type: application/json' -d '{"tenant_slug":"fratelanza","username":"admin","password":"admin123"}'` |

Manual browser E2E: open `http://127.0.0.1:5000/login`.

### Gotchas

- Use `python3` (not `python`) and ensure `~/.local/bin` is on `PATH` for `uvicorn`.
- Frontend install requires `npm install --legacy-peer-deps` (see `frontend/package.json` / `start.sh`).
- Backend auto-migrates tenant schemas on startup via `platform_db.apply_schema_to_all_tenants()`.
- Root-level `*.py` files are legacy desktop POS — not used by the web app.
