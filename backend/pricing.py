"""Default pharmacy pricing rules (Egypt — gross sales price model).

Sales price is what the customer pays (VAT-inclusive display price).
- Profit target = 20% of sales price  →  cost = 80% of sales price
- VAT       = 14% of sales price      →  net ex-VAT = 86% of sales price

Example: price 130 → profit 26, cost 104, VAT 18.2, net 111.8
"""

DEFAULT_PROFIT_RATIO = 0.20
DEFAULT_VAT_RATIO = 0.14
DEFAULT_COST_RATIO = 1.0 - DEFAULT_PROFIT_RATIO  # 0.80


def default_cost_from_price(price: float) -> float:
    p = float(price or 0)
    if p <= 0:
        return 0.0
    return round(p * DEFAULT_COST_RATIO, 2)


def profit_from_price(price: float) -> float:
    p = float(price or 0)
    if p <= 0:
        return 0.0
    return round(p * DEFAULT_PROFIT_RATIO, 2)


def vat_amount_from_price(price: float) -> float:
    p = float(price or 0)
    if p <= 0:
        return 0.0
    return round(p * DEFAULT_VAT_RATIO, 2)


def net_ex_vat_from_price(price: float) -> float:
    p = float(price or 0)
    if p <= 0:
        return 0.0
    return round(p * (1.0 - DEFAULT_VAT_RATIO), 2)


def profit_pct_of_price(price: float, cost: float) -> float:
    p = float(price or 0)
    if p <= 0:
        return 0.0
    return round((p - float(cost or 0)) / p * 100, 1)


def unit_inventory_cost(product: dict) -> float:
    """Cost per main unit for COGS — prefer moving average, else last cost."""
    for key in ("avg_cost", "cost"):
        v = product.get(key)
        if v is not None and float(v) > 0:
            return float(v)
    return 0.0


# SQL fragment: cost per main unit from product row alias `p`
SQL_UNIT_COST = "COALESCE(NULLIF(p.avg_cost, 0), NULLIF(p.cost, 0), 0)"
