---
name: Credit / account money model
description: How customer credit balances are computed and the rule for recording payments at sale time without corrupting the balance.
---

A customer's credit (account) balance = SUM(net_total) of their invoices where
payment_method='account' AND type!='return', MINUS SUM(amount) of their
customer_payments rows. The customer statement ledger and the customers list both
derive balance this way.

**Rule:** To record a partial payment taken *at the moment of an account sale*,
insert a `customer_payments` row for the paid-now amount — do NOT reduce the
invoice net_total. Reducing net_total would understate what was charged and break
the statement/credit-limit history.

**Why:** balance is a derived value (charged minus paid). Keeping the full
net_total as the charge and adding a payment row keeps the charge history,
statement debits, and credit-limit math all internally consistent.

**How to apply:**
- Credit-limit check on a partial-account sale must use the *remaining* portion
  (net_total - paid_now), not the full net_total.
- Store the paid-now amount in the invoice's cash_amount (if paid by cash) or
  visa_amount (any non-cash method) so shift reconciliation's
  cash_collected = SUM(cash_amount) stays accurate; zero the other field.
- Shift summary buckets account sales' full net_total into "other_sales"
  (payment_method NOT IN cash,visa); cash_collected is a separate physical-cash
  metric, so there is no double-count.
