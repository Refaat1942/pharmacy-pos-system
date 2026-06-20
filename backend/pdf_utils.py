"""PDF document generation for insurance claims and payment requests."""
from __future__ import annotations

from io import BytesIO
from typing import Iterable, Optional

from fastapi.responses import StreamingResponse


def _safe(v) -> str:
    if v is None:
        return ""
    return str(v)


def pdf_response(pdf_bytes: bytes, filename: str) -> StreamingResponse:
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def build_claim_pdf(
    *,
    pharmacy_name: str,
    pharmacy_address: str,
    tax_id: str,
    branch_name: str,
    claim: dict,
    company_name: str,
    plan_name: str,
    invoices: list[dict],
    language: str = "bilingual",
) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    buf = BytesIO()
    w, h = A4
    c = canvas.Canvas(buf, pagesize=A4)
    y = h - 20 * mm

    def line(text: str, size: int = 10, bold: bool = False):
        nonlocal y
        if y < 25 * mm:
            c.showPage()
            y = h - 20 * mm
        c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
        c.drawString(20 * mm, y, _safe(text)[:110])
        y -= size * 0.5 * mm + 3 * mm

    def row(cols: Iterable[str], bold: bool = False):
        nonlocal y
        if y < 20 * mm:
            c.showPage()
            y = h - 20 * mm
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 8)
        x = 20 * mm
        widths = [35 * mm, 28 * mm, 55 * mm, 25 * mm, 25 * mm]
        for i, col in enumerate(cols):
            c.drawString(x, y, _safe(col)[:28])
            x += widths[i] if i < len(widths) else 25 * mm
        y -= 5 * mm

    title_en = "Insurance Claim Statement"
    title_ar = "كشف مطالبة تأمين"
    if language in ("ar", "bilingual"):
        line(title_ar if language == "ar" else f"{title_en} / {title_ar}", 14, True)
    else:
        line(title_en, 14, True)

    line(pharmacy_name, 11, True)
    if pharmacy_address:
        line(pharmacy_address, 9)
    if tax_id:
        line(f"Tax ID: {tax_id}", 9)
    if branch_name:
        line(f"Branch: {branch_name}", 9)
    y -= 2 * mm

    line(f"Claim #: {claim.get('claim_number', '')}", 10, True)
    line(f"Company: {company_name}", 10)
    if plan_name:
        line(f"Plan: {plan_name}", 10)
    line(f"Period: {claim.get('period_from', '')} — {claim.get('period_to', '')}", 9)
    line(f"Status: {claim.get('status', '')}", 9)
    y -= 3 * mm

    line("Summary / الملخص", 10, True)
    line(f"Receipts: {claim.get('receipt_count', 0)}", 9)
    line(f"Total sales: {float(claim.get('total_sales') or 0):,.2f} EGP", 9)
    line(f"Covered amount: {float(claim.get('covered_amount') or 0):,.2f} EGP", 9, True)
    line(f"Net claim: {float(claim.get('net_claim_amount') or 0):,.2f} EGP", 10, True)
    y -= 4 * mm

    line("Invoice details / تفاصيل الفواتير", 10, True)
    row(["Invoice", "Date", "Patient", "Covered", "Patient paid"], bold=True)
    c.setStrokeColor(colors.grey)
    c.line(20 * mm, y + 2 * mm, w - 20 * mm, y + 2 * mm)
    y -= 2 * mm

    for inv in invoices:
        snap = inv.get("insurance_snapshot") or {}
        totals = inv.get("insurance_totals") or {}
        row([
            inv.get("invoice_number", ""),
            str(inv.get("created_at", ""))[:10],
            inv.get("customer_name") or snap.get("patient_name", ""),
            f"{float(totals.get('insurance_covered') or 0):.2f}",
            f"{float(totals.get('final_patient_paid') or 0):.2f}",
        ])

    c.save()
    buf.seek(0)
    return buf.read()


def build_payment_request_pdf(
    *,
    pharmacy_name: str,
    pharmacy_address: str,
    tax_id: str,
    branch_name: str,
    claim: dict,
    company_name: str,
    language: str = "bilingual",
) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    buf = BytesIO()
    w, h = A4
    c = canvas.Canvas(buf, pagesize=A4)
    y = h - 25 * mm

    def line(text: str, size: int = 10, bold: bool = False):
        nonlocal y
        c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
        c.drawString(25 * mm, y, _safe(text)[:100])
        y -= 7 * mm

    if language in ("ar", "bilingual"):
        line("طلب صرف / Payment Request", 14, True)
    else:
        line("Payment Request", 14, True)

    line(f"To: {company_name}", 11, True)
    line(f"From: {pharmacy_name}", 11)
    if branch_name:
        line(f"Branch: {branch_name}", 10)
    if pharmacy_address:
        line(pharmacy_address, 9)
    if tax_id:
        line(f"Tax ID: {tax_id}", 9)
    y -= 5 * mm

    line(f"Claim reference: {claim.get('claim_number', '')}", 10)
    line(f"Claim period: {claim.get('period_from', '')} to {claim.get('period_to', '')}", 10)
    line(f"Number of receipts: {claim.get('receipt_count', 0)}", 10)
    line(f"Total covered amount: {float(claim.get('covered_amount') or 0):,.2f} EGP", 11, True)
    line(f"Net amount due: {float(claim.get('net_claim_amount') or 0):,.2f} EGP", 12, True)
    y -= 8 * mm
    line("Please process payment for the above claim at your earliest convenience.", 9)
    line("يرجى صرف المبلغ المستحق للمطالبة أعلاه.", 9)

    c.save()
    buf.seek(0)
    return buf.read()
