---
name: Pack units & returns
description: How packaged products track stock/units and the rule for computing returns correctly.
---

Products can be sold by a pack (e.g. box) or its sub-unit (e.g. strip). `pack_size` = sub-units per pack. **Stock is always tracked in sub-units when pack_size > 1** (a sale of 1 box reduces stock by pack_size).

**Rule: a sale line must persist its own pack multiple at sale time** (sub-units per sold unit: pack_size if sold as a pack, else 1). Return math (refund, restock, remaining-returnable) must use that stored snapshot, NOT the product's current `pack_size`/`sub_unit`.

**Why:** A product's packaging metadata is mutable. Deriving return limits/refund/restock from the live product means changing pack_size after a sale corrupts returns of older invoices (over/under refund, over/under restock, wrong return caps). Returns are financial — they must reproduce sale-time facts.

**How to apply:**
- Returns are tracked in sub-units. Refund per line = (unit_price / line_pack) * sub_units_returned; restock += sub_units_returned; remaining = quantity*line_pack − already-returned-sub-units.
- Restoring stock on return must add back sub-units (quantity*pack), not the sold-unit count — restocking only the sold-unit count is a silent under-restock bug for packs.
- Proportional refunds round to 2 decimals per line, so repeated partial returns can drift ~0.01; accepted tradeoff.
- Legacy rows that predate the snapshot fall back to current product config (best effort only).
