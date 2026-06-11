"""Loyalty points calculator and ledger helpers."""
from __future__ import annotations

import math
from typing import Any

from platform_db import get_tenant_by_slug, normalize_features

LOYALTY_PROFILE_COLS = (
    "loyalty_enabled",
    "loyalty_points_per_egp",
    "loyalty_egp_per_point",
    "loyalty_min_redeem",
    "loyalty_min_sale_egp",
    "loyalty_earn_on_account",
    "loyalty_max_redeem_pct",
)

DEFAULT_LOYALTY_SETTINGS: dict[str, Any] = {
    "loyalty_enabled": False,
    "loyalty_points_per_egp": 1.0,
    "loyalty_egp_per_point": 0.1,
    "loyalty_min_redeem": 100,
    "loyalty_min_sale_egp": 0.0,
    "loyalty_earn_on_account": True,
    "loyalty_max_redeem_pct": 50.0,
}


def tenant_has_loyalty_feature(user: dict | None) -> bool:
    if not user:
        return False
    slug = user.get("tenant_slug")
    if not slug:
        return False
    tenant = get_tenant_by_slug(slug)
    if not tenant:
        return False
    return "loyalty" in normalize_features(tenant.get("features"))


def load_loyalty_settings(cur) -> dict[str, Any]:
    cur.execute(
        f"SELECT {', '.join(LOYALTY_PROFILE_COLS)} FROM pharmacy_profile WHERE id = 1"
    )
    row = cur.fetchone() or {}
    out = dict(DEFAULT_LOYALTY_SETTINGS)
    for k in LOYALTY_PROFILE_COLS:
        if k in row and row[k] is not None:
            out[k] = row[k]
    out["loyalty_enabled"] = bool(out.get("loyalty_enabled"))
    out["loyalty_earn_on_account"] = bool(out.get("loyalty_earn_on_account"))
    return out


def is_loyalty_operational(cur, user: dict | None) -> bool:
    if not tenant_has_loyalty_feature(user):
        return False
    settings = load_loyalty_settings(cur)
    return bool(settings.get("loyalty_enabled"))


def get_customer_points(cur, customer_id: int) -> int:
    cur.execute("SELECT COALESCE(loyalty_points, 0) AS pts FROM customers WHERE id=%s", (customer_id,))
    row = cur.fetchone()
    if not row:
        return 0
    return int(row["pts"] or 0)


def calc_earn_points(net_paid: float, settings: dict) -> int:
    net_paid = float(net_paid or 0)
    min_sale = float(settings.get("loyalty_min_sale_egp") or 0)
    if net_paid < min_sale:
        return 0
    rate = float(settings.get("loyalty_points_per_egp") or 0)
    if rate <= 0:
        return 0
    return int(math.floor(net_paid * rate))


def calc_redeem_discount(points: int, settings: dict) -> float:
    if points <= 0:
        return 0.0
    value = float(settings.get("loyalty_egp_per_point") or 0)
    if value <= 0:
        return 0.0
    return round(points * value, 2)


def max_redeemable_points(balance: int, net_total: float, settings: dict) -> int:
    balance = int(balance or 0)
    net_total = float(net_total or 0)
    min_redeem = int(settings.get("loyalty_min_redeem") or 0)
    if balance < min_redeem or net_total <= 0:
        return 0
    value = float(settings.get("loyalty_egp_per_point") or 0)
    if value <= 0:
        return 0
    max_by_total = int(math.floor(net_total / value))
    max_pct = float(settings.get("loyalty_max_redeem_pct") or 100)
    max_by_pct = int(math.floor((net_total * max_pct / 100.0) / value)) if max_pct > 0 else max_by_total
    return max(0, min(balance, max_by_total, max_by_pct))


def preview_loyalty(
    *,
    settings: dict,
    customer_points: int,
    net_total: float,
    redeem_points: int = 0,
    payment_method: str = "cash",
    credit_portion: float = 0.0,
) -> dict:
    """Smart calculator preview for POS and admin UI."""
    net_total = round(float(net_total or 0), 2)
    redeem_points = max(0, int(redeem_points or 0))
    max_pts = max_redeemable_points(customer_points, net_total, settings)
    if redeem_points > max_pts:
        redeem_points = max_pts
    loyalty_discount = calc_redeem_discount(redeem_points, settings)
    if loyalty_discount > net_total:
        loyalty_discount = net_total
        redeem_points = max_redeemable_points(customer_points, net_total, settings)
        loyalty_discount = calc_redeem_discount(redeem_points, settings)

    net_after = round(net_total - loyalty_discount, 2)
    earn_base = net_after
    if payment_method == "account" and not settings.get("loyalty_earn_on_account"):
        earn_base = max(0.0, net_after - float(credit_portion or 0))
    points_earn = calc_earn_points(earn_base, settings)

    return {
        "net_total": net_total,
        "points_balance": customer_points,
        "max_redeem_points": max_pts,
        "points_redeem": redeem_points,
        "loyalty_discount": loyalty_discount,
        "net_after_loyalty": net_after,
        "points_earn": points_earn,
        "points_balance_after": customer_points - redeem_points + points_earn,
    }


def _record_transaction(
    cur,
    customer_id: int,
    kind: str,
    points: int,
    *,
    invoice_id: int | None = None,
    sale_amount: float | None = None,
    notes: str | None = None,
    user_id: int | None = None,
) -> int:
    cur.execute("SELECT COALESCE(loyalty_points, 0) AS pts FROM customers WHERE id=%s FOR UPDATE", (customer_id,))
    row = cur.fetchone()
    if not row:
        raise ValueError("Customer not found")
    balance = int(row["pts"] or 0) + int(points)
    if balance < 0:
        raise ValueError("Insufficient loyalty points")
    cur.execute(
        """INSERT INTO loyalty_transactions
           (customer_id, invoice_id, kind, points, balance_after, sale_amount, notes, recorded_by)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (customer_id, invoice_id, kind, points, balance, sale_amount, notes, user_id),
    )
    tid = cur.fetchone()["id"]
    cur.execute("UPDATE customers SET loyalty_points=%s WHERE id=%s", (balance, customer_id))
    return tid


def apply_sale_loyalty(
    cur,
    customer_id: int,
    invoice_id: int,
    *,
    points_earned: int,
    points_redeemed: int,
    loyalty_discount: float,
    net_paid: float,
    user_id: int | None,
) -> None:
    if points_redeemed > 0:
        _record_transaction(
            cur,
            customer_id,
            "redeem",
            -points_redeemed,
            invoice_id=invoice_id,
            sale_amount=loyalty_discount,
            notes=f"Redeemed on sale (discount {loyalty_discount:.2f})",
            user_id=user_id,
        )
    if points_earned > 0:
        _record_transaction(
            cur,
            customer_id,
            "earn",
            points_earned,
            invoice_id=invoice_id,
            sale_amount=net_paid,
            notes="Points earned on sale",
            user_id=user_id,
        )


def reverse_loyalty_on_return(
    cur,
    original_invoice_id: int,
    return_amount: float,
    user_id: int | None,
) -> None:
    cur.execute(
        """SELECT customer_id, net_total,
                  COALESCE(loyalty_points_earned, 0) AS earned,
                  COALESCE(loyalty_points_redeemed, 0) AS redeemed
           FROM invoices WHERE id=%s""",
        (original_invoice_id,),
    )
    inv = cur.fetchone()
    if not inv or not inv.get("customer_id"):
        return
    customer_id = inv["customer_id"]
    orig_net = float(inv["net_total"] or 0)
    if orig_net <= 0 or return_amount <= 0:
        return

    earned = int(inv["earned"] or 0)
    if earned > 0:
        claw = int(math.floor(earned * (return_amount / orig_net)))
        if claw > 0:
            _record_transaction(
                cur,
                customer_id,
                "reversal",
                -claw,
                invoice_id=original_invoice_id,
                sale_amount=return_amount,
                notes=f"Return reversal ({return_amount:.2f} EGP)",
                user_id=user_id,
            )

    redeemed = int(inv["redeemed"] or 0)
    if redeemed > 0:
        restore = int(math.floor(redeemed * (return_amount / orig_net)))
        if restore > 0:
            _record_transaction(
                cur,
                customer_id,
                "restore",
                restore,
                invoice_id=original_invoice_id,
                sale_amount=return_amount,
                notes=f"Restored redeemed points on return",
                user_id=user_id,
            )


def prepare_sale_loyalty(
    cur,
    user: dict,
    customer_id: int | None,
    net_total: float,
    redeem_points: int,
    payment_method: str,
    credit_portion: float = 0.0,
) -> dict:
    """Validate and compute loyalty for a sale. Raises ValueError on invalid redeem."""
    if not customer_id or not is_loyalty_operational(cur, user):
        return {
            "active": False,
            "points_redeemed": 0,
            "loyalty_discount": 0.0,
            "points_earned": 0,
            "net_after_loyalty": round(float(net_total or 0), 2),
        }

    settings = load_loyalty_settings(cur)
    balance = get_customer_points(cur, customer_id)
    preview = preview_loyalty(
        settings=settings,
        customer_points=balance,
        net_total=net_total,
        redeem_points=redeem_points,
        payment_method=payment_method,
        credit_portion=credit_portion,
    )

    requested = max(0, int(redeem_points or 0))
    if requested > preview["max_redeem_points"]:
        raise ValueError(
            f"Cannot redeem {requested} points (max {preview['max_redeem_points']}, balance {balance})"
        )
    if requested > 0 and requested < int(settings.get("loyalty_min_redeem") or 0):
        raise ValueError(f"Minimum redeem is {settings.get('loyalty_min_redeem')} points")

    return {
        "active": True,
        "points_redeemed": preview["points_redeem"],
        "loyalty_discount": preview["loyalty_discount"],
        "points_earned": preview["points_earn"],
        "net_after_loyalty": preview["net_after_loyalty"],
    }
