# Fratelanza ERP

Bilingual (EN/AR) multi-tenant pharmacy POS/ERP. FastAPI backend + React/Vite/TS/Tailwind frontend + PostgreSQL. Deployed at https://erp.fratelanza.com via Hostinger VPS.

See `HANDOVER.md` for full architecture, ops, and migration guide.
See `TROUBLESHOOTING.md` for bilingual end-user troubleshooting.

## User preferences

- **Confirm before any destructive action.** Before deleting/clearing data, dropping tables, force-pushing, or any irreversible operation: stop, explain what will be lost, and ask for explicit confirmation. Prefer "deactivate" over "delete" wherever possible in the app UI.
- **No code comments unless explicitly asked.**
- **Safe-batch UX changes only** — preserve existing behavior; use `ALTER ... IF NOT EXISTS` for schema changes (auto-applied via `platform_db.apply_schema_to_all_tenants()`).
- Communicate in plain language (non-technical user), keep responses concise.
- Deploy via `sudo bash /opt/pharmapos/deploy/update.sh` on the VPS.
