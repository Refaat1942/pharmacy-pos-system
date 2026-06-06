# Fratelanza ERP — POS Visual Guide (English)

**For pharmacy staff and customers**  
This guide illustrates every screen in the pharmacy POS system (not the super-admin platform). Each screenshot is numbered for easy reference during training or support calls.

Screenshots are stored in [`docs/screenshots/en/`](screenshots/en/).

---

## How to use this guide

| Item | Detail |
|------|--------|
| **System URL** | https://erp.fratelanza.com |
| **Language toggle** | Globe button in the top bar — switch between English and Arabic |
| **Arabic version** | See [`POS_VISUAL_GUIDE_AR.md`](POS_VISUAL_GUIDE_AR.md) |
| **Screenshot size** | 1440 × 900 — representative of a desktop register |

---

## 1. Getting started

### Screenshot 1 — Login screen
![01 Login](screenshots/en/01-login.png)

Sign in with three fields:
- **Pharmacy Code** — your pharmacy's unique code (e.g. `fratelanza`)
- **Username** — personal login from your admin
- **Password** — personal password

Use the **عربي** button (top-right) to switch to Arabic before signing in.

---

## 2. Navigation & dashboard

### Screenshot 2 — Operational dashboard
![02 Dashboard](screenshots/en/02-dashboard.png)

Daily KPIs: today's sales, invoice count, returns, net sales, profit margin, alerts, and a 7-day sales chart. Admins can filter by branch.

### Screenshot 3 — Sidebar menu (full navigation)
![03 Sidebar](screenshots/en/03-sidebar-menu.png)

All modules available to an admin user. Cashiers see a shorter menu (POS, sales, returns, shifts, etc.) based on their role.

| Menu item | Purpose |
|-----------|---------|
| Dashboard | Daily performance overview |
| Point of Sale | Sell to customers |
| Sales History | Past invoices & refunds |
| Deliveries | Track delivery orders |
| Returns | Return register |
| Inventory | Products & stock |
| Transfers | Move stock between branches |
| Branches Stock | Cross-branch stock view |
| Expiry | Near-expiry & expired items |
| Purchases | Purchase orders |
| Customers | Customer accounts |
| Clinics | Clinic prescription portal |
| Suppliers | Supplier accounts |
| Reports | Analytics & Excel exports |
| Cash Drawer | Open/close shift |
| Time Clock | Employee check-in/out |
| Fraud Surveillance | Admin alerts |
| Stock Reallocation | Smart transfer suggestions |
| Settings | Users, branches, receipts |

---

## 3. Point of Sale (POS)

### Screenshot 4 — POS empty cart
![04 POS empty](screenshots/en/04-pos-empty.png)

The home screen for cashiers. Search or scan products to start. A **shift must be open** before checkout (see Screenshots 35–36).

### Screenshot 5 — Product search
![05 POS search](screenshots/en/05-pos-search-results.png)

Type a name (Arabic or English) or scan a barcode. Results show stock level and price.

### Screenshot 6 — Cart with items
![06 POS cart](screenshots/en/06-pos-cart-with-items.png)

- Assign a **seller** (pharmacist) — required for every sale
- Optional **customer** attachment
- Per-line and invoice-level discounts (EGP or %)
- **Suspend** / **Held** for parked carts
- **New POS window** — second tab for another customer
- **Refund Receipt** — shortcut to Sales History refund mode

### Screenshot 7 — Payment: cash sale
![07 Payment cash](screenshots/en/07-pos-payment-cash.png)

Choose sale type, payment method, enter amount tendered; system calculates change.

### Screenshot 8 — Payment: delivery sale
![08 Payment delivery](screenshots/en/08-pos-payment-delivery.png)

Customer name, phone, address, delivery person, and delivery fee fields.

### Screenshot 9 — Payment: digital sale
![09 Payment digital](screenshots/en/09-pos-payment-digital.png)

Talabat, Vezeeta, or other platforms. Platform billing: paid vs on-account.

---

## 4. Sales, deliveries & returns

### Screenshot 10 — Sales history
![10 Sales](screenshots/en/10-sales-history.png)

Filter by date, sale type, seller, payment method, and invoice number. Export to Excel.

### Screenshot 11 — Invoice detail
![11 Invoice detail](screenshots/en/11-sales-invoice-detail-placeholder.png)

Click **View** on any invoice to see line items, payments, and delivery status. Use **Return** to process a partial or full refund.

### Screenshot 12 — Deliveries
![12 Deliveries](screenshots/en/12-deliveries.png)

Track orders: Pending → Out for delivery → Delivered. Driver settlement summary.

### Screenshot 13 — Returns register
![13 Returns](screenshots/en/13-returns.png)

Summary of all returns with date filters and return ratio statistics.

---

## 5. Inventory

### Screenshot 14 — Items list
![14 Inventory items](screenshots/en/14-inventory-items.png)

Product list with stock stats, search, category filter, bulk upload, and barcode printing.

### Screenshot 15 — Add / edit product
![15 Add product](screenshots/en/15-inventory-add-product-modal.png)

Barcode, names (EN/AR), category, price, cost, min stock, pack/sub-unit, expiry lots.

### Screenshot 16 — Branch stock
![16 Branch stock](screenshots/en/16-inventory-branch-stock.png)

Per-branch stock grid with pick panel for adjustments.

### Screenshot 17 — Stocktake
![17 Stocktake](screenshots/en/17-inventory-stocktake.png)

Physical count workflow with variance report.

### Screenshot 18 — Stock movements
![18 Movements](screenshots/en/18-inventory-movements.png)

Audit log of every stock change (sales, returns, adjustments, transfers).

### Screenshot 19 — Velocity (fast / slow / dead stock)
![19 Velocity](screenshots/en/19-inventory-velocity.png)

Identifies fast movers, slow movers, and dead stock.

### Screenshot 20 — Consumption alerts
![20 Alerts](screenshots/en/20-inventory-alerts.png)

Low-stock and consumption-based reorder alerts.

---

## 6. Stock movement between branches

### Screenshot 21 — Transfers list
![21 Transfers](screenshots/en/21-transfers.png)

Inter-branch transfers: in transit, completed, cancelled.

### Screenshot 22 — Create transfer
![22 Create transfer](screenshots/en/22-transfers-create-modal.png)

Select from/to branch, scan or search products, set quantities, print transfer slip.

### Screenshot 23 — Branches stock (cross-branch view)
![23 Branches stock](screenshots/en/23-branches-stock.png)

Search any product and see stock across all branches in one grid.

### Screenshot 24 — Expiry tracking
![24 Expiry](screenshots/en/24-expiry.png)

Near-expiry (configurable days) and expired items with export.

---

## 7. Purchasing & suppliers

### Screenshot 25 — Purchase orders
![25 Purchases](screenshots/en/25-purchases.png)

Draft, received, and cancelled POs. Create new PO or use replenishment assistant.

### Screenshot 26 — Replenishment assistant
![26 Replenishment](screenshots/en/26-purchases-replenishment-modal.png)

Shows items at or below minimum stock — one click to create a draft PO.

### Screenshot 31 — Suppliers
![31 Suppliers](screenshots/en/31-suppliers.png)

Supplier list with statements and payment recording.

---

## 8. Customers & clinics

### Screenshot 27 — Customers
![27 Customers](screenshots/en/27-customers.png)

Customer accounts with credit limits, statements, and payments.

### Screenshot 28 — Add customer
![28 Add customer](screenshots/en/28-customers-add-modal.png)

Name, phone, notes, credit limit.

### Screenshot 29 — Clinics
![29 Clinics](screenshots/en/29-clinics.png)

Linked clinics with prescription portal link (share with doctors).

### Screenshot 30 — Add clinic
![30 Add clinic](screenshots/en/30-clinics-add-modal.png)

Clinic name, contact, portal token management.

---

## 9. Reports & analytics

### Screenshot 33 — Reports hub
![33 Reports](screenshots/en/33-reports-hub.png)

14 report types: P&L, trends, categories, branches, clinics, digital platforms, payments, sellers, deliveries, customers, and more.

### Screenshot 34 — Profit & loss report
![34 P&L](screenshots/en/34-reports-profit-loss.png)

Revenue, COGS, gross profit, margin %, with date range and Excel export.

---

## 10. Cash drawer (shifts)

### Screenshot 35 — Cash drawer
![35 Shifts](screenshots/en/35-shifts.png)

Current shift status and shift history. Required before POS sales.

### Screenshot 36 — Open shift
![36 Open shift](screenshots/en/36-shifts-open-modal.png)

Enter opening cash amount. Shift type (morning/evening/night) is auto-detected from pharmacy schedule.

---

## 11. Human resources

### Screenshot 37 — Employees
![37 HR employees](screenshots/en/37-hr-employees.png)

Staff records, salaries, QR clock cards.

### Screenshot 38 — Attendance
![38 HR attendance](screenshots/en/38-hr-attendance.png)

Daily check-in/out log with manual recording.

### Screenshot 39 — Payroll
![39 HR payroll](screenshots/en/39-hr-payroll.png)

Monthly payslips: base, bonus, penalties, net pay.

### Screenshot 40 — Performance
![40 HR performance](screenshots/en/40-hr-performance.png)

Seller leaderboard by sales volume.

---

## 12. Security & operations

### Screenshot 41 — Fraud surveillance
![41 Fraud](screenshots/en/41-fraud-surveillance.png)

Admin-only alerts for suspicious patterns (admin role).

### Screenshot 42 — Stock reallocation
![42 Reallocation](screenshots/en/42-stock-reallocation.png)

AI-style suggestions to move surplus stock between branches.

### Screenshot 43 — Time clock kiosk
![43 Clock](screenshots/en/43-time-clock.png)

Full-screen employee check-in/out by scanning QR or typing clock code.

---

## 13. Settings (admin)

### Screenshot 44 — Users & permissions
![44 Settings users](screenshots/en/44-settings-users.png)

Create users, assign roles, set per-feature permissions, print login cards.

### Screenshot 45 — Branches
![45 Settings branches](screenshots/en/45-settings-branches.png)

Branch name, address, phone — appears on printed receipts.

### Screenshot 46 — Pharmacy & receipt design
![46 Settings pharmacy](screenshots/en/46-settings-pharmacy.png)

Logo, branding, receipt layout, shift schedule times, receipt language (auto/EN/AR).

### Screenshot 47 — User manual download
![47 Settings manual](screenshots/en/47-settings-manual.png)

Download the full user manual in English or Arabic.

---

## Quick reference card

| # | Screen | Route |
|---|--------|-------|
| 1 | Login | `/login` |
| 2 | Dashboard | `/dashboard` |
| 3 | Sidebar | (all pages) |
| 4–9 | Point of Sale | `/` |
| 10–11 | Sales History | `/sales` |
| 12 | Deliveries | `/deliveries` |
| 13 | Returns | `/returns` |
| 14–20 | Inventory | `/inventory` |
| 21–22 | Transfers | `/transfers` |
| 23 | Branches Stock | `/branches-stock` |
| 24 | Expiry | `/expiry` |
| 25–26 | Purchases | `/purchases` |
| 27–28 | Customers | `/customers` |
| 29–30 | Clinics | `/clinics` |
| 31 | Suppliers | `/suppliers` |
| 33–34 | Reports | `/reports` |
| 35–36 | Cash Drawer | `/shifts` |
| 37–40 | HR & Payroll | `/hr` |
| 41 | Fraud | `/fraud` |
| 42 | Stock Reallocation | `/stock-reallocation` |
| 43 | Time Clock | `/clock` |
| 44–47 | Settings | `/settings` |

---

*Generated for Fratelanza ERP — pharmacy POS documentation. To regenerate screenshots: `node scripts/capture-pos-screenshots.mjs`*
