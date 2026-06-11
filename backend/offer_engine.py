"""Promotional offer discount calculator (shared by API validation and POS)."""
from __future__ import annotations

from collections import defaultdict
from typing import Any

OFFER_TYPES = frozenset({
    "second_half",   # 1 + 50% on second (configurable %)
    "bogo",          # buy 1 get 1 free
    "buy2get1",      # buy 2 get 1 free
    "direct_percent",
    "direct_amount",
})


def _unit_lines(cart_lines: list[dict], product_ids: set[int]) -> list[dict]:
    """Flatten cart lines into per-unit entries preserving scan order."""
    units: list[dict] = []
    for line_idx, line in enumerate(cart_lines):
        pid = int(line["product_id"])
        if pid not in product_ids:
            continue
        price = float(line["unit_price"])
        qty = int(line["quantity"])
        for _ in range(qty):
            units.append({"line_idx": line_idx, "unit_price": price, "product_id": pid})
    return units


def _distribute(units: list[dict], per_unit_discounts: list[float]) -> dict[int, float]:
    by_line: dict[int, float] = defaultdict(float)
    for u, d in zip(units, per_unit_discounts):
        if d > 0:
            by_line[u["line_idx"]] += d
    return dict(by_line)


def compute_offer_line_discounts(
    offer: dict[str, Any],
    cart_lines: list[dict],
) -> tuple[dict[int, float], float]:
    """
    cart_lines: [{product_id, quantity, unit_price}, ...]
    Returns ({line_index: discount_amount}, total_savings).
    """
    product_ids = {int(p) for p in (offer.get("product_ids") or [])}
    if not product_ids:
        return {}, 0.0

    units = _unit_lines(cart_lines, product_ids)
    if not units:
        return {}, 0.0

    offer_type = offer.get("offer_type") or ""
    pct = float(offer.get("discount_percent") or 50)
    amt = float(offer.get("discount_amount") or 0)
    per_unit = [0.0] * len(units)

    if offer_type == "direct_percent":
        rate = max(0.0, min(100.0, pct)) / 100.0
        for i, u in enumerate(units):
            per_unit[i] = round(u["unit_price"] * rate, 2)

    elif offer_type == "direct_amount":
        for i, u in enumerate(units):
            per_unit[i] = round(min(amt, u["unit_price"]), 2)

    elif offer_type == "second_half":
        rate = max(0.0, min(100.0, pct)) / 100.0
        for i in range(0, len(units) - (len(units) % 2), 2):
            per_unit[i + 1] = round(units[i + 1]["unit_price"] * rate, 2)

    elif offer_type == "bogo":
        for i in range(0, len(units) - (len(units) % 2), 2):
            cheaper_idx = i if units[i]["unit_price"] <= units[i + 1]["unit_price"] else i + 1
            per_unit[cheaper_idx] = round(units[cheaper_idx]["unit_price"], 2)

    elif offer_type == "buy2get1":
        for i in range(0, len(units) - (len(units) % 3), 3):
            trio = units[i : i + 3]
            cheapest = min(range(3), key=lambda j: trio[j]["unit_price"])
            per_unit[i + cheapest] = round(trio[cheapest]["unit_price"], 2)

    else:
        return {}, 0.0

    by_line = _distribute(units, per_unit)
    total = round(sum(per_unit), 2)
    return by_line, total


def apply_offers_to_cart(
    cart_lines: list[dict],
    offers: list[dict[str, Any]],
) -> tuple[list[dict], list[int], float]:
    """
    Apply offers by priority (lower number = higher priority).
    Each product may only belong to one active offer (enforced on save).
    Returns (lines with offer_discount + offer_id), list of offer ids used, total savings.
    """
    sorted_offers = sorted(offers, key=lambda o: (int(o.get("priority") or 0), int(o.get("id") or 0)))
    line_offer_discount: dict[int, float] = defaultdict(float)
    line_offer_id: dict[int, int] = {}
    used_offer_ids: list[int] = []

    for offer in sorted_offers:
        if not offer.get("active", True):
            continue
        by_line, total = compute_offer_line_discounts(offer, cart_lines)
        if total <= 0:
            continue
        oid = int(offer["id"])
        if oid not in used_offer_ids:
            used_offer_ids.append(oid)
        for idx, disc in by_line.items():
            line_offer_discount[idx] += disc
            line_offer_id[idx] = oid

    total_savings = round(sum(line_offer_discount.values()), 2)
    enriched = []
    for idx, line in enumerate(cart_lines):
        enriched.append({
            **line,
            "offer_id": line_offer_id.get(idx),
            "offer_discount": round(line_offer_discount.get(idx, 0), 2),
        })
    return enriched, used_offer_ids, total_savings
