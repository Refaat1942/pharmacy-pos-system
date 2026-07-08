# POS Screenshots — Fratelanza ERP

Numbered screenshots of the **pharmacy POS** (tenant app) in English and Arabic for customer training and handover.

## Contents

| Folder | Language | Count |
|--------|----------|-------|
| [`en/`](en/) | English (LTR) | 47 screenshots |
| [`ar/`](ar/) | Arabic (RTL) | 47 screenshots |

## Guides

- **English:** [`../POS_VISUAL_GUIDE_EN.md`](../POS_VISUAL_GUIDE_EN.md)
- **Arabic:** [`../POS_VISUAL_GUIDE_AR.md`](../POS_VISUAL_GUIDE_AR.md)

## Regenerating

Requires the app running locally (backend on :8000, frontend on :5000):

```bash
./start.sh   # or start backend + frontend separately
node scripts/capture-pos-screenshots.mjs
```

Environment variables (optional):

- `POS_URL` — frontend URL (default `http://localhost:5000`)
- `API_URL` — backend URL (default `http://127.0.0.1:8000`)

## Screenshot index

| # | Filename | Screen |
|---|----------|--------|
| 01 | `01-login.png` | Login |
| 02 | `02-dashboard.png` | Dashboard |
| 03 | `03-sidebar-menu.png` | Navigation sidebar |
| 04 | `04-pos-empty.png` | POS — empty cart |
| 05 | `05-pos-search-results.png` | POS — product search |
| 06 | `06-pos-cart-with-items.png` | POS — cart with items |
| 07 | `07-pos-payment-cash.png` | Payment — cash |
| 08 | `08-pos-payment-delivery.png` | Payment — delivery |
| 09 | `09-pos-payment-digital.png` | Payment — digital |
| 10 | `10-sales-history.png` | Sales history |
| 11 | `11-sales-invoice-detail*.png` | Invoice detail |
| 12 | `12-deliveries.png` | Deliveries |
| 13 | `13-returns.png` | Returns |
| 14–20 | `14–20-inventory-*.png` | Inventory tabs |
| 21–22 | `21–22-transfers*.png` | Transfers |
| 23 | `23-branches-stock.png` | Branches stock |
| 24 | `24-expiry.png` | Expiry |
| 25–26 | `25–26-purchases*.png` | Purchases |
| 27–28 | `27–28-customers*.png` | Customers |
| 29–30 | `29–30-clinics*.png` | Clinics |
| 31 | `31-suppliers.png` | Suppliers |
| 33–34 | `33–34-reports*.png` | Reports |
| 35–36 | `35–36-shifts*.png` | Cash drawer |
| 37–40 | `37–40-hr-*.png` | HR & payroll |
| 41 | `41-fraud-surveillance.png` | Fraud surveillance |
| 42 | `42-stock-reallocation.png` | Stock reallocation |
| 43 | `43-time-clock.png` | Time clock |
| 44–47 | `44–47-settings-*.png` | Settings |

*Super-admin platform screens (`/platform`) are excluded.*
