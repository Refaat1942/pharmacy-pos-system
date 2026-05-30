---
name: Bulk upload unit model
description: How the product bulk-upload maps client master-data columns and converts units/stock/price
---

The product bulk-upload (Inventory → Bulk Upload) accepts a pharmacy's master-data columns directly via case-insensitive header aliases: Code→barcode, Material Name→name, Unit→main (big) unit, Quantity→stock, Sales Price→price. The older headers (barcode, name_en, name_ar, stock, price, …) still work too.

**Small-unit columns are SPLIT into name vs count:**
- "Small Unit" → sub_unit NAME (e.g. Strip/Tablet); lowercased to match the product-form dropdown option values. Blank → defaults to "Piece" when pack_size>1.
- "Small Unit Quantity Per Unit" (and "units per box", "units per unit", etc.) → pack_size COUNT.
- **Legacy fallback:** if no count column matched and the "Small Unit" cell is purely numeric, it is treated as the COUNT (older templates used "Small Unit" for the number) and the name is left blank. This keeps old upload files working.

Business decisions confirmed by the pharmacy owner:
- **Quantity is counted in BIG units** (boxes), and fractions are allowed (e.g. 2.5 boxes).
- **Sales Price is the price of one BIG unit** (box).

**Why:** the client's exported master data counts whole boxes and prices per box. Misreading these as small-unit values corrupts both inventory valuation and shelf pricing, so the semantics must stay fixed.

**How to apply:** when pack_size > 1 → stock is stored in SUB-units = round(Quantity × pack_size); sub_price = round(price ÷ pack_size, 2); sub_unit defaults to "Piece" (editable per item). When pack_size ≤ 1 → stock = round(Quantity), no sub_unit/sub_price. Existing-item matching on re-upload is scoped to the current branch_id (NULL-safe), not a global barcode match, so an upload never edits another branch's row.
