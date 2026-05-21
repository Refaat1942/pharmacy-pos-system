# Fratelanza ERP — Operations & Handover Manual

Complete reference for operating, maintaining, and migrating the Fratelanza pharmacy ERP. Intended for any developer or operator taking over the system.

---

## 1. What This System Is

A bilingual (English / Arabic) **multi-tenant SaaS pharmacy POS and ERP**. A single deployment hosts many pharmacies, each with its own isolated PostgreSQL schema, accessed through one shared frontend and backend.

**Live URL (current deployment):** https://erp.fratelanza.com
**Source code:** https://github.com/Refaat1942/pharmacy-pos-system

### Core Features
- POS (sales, returns, multi-payment, discounts, tax)
- Inventory management with per-branch stock, low-stock alerts, fast/slow/dead analytics
- Multi-branch support with cross-branch stock view
- HR: employees, roles, shifts, payroll, QR/barcode attendance kiosk, sales performance leaderboard
- Purchasing, suppliers, customers, loyalty
- Reports & dashboard
- Bilingual UI (EN/AR) with RTL support
- Receipt printing (thermal printers via browser)

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript + TailwindCSS + i18next |
| Backend | Python 3.10+ + FastAPI + Gunicorn (with Uvicorn workers) |
| Database | PostgreSQL 14+ (multi-tenant via schemas) |
| Auth | JWT (HS256) with bcrypt password hashing |
| Web server | Nginx (reverse proxy + static file serving) |
| HTTPS | Let's Encrypt via certbot (auto-renew) |
| Process manager | systemd (`pharmapos.service`) |
| Deployment | Git pull + build script (`deploy/update.sh`) |

---

## 3. Repository Structure

```
/
├── backend/                  Python FastAPI backend
│   ├── main.py               App entry, route registration, CORS
│   ├── db.py                 DB connection factory (uses DATABASE_URL)
│   ├── platform_db.py        Multi-tenant: schema creation per tenant
│   ├── tenant_ctx.py         Per-request tenant resolution
│   ├── init_db.py            Schema bootstrap + ALTER...IF NOT EXISTS migrations
│   ├── auth.py               JWT issue/verify, password hashing
│   ├── deps.py               FastAPI dependencies (current_user, db, tenant)
│   ├── seed.py               Sample/demo data seeder
│   ├── platform_api.py       Super-admin endpoints (create/manage tenants)
│   ├── inventory.py          Items, stock movements, branch-stock, velocity, alerts
│   ├── purchasing.py         Suppliers, purchase orders, GRN
│   ├── customers.py          Customer master, loyalty
│   ├── invoices.py           POS sales/returns
│   ├── hr.py                 Employees, attendance, payroll, performance, QR clock
│   ├── shifts.py             Shift open/close, auto shift-type detection
│   ├── reports.py            Sales reports, dashboards
│   ├── dashboard.py          KPI cards
│   ├── settings.py           Pharmacy profile, tax, currency, receipt config
│   └── requirements.txt      Python dependencies
│
├── frontend/                 React SPA
│   ├── src/
│   │   ├── App.tsx           Router setup, tenant detection from subdomain
│   │   ├── main.tsx          Entry point
│   │   ├── pages/            One file per page (POS, Inventory, HR, Reports, etc.)
│   │   ├── components/       Reusable UI components
│   │   ├── lib/              api.ts (axios + JWT interceptor), auth.tsx, i18n.ts
│   │   └── locales/          en.json, ar.json
│   ├── package.json
│   └── vite.config.ts
│
├── deploy/                   VPS operations scripts
│   ├── setup_vps.sh          One-shot fresh VPS bootstrap (Ubuntu 24.04)
│   ├── update.sh             Pull latest code, rebuild frontend, restart backend
│   ├── backup.sh             Nightly DB backups (installed via cron)
│   ├── restore.sh            Restore a DB from a backup file
│   ├── harden.sh             Security hardening (fail2ban, unattended-upgrades)
│   ├── nginx.conf            Reference nginx config
│   ├── nginx-pharmapos-security.conf  Security headers, rate limiting
│   └── pharmapos.service     Reference systemd unit
│
├── start.sh                  Local dev startup (Replit-style)
└── HANDOVER.md               This document
```

> Note: there are some legacy Python files at repo root (`pos_app.py`, `printing.py`, etc.) from the original desktop version. They are **not used in production** — the system runs entirely from `backend/` + `frontend/`.

---

## 4. Multi-Tenancy Model

**One PostgreSQL database, one schema per tenant.**

- A central `public` schema holds tenants, billing, super-admin users.
- Each tenant pharmacy gets its own schema: `tenant_<id>` (e.g. `tenant_3`).
- Every tenant schema contains the full app tables (products, invoices, employees, etc.) — completely isolated.
- Tenant is resolved per request from the **subdomain** (e.g. `pharmacy1.erp.fratelanza.com` → `tenant_1`), or from a header in dev.
- Schema migrations are auto-applied to **all** tenant schemas on backend startup via `platform_db.apply_schema_to_all_tenants()`. **Always use `CREATE TABLE IF NOT EXISTS` and `ALTER ... IF NOT EXISTS`** in `init_db.py` so migrations are idempotent.

### Adding a new tenant
Use the super-admin panel or call the platform API:
```bash
POST /api/platform/tenants
Authorization: Bearer <superadmin_jwt>
{
  "code": "newpharm",
  "name": "New Pharmacy",
  "admin_username": "admin",
  "admin_password": "strong-password-here"
}
```
This creates the schema, runs the bootstrap, and inserts the first admin user.

---

## 5. Environment Variables

Stored in `/etc/pharmapos.env` (mode `600`, root-owned) on the VPS. Read by systemd via `EnvironmentFile=`.

| Variable | Required | Example | Purpose |
|---|---|---|---|
| `DATABASE_URL` | **yes** | `postgresql://pharmapos_user:xxx@localhost:5432/pharmapos_db` | Postgres connection |
| `SECRET_KEY` | **yes** in prod | 64 hex chars (`openssl rand -hex 32`) | JWT signing key. **Rotating invalidates all sessions.** |
| `ENVIRONMENT` | **yes** in prod | `production` | When set to `production`, the app refuses to start with a weak/missing `SECRET_KEY` |
| `PLATFORM_ADMIN_USERNAME` | no | `superadmin` | Super-admin login (default: `superadmin`) |
| `PLATFORM_ADMIN_PASSWORD` | no | strong password | Super-admin password (default: `super123` — **change immediately in prod**) |
| `PGHOST` / `PGPORT` / `PGDATABASE` / `PGUSER` / `PGPASSWORD` | no | — | Alternative to `DATABASE_URL` (used by backup script) |

After editing `/etc/pharmapos.env`:
```bash
sudo systemctl restart pharmapos
```

---

## 6. Fresh VPS Setup (Migration / New Customer)

Target: Ubuntu 22.04 or 24.04 LTS, minimum 2 GB RAM, 20 GB disk, public IP.

### 6.1 One-shot install
```bash
ssh root@NEW_VPS_IP
bash <(curl -s https://raw.githubusercontent.com/Refaat1942/pharmacy-pos-system/main/deploy/setup_vps.sh) NEW_VPS_IP
```

This script:
1. Updates system packages.
2. Installs Node.js 20, PostgreSQL, Nginx, certbot, Python venv.
3. Creates DB `pharmapos_db` + user `pharmapos_user` with a random password.
4. Clones the repo to `/opt/pharmapos`.
5. Builds the Python venv and installs dependencies.
6. Writes `/etc/pharmapos.env` with a random 32-byte `SECRET_KEY`.
7. Runs `init_db.py` + `seed.py` (seed only if DB empty).
8. Builds the frontend (`npm run build`).
9. Installs and starts the `pharmapos` systemd service.
10. Configures nginx on port 80, proxying `/api/*` to `127.0.0.1:8000` and serving the React build.
11. Enables UFW firewall (22, 80, 443).

### 6.2 Point the domain
- In the registrar, add an `A` record: `erp.YOURDOMAIN.com → NEW_VPS_IP`.
- Wait for DNS to propagate (5–60 min): `dig erp.YOURDOMAIN.com`.

### 6.3 Issue HTTPS certificate
```bash
sudo certbot --nginx -d erp.YOURDOMAIN.com
```
- Pick "redirect" when asked, so all HTTP traffic upgrades to HTTPS.
- Test auto-renewal: `sudo certbot renew --dry-run` — should print "all simulated renewals succeeded."

### 6.4 Hardening (recommended)
```bash
sudo bash /opt/pharmapos/deploy/harden.sh
```
Installs `fail2ban`, enables unattended security upgrades, changes app dir ownership to the `pharmapos` user.

### 6.5 Daily backups
```bash
sudo chmod +x /opt/pharmapos/deploy/backup.sh /opt/pharmapos/deploy/restore.sh
echo "0 3 * * * root /opt/pharmapos/deploy/backup.sh" | sudo tee /etc/cron.d/pharmapos-backup
sudo chmod 644 /etc/cron.d/pharmapos-backup
sudo bash /opt/pharmapos/deploy/backup.sh   # run once to verify
ls -lh /var/backups/pharmapos/              # should show .sql.gz files
```

### 6.6 First login
Default credentials seeded by `seed.py`:
- `admin / admin123`
- `pharmacist1 / pharm123`

**Change these immediately** from the app's user management page.

---

## 7. Daily Operations

### 7.1 Pushing code changes
```
Developer:  edit code → commit → push to GitHub main branch
VPS:        sudo bash /opt/pharmapos/deploy/update.sh
```
`update.sh` pulls, runs `pip install`, runs `init_db.py` (idempotent schema migrations applied to all tenant schemas), builds frontend, restarts backend, reloads nginx.

### 7.2 Restarting the backend
```bash
sudo systemctl restart pharmapos
sudo systemctl status pharmapos
```

### 7.3 Viewing logs
| What | Where |
|---|---|
| Backend access log | `/var/log/pharmapos/access.log` |
| Backend error log | `/var/log/pharmapos/error.log` |
| systemd backend log | `sudo journalctl -u pharmapos -f` |
| Nginx access | `/var/log/nginx/access.log` |
| Nginx error | `/var/log/nginx/error.log` |
| Backup log | `/var/log/pharmapos-backup.log` |
| Let's Encrypt | `/var/log/letsencrypt/letsencrypt.log` |

### 7.4 Database access
```bash
sudo -u postgres psql pharmapos_db
\dn               -- list all tenant schemas
SET search_path TO tenant_3;
\dt               -- list tables in tenant 3
SELECT count(*) FROM invoices;
```

### 7.5 Manual backup (on demand)
```bash
sudo bash /opt/pharmapos/deploy/backup.sh
```

### 7.6 Restore from backup
```bash
sudo bash /opt/pharmapos/deploy/restore.sh pharmapos_db /var/backups/pharmapos/pharmapos_db_YYYYMMDD_HHMMSS.sql.gz
```
Backend is stopped automatically during restore, restarted after.

### 7.7 Adding a new pharmacy (tenant)
Log in as super-admin at `/platform`, create the tenant, give the customer their subdomain URL and admin password.

---

## 8. Where the QR Attendance Kiosk Lives

- **Kiosk URL:** `https://erp.YOURDOMAIN.com/clock`
- **Card printing:** Admin → HR → "Print QR Cards" button (or `/hr/cards`)
- Each employee gets a unique `clock_code`, rendered as both a QR code and a CODE128 barcode on the printed card.
- Cards work with both phone scanners and USB laser/imager scanners.
- The kiosk uses an always-focused input — any scanner that types + Enter will work as a keyboard wedge with zero drivers.

---

## 9. Migrating an Existing Deployment to a New VPS

To move a live customer to their own server:

1. **Set up the new VPS** following section 6 (steps 6.1 + 6.2 only — skip seed by passing empty DB, or let it seed and overwrite).
2. **On the old VPS**, take a fresh backup of all databases:
   ```bash
   sudo bash /opt/pharmapos/deploy/backup.sh
   ls -lh /var/backups/pharmapos/   # note the newest filenames
   ```
3. **Copy the backups to the new VPS:**
   ```bash
   # from your laptop or directly between servers
   scp root@OLD_VPS:/var/backups/pharmapos/pharmapos_db_*.sql.gz root@NEW_VPS:/var/backups/pharmapos/
   ```
4. **Restore on the new VPS:**
   ```bash
   ssh root@NEW_VPS
   sudo bash /opt/pharmapos/deploy/restore.sh pharmapos_db /var/backups/pharmapos/pharmapos_db_LATEST.sql.gz
   ```
5. **Update DNS** to point `erp.DOMAIN.com` → new VPS IP. Wait for propagation.
6. **Issue HTTPS on the new VPS:**
   ```bash
   sudo certbot --nginx -d erp.DOMAIN.com
   ```
7. **Verify:** open the URL, log in, check recent sales/invoices match the old system.
8. **Decommission the old VPS** only after 7+ days of successful operation, and only after one final backup is safely stored off-site.

### What transfers with the database
- All pharmacies, users, products, prices, stock levels, customers, suppliers
- All invoices, payments, returns, purchase orders
- All employees, attendance records, shifts, payroll
- Settings (pharmacy name, tax, currency, receipt config)

### What does NOT transfer (re-do on new VPS)
- HTTPS certificates (re-issued by certbot)
- The `SECRET_KEY` — **if you keep the same `SECRET_KEY`, existing JWT tokens remain valid; if you generate a new one, every user must log in again** (often desirable for security on migration)
- Cron jobs and systemd units (re-installed by setup script)
- Server-side file uploads, if any (check `/opt/pharmapos/uploads/` if it exists and `scp -r` it across)

---

## 10. Security Notes

- All passwords stored as **bcrypt** hashes — never plain text.
- JWT tokens signed with `SECRET_KEY` (HS256), 8-hour expiry by default.
- In `ENVIRONMENT=production`, the app **refuses to start** if `SECRET_KEY` is missing, weak, or set to the dev fallback. This is intentional — do not weaken it.
- DB user `pharmapos_user` only has access to `pharmapos_db`, not to other databases on the cluster.
- Nginx serves static assets directly; only `/api/*` is proxied to the backend.
- Backend listens on `127.0.0.1:8000` (loopback only) — never directly exposed.
- UFW firewall allows only ports 22, 80, 443.
- Optional: `harden.sh` adds fail2ban and unattended-upgrades.

### Things to rotate periodically
- `SECRET_KEY`: forces re-login of all users. Set a new one in `/etc/pharmapos.env`, restart `pharmapos`. Recommended yearly or after any suspected compromise.
- DB password: change in postgres (`ALTER USER pharmapos_user WITH PASSWORD 'new'`), update `DATABASE_URL` in `/etc/pharmapos.env`, restart `pharmapos`.
- GitHub deploy token (if repo is private): regenerate every year.

---

## 11. Common Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| 502 Bad Gateway | Backend crashed | `sudo journalctl -u pharmapos -n 100` → identify error → `sudo systemctl restart pharmapos` |
| Login fails for all users after update | `SECRET_KEY` changed | Users must log in again — this is expected if you rotated the key |
| "Schema migration failed" on startup | A new column/table in `init_db.py` conflicts with existing data | Check error in journalctl; usually need to wrap in `IF NOT EXISTS`. **Never** drop/recreate tables in production. |
| Disk full | Old backups, big logs | Delete old backups manually; truncate logs: `sudo truncate -s 0 /var/log/pharmapos/*.log` |
| HTTPS expired warning | Let's Encrypt renewal failed | `sudo certbot renew --dry-run` — fix any errors; usually a misconfigured manual-plugin cert |
| Frontend shows blank page after update | Vite build failed | Check end of `update.sh` output; rerun `cd /opt/pharmapos/frontend && npm install --legacy-peer-deps && npm run build` |
| Scanner reads card but nothing happens on `/clock` | Input lost focus | Click once inside the input field; refresh the page if needed |
| New tenant can't log in | Schema bootstrap failed | Check journalctl for `apply_schema_to_all_tenants` errors |

---

## 12. Contacts & Credentials Inventory

Keep this list in a password manager (1Password, Bitwarden, etc.), **not in this file**:

- [ ] Domain registrar login (for renewing the domain)
- [ ] Hostinger (or VPS provider) panel login
- [ ] VPS root SSH password / key
- [ ] PostgreSQL `pharmapos_user` password (in `/etc/pharmapos.env`)
- [ ] App `superadmin` password
- [ ] Each tenant's `admin` password (only if you set it; ideally the customer rotates immediately)
- [ ] GitHub deploy token (if repo is private)
- [ ] GitHub account credentials (for the repo)
- [ ] Cloudflare / DNS provider login (if separate from registrar)
- [ ] Renewal dates: domain, VPS plan, deploy token (calendar reminders)

---

## 13. Things You Can Safely Ignore

- Files at repo root like `pos_app.py`, `invoice_*_wrapper.py`, `printing.py`, `knowledge_app.py`, `launcher.py`, `ui_*.py` — these are legacy code from an earlier desktop version. **Not used in production.** Can be deleted in a future cleanup.
- `Cairo-Regular.ttf` — leftover font from desktop version, harmless.
- `DASHBOARD_SPEC.md` — design notes, not enforced.
- The production system runs ONLY from `backend/` (FastAPI) + `frontend/` (React build) + `deploy/` scripts.

---

## 14. Quick-Reference Commands

```bash
# Update to latest code
sudo bash /opt/pharmapos/deploy/update.sh

# Restart backend
sudo systemctl restart pharmapos

# Tail backend logs live
sudo journalctl -u pharmapos -f

# Manual backup now
sudo bash /opt/pharmapos/deploy/backup.sh

# Restore a backup
sudo bash /opt/pharmapos/deploy/restore.sh pharmapos_db /var/backups/pharmapos/FILE.sql.gz

# Renew HTTPS (auto, but force one)
sudo certbot renew

# DB shell
sudo -u postgres psql pharmapos_db

# List tenants
sudo -u postgres psql pharmapos_db -c "\dn tenant_*"

# Check service status
sudo systemctl status pharmapos nginx postgresql

# Check disk space
df -h /
du -sh /var/backups/pharmapos /var/log/pharmapos /opt/pharmapos
```

---

*Last updated: May 2026 — keep this file in sync with any infrastructure or schema changes.*
