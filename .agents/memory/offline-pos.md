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
- One ordered queue (kinds: sale, shift_open, shift_close, return, delivery). Shifts/returns
  endpoints accept client_uuid + offline_created_at (dedup + real time). shift id <= 0 on
  close = "my open shift". Recent invoices pack: GET /api/pos/offline-invoices (3 days).
- Offline login/unlock: PBKDF2 hash saved per slug|username after online login (IndexedDB).
- Each queue entry keeps the cashier's token + branch; api.ts must not overwrite headers a
  caller set (it used to, which also silently broke the Dashboard branch filter).
- Still online-only by design: insurance, loyalty redemption, back-office writes.
