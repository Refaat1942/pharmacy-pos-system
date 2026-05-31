---
name: Frontend auth-bound downloads & per-terminal POS state
description: Two non-obvious frontend constraints — authenticated file downloads and scoping of localStorage POS state on shared terminals.
---

## Authenticated file downloads must NOT use a plain `<a href>`
The backend `get_current_user` uses `HTTPBearer` (Authorization header), there is no auth cookie. A plain `<a href="/api/...">` link sends no Authorization header, so any download endpoint behind auth returns 401 silently.

**Why:** users reported the bulk-template "download" did nothing — it was a 401.
**How to apply:** download protected files via `api.get(url, { responseType: 'blob' })` then create an object URL + temporary `<a>` element to trigger the save.

## Per-terminal POS state must be scoped per tenant+user+branch
POS persists cart/discount/seller/customer/held-sales in `localStorage`. The terminals are SHARED across users. Global keys leak one user's cart/customer/held sales to the next person who logs in (workflow integrity + privacy).

**Why:** architect flagged cross-user data exposure on shared terminals.
**How to apply:** build POS storage keys as `pos_<thing>_<tenantSlug>_<userId>_<activeBranch>` (branch from `pharma_active_branch`). Also clear all `pos_*` keys inside `logout()` in `auth.tsx`.

## Any POS attribution field must persist AND ride held-cart suspend/recall
When you add a field that tags the cart (e.g. originating clinic), it is not enough to hold it in React state. The cart itself persists to scoped `localStorage`, so a partial field silently drops on page refresh; and suspend/recall (held carts) only copies the fields it explicitly lists.

**Why:** clinic stamp was being lost on refresh and on suspend→recall, so prescription-origin sales saved with NULL clinic.
**How to apply:** for every cart-tagging field — (1) add its own scoped `localStorage` key + persistence `useEffect`, (2) add it to the `HeldCart` interface, (3) copy it in BOTH `suspendCurrent` and `recallHeld` (reset on suspend, restore with `?? null` for old held carts).
