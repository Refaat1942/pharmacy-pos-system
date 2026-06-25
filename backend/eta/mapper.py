"""Map POS invoices / returns to EtaMiddleware document payloads."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Optional

from eta.constants import (
    CUSTOMER_BUSINESS,
    CUSTOMER_PERSON,
    DOC_TYPE_RETURN_RECEIPT,
    DOC_TYPE_SALES_RECEIPT,
    PAYMENT_CASH,
    PAYMENT_MIXED,
    PAYMENT_VISA,
    DEFAULT_WALK_IN,
)
from eta.db import get_branch_device


def _money(value: float | Decimal | None) -> float:
    return float(Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _parse_region(region: str | None) -> tuple[str, str]:
    """customers.region is `governorate_key:region_key` — map to ETA governorate/city strings."""
    if not region or ":" not in region:
        return "Cairo", "Cairo"
    gov_key, city_key = region.split(":", 1)
    gov = gov_key.replace("_", " ").title()
    city = city_key.replace("_", " ").title()
    return gov or "Cairo", city or gov or "Cairo"


def _payment_type(payment_method: str, cash_amount: float | None, visa_amount: float | None) -> int:
    cash = float(cash_amount or 0)
    visa = float(visa_amount or 0)
    if payment_method == "visa" or (visa > 0 and cash <= 0):
        return PAYMENT_VISA
    if cash > 0 and visa > 0:
        return PAYMENT_MIXED
    return PAYMENT_CASH


def _unit_type(unit: str | None, unit_label: str | None) -> str:
    u = (unit_label or unit or "").lower()
    if u in ("kg", "kilogram", "كيلو"):
        return "KG"
    return "EA"


def _line_taxes(vat_rate: float, vat_amount: float) -> list[dict]:
    if vat_rate <= 0 and vat_amount <= 0:
        return [{"TaxType": "T1", "Rate": 0.0}]
    return [{"TaxType": "VAT", "Rate": round(vat_rate, 4)}]


def _resolve_item_code(product: dict) -> str:
    for key in ("eta_item_code", "international_barcode", "barcode"):
        val = (product.get(key) or "").strip()
        if val:
            return val
    return ""


def build_unique_id(branch_code: str, invoice_number: str, invoice_id: int) -> str:
    safe_branch = (branch_code or "0").strip()
    safe_inv = (invoice_number or str(invoice_id)).strip()
    return f"{safe_branch}-R-{invoice_id}-{safe_inv}"


def customer_block(
    customer: dict | None,
    walk_in: dict[str, str],
    *,
    delivery_name: str | None = None,
    delivery_phone: str | None = None,
) -> dict[str, Any]:
    if customer:
        gov, city = _parse_region(customer.get("region"))
        tax_id = (customer.get("tax_number") or "").strip()
        ctype = CUSTOMER_BUSINESS if tax_id else CUSTOMER_PERSON
        return {
            "CustomerName": (customer.get("name") or "Customer").strip(),
            "CustomerCode": (customer.get("code") or f"C{customer.get('id')}").strip(),
            "CustomerTaxId": tax_id,
            "CustomerPhone": (customer.get("phone") or "").strip(),
            "CustomerCountryCode": "EG",
            "CustomerGovernate": gov,
            "CustomerCity": city,
            "CustomerStreet": (customer.get("address_details") or "N/A").strip() or "N/A",
            "CustomerBuilding": "1",
            "CustomerType": ctype,
        }

    block = dict(walk_in)
    if delivery_name:
        block["CustomerName"] = delivery_name.strip()
    if delivery_phone:
        block["CustomerPhone"] = delivery_phone.strip()
    block.setdefault("CustomerType", CUSTOMER_PERSON)
    return block


def build_line_item(row: dict, product: dict | None) -> dict[str, Any]:
    qty = _money(row.get("quantity") or 0)
    unit_price = _money(row.get("unit_price") or 0)
    discount = _money(row.get("discount") or 0) + _money(row.get("offer_discount") or 0)
    net_total = _money(row.get("total") or 0) - discount if row.get("total") is not None else _money(qty * unit_price - discount)

    vat_rate = float(product.get("vat_rate") or 0) if product else 0.0
    if row.get("vat_amount") is not None:
        vat_amount = _money(row.get("vat_amount"))
    elif vat_rate > 0:
        vat_amount = _money(net_total * vat_rate)
    else:
        vat_amount = 0.0

    total = _money(net_total + vat_amount)
    desc = (row.get("product_name_en") or row.get("product_name_ar") or "Product").strip()
    internal = str(product.get("id") if product and product.get("id") else row.get("barcode") or row.get("product_id") or "ITEM")

    line: dict[str, Any] = {
        "ProductDescription": desc,
        "Quantity": qty,
        "UnitPrice": unit_price,
        "UnitType": _unit_type(product.get("unit") if product else None, row.get("unit_label")),
        "DiscountAmount": discount,
        "NetTotal": net_total,
        "Total": total,
        "Currency": "EGP",
        "CurrencyRate": 1.0,
        "VAT": vat_amount,
        "ServiceCharge": 0.0,
        "WTH": 0.0,
        "InternalCode": internal,
        "ItemCode": _resolve_item_code(product or {}),
        "DocumentDetailTaxs": _line_taxes(vat_rate, vat_amount),
    }
    egs = (product.get("eta_egs_code") or "").strip() if product else ""
    if egs:
        line["EGSCode"] = egs
    return line


def build_sales_document(
    invoice: dict,
    items: list[dict],
    *,
    branch_device: dict,
    customer: dict | None,
    walk_in: dict[str, str],
    products_by_id: dict[int, dict],
) -> dict[str, Any]:
    created: datetime = invoice["created_at"]
    branch_code = (branch_device.get("branch_code") or "0").strip()
    internal_id = str(invoice.get("invoice_number") or invoice["id"])
    unique_id = build_unique_id(branch_code, internal_id, int(invoice["id"]))

    total_discount = _money(invoice.get("discount") or 0) + _money(invoice.get("offer_savings") or 0) + _money(invoice.get("loyalty_discount") or 0)
    net_amount = _money(invoice.get("net_total") or 0)
    extra_discount = _money(invoice.get("offer_savings") or 0) + _money(invoice.get("loyalty_discount") or 0)

    doc: dict[str, Any] = {
        "InternalId": internal_id,
        "UniqueId": unique_id,
        "ReferenceUUID": None,
        "Date": created.strftime("%Y-%m-%d"),
        "Time": created.strftime("%H:%M:%S"),
        **customer_block(
            customer,
            walk_in,
            delivery_name=invoice.get("delivery_customer_name"),
            delivery_phone=invoice.get("delivery_customer_phone"),
        ),
        "TotalSales": net_amount,
        "NetAmount": net_amount,
        "TotalDiscount": total_discount,
        "ExtraDiscount": extra_discount,
        "DocumentType": DOC_TYPE_SALES_RECEIPT,
        "PaymentType": _payment_type(
            invoice.get("payment_method") or "cash",
            invoice.get("cash_amount"),
            invoice.get("visa_amount"),
        ),
        "DocOrderType": 1 if invoice.get("type") == "delivery" else 0,
        "BranchCode": branch_code,
        "PosSerial": branch_device.get("pos_serial"),
        "IsPartialRefund": False,
        "DocumentDetails": [
            build_line_item(it, products_by_id.get(it.get("product_id")))
            for it in items
        ],
    }
    return doc


def build_return_document(
    ret: dict,
    items: list[dict],
    *,
    branch_device: dict,
    original_unique_id: str,
    original_uuid: str | None,
    customer: dict | None,
    walk_in: dict[str, str],
    products_by_id: dict[int, dict],
    partial: bool = False,
) -> dict[str, Any]:
    created: datetime = ret["created_at"]
    branch_code = (branch_device.get("branch_code") or "0").strip()
    internal_id = str(ret.get("return_invoice_number") or ret["id"])

    net_amount = _money(ret.get("total_returned") or 0)
    doc = build_sales_document(
        {
            "id": ret["id"],
            "invoice_number": internal_id,
            "created_at": created,
            "net_total": net_amount,
            "discount": 0,
            "offer_savings": 0,
            "loyalty_discount": 0,
            "payment_method": "cash",
            "cash_amount": net_amount,
            "visa_amount": 0,
            "type": "return",
        },
        items,
        branch_device=branch_device,
        customer=customer,
        walk_in=walk_in,
        products_by_id=products_by_id,
    )
    doc["InternalId"] = internal_id
    doc["UniqueId"] = build_unique_id(branch_code, internal_id, int(ret["id"]))
    doc["ReferenceUUID"] = original_uuid or original_unique_id

    if partial:
        doc["DocumentType"] = DOC_TYPE_SALES_RECEIPT
        doc["IsPartialRefund"] = True
    else:
        doc["DocumentType"] = DOC_TYPE_RETURN_RECEIPT
        doc["IsPartialRefund"] = False
    return doc


def load_invoice_bundle(cur, invoice_id: int) -> tuple[dict, list[dict], dict | None, dict]:
    cur.execute("SELECT * FROM invoices WHERE id = %s", (invoice_id,))
    invoice = cur.fetchone()
    if not invoice:
        raise ValueError("Invoice not found")
    invoice = dict(invoice)

    cur.execute(
        """
        SELECT ii.*, p.unit, p.vat_rate, p.eta_item_code, p.eta_egs_code,
               p.international_barcode, p.barcode AS product_barcode
        FROM invoice_items ii
        LEFT JOIN products p ON p.id = ii.product_id
        WHERE ii.invoice_id = %s
        ORDER BY ii.id ASC
        """,
        (invoice_id,),
    )
    items = [dict(r) for r in cur.fetchall()]

    customer = None
    if invoice.get("customer_id"):
        cur.execute("SELECT * FROM customers WHERE id = %s", (invoice["customer_id"],))
        row = cur.fetchone()
        customer = dict(row) if row else None

    branch_id = invoice.get("branch_id")
    device = get_branch_device(cur, branch_id) if branch_id else None
    if not device:
        raise ValueError(f"No ETA POS device configured for branch {branch_id}")

    products_by_id: dict[int, dict] = {}
    for it in items:
        pid = it.get("product_id")
        if pid:
            products_by_id[pid] = {
                "id": pid,
                "unit": it.get("unit"),
                "vat_rate": it.get("vat_rate"),
                "eta_item_code": it.get("eta_item_code"),
                "eta_egs_code": it.get("eta_egs_code"),
                "international_barcode": it.get("international_barcode"),
                "barcode": it.get("product_barcode"),
            }

    return invoice, items, customer, device
