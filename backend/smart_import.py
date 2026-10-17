"""Smart import of customers, suppliers and purchase history from any old system.

Pharmacies move to FPS from many programs (Egyptian pharmacy software, Odoo, Daftra,
hand-made Excel …). Their exports differ in format, language, header names and layout,
so — like the product import (import_mapper) — the file is read whatever its shape,
the header row is found automatically, every column is matched to a field by its name
and by what its values look like, and the user can correct the mapping before import.

Endpoints (admin only):
  POST /api/import/{kind}/preview  → detected sheet, header row, column → field mapping
  POST /api/import/{kind}          → import with the (corrected) mapping
kind = customers | suppliers | purchases
"""
from __future__ import annotations

import json
import re
from datetime import date, datetime
from typing import Any, Optional

import psycopg2
import psycopg2.extras
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from db import get_db_connection
from deps import get_active_branch_id, get_current_user
from import_mapper import _cell_text, normalize_header, parse_date, parse_number, read_sheets

router = APIRouter(prefix="/api/import", tags=["smart-import"])

MAX_UPLOAD = 40 * 1024 * 1024
_ARABIC = re.compile(r"[؀-ۿ]")

# ─── Field profiles ────────────────────────────────────────────────────────
# field → (English label, Arabic label, required)
PROFILES: dict[str, dict[str, Any]] = {
    "customers": {
        "fields": {
            "code": ("Customer code", "كود العميل", False),
            "name": ("Customer name", "اسم العميل", True),
            "phone": ("Phone / mobile", "التليفون / الموبايل", False),
            "phone2": ("Second phone", "تليفون آخر", False),
            "email": ("Email", "البريد الإلكتروني", False),
            "address": ("Address", "العنوان", False),
            "region": ("Area / region", "المنطقة", False),
            "tax_number": ("Tax number", "الرقم الضريبي", False),
            "credit_limit": ("Credit limit", "حد الائتمان", False),
            "balance": ("Balance (owed by customer)", "الرصيد (على العميل)", False),
            "debit": ("Debit", "مدين", False),
            "credit": ("Credit", "دائن", False),
            "notes": ("Notes", "ملاحظات", False),
        },
        "synonyms": {
            "code": ["code", "customer code", "client code", "account code", "account no", "account number", "customer id",
                     "customer no", "id", "no", "كود", "الكود", "كود العميل", "رقم العميل", "رقم الحساب", "كود الحساب"],
            "name": ["name", "customer", "customer name", "client", "client name", "account name", "full name", "partner",
                     "display name", "contact name", "patient", "patient name", "client name", "business name",
                     "الاسم", "اسم", "العميل", "اسم العميل", "اسم الحساب", "الحساب", "اسم المريض", "المريض", "الاسم التجاري", "اسم النشاط"],
            "phone": ["phone", "mobile", "mobile no", "mobile number", "tel", "telephone", "phone number", "cell", "whatsapp",
                      "contact", "contact no", "الهاتف", "هاتف", "التليفون", "تليفون", "تلفون", "الموبايل", "موبايل",
                      "المحمول", "محمول", "رقم الهاتف", "رقم الموبايل", "رقم التليفون", "جوال", "الجوال", "واتس"],
            "phone2": ["phone 2", "phone2", "mobile 2", "other phone", "tel 2", "work phone", "landline",
                       "تليفون 2", "هاتف 2", "موبايل 2", "تليفون اخر", "هاتف اخر", "تليفون المنزل", "ارضي"],
            "email": ["email", "e mail", "mail", "البريد", "البريد الالكتروني", "الايميل", "ايميل"],
            "address": ["address", "street", "address details", "full address", "location",
                        "العنوان", "عنوان", "عنوان العميل", "الشارع"],
            "region": ["region", "area", "district", "city", "zone", "governorate", "state",
                       "المنطقه", "منطقه", "الحي", "المدينه", "المحافظه", "خط السير"],
            "tax_number": ["tax number", "tax no", "tax id", "vat number", "tax registration", "trn",
                           "الرقم الضريبي", "رقم ضريبي", "رقم التسجيل الضريبي", "البطاقه الضريبيه"],
            "credit_limit": ["credit limit", "limit", "max credit", "حد الائتمان", "الحد الائتماني", "حد الدين",
                             "الحد الاقصي", "اقصي مديونيه", "حد المديونيه"],
            "balance": ["balance", "current balance", "opening balance", "due", "amount due", "outstanding", "receivable",
                        "total due", "net balance", "الرصيد", "رصيد", "الرصيد الحالي", "رصيد اول المده", "الرصيد الافتتاحي",
                        "المديونيه", "المستحق", "الباقي", "المتبقي", "صافي الرصيد", "رصيد العميل", "الرصيد بعد"],
            "debit": ["debit", "dr", "debit balance", "مدين", "رصيد مدين", "المدين", "عليه"],
            "credit": ["credit", "cr", "credit balance", "دائن", "رصيد دائن", "الدائن", "له"],
            "notes": ["notes", "note", "remarks", "comment", "comments", "description",
                      "ملاحظات", "ملاحظه", "ملحوظه", "تعليق", "البيان"],
        },
    },
    "suppliers": {
        "fields": {
            "code": ("Supplier code", "كود المورد", False),
            "name": ("Supplier name", "اسم المورد", True),
            "contact_person": ("Contact person", "المسؤول", False),
            "phone": ("Phone / mobile", "التليفون / الموبايل", False),
            "phone2": ("Second phone", "تليفون آخر", False),
            "email": ("Email", "البريد الإلكتروني", False),
            "address": ("Address", "العنوان", False),
            "tax_number": ("Tax number", "الرقم الضريبي", False),
            "commercial_reg": ("Commercial register", "السجل التجاري", False),
            "balance": ("Balance (we owe supplier)", "الرصيد (لصالح المورد)", False),
            "debit": ("Debit", "مدين", False),
            "credit": ("Credit", "دائن", False),
            "notes": ("Notes", "ملاحظات", False),
        },
        "synonyms": {
            "code": ["code", "supplier code", "vendor code", "account code", "supplier id", "vendor id", "id", "no",
                     "كود", "الكود", "كود المورد", "رقم المورد", "كود الشركه", "رقم الحساب"],
            "name": ["name", "supplier", "supplier name", "vendor", "vendor name", "company", "company name", "distributor",
                     "store", "partner", "account name", "الاسم", "اسم", "المورد", "اسم المورد", "الشركه", "اسم الشركه",
                     "الموزع", "اسم الموزع", "المخزن", "اسم المخزن", "اسم الحساب", "الجهه"],
            "contact_person": ["contact person", "contact", "representative", "rep", "sales rep", "contact name",
                               "المسئول", "المسؤول", "الشخص المسؤول", "المندوب", "اسم المندوب", "مسئول الاتصال", "تليفون المندوب"],
            "phone": ["phone", "mobile", "tel", "telephone", "phone number", "mobile number", "whatsapp",
                                        "الهاتف", "هاتف", "التليفون", "تليفون", "تلفون", "الموبايل", "موبايل",
                                        "المحمول", "رقم الهاتف", "رقم التليفون", "جوال"],
            "phone2": ["phone 2", "phone2", "mobile 2", "fax", "other phone", "تليفون 2", "هاتف 2", "فاكس", "تليفون اخر"],
            "email": ["email", "e mail", "mail", "البريد", "البريد الالكتروني", "الايميل", "ايميل"],
            "address": ["address", "street", "city", "location", "العنوان", "عنوان", "المدينه"],
            "tax_number": ["tax number", "tax no", "tax id", "vat number", "tax registration", "tax card",
                           "الرقم الضريبي", "رقم ضريبي", "البطاقه الضريبيه", "رقم التسجيل الضريبي", "رقم البطاقه الضريبيه"],
            "commercial_reg": ["commercial register", "commercial registration", "cr", "cr no", "registration no",
                               "السجل التجاري", "سجل تجاري", "رقم السجل التجاري", "رقم السجل"],
            "balance": ["balance", "current balance", "opening balance", "payable", "amount due", "due", "outstanding",
                        "net balance", "الرصيد", "رصيد", "الرصيد الحالي", "رصيد اول المده", "الرصيد الافتتاحي",
                        "المستحق", "المستحق للمورد", "رصيد المورد", "المديونيه", "الباقي", "المتبقي"],
            "debit": ["debit", "dr", "debit balance", "مدين", "رصيد مدين", "المدين", "عليه"],
            "credit": ["credit", "credit balance", "دائن", "رصيد دائن", "الدائن", "له"],
            "notes": ["notes", "note", "remarks", "comment", "ملاحظات", "ملاحظه", "ملحوظه", "تعليق"],
        },
    },
    "purchases": {
        "fields": {
            "invoice_no": ("Invoice number", "رقم الفاتورة", False),
            "invoice_date": ("Invoice date", "تاريخ الفاتورة", False),
            "supplier": ("Supplier", "المورد", True),
            "item_code": ("Item code / barcode", "كود الصنف / الباركود", False),
            "item_name": ("Item name", "اسم الصنف", False),
            "unit": ("Unit (box / strip)", "الوحدة (علبة / شريط)", False),
            "quantity": ("Quantity", "الكمية", True),
            "bonus": ("Bonus / free qty", "البونص / الهدية", False),
            "unit_cost": ("Purchase price", "سعر الشراء", False),
            "public_price": ("Public (selling) price", "سعر الجمهور", False),
            "discount_pct": ("Discount %", "نسبة الخصم", False),
            "line_total": ("Line total", "الإجمالي", False),
            "expiry": ("Expiry date", "تاريخ الصلاحية", False),
            "batch": ("Batch / lot", "رقم التشغيلة", False),
        },
        "synonyms": {
            "invoice_no": ["invoice no", "invoice number", "invoice", "inv no", "bill no", "bill number", "reference",
                           "ref", "doc no", "document no", "voucher no", "supplier invoice", "po number", "purchase no",
                           "invoice id", "رقم الفاتوره", "الفاتوره", "م الفاتوره", "رقم الفاتوره الشراء", "فاتوره رقم", "رقم المستند", "رقم الاذن",
                           "رقم السند", "المرجع", "رقم فاتوره المورد", "رقم الحركه"],
            "invoice_date": ["date", "invoice date", "bill date", "purchase date", "doc date", "transaction date", "posting date",
                             "التاريخ", "تاريخ", "تاريخ الفاتوره", "تاريخ الشراء", "تاريخ المستند", "تاريخ الحركه"],
            "supplier": ["supplier", "supplier name", "vendor", "vendor name", "company", "distributor", "from", "partner",
                         "المورد", "اسم المورد", "الشركه", "اسم الشركه", "الموزع", "المخزن", "الجهه"],
            "item_code": ["item code", "code", "barcode", "product code", "sku", "item no", "item id", "ean",
                          "كود الصنف", "كود", "الكود", "الباركود", "باركود", "رقم الصنف", "كود الماده"],
            "item_name": ["item", "item name", "product", "product name", "description", "drug", "drug name", "medicine",
                          "الصنف", "اسم الصنف", "اسم الدواء", "الدواء", "البيان", "اسم المنتج", "الوصف", "اسم الماده"],
            "unit": ["unit", "uom", "unit of measure", "pack", "الوحده", "وحده", "العبوه"],
            "quantity": ["quantity", "qty", "purchased qty", "received qty", "units", "count",
                         "الكميه", "كميه", "العدد", "الكميه المشتراه", "الكميه المستلمه"],
            "bonus": ["bonus", "free", "free qty", "bonus qty", "gift", "extra", "foc", "free of charge",
                      "بونص", "البونص", "هديه", "الهديه", "هدايا", "مجاني", "كميه مجانيه", "بونيص"],
            "unit_cost": ["cost", "unit cost", "purchase price", "buy price", "buying price", "net price", "pharmacist price",
                          "price", "rate", "unit price", "سعر الشراء", "سعر الصيدلي", "التكلفه", "سعر التكلفه",
                          "سعر الوحده", "السعر", "سعر"],
            "public_price": ["public price", "selling price", "sale price", "retail price", "consumer price", "mrp", "pp",
                             "سعر الجمهور", "سعر البيع", "سعر المستهلك", "الجمهور"],
            "discount_pct": ["discount %", "discount", "disc %", "disc", "discount percent", "نسبه الخصم", "الخصم", "خصم",
                             "خصم %", "نسبه"],
            "line_total": ["total", "line total", "amount", "net", "net amount", "value", "subtotal",
                           "الاجمالي", "اجمالي", "الصافي", "القيمه", "المبلغ", "الاجمالي بعد الخصم", "المجموع"],
            "expiry": ["expiry", "expiry date", "exp", "exp date", "expiration", "valid until", "best before",
                       "تاريخ الصلاحيه", "الصلاحيه", "تاريخ الانتهاء", "انتهاء الصلاحيه"],
            "batch": ["batch", "batch no", "lot", "lot no", "operation no", "التشغيله", "رقم التشغيله", "رقم اللوت", "اللوط", "باتش", "رقم الباتش"],
        },
    },
}

_NORM: dict[str, dict[str, list[str]]] = {
    kind: {f: sorted({normalize_header(s) for s in syns}, key=len, reverse=True) for f, syns in p["synonyms"].items()}
    for kind, p in PROFILES.items()
}


def _score(kind: str, header_norm: str, field: str) -> int:
    """0–100: how well a normalised header matches one field of a profile."""
    if not header_norm:
        return 0
    best = 0
    padded = f" {header_norm} "
    for syn in _NORM[kind][field]:
        if header_norm == syn:
            return 100
        if f" {syn} " in padded:
            best = max(best, int(55 + 35 * len(syn) / max(len(header_norm), 1)))
    return best


def _profile(values: list[Any]) -> dict:
    vals = [v for v in values if _cell_text(v) != ""]
    n = len(vals) or 1
    texts = [_cell_text(v) for v in vals]
    digits = [re.sub(r"\D", "", t) for t in texts]
    return {
        "filled": len(vals),
        "num": sum(1 for t in texts if parse_number(t) is not None and not re.search(r"[a-zA-Z؀-ۿ]{2,}", t)) / n,
        "phone": sum(1 for d, t in zip(digits, texts) if 8 <= len(d) <= 13 and len(d) >= len(t.replace(" ", "")) - 3
                     and (d.startswith("01") or d.startswith("201") or d.startswith("0"))) / n,
        "email": sum(1 for t in texts if "@" in t and "." in t) / n,
        "date": sum(1 for v in vals if isinstance(v, (date, datetime)) or (isinstance(v, str) and parse_date(v))) / n,
        "text": sum(1 for t in texts if re.search(r"[a-zA-Z؀-ۿ]{2,}", t)) / n,
        "avg_len": sum(len(t) for t in texts) / n,
        "distinct": len(set(texts)),
    }


def _find_header(kind: str, sheets) -> tuple[int, int]:
    fields = PROFILES[kind]["fields"]
    best = (0, 0, -1, 0)
    for si, (_, rows) in enumerate(sheets):
        for ri, row in enumerate(rows[:40]):
            sc = 0
            for cell in row:
                h = normalize_header(cell)
                if h and max(_score(kind, h, f) for f in fields) >= 60:
                    sc += 1
            data_rows = len(rows) - ri - 1
            if sc > best[2] or (sc == best[2] and sc > 0 and data_rows > best[3]):
                best = (si, ri, sc, data_rows)
    if best[2] <= 0:
        si = max(range(len(sheets)), key=lambda i: len(sheets[i][1])) if sheets else 0
        rows = sheets[si][1] if sheets else []
        return si, next((i for i, r in enumerate(rows) if any(_cell_text(c) for c in r)), 0)
    return best[0], best[1]


def detect_mapping(kind: str, headers: list[Any], rows: list[list[Any]]) -> list[dict]:
    fields = PROFILES[kind]["fields"]
    ncols = max([len(headers)] + [len(r) for r in rows[:200]] or [0])
    sample = rows[:300]
    cols = []
    for ci in range(ncols):
        h = headers[ci] if ci < len(headers) else None
        vals = [r[ci] if ci < len(r) else None for r in sample]
        cols.append({"index": ci, "header": _cell_text(h), "norm": normalize_header(h), "p": _profile(vals),
                     "samples": [_cell_text(v) for v in vals if _cell_text(v)][:4]})

    pairs = []
    for c in cols:
        if not c["norm"] and c["p"]["filled"] == 0:
            continue
        for f in fields:
            sc = _score(kind, c["norm"], f)
            if sc >= 55:
                # A name-type header over a column of numbers is not the name.
                if f == "name" and c["p"]["num"] > 0.8:
                    continue
                if f in ("phone", "phone2") and c["p"]["text"] > 0.6 and c["p"]["phone"] < 0.3:
                    continue
                pairs.append((sc, -c["index"], c["index"], f))
    pairs.sort(reverse=True)
    assigned: dict[int, tuple[str, int]] = {}
    used: set[str] = set()
    for sc, _, ci, f in pairs:
        if ci in assigned or f in used:
            continue
        assigned[ci] = (f, sc)
        used.add(f)

    free = [c for c in cols if c["index"] not in assigned and c["p"]["filled"] > 0]

    def take(field, pred, key):
        nonlocal free
        if field not in fields or field in used:
            return
        cands = [c for c in free if pred(c["p"])]
        if not cands:
            return
        c = max(cands, key=lambda c: key(c["p"]))
        assigned[c["index"]] = (field, 40)
        used.add(field)
        free = [x for x in free if x["index"] != c["index"]]

    take("email", lambda p: p["email"] >= 0.6, lambda p: p["email"])
    take("phone", lambda p: p["phone"] >= 0.6, lambda p: p["phone"])
    take("phone2", lambda p: p["phone"] >= 0.6, lambda p: p["phone"])
    take("invoice_date", lambda p: p["date"] >= 0.7, lambda p: p["date"])
    take("name", lambda p: p["text"] >= 0.7 and p["avg_len"] >= 4 and p["distinct"] > 1, lambda p: (p["distinct"], p["avg_len"]))
    take("item_name", lambda p: p["text"] >= 0.7 and p["avg_len"] >= 4, lambda p: (p["distinct"], p["avg_len"]))

    out = []
    for c in cols:
        f, sc = assigned.get(c["index"], (None, 0))
        out.append({"index": c["index"], "header": c["header"], "field": f,
                    "confidence": "high" if sc >= 80 else "medium" if sc >= 55 else "guess" if f else "none",
                    "samples": c["samples"]})
    return out


def _load(kind: str, content: bytes, filename: str, mapping: Optional[dict], sheet_index: Optional[int],
          header_row: Optional[int]):
    sheets = read_sheets(content, filename)
    if not sheets or not any(rows for _, rows in sheets):
        raise HTTPException(400, "The file is empty")
    auto_si, auto_hi = _find_header(kind, sheets)
    si = sheet_index if sheet_index is not None and 0 <= sheet_index < len(sheets) else auto_si
    hi = header_row - 1 if header_row and header_row >= 1 else (auto_hi if si == auto_si else _find_header(kind, [sheets[si]])[1])
    rows = sheets[si][1]
    headers = rows[hi] if hi < len(rows) else []
    body = [r for r in rows[hi + 1:]]
    data = [r for r in body if any(_cell_text(c) for c in r)]
    columns = detect_mapping(kind, list(headers), data)
    fields = PROFILES[kind]["fields"]
    if mapping:
        col_field = {int(k): v for k, v in mapping.items() if v in fields}
    else:
        col_field = {c["index"]: c["field"] for c in columns if c["field"]}
    return sheets, si, hi, body, columns, col_field


# ─── Value helpers ─────────────────────────────────────────────────────────
_TOTAL_ROW = re.compile(r"^(total|totals|grand total|sum|الاجمالي|اجمالي|الاجماليات|المجموع|الإجمالي|إجمالي)\b", re.I)


def _is_total_row(rec: dict) -> bool:
    name = str(rec.get("name") or rec.get("item_name") or rec.get("supplier") or "").strip()
    return bool(name) and bool(_TOTAL_ROW.match(normalize_header(name) or name))


def _signed_amount(raw: Any, debit_word_positive: bool) -> Optional[float]:
    """'1,250 دائن' / '(300)' / '-300' / '500 Dr' → signed float.

    debit_word_positive: customers → مدين/Dr is a positive balance (they owe us);
    suppliers → دائن/Cr is positive (we owe them).
    """
    if raw is None or _cell_text(raw) == "":
        return None
    t = _cell_text(raw)
    n = normalize_header(t)
    neg = t.strip().startswith("(") and t.strip().endswith(")")
    val = parse_number(re.sub(r"[()]", "", t))
    if val is None:
        return None
    is_debit = bool(re.search(r"(^|\s)(dr|debit|مدين|م|عليه)(\s|$)", n))
    is_credit = bool(re.search(r"(^|\s)(cr|credit|دائن|داين|د|له)(\s|$)", n))
    if is_debit or is_credit:
        val = abs(val) * (1 if (is_debit == debit_word_positive) else -1)
    if neg:
        val = -abs(val)
    return round(val, 2)


def _balance(rec: dict, customers: bool) -> Optional[float]:
    bal = _signed_amount(rec.get("balance"), debit_word_positive=customers)
    dr = parse_number(rec.get("debit")) if rec.get("debit") not in (None, "") else None
    cr = parse_number(rec.get("credit")) if rec.get("credit") not in (None, "") else None
    if dr is not None or cr is not None:
        d, c = abs(dr or 0), abs(cr or 0)
        return round(d - c if customers else c - d, 2)
    return bal


def _date(v: Any) -> Optional[date]:
    """Dates from any export, incl. expiry written as month/year only ("3-27", "03/2027")."""
    if v in (None, ""):
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    d = parse_date(v)
    if d:
        return d
    m = re.fullmatch(r"(\d{1,2})\s*[-/.]\s*(\d{2}|\d{4})", normalize_header(_cell_text(v)).replace(" ", "-"))
    if m and 1 <= int(m.group(1)) <= 12:
        y = int(m.group(2)) + (2000 if len(m.group(2)) == 2 else 0)
        nxt = date(y + (m.group(1) == "12"), int(m.group(1)) % 12 + 1, 1)
        return date.fromordinal(nxt.toordinal() - 1)  # last day of that month
    return None


def _text(v: Any, limit: int = 200) -> Optional[str]:
    t = _cell_text(v).strip()
    return t[:limit] if t else None


def _phone(v: Any) -> Optional[str]:
    t = _cell_text(v)
    if not t:
        return None
    t = normalize_header(t)  # Arabic-Indic digits → 0-9
    d = re.sub(r"\D", "", t)
    if not d:
        return None
    if d.startswith("20") and len(d) == 12:
        d = "0" + d[2:]
    if len(d) == 10 and d.startswith("1"):
        d = "0" + d  # Excel dropped the leading zero of an Egyptian mobile
    return d[:20]


def _norm_name(s: str) -> str:
    return normalize_header(s)


# ─── Importers ─────────────────────────────────────────────────────────────
def _import_customers(cur, recs: list[tuple[int, dict]], branch_id: Optional[int], user_id: Optional[int]) -> dict:
    from customers import _ensure_customer_code, _sync_customer_phones
    created = updated = skipped = 0
    errors: list[dict] = []
    cur.execute("SELECT id, name, phone, code FROM customers")
    by_code, by_phone, by_name = {}, {}, {}
    for r in cur.fetchall():
        if r["code"]:
            by_code[str(r["code"]).strip().upper()] = r["id"]
        if r["phone"]:
            by_phone[re.sub(r"\D", "", r["phone"])[-10:]] = r["id"]
        by_name.setdefault(_norm_name(r["name"] or ""), r["id"])
    cur.execute("SELECT customer_id, phone FROM customer_phones")
    for r in cur.fetchall():
        by_phone.setdefault(re.sub(r"\D", "", r["phone"] or "")[-10:], r["customer_id"])

    for rown, rec in recs:
        name = _text(rec.get("name"), 100)
        if not name or _is_total_row(rec):
            skipped += 1
            continue
        try:
            cur.execute("SAVEPOINT row_sp")
            phone, phone2 = _phone(rec.get("phone")), _phone(rec.get("phone2"))
            code = _text(rec.get("code"), 50)
            cid = (by_code.get(code.upper()) if code else None) \
                or (by_phone.get(phone[-10:]) if phone else None) \
                or by_name.get(_norm_name(name))
            bal = _balance(rec, customers=True)
            limit = parse_number(rec.get("credit_limit")) if rec.get("credit_limit") not in (None, "") else None
            values = {
                "email": _text(rec.get("email")), "address_details": _text(rec.get("address"), 500),
                "region": _text(rec.get("region"), 100), "tax_number": _text(rec.get("tax_number"), 50),
                "notes": _text(rec.get("notes"), 1000),
            }
            if cid:
                sets, params = ["name=%s"], [name]
                for k, v in values.items():
                    if v:
                        sets.append(f"{k}=%s"); params.append(v)
                if limit is not None:
                    sets.append("credit_limit=%s"); params.append(limit)
                if bal is not None:
                    sets.append("opening_balance=%s"); params.append(bal)
                cur.execute(f"UPDATE customers SET {', '.join(sets)} WHERE id=%s", params + [cid])
                updated += 1
            else:
                cur.execute(
                    """INSERT INTO customers (name, phone, email, address_details, region, tax_number, notes,
                                              credit_limit, opening_balance, active, sale_type)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,true,'cash') RETURNING id""",
                    (name, phone, values["email"], values["address_details"], values["region"],
                     values["tax_number"], values["notes"], limit or 0, bal or 0),
                )
                cid = cur.fetchone()["id"]
                final = _ensure_customer_code(cur, cid, code)
                cur.execute("UPDATE customers SET code=%s WHERE id=%s", (final, cid))
                by_code[final.upper()] = cid
                by_name[_norm_name(name)] = cid
                created += 1
            phones = [p for p in (phone, phone2) if p]
            if phones:
                _sync_customer_phones(cur, cid, [{"phone": p, "is_primary": i == 0} for i, p in enumerate(phones)])
                by_phone[phones[0][-10:]] = cid
            if branch_id:
                cur.execute(
                    "INSERT INTO customer_branches (customer_id, branch_id, authorized_by) VALUES (%s,%s,%s) "
                    "ON CONFLICT DO NOTHING", (cid, branch_id, user_id))
            cur.execute("RELEASE SAVEPOINT row_sp")
        except Exception as e:  # one bad row never stops the import
            cur.execute("ROLLBACK TO SAVEPOINT row_sp")
            errors.append({"row": rown, "error": getattr(e, "detail", None) or str(e)[:200]})
    return {"created": created, "updated": updated, "skipped": skipped, "errors": errors}


def _import_suppliers(cur, recs: list[tuple[int, dict]]) -> dict:
    created = updated = skipped = 0
    errors: list[dict] = []
    cur.execute("SELECT id, name, tax_number FROM suppliers")
    by_name, by_tax = {}, {}
    for r in cur.fetchall():
        by_name.setdefault(_norm_name(r["name"] or ""), r["id"])
        if r["tax_number"]:
            by_tax[re.sub(r"\D", "", r["tax_number"])] = r["id"]
    for rown, rec in recs:
        name = _text(rec.get("name"), 200)
        if not name or _is_total_row(rec):
            skipped += 1
            continue
        try:
            cur.execute("SAVEPOINT row_sp")
            tax = _text(rec.get("tax_number"), 50)
            sid = (by_tax.get(re.sub(r"\D", "", tax)) if tax and re.sub(r"\D", "", tax) else None) \
                or by_name.get(_norm_name(name))
            phones = [p for p in (_phone(rec.get("phone")), _phone(rec.get("phone2"))) if p]
            notes = "\n".join(x for x in (
                _text(rec.get("notes"), 800),
                f"السجل التجاري: {_text(rec.get('commercial_reg'), 60)}" if rec.get("commercial_reg") else None,
                f"كود قديم: {_text(rec.get('code'), 60)}" if rec.get("code") else None,
            ) if x) or None
            vals = {"contact_person": _text(rec.get("contact_person"), 150), "phone": " / ".join(phones)[:40] or None,
                    "email": _text(rec.get("email")), "address": _text(rec.get("address"), 500),
                    "tax_number": tax, "notes": notes}
            bal = _balance(rec, customers=False)
            if sid:
                sets, params = ["name=%s"], [name]
                for k, v in vals.items():
                    if v:
                        sets.append(f"{k}=%s"); params.append(v)
                if bal is not None:
                    sets.append("opening_balance=%s"); params.append(bal)
                cur.execute(f"UPDATE suppliers SET {', '.join(sets)} WHERE id=%s", params + [sid])
                updated += 1
            else:
                cur.execute(
                    """INSERT INTO suppliers (name, contact_person, phone, email, address, tax_number, notes,
                                              opening_balance, active)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,true) RETURNING id""",
                    (name, vals["contact_person"], vals["phone"], vals["email"], vals["address"], tax, notes, bal or 0),
                )
                sid = cur.fetchone()["id"]
                by_name[_norm_name(name)] = sid
                created += 1
            cur.execute("RELEASE SAVEPOINT row_sp")
        except Exception as e:
            cur.execute("ROLLBACK TO SAVEPOINT row_sp")
            errors.append({"row": rown, "error": str(e)[:200]})
    return {"created": created, "updated": updated, "skipped": skipped, "errors": errors}


def _import_purchases(cur, recs: list[tuple[int, dict]], branch_id: int, user_id: Optional[int]) -> dict:
    """Old purchase invoices → purchase orders with status 'imported' (history only:
    stock comes from the item import and the supplier balance from its opening balance,
    so nothing is counted twice)."""
    from import_mapper import normalize_unit
    skipped = 0
    errors: list[dict] = []
    cur.execute("SELECT id, name FROM suppliers")
    sup_by_name = {_norm_name(r["name"] or ""): r["id"] for r in cur.fetchall()}
    cur.execute(
        "SELECT id, barcode, international_barcode, name_en, name_ar FROM products "
        "WHERE branch_id=%s OR branch_id IS NULL", (branch_id,))
    prod_by_code, prod_by_name = {}, {}
    for p in cur.fetchall():
        for code in (p["barcode"], p["international_barcode"]):
            if code:
                prod_by_code[str(code).strip().lower()] = p
        for nm in (p["name_en"], p["name_ar"]):
            if nm:
                prod_by_name.setdefault(_norm_name(nm), p)

    # Group rows into invoices. Exports often repeat the invoice fields on every line,
    # or give them only on the first line of each invoice — carry them forward.
    groups: dict[tuple, list[tuple[int, dict]]] = {}
    order: list[tuple] = []
    last = {"invoice_no": None, "invoice_date": None, "supplier": None}
    for rown, rec in recs:
        for k in last:
            if rec.get(k) not in (None, ""):
                last[k] = rec[k]
            else:
                rec[k] = last[k]
        if _is_total_row(rec) or (not rec.get("item_name") and not rec.get("item_code")):
            skipped += 1
            continue
        dd = _date(rec.get("invoice_date"))
        key = (_text(rec.get("invoice_no"), 80) or f"#{dd or ''}", dd, _norm_name(_text(rec.get("supplier")) or ""))
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append((rown, rec))

    invoices = lines = unmatched = 0
    suppliers_created = 0
    for key in order:
        inv_no, inv_date, sup_norm = key
        rows = groups[key]
        first = rows[0][1]
        sup_name = _text(first.get("supplier"), 200)
        if not sup_name:
            for rown, _ in rows:
                errors.append({"row": rown, "error": "Supplier is missing"})
            continue
        try:
            cur.execute("SAVEPOINT inv_sp")
            sid = sup_by_name.get(sup_norm)
            if not sid:
                cur.execute("INSERT INTO suppliers (name, active) VALUES (%s, true) RETURNING id", (sup_name,))
                sid = cur.fetchone()["id"]
                sup_by_name[sup_norm] = sid
                suppliers_created += 1
            ref = inv_no if not inv_no.startswith("#") else None
            if ref:
                cur.execute(
                    "SELECT id FROM purchase_orders WHERE supplier_id=%s AND supplier_invoice_number=%s "
                    "AND status='imported' LIMIT 1", (sid, ref))
                if cur.fetchone():  # already imported (file uploaded twice)
                    skipped += len(rows)
                    cur.execute("RELEASE SAVEPOINT inv_sp")
                    continue
            cur.execute("SELECT nextval('purchase_order_seq') AS n")
            n = cur.fetchone()["n"]
            when = inv_date or date.today()
            po_number = f"IMP-{when.strftime('%Y%m%d')}-{int(n):04d}"
            cur.execute(
                """INSERT INTO purchase_orders (po_number, supplier_id, branch_id, status, supplier_invoice_number,
                                                supplier_invoice_date, notes, created_by, created_at, received_at)
                   VALUES (%s,%s,%s,'imported',%s,%s,%s,%s,%s,%s) RETURNING id""",
                (po_number, sid, branch_id, ref, inv_date, "مستورد من البرنامج القديم / imported", user_id,
                 when, when),
            )
            po_id = cur.fetchone()["id"]
            subtotal = 0.0
            for rown, rec in rows:
                code = _text(rec.get("item_code"), 50)
                name = _text(rec.get("item_name"), 300)
                prod = (prod_by_code.get(code.lower()) if code else None) or (prod_by_name.get(_norm_name(name)) if name else None)
                if not prod:
                    unmatched += 1
                qty = parse_number(rec.get("quantity")) or 0
                bonus = parse_number(rec.get("bonus")) or 0
                if qty <= 0 and bonus <= 0:
                    errors.append({"row": rown, "error": "Quantity is missing"})
                    continue
                cost = parse_number(rec.get("unit_cost"))
                total = parse_number(rec.get("line_total"))
                disc = parse_number(rec.get("discount_pct"))
                if cost is None and total is not None and qty:
                    cost = total / qty
                if cost is None:
                    pub = parse_number(rec.get("public_price"))
                    cost = pub * (1 - (disc or 0) / 100) if pub is not None else 0
                elif disc and total is None and parse_number(rec.get("public_price")) is not None \
                        and abs(cost - parse_number(rec.get("public_price"))) < 0.01:
                    cost = cost * (1 - disc / 100)  # "price" was the public price before discount
                if total is None:
                    total = cost * qty
                expd = _date(rec.get("expiry"))
                unit = normalize_unit(rec.get("unit")) if rec.get("unit") else ""
                cur.execute(
                    """INSERT INTO purchase_order_items (po_id, product_id, barcode, product_name_ar, product_name_en,
                                                         quantity, bonus_qty, unit_cost, expiry_date, total, unit_type)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (po_id, prod["id"] if prod else None, code or (prod["barcode"] if prod else None),
                     (prod["name_ar"] if prod else None) or name, (prod["name_en"] if prod else None) or name,
                     max(1, int(round(qty))) if qty > 0 else max(1, int(round(bonus))), int(round(bonus)) if qty > 0 else 0,
                     round(cost, 2), expd, round(total, 2), "sub" if unit == "strip" else "pack"),
                )
                subtotal += total
                lines += 1
            cur.execute("UPDATE purchase_orders SET subtotal=%s, total=%s WHERE id=%s",
                        (round(subtotal, 2), round(subtotal, 2), po_id))
            invoices += 1
            cur.execute("RELEASE SAVEPOINT inv_sp")
        except Exception as e:
            cur.execute("ROLLBACK TO SAVEPOINT inv_sp")
            errors.append({"row": rows[0][0], "error": f"Invoice {inv_no}: {str(e)[:180]}"})
    return {"created": invoices, "lines": lines, "unmatched_items": unmatched,
            "suppliers_created": suppliers_created, "updated": 0, "skipped": skipped, "errors": errors}


# ─── Endpoints ─────────────────────────────────────────────────────────────
def _admin(user: dict) -> None:
    if user.get("role") != "admin":
        raise HTTPException(403, "Only an admin can import data")


def _kind(kind: str) -> str:
    if kind not in PROFILES:
        raise HTTPException(404, "Unknown import type")
    return kind


async def _read(file: UploadFile) -> bytes:
    content = await file.read()
    if not content:
        raise HTTPException(400, "The file is empty")
    if len(content) > MAX_UPLOAD:
        raise HTTPException(413, "File is too large (max 40 MB)")
    return content


@router.post("/{kind}/preview")
async def preview(kind: str, file: UploadFile = File(...), sheet_index: Optional[int] = Form(None),
                  header_row: Optional[int] = Form(None), current_user=Depends(get_current_user)):
    _admin(current_user)
    kind = _kind(kind)
    content = await _read(file)
    try:
        sheets, si, hi, body, columns, _ = _load(kind, content, file.filename or "", None, sheet_index, header_row)
    except ValueError as e:
        raise HTTPException(400, str(e))
    data = [r for r in body if any(_cell_text(c) for c in r)]
    return {
        "kind": kind,
        "sheets": [n for n, _ in sheets], "sheet_index": si, "header_row": hi + 1, "row_count": len(data),
        "columns": columns,
        "fields": [{"key": k, "label_en": v[0], "label_ar": v[1], "required": v[2]}
                   for k, v in PROFILES[kind]["fields"].items()],
        "preview_rows": [[_cell_text(c) for c in r] for r in data[:8]],
    }


@router.post("/{kind}")
async def run_import(kind: str, file: UploadFile = File(...), mapping: Optional[str] = Form(None),
                     sheet_index: Optional[int] = Form(None), header_row: Optional[int] = Form(None),
                     current_user=Depends(get_current_user), active_branch=Depends(get_active_branch_id)):
    _admin(current_user)
    kind = _kind(kind)
    content = await _read(file)
    try:
        mp = json.loads(mapping) if mapping else None
        _, _, hi, body, _, col_field = _load(kind, content, file.filename or "", mp, sheet_index, header_row)
    except (ValueError, json.JSONDecodeError) as e:
        raise HTTPException(400, str(e))
    missing = [k for k, v in PROFILES[kind]["fields"].items() if v[2] and k not in col_field.values()]
    if missing:
        labels = ", ".join(PROFILES[kind]["fields"][k][1] for k in missing)
        raise HTTPException(400, f"Choose the column for: {labels}")
    recs: list[tuple[int, dict]] = []
    for n, r in enumerate(body):
        if not any(_cell_text(c) for c in r):
            continue
        rec = {f: r[ci] for ci, f in col_field.items() if ci < len(r) and r[ci] not in (None, "")}
        recs.append((hi + 2 + n, rec))

    branch_id = active_branch if active_branch is not None else current_user.get("branch_id")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        if kind == "customers":
            res = _import_customers(cur, recs, branch_id, current_user.get("user_id"))
        elif kind == "suppliers":
            res = _import_suppliers(cur, recs)
        else:
            if not branch_id:
                raise HTTPException(400, "Choose a branch first")
            res = _import_purchases(cur, recs, int(branch_id), current_user.get("user_id"))
        conn.commit()
        res["errors"] = res["errors"][:200]
        res["rows"] = len(recs)
        return res
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, f"Import failed: {e}")
    finally:
        conn.close()
