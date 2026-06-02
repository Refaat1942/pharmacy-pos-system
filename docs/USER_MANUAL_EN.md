# Dr. Mohamed Saber Pharmacy — User Manual

Welcome. This guide walks you through every part of the pharmacy system, from logging in to closing the day's cash drawer. Keep it near the register for the first few weeks.

---

## 1. Logging in

1. Open your browser and go to: **https://erp.fratelanza.com**
2. You will see three fields:
   - **Pharmacy Code** — type `dms` (always the same)
   - **Username** — your personal username (given to you by the admin)
   - **Password** — your personal password
3. Click **Sign In**.

> Tip: The language toggle (عربي / EN) is at the top-right corner of every screen.

### Roles — what each user can do

| Role | Can do |
|---|---|
| **Admin** | Everything: users, branches, settings, reports, sales, inventory |
| **Pharmacist** | Sales, returns, inventory, customers, purchases, view reports |
| **Cashier** | POS sales, returns, view their own shift |
| **Branch account** | Read-only branch overview |

### Locking & unlocking the terminal

To protect the register when you step away, the screen **locks itself automatically after 10 minutes** of no activity. It shows your name so everyone knows whose session is open, and your work stays exactly where you left it.

To unlock and carry on, do **either**:
- Type your **password**, or
- **Scan your personal login card** (QR / barcode).

If a different person needs the register, click **Switch user / Log out** on the lock screen to log in fresh.

> Login cards are printed by the admin from **Settings → Users → Print login cards**. Each user has their own card.

---

## 2. The Point of Sale (POS) — selling to a customer

The POS screen is the home screen for cashiers and pharmacists.

### Steps for a normal cash sale

1. **Choose the salesperson** at the top — every sale must be linked to a pharmacist.
2. **Find the product**:
   - Scan its barcode, OR
   - Type part of the name (Arabic or English) in the search box, OR
   - Click a product from the grid.
3. The item is added to the cart on the right. To change quantity, **type the new number** in the quantity box of the cart row.
4. Optional: type the customer name or phone in the **Customer** box at the top to attach the sale to a customer account.
5. Click **Pay** (bottom-right).

### In the Payment window

- **Sale type:** Cash / Delivery / Digital (Talabat, Vezeeta, etc.)
- **Payment method:** Cash / Visa / Hybrid (cash + card) / Account (on credit — requires customer)
- For **Delivery** or **Digital** sales, fill in the customer name, phone, address, and delivery fee. The fee is added to the total.
- For **Cash**: type the amount given by the customer — the system shows the change.
- For **Hybrid**: type how much was paid in cash and how much by card. The two must sum to the total.
- Click **Confirm** to print the receipt.

> The printed receipt shows the **branch name and address** at the top, so each branch's receipts clearly show where the sale was made. Set each branch's name and address in **Settings → Branches**.

### Returns

1. Open **Sales History** from the menu.
2. Find the original invoice, click it.
3. Click **Return**, tick the items being returned, choose the quantity, write the reason.
4. Confirm. The stock is added back and the refund is recorded.

---

## 3. Inventory — managing products and stock

### Adding a new product

1. Go to **Inventory → Add Product**.
2. Fill in:
   - **Barcode** (scan it or type it)
   - **Name (English)** — required
   - **Name (Arabic)** — optional
   - **Category, Unit, Price, Cost** — required
   - **Min stock** — when stock falls below this, the product appears in low-stock alerts
   - **Pack size, sub-unit, sub-price** — if the item is sold both as a box and as individual strips/pills
3. Click **Save**.

### Updating stock

- **Buying new stock from a supplier** → use **Purchases** (see section 5). This is the correct way and is fully tracked.
- **Manual correction** (e.g. found a damaged box) → **Inventory → product → edit stock**. Always write a reason in the note.
- **Moving stock between your branches** → **Transfers** (see section 4).

### Expiry tracking

Go to **Expiry** in the menu to see all products expiring soon, sorted by date. The system flags items expiring within the next 90 days.

### Bulk upload

To load hundreds of products at once: **Inventory → Bulk Upload → Download template → fill the Excel → upload**.

The template columns are:

| Column | Meaning |
|---|---|
| **Code** | Barcode / item code (used to match existing items when you re-upload) |
| **Material Name** | Product name |
| **Unit** | The big unit (e.g. Box) |
| **Small Unit** | The name of the small unit — e.g. **Strip**, Tablet, Capsule. Leave blank if the item isn't split (defaults to *Piece*) |
| **Small Unit Quantity Per Unit** | How many small units are in one big unit (e.g. a box of 4 strips → **4**). Use **1** (or leave blank) if the item isn't split |
| **Quantity** | Stock, counted in **big units** (e.g. number of boxes — fractions like 2.5 are allowed) |
| **Sales Price** | Selling price of **one big unit** |
| **Cost, Category, Min Stock** | Optional |

The system automatically works out the price of one small unit (Sales Price ÷ Small Unit Quantity Per Unit) and stores stock in small units, so at the till you can choose to sell either a full box or a single strip. The **Small Unit** column lets you classify it (Strip, Tablet…); if you leave it blank the small unit is labelled *Piece*, and you can still rename it later on each item's card in Inventory.

---

## 4. Branches — multiple locations

### Creating a branch (admin only)

1. **Settings → Branches → Add Branch**.
2. Enter Arabic + English name, address, phone. Click **Save**.

### Branch stock overview

**Branches Stock** in the menu shows the same product's stock across every branch on one screen. Use the search box (you can search multiple terms separated by commas: `paracetamol, vitamin C`) to filter the list.

### Moving stock between branches

1. **Transfers → New Transfer**.
2. Choose source branch, destination branch, products and quantities.
3. Confirm. Stock leaves the source immediately and arrives at the destination.

### Printing a transfer slip

1. Open **Transfers** and click the **eye (view)** icon on the transfer's row.
2. In the details window, click **Print** (top-right).
3. A transfer slip prints showing the from/to branches, items and quantities, totals, and signature lines for the sender and receiver.

### Resetting a branch (admin only — careful)

If a branch needs a completely clean reset (test data, retrying go-live, etc.):

**Settings → Branches → Reset branch data** → type the branch name + your admin password → confirm.

This permanently deletes all invoices, stock movements, returns, and customer payments for that branch, and resets every product's stock at that branch to zero. **The products, users, and customer balances themselves are kept.** Use this only when you really mean it — it cannot be undone.

---

## 5. Purchases & Suppliers

### Suppliers

**Suppliers** menu → **Add Supplier** → name, phone, address, opening balance. Use this list when recording a purchase.

### Recording a purchase

1. **Purchases → New Purchase**.
2. Choose the supplier and the branch receiving the goods.
3. Add each product with quantity, cost price, and expiry date.
4. Choose how it was paid (cash, on credit, partial).
5. Click **Save**. Stock is added to that branch automatically.

---

## 6. Customers — accounts and credit sales

**Customers** menu lets you:

- Add a new customer (name, phone, opening balance, credit limit).
- Record a payment from a customer (against open invoices or as a general payment).
- See each customer's history — invoices, payments, current balance.

When a customer has an account, you can sell to them on credit (**Account** payment method in POS). The balance updates automatically.

---

## 7. Reports & Dashboard

- **Dashboard** — today's sales, top sellers, low-stock alerts at a glance.
- **Reports** — date-range filtered reports: sales by product, by salesperson, by branch, by payment method; profit margins; expired stock; etc. Export any report to Excel.

---

## 8. Shifts (cashier cash drawer)

> **One open shift per person.** Each user can have only one open shift at a time. Close your current shift before starting a new one.

At the start of the day:
1. **Shifts → Start Shift** → enter opening cash (the money in the drawer).

During the day all your cash sales accumulate automatically.

At the end of the day / shift:
1. **Shifts → Close Shift** → count the cash in the drawer, enter the actual amount.
2. The system shows expected vs actual and the difference (over / short).
3. Confirm. The shift report is saved.

---

## 9. HR — employees and attendance (optional module)

- **HR** menu → add employee records, salaries, allowances.
- **Clock** screen → employees check in / out with their PIN. Hours are tallied for payroll.
- **Employee Cards** → printable ID cards for staff.

---

## 10. Settings (admin only)

| Section | What you do here |
|---|---|
| **Users** | Add / edit / deactivate users, set roles, reset passwords, print login cards, fine-tune what each user sees |
| **Branches** | Add / edit branches, reset branch data |
| **Pharmacy** | Pharmacy name, tax info, receipt header / footer |
| **Backup** | Download a backup of your data (recommended weekly) |

### Important: deactivate vs delete

For users and products, prefer **Deactivate** over **Delete**:
- **Deactivated** = hidden from daily screens, but history and reports stay correct.
- **Deleted** = only possible if the item has never been used; otherwise the system blocks it to protect your reports.

---

## 11. Tips for daily use

- **Always pick the salesperson before clicking Pay** — the system will not let you confirm without one.
- **Search is your friend** — Arabic or English, partial matches work everywhere.
- **The language switch (top-right) is per-user** — your choice is remembered next time you log in.
- **Print receipts only when needed** — every sale is saved electronically and can be reprinted from Sales History anytime.
- **The branch you're working in is shown in the top bar** — admins can switch branches there; branch staff see their branch name.
- **If something looks wrong**, do NOT delete it — go back through Sales History or Stock Movements first to understand. Then fix with a return or a stock correction, not by deleting.

---

## 12. Help & support

If something goes wrong:
1. Try refreshing the page (Ctrl + Shift + R).
2. Check that your internet is working.
3. If still stuck, take a screenshot and contact your IT support / admin.

---

*This manual covers everyday use. For technical issues, server administration, deployment, and troubleshooting, see the separate technical handover document (HANDOVER.md / TROUBLESHOOTING.md).*
