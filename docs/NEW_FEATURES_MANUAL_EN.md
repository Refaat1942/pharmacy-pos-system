# New Features Manual (2026 Update)

This guide covers the **latest additions** to the Fratelanza Pharmacy ERP. Use it together with the main user manual (`USER_MANUAL_EN.md`).

---

## Before you start

### 1. Deploy the update

New screens only appear after the server has the latest code. On the VPS:

```bash
sudo bash /opt/pharmapos/deploy/update.sh
```

Do **not** rely on a manual `git pull` alone — the update script also runs database migrations and rebuilds the frontend.

### 2. Enable features (superadmin)

Most new modules are controlled per pharmacy (tenant) in the **Control Platform**. Until a feature is enabled for your pharmacy, it will **not** show in the menu or POS — even if the code is deployed.

| Feature key | What it unlocks |
|-------------|-----------------|
| `ai_assistant` | Smart AI assistant widget |
| `offers` | Promo offers page + POS auto-discounts |
| `loyalty` | Loyalty program page + POS points |
| `pos_counseling` | Pharmacist tips when scanning items on POS |

**Customer WhatsApp**, **dose labels**, and **POS quick items** are part of the core POS/customers flow and do not need a separate feature flag (quick items are configured in Settings).

Ask your system administrator to enable the features you need, then **log out and log back in** so the menu refreshes.

### 3. Optional: AI API key

The smart assistant works in two modes:

- **Quick help (FAQ)** — always available when `ai_assistant` is enabled.
- **AI answers** — requires `OPENAI_API_KEY` (or `AI_API_KEY`) on the server.

---

## Table of contents

1. [Smart AI Assistant](#1-smart-ai-assistant)
2. [Customer WhatsApp](#2-customer-whatsapp)
3. [Promo Offers](#3-promo-offers)
4. [Dose Label Printing](#4-dose-label-printing)
5. [POS Quick Items](#5-pos-quick-items)
6. [Loyalty Program](#6-loyalty-program)
7. [Smart POS Counseling](#7-smart-pos-counseling)
8. [Quick reference](#8-quick-reference)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Smart AI Assistant

**Who:** All users (when feature is enabled)  
**Where:** Floating button at the bottom corner of every screen

### What it does

Answers questions about how to use the system: POS sales, returns, inventory, shifts, barcode labels, customers, backups, and more. It knows which page you are on and can give context-aware help.

### How to use

1. Click the **assistant** button (chat / sparkles icon).
2. Read the welcome message, or tap a **suggested question** (e.g. “How do I make a sale?”).
3. Type your question and press **Send**.
4. Click **Close** when finished.

### Modes

- **Quick help** — instant answers from the built-in knowledge base.
- **AI answers** — richer replies when the server has an OpenAI API key configured.

The mode is shown at the top of the chat panel.

### Tips

- Ask in **Arabic or English** — the assistant follows your UI language.
- Be specific: e.g. “How do I open a cash shift?” works better than “help”.
- The assistant explains the system; it does **not** change stock or complete sales for you.

---

## 2. Customer WhatsApp

**Who:** Pharmacists, cashiers, admins  
**Where:** **Customers** page

### What it does

Opens WhatsApp (Web or app) with the customer’s phone number pre-filled and a polite greeting — useful for reminders, delivery follow-up, or loyalty messages.

### How to use

**From the customer list**

1. Go to **Customers**.
2. In the phone column, click the green **WhatsApp** icon next to a valid mobile number.

**From the customer card**

1. Click a customer row to open the **info card**.
2. Click **WhatsApp** on the card (top-right).

### Requirements

- The customer must have a **valid Egyptian mobile number** (e.g. `01xxxxxxxxx` or `+20…`).
- WhatsApp must be installed on the device, or the browser will open WhatsApp Web.

### Tips

- Update the customer phone in **Edit** if the button does not appear.
- The greeting uses the customer name and your current UI language.

---

## 3. Promo Offers

**Who:** Admin (create offers); all POS users (auto-apply)  
**Where:** **Promo Offers** in the sidebar; POS cart

### What it does

Creates promotional rules that **automatically discount** matching products in the cart. Savings are stored on the invoice and appear in reports.

### Offer types

| Type | Meaning |
|------|---------|
| **Buy 1 Get 1 Free** | Every second unit of selected products is free |
| **Buy 2 Get 1 Free** | Every third unit is free |
| **1 + 50% on 2nd** | Second unit at 50% off |
| **Direct % discount** | Percentage off each unit |
| **Direct amount off** | Fixed EGP off each unit |

### Creating an offer (admin)

1. Open **Promo Offers** from the menu.
2. Click **Add offer**.
3. Enter name (English / Arabic).
4. Choose **offer type** and discount values.
5. Search and add **products** included in the offer.
6. Set **priority** (higher = applied first if multiple offers match).
7. Optional: **valid from / to** dates and **branch** restriction.
8. Leave **Active** on and save.

### At the POS

1. Add products to the cart as usual.
2. If an active offer applies, discounts appear on line items automatically.
3. The cart footer shows **total offer savings** before payment.
4. Use the **offers** button on POS (if shown) to refresh active offers for the branch.

### Reports

**Reports → Offer sales** — totals and breakdown by offer (Excel export available). Requires the `offers` feature.

### Tips

- Test with a small cart before a busy day.
- Overlapping offers: **priority** decides which runs first.
- Returns reverse stock; offer amounts are stored on the original invoice for audit.

---

## 4. Dose Label Printing

**Who:** Pharmacists at POS  
**Where:** POS cart; **Settings → Pharmacy profile**

### What it does

Prints small **thermal dose labels** (patient directions) for items in the cart — Arabic/English text, optional patient name, adjustable quantity.

### Setup (admin, one time)

1. Go to **Settings → Pharmacy profile**.
2. Scroll to **Dose label presets**.
3. Add common directions in English and Arabic (e.g. “Take one tablet after food”).
4. Save profile.

### Printing from POS

1. On the POS cart, find the line item.
2. Click the **pill icon** on that row.
3. In the label dialog:
   - Choose a **preset** or type custom directions.
   - Enter **patient name** (defaults from selected customer).
   - Set **number of labels**.
   - Pick label size (**thermal** or **tall**).
4. Click **Print** — use your label printer or “Save as PDF”.

### Tips

- Presets save time for repeated directions (antibiotics, syrups, etc.).
- Labels are independent of the sales receipt — you can print before or after payment.

---

## 5. POS Quick Items

**Who:** Admin configures; all POS users add items  
**Where:** POS screen; **Settings → Pharmacy profile**

### What it does

Shows a row of **one-tap buttons** for small, fast-moving items (bags, cotton, syringes, etc.) so staff do not need to search every time.

### Setup (admin)

1. **Settings → Pharmacy profile** → **POS quick items**.
2. Search products and add up to your chosen list (e.g. 5–10 items).
3. Save profile.

### At the POS

1. Below the product search area, click a **quick item** chip to add it to the cart.
2. Or open the quick-items panel for the full list.

### Tips

- Only products that exist in inventory can be added.
- If no quick items are configured, staff only see the panel if they are admin (to remind them to set it up).

---

## 6. Loyalty Program

**Who:** Admin configures; staff use at POS  
**Where:** **Loyalty** in the sidebar; POS payment window

Requires feature: **`loyalty`**

### What it does

- Customers **earn points** on paid sales.
- Customers **redeem points** for a discount on future sales.
- Full **member list**, **transaction history**, and **Excel export**.

### Step 1 — Turn on the program (admin)

1. Open **Loyalty → Rules & Calculator**.
2. Enable **Loyalty program for this pharmacy**.
3. Set rules:

| Setting | Meaning |
|---------|---------|
| Points per 1 EGP | How many points each pound spent earns |
| EGP per point | Cash value when redeeming (e.g. 0.10 = 10 pts → 1 EGP) |
| Minimum redeem | Smallest balance customer can use |
| Minimum sale | Sale must reach this total to earn points |
| Max % with points | Cap on how much of a bill can be paid with points |
| Earn on account sales | Whether credit sales earn points |

4. Use the **calculator** on the same tab to preview earn/redeem before saving.
5. Click **Save**.

The header badge shows **Program active** when both the feature and pharmacy setting are on.

### Step 2 — Members and history

- **Members** — search, sort, filter by points; export Excel.
- **Point history** — every earn, redeem, adjustment, and return reversal.

### Step 3 — At the POS

1. **Select a customer** (required for loyalty).
2. Their **point balance** appears under the customer field.
3. Click **Pay**.
4. In the payment window, enter **points to redeem** (if any).
5. The system shows **loyalty discount** and **points to be earned** on this sale.
6. Complete payment as usual.

### Returns

If a sale is returned, the system **reverses** earned/redeemed points automatically according to the return.

### Tips

- Loyalty does nothing without a **linked customer** on the sale.
- Redemption is validated against balance, minimum redeem, and max % rules.
- Admin can adjust a customer’s balance from the loyalty API/admin tools if needed.

---

## 7. Smart POS Counseling

**Who:** Pharmacists at POS  
**Where:** POS — tips appear when you add/scanned products

Requires feature: **`pos_counseling`**

### What it does

When you scan or add certain products, a **gentle notification** appears with:

- Short **counseling advice** (e.g. take with food, avoid alcohol).
- **Related product suggestions** you may offer the customer.
- **Add to cart** on suggested items.

Up to **three** recent tips stay visible; dismiss with **X**.

### How to use

1. Work on POS as normal — scan or search products.
2. If the product matches the knowledge base, a **Pharmacist tip** banner slides in (top-right).
3. Read the advice to the customer if appropriate.
4. Tap **Add to cart** on a suggested related product, or dismiss the tip.

### Tips

- Tips are **suggestions only** — clinical judgment always comes first.
- No tip appears for products outside the counseling database.
- Feature must be enabled for the pharmacy; otherwise no tips are requested.

---

## 8. Quick reference

| Feature | Menu / location | Admin setup |
|---------|-----------------|-------------|
| AI Assistant | Floating button everywhere | Enable `ai_assistant`; optional API key |
| WhatsApp | Customers list & card | Valid customer phone |
| Promo Offers | Sidebar → Promo Offers | Enable `offers`; create offers |
| Dose labels | POS cart pill icon | Settings → dose presets |
| Quick items | POS quick chips | Settings → POS quick items |
| Loyalty | Sidebar → Loyalty | Enable `loyalty`; Rules tab |
| POS counseling | POS scan/add | Enable `pos_counseling` |

---

## 9. Troubleshooting

| Problem | What to check |
|---------|----------------|
| New menu item missing | Feature not enabled for your pharmacy; log out and in |
| AI only shows FAQ | `OPENAI_API_KEY` not set on server |
| Offers not discounting | Offer inactive, wrong dates, wrong branch, or product not in offer list |
| Loyalty not earning | Program disabled in Loyalty settings; no customer on sale; sale below minimum |
| WhatsApp button missing | Phone number format invalid or empty |
| No counseling tips | Feature off; product not in counseling database |
| Changes after deploy | Run `update.sh`; hard refresh browser (Ctrl+Shift+R) |

---

*For everyday POS, inventory, and shifts, see `USER_MANUAL_EN.md`. For server deployment, see `deploy/update.sh` and `AGENTS.md`.*
