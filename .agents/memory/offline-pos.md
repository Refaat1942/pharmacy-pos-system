# Offline POS selling

- frontend/src/lib/offline.ts installs axios interceptors (via lib/api.ts): GETs cached in IndexedDB
  (`fps-offline`, scoped tenant|branch), `/products?q` answered locally from the offline pack
  (`GET /api/pos/offline-pack`), `POST /sales` queued on network error and flushed every 30 s.
- Every POST /sales carries `client_uuid`; backend returns the existing invoice on repeat
  (partial unique index `idx_invoices_client_uuid`, UniqueViolation -> return existing).
- Offline sales send `offline_created_at`: skip open-shift + sellable checks, insurance and
  loyalty redemption rejected, created_at clamped to the last 30 days.
- public/sw.js caches the app shell only; never /api or /downloads.
- db.py `_apply_search_path` commits after SET: otherwise a later rollback silently resets
  search_path to public ("relation invoices does not exist").
