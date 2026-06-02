---
name: Purchase order landed-cost & margin model
description: How per-line discount/VAT/public price on POs feed product cost, selling price, and profit margins
---

# PO landed cost → product cost → margins

Purchase order lines carry `discount_pct`, `vat_pct`, and `public_price` in
addition to `unit_cost`. The effective landed unit cost is:

`effective = unit_cost * (1 - discount_pct/100) * (1 + vat_pct/100)`

(helper `_eff_unit_cost` in `backend/purchasing.py`; frontend mirrors it as `lineNet`).

Rules to keep consistent:
- A PO line `total` = `qty * effective`. PO `subtotal` = sum of line totals (net of
  per-line discount+VAT). Header `total` = `subtotal - header.discount + header.tax`.
  Header-level discount/tax still exist and apply on top of per-line values.
- On **receive**, `products.cost` is set to the effective landed cost — NOT the raw
  `unit_cost`. Profit reports compute COGS from `products.cost`, so discount and VAT
  intentionally flow into gross-profit margins.
  **Why:** the owner explicitly wants VAT (and discount) included in the cost basis so
  margins reflect true landed cost. Do not "fix" this by excluding input VAT.
- On receive, `products.price` (retail/selling) is updated only when the line
  `public_price > 0`. New products created on receive get `price = public_price` (or
  effective cost if none) and `cost = effective cost`.

Money math uses Python/JS `float` throughout (consistent with the rest of the app);
DECIMAL columns round to 2 places on store. If finance-grade precision is ever required,
switch the whole money path to `Decimal` — do not mix.
