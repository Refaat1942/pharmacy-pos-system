# Fratelanza Hub — Blueprint

> Master reference for the Fratelanza Hub SaaS platform.
> Last updated: May 19, 2026

---

## 1. What this is

A **bilingual (English / Arabic, RTL-aware) business operations platform** sold as a SaaS to small and medium businesses in Egypt. Every customer gets their own private database on a single shared Docker stack, accessed via their own subdomain (`acme.fratelanza.com`). All money is in Egyptian Pounds (EGP / ج.م) — never USD.

### Two products in one monorepo

| Product | URL | Purpose | Users |
|---|---|---|---|
| **CRM** (Fratelanza Hub) | `*.fratelanza.com` + `fratelanza.com` | The actual business app each customer uses | Customer's staff |
| **Admin** (Fratelanza Admin) | `admin.fratelanza.com` | Control plane: create customers, enable/disable modules, billing status | You only |

---

## 2. Tech stack

- **Monorepo**: pnpm workspaces, Node.js 24, TypeScript 5.9
- **Backend**: Express 5 + express-session (cookie auth), Drizzle ORM, PostgreSQL, Zod validation
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui + Recharts
- **API contract**: OpenAPI spec → Orval codegen → typed React Query hooks
- **Auth**: bcryptjs password hashing, session cookies (Postgres-backed on admin, memory on CRM)
- **Files**: multer uploads to `./uploads/`
- **Deploy**: Docker Compose (4 services), nginx reverse proxy with Let's Encrypt wildcard cert

---

## 3. Architecture at a glance

```
                    Internet
                       │
                       ▼
          ┌────────────────────────┐
          │  nginx (VPS port 443)  │  ← Let's Encrypt wildcard cert
          │  + HTTP→HTTPS redirect │
          └─────────┬──────────────┘
                    │
       ┌────────────┴─────────────┐
       │                          │
       ▼                          ▼
  fratelanza.com /          admin.fratelanza.com
  *.fratelanza.com               │
       │                          │
       ▼                          ▼
  ┌─────────┐               ┌──────────┐
  │ CRM app │◄──HTTP API────│ Admin app│
  │ :1025   │  /api/tenants │ :2025    │
  └────┬────┘               └─────┬────┘
       │                          │
       │ per-tenant DB pool       │ provisions
       │ keyed by subdomain       │ tenant DBs
       ▼                          ▼
  ┌──────────────────────────────────┐
  │  Postgres (CRM)                  │
  │  - fratelanza (default tenant)   │
  │  - acme (customer 1)             │
  │  - widgets_co (customer 2)       │
  │  - ...                           │
  └──────────────────────────────────┘
  ┌──────────────────────────────────┐
  │  Postgres (Admin)                │
  │  - admin_users, admin_customers, │
  │    admin_session                 │
  └──────────────────────────────────┘
```

### How a request flows

1. Customer visits `acme.fratelanza.com`
2. nginx terminates TLS, forwards to CRM on port 1025, preserves `Host: acme.fratelanza.com`
3. CRM `tenant.ts` middleware extracts `acme` from hostname
4. Middleware calls admin app at `http://admin-app:5050/api/tenants/acme` (60s in-memory cache)
5. Admin returns `{ name, subdomain, db_name: "acme", status: "active", features: {...} }`
6. If `status === "blocked"` → 403; frontend shows BlockedPage
7. Otherwise CRM gets/creates a `pg.Pool` for database `acme` and runs the route inside `tenantAls.run(...)`
8. All Drizzle queries inside the route use the tenant's DB transparently (the `db` export is a Proxy that resolves via AsyncLocalStorage)

---

## 4. Repository layout

```
Fratelanza-HUB/
├── artifacts/
│   ├── api-server/              CRM backend (Express + Drizzle)
│   │   └── src/
│   │       ├── routes/          auth, tasks, clients, transactions, employees,
│   │       │                    notifications, reports, products, rentals,
│   │       │                    dashboard, invoices, users, settings
│   │       └── middleware/      tenant, feature (requireFeature), auth (requirePermission)
│   │
│   ├── fratelanza-hub/          CRM frontend (React + Vite)
│   │   └── src/
│   │       ├── pages/           dashboard, tasks, crm, finance, team,
│   │       │                    products, rentals, reports, invoices, settings
│   │       ├── components/
│   │       ├── lib/             api.ts, whatsapp.ts
│   │       └── App.tsx          FeatureGate, route table
│   │
│   ├── fratelanza-admin/        Admin control plane (Express + EJS)
│   │   └── src/
│   │       ├── db.ts            ALL_PERMISSIONS, FEATURE_KEYS+LABELS
│   │       ├── provision.ts     provisionTenantDb, provisionInBackground
│   │       ├── tenant-schema.sql baseline CRM schema (regenerate after schema change)
│   │       └── views/           EJS templates
│   │
│   └── mockup-sandbox/          UI prototype playground (canvas only)
│
├── lib/
│   ├── db/                      Drizzle schema + tenant ALS Proxy
│   │   └── src/
│   │       ├── schema/          tasks, clients, transactions, activity, employees,
│   │       │                    notifications, users, products, rentals, invoices
│   │       ├── tenant.ts        AsyncLocalStorage, per-tenant pool cache
│   │       └── index.ts         Proxy exports (db, pool)
│   │
│   ├── api-spec/                OpenAPI source + Orval codegen
│   ├── api-zod/                 Generated Zod schemas
│   └── api-client-react/        Generated React Query hooks
│
├── deploy/
│   ├── nginx.conf               TLS termination, host routing, header preservation
│   ├── setup-ssl.sh             Cloudflare DNS-01 wildcard cert helper
│   └── README.md                Phase 4 deploy runbook
│
├── docker-compose.yml           4 services: db, app, admin-db, admin-app
├── .env.example                 All secrets template
└── replit.md                    Dev-side project notes
```

---

## 5. The CRM product

### Modules (each can be toggled per-customer in admin)

| Module | What it does | Permission key | Feature key |
|---|---|---|---|
| Dashboard | Revenue/client/task summary, charts | (always shown) | `dashboard` |
| Tasks | Kanban + list, assignee, deadline, recurrence, auto-notification | `tasks` | `tasks` |
| Clients (CRM) | Client cards, pipeline stages, WhatsApp button | `clients` | `clients` |
| Finance | Income/expense in EGP, categories, charts | `finance` | `finance` |
| Team/HR | Employee management | `employees` | `employees` |
| Products | Inventory with stock + pricing (EGP) | `products` | `products` |
| Rentals | Rental contracts with docs, daily rates (EGP) | `rentals` | `rentals` |
| Reports | Analytics dashboards | `reports` | `reports` |
| **Invoices** | Invoice CRUD, PDF print, payments → auto Finance entry, WhatsApp | `invoicing` | `invoicing` |
| Notifications | Bell icon, unread count, auto on task assign | `notifications` | `notifications` |
| Settings → Users | Per-user permission matrix | `settings` (admin only) | `settings` |

### Bilingual rules

- Every text field has both `field` and `field_ar` columns in DB
- Forms show **only the active language** (not both at once)
- All UI strings flow through `t("English", "Arabic")` helper from `LanguageProvider`
- Layout flips RTL when Arabic is selected

### Defense in depth

- **Backend**: `requireFeature("invoicing")` + `requirePermission("invoicing")` on the router
- **Frontend menu**: hidden if feature disabled or user lacks permission
- **Frontend routing**: `<FeatureGate>` 404s direct URL hits when feature disabled or permission missing

---

## 6. Multi-tenancy

### How a new customer is onboarded

1. Sign in to `admin.fratelanza.com` as `admin` / `<your password>`
2. Customers → New Customer
3. Fill in name, subdomain (e.g. `acme`), database name (`acme`)
4. Save — admin auto-runs `provisionTenantDb("acme")`:
   - Connects to Postgres maintenance DB
   - `CREATE DATABASE acme`
   - Applies `tenant-schema.sql` (full CRM baseline)
   - Seeds default `admin` / `admin123` user
5. Customer goes to `acme.fratelanza.com`, logs in with `admin` / `admin123`, changes password
6. Done — they have their own isolated CRM

### What admin can do per-customer

- **Enable/disable modules** (any of the 10 feature keys above) — takes effect within 60 seconds (cache TTL)
- **Block tenant** — sets `status="blocked"`, all requests return 403, frontend shows BlockedPage
- **Re-provision DB** — useful if baseline schema changed and you need to apply new tables to an existing tenant
- **Edit branding** — customer name shown in app header

### Critical files for multi-tenancy

| File | Role |
|---|---|
| `lib/db/src/tenant.ts` | AsyncLocalStorage + per-tenant pg.Pool cache |
| `lib/db/src/index.ts` | `db` and `pool` are Proxies — resolve to current tenant DB |
| `artifacts/api-server/src/middleware/tenant.ts` | Extracts subdomain → fetches config → binds ALS |
| `artifacts/api-server/src/middleware/feature.ts` | `requireFeature(key)` per-route gate |
| `artifacts/fratelanza-admin/src/provision.ts` | DB provisioning logic |
| `artifacts/fratelanza-admin/src/tenant-schema.sql` | Baseline CRM schema (regenerate after schema changes!) |

### Required env vars

**CRM (`app` service):**
- `DATABASE_URL` — fallback for default/single-tenant mode
- `SESSION_SECRET`
- `ADMIN_API_URL` — e.g. `http://admin-app:5050`
- `ADMIN_API_KEY` — optional shared secret
- `TENANT_DB_URL_TEMPLATE` — e.g. `postgresql://fratelanza:PASS@db:5432/{db}`

**Admin (`admin-app` service):**
- `ADMIN_DATABASE_URL` — admin's own Postgres
- `ADMIN_SESSION_SECRET`
- `ADMIN_USERNAME`, `ADMIN_PASSWORD` — for initial admin seed
- `ADMIN_API_KEY` — same shared secret as CRM
- `TENANT_DB_URL_TEMPLATE` — same as CRM
- `TENANT_MAINTENANCE_DB_URL` — must have CREATEDB privilege (e.g. `postgresql://fratelanza:PASS@db:5432/postgres`)
- `TENANT_DEFAULT_ADMIN_PASSWORD` — initial password for the seeded admin user in each new tenant

---

## 7. Deploy

### First-time VPS setup

Done. Server is **187.124.15.14**, see `deploy/README.md` for the full runbook (DNS, nginx, certbot, Docker).

### Routine updates (after pushing to GitHub from Replit)

```bash
cd ~/Fratelanza-HUB
git fetch origin && git reset --hard origin/main
docker compose up -d --build app admin-app
```

⚠ `git reset --hard` discards any local edits on the VPS. This is intentional — the only source of truth is GitHub. If you've ever SSH'd into the VPS and edited a file, that edit will be lost on next deploy. Don't edit on VPS.

### When the schema changes

After any change to `lib/db/src/schema/*`:

1. **Dev**: `pnpm --filter @workspace/db run push` (or run raw SQL if TTY prompts)
2. **Regenerate baseline**: `cd lib/db && npx drizzle-kit export --dialect=postgresql --schema=./src/schema/index.ts > ../../artifacts/fratelanza-admin/src/tenant-schema.sql`
3. **Commit + push**
4. **VPS**: pull + rebuild (above), then either:
   - Apply migration manually via `docker compose exec -T db psql -U fratelanza -d <tenant_db> -c "..."` for each existing tenant
   - OR click "Provision DB" in admin for each tenant (re-runs baseline, idempotent `IF NOT EXISTS`)

---

## 8. The Invoicing module (newest addition)

### What it does

- Generate invoices with auto-numbered IDs like `INV-202605-0001`
- Multiple line items per invoice (description in EN/AR, qty, unit price)
- Live subtotal + tax % + total calculation
- Status workflow: `draft → sent → paid / overdue / cancelled`
- Beautiful printable invoice view (browser print → PDF)
- Record partial or full payments → **auto-creates a Finance income transaction** (so revenue dashboards stay accurate)
- **WhatsApp button** on every invoice (list + detail) → opens WhatsApp with invoice number, total, due date pre-filled in the client's language

### Database tables

```sql
invoices (id, invoice_number UNIQUE, client_id, client_name_snapshot, client_phone_snapshot,
          status, issue_date, due_date, subtotal, tax_rate, tax_amount, total,
          paid_amount, notes, notes_ar, created_at, updated_at)

invoice_items (id, invoice_id FK CASCADE, description, description_ar,
               quantity, unit_price, total, sort_order)
```

Client info is **snapshotted** at invoice time — editing the client later doesn't change historical invoices.

### API endpoints

```
GET    /api/invoices                List with filters (status, search)
GET    /api/invoices/stats          Counts + totals by status
GET    /api/invoices/:id            Single invoice + items
POST   /api/invoices                Create with items
PATCH  /api/invoices/:id            Update header + status
DELETE /api/invoices/:id            Cascade delete items
POST   /api/invoices/:id/payments   Record payment → auto Finance entry
```

All routes require both `requireFeature("invoicing")` and `requirePermission("invoicing")`.

---

## 9. WhatsApp integration

No API keys, no monthly cost, no Twilio. Uses `wa.me` deep links that open the user's installed WhatsApp (mobile) or WhatsApp Web (desktop).

### Helper

`artifacts/fratelanza-hub/src/lib/whatsapp.ts`:
- `buildWhatsAppLink(phone, message)` — normalizes phone (auto-prefixes +20 for Egyptian local numbers like `01x...`), URL-encodes message
- `openWhatsApp(phone, message)` — opens link in new tab

### Where it's wired

- **CRM client cards** — green WhatsApp icon button → opens with bilingual greeting (`Hello {name},` or `السلام عليكم {name}،`)
- **Invoice list rows** — WhatsApp icon → sends "Invoice INV-... — Total: ... EGP — Due: ..."
- **Invoice detail view** — same as above, more prominent button

### Future WhatsApp targets (not yet built)

- Task assignment notification to assignee (needs employee.phone lookup)
- Rental due-date reminders
- Payment confirmation message after recording payment

---

## 10. Phase status

| Phase | What | Status |
|---|---|---|
| 1 | Single-tenant CRM (all 9 base modules + bilingual + EGP + RTL) | DONE |
| 2 | CRM tenant-awareness (subdomain → tenant DB resolution) | DONE |
| 3 | Admin auto-provisioning (CREATE DATABASE on new customer) | DONE |
| 4 | VPS deploy + nginx + wildcard TLS + docker-compose stack | DONE |
| 5a | Roles & per-user permissions enforced backend + frontend | DONE |
| 5b | Invoicing module (full: schema, API, UI, PDF, payments) | DONE |
| 5e | WhatsApp on clients + invoices | DONE (partial) |
| 5c | Inventory polish (low-stock alerts, stock value on dashboard) | TODO |
| 5d | Customer portal (separate subdomain, scoped views per client) | TODO |
| 5e+ | WhatsApp on tasks, rentals, payment confirmations | TODO |

---

## 11. Gotchas / lessons learned

- **Never edit files on the VPS.** `git reset --hard` will overwrite them. GitHub is the only source of truth.
- **`pnpm --filter @workspace/db run push` needs a TTY** — won't work in non-interactive shells. Run raw SQL instead when scripting.
- **After schema changes**: regenerate `tenant-schema.sql` AND apply to existing tenant DBs (push only updates default DB).
- **Transactions schema requires `title`** (not just `description`) — was a foot-gun when wiring invoice payments → finance.
- **Currency is always EGP** — never USD, never any other currency. UI shows `ج.م` in Arabic, `EGP` in English.
- **Bilingual forms show one language at a time** — never both side-by-side. Switching language switches the form.
- **`Host` header MUST be preserved by nginx** — CRM resolves tenant from it. If nginx strips it, every request becomes single-tenant mode.
- **express-session uses MemoryStore on CRM** — fine for single Docker container, would break with horizontal scaling.
- **Use plain `zod` (not `zod/v4`) in route files** that handle features not yet in the OpenAPI spec — keeps codegen happy.
- **New API routes that aren't in OpenAPI spec** won't get typed React Query hooks — must use manual `apiFetch` from `lib/api.ts`.

---

## 12. Where to look when something breaks

| Symptom | Where to look |
|---|---|
| Customer can't log in | CRM container logs: `docker compose logs app --tail 100` |
| Subdomain returns "tenant not found" | Admin DB: `SELECT * FROM admin_customers WHERE subdomain='...'` |
| New feature not visible to customer | Admin → Customer → Features toggle; wait 60s for cache TTL |
| Schema change not in tenant DB | Re-run baseline: Admin → Customer → "Provision DB" button |
| Provisioning failed | Check `admin_customers.provision_error` for the SQL error |
| TLS cert expired | `docker compose exec certbot certbot renew` (or systemd timer) |
| nginx not routing | `nginx -t` then `systemctl reload nginx` |
| Permission denied on a module | User's permissions in CRM → Settings → Users (admin-only page) |

---

## 13. Quick references

- **GitHub**: https://github.com/Refaat1942/Fratelanza-HUB
- **VPS**: 187.124.15.14 (CRM on port 1025, Admin on port 2025, both loopback-only behind nginx)
- **Default CRM login** (each new tenant): `admin` / `admin123` (must be changed on first login)
- **Default Admin login**: `admin` / value of `ADMIN_PASSWORD` env var (set in `.env`)
- **Credentials file on VPS**: `~/fratelanza-admin-credentials.txt` (root-readable only)
- **Replit project notes**: `replit.md` (separate from this blueprint — dev-side conventions)
