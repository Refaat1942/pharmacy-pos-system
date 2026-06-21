"""Professional bilingual PDF documents for insurance claims and payment requests."""
from __future__ import annotations

from datetime import date, datetime
from io import BytesIO
from typing import Iterable, Optional

from fastapi.responses import StreamingResponse

from pdf_fonts import ensure_pdf_fonts, shape_ar


def _safe(v) -> str:
    if v is None:
        return ""
    return str(v)


def _fmt_money(v) -> str:
    try:
        return f"{float(v or 0):,.2f}"
    except (TypeError, ValueError):
        return "0.00"


def _fmt_date(v) -> str:
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, date):
        return v.isoformat()
    return str(v)[:10]


def pdf_response(pdf_bytes: bytes, filename: str) -> StreamingResponse:
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class _InsuranceDoc:
    """Shared layout: bordered pages, bilingual letterhead, styled tables."""

    MARGIN = 18
    ACCENT = (0.05, 0.45, 0.38)
    LIGHT = (0.93, 0.97, 0.95)
    BORDER = (0.75, 0.78, 0.80)

    def __init__(self, *, language: str = "bilingual"):
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.pdfgen import canvas

        self.language = language
        self.reg, self.bold = ensure_pdf_fonts()
        self.mm = mm
        self.buf = BytesIO()
        self.w, self.h = A4
        self.c = canvas.Canvas(self.buf, pagesize=A4)
        self.y = self.h - self.MARGIN * mm
        self.page = 1

    def _bilingual(self, en: str, ar: str) -> str:
        if self.language == "ar":
            return shape_ar(ar)
        if self.language == "en":
            return en
        return f"{en}  |  {shape_ar(ar)}"

    def _draw_page_frame(self):
        c = self.c
        m = self.MARGIN * self.mm
        c.setStrokeColorRGB(*self.BORDER)
        c.setLineWidth(1.2)
        c.rect(m, m, self.w - 2 * m, self.h - 2 * m, stroke=1, fill=0)
        c.setLineWidth(0.5)
        c.rect(m + 3 * self.mm, m + 3 * self.mm, self.w - 2 * m - 6 * self.mm, self.h - 2 * m - 6 * self.mm, stroke=1, fill=0)
        c.setFont(self.reg, 8)
        c.setFillColorRGB(0.45, 0.45, 0.45)
        c.drawCentredString(self.w / 2, m + 5 * self.mm, f"— {self.page} —")
        self.page += 1

    def _new_page_if_needed(self, need_mm: float = 30):
        if self.y < (self.MARGIN + need_mm) * self.mm:
            self._draw_page_frame()
            self.c.showPage()
            self.y = self.h - self.MARGIN * self.mm
            self._draw_page_frame()

    def letterhead(
        self,
        *,
        pharmacy_name_en: str,
        pharmacy_name_ar: str,
        pharmacy_address_en: str,
        pharmacy_address_ar: str,
        tax_id: str,
        branch_name: str,
        doc_title_en: str,
        doc_title_ar: str,
    ):
        c = self.c
        m = self.MARGIN * self.mm
        self._draw_page_frame()

        c.setFillColorRGB(*self.ACCENT)
        c.rect(m + 4 * self.mm, self.y - 2 * self.mm, self.w - 2 * m - 8 * self.mm, 14 * self.mm, stroke=0, fill=1)
        c.setFillColorRGB(1, 1, 1)
        c.setFont(self.bold, 13)
        c.drawString(m + 8 * self.mm, self.y + 2 * self.mm, _safe(pharmacy_name_en)[:60])
        if pharmacy_name_ar:
            c.setFont(self.bold, 12)
            c.drawRightString(self.w - m - 8 * self.mm, self.y + 2 * self.mm, shape_ar(pharmacy_name_ar)[:50])
        self.y -= 18 * self.mm

        c.setFillColorRGB(0.15, 0.15, 0.15)
        c.setFont(self.reg, 9)
        if pharmacy_address_en:
            c.drawString(m + 8 * self.mm, self.y, _safe(pharmacy_address_en)[:90])
            self.y -= 5 * self.mm
        if pharmacy_address_ar and self.language != "en":
            c.drawRightString(self.w - m - 8 * self.mm, self.y + 5 * self.mm, shape_ar(pharmacy_address_ar)[:70])
        meta = []
        if tax_id:
            meta.append(self._bilingual(f"Tax ID: {tax_id}", f"الرقم الضريبي: {tax_id}"))
        if branch_name:
            meta.append(self._bilingual(f"Branch: {branch_name}", f"الفرع: {branch_name}"))
        for line in meta:
            c.drawString(m + 8 * self.mm, self.y, line[:100])
            self.y -= 5 * self.mm
        self.y -= 4 * self.mm

        c.setFillColorRGB(*self.ACCENT)
        c.setFont(self.bold, 15)
        c.drawCentredString(self.w / 2, self.y, self._bilingual(doc_title_en, doc_title_ar))
        self.y -= 10 * self.mm

    def section_title(self, en: str, ar: str):
        self._new_page_if_needed(20)
        c = self.c
        m = self.MARGIN * self.mm
        c.setFillColorRGB(*self.LIGHT)
        c.rect(m + 6 * self.mm, self.y - 1 * self.mm, self.w - 2 * m - 12 * self.mm, 8 * self.mm, stroke=0, fill=1)
        c.setFillColorRGB(*self.ACCENT)
        c.setFont(self.bold, 10)
        c.drawString(m + 10 * self.mm, self.y + 1 * self.mm, self._bilingual(en, ar))
        self.y -= 11 * self.mm

    def key_value_rows(self, rows: Iterable[tuple[str, str, str]]):
        """Each row: (label_en, label_ar, value)."""
        c = self.c
        m = self.MARGIN * self.mm
        col1 = m + 10 * self.mm
        col2 = self.w / 2 + 5 * self.mm
        for label_en, label_ar, value in rows:
            self._new_page_if_needed(12)
            c.setFont(self.reg, 9)
            c.setFillColorRGB(0.35, 0.35, 0.35)
            c.drawString(col1, self.y, self._bilingual(label_en, label_ar)[:45])
            c.setFillColorRGB(0.1, 0.1, 0.1)
            c.setFont(self.bold, 9)
            c.drawString(col2, self.y, _safe(value)[:40])
            self.y -= 6 * self.mm

    def table(self, headers: list[tuple[str, str]], rows: list[list[str]], col_widths_mm: list[float]):
        from reportlab.lib import colors
        from reportlab.platypus import Table, TableStyle

        self._new_page_if_needed(25)
        m = self.MARGIN * self.mm
        header_cells = [self._bilingual(en, ar) for en, ar in headers]
        data = [header_cells] + [[_safe(c) for c in row] for row in rows]
        widths = [w * self.mm for w in col_widths_mm]
        table = Table(data, colWidths=widths, repeatRows=1)
        table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.Color(*self.ACCENT)),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), self.bold),
                ("FONTSIZE", (0, 0), (-1, 0), 8),
                ("FONTNAME", (0, 1), (-1, -1), self.reg),
                ("FONTSIZE", (0, 1), (-1, -1), 8),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.Color(*self.LIGHT)]),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.Color(*self.BORDER)),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ])
        )
        tw, th = table.wrap(self.w - 2 * m - 16 * self.mm, self.y)
        if self.y - th < (self.MARGIN + 15) * self.mm:
            self._draw_page_frame()
            self.c.showPage()
            self.y = self.h - self.MARGIN * self.mm
            self._draw_page_frame()
        table.drawOn(self.c, m + 8 * self.mm, self.y - th)
        self.y -= th + 6 * self.mm

    def paragraph(self, en: str, ar: str, size: int = 9):
        self._new_page_if_needed(15)
        c = self.c
        m = self.MARGIN * self.mm
        c.setFont(self.reg, size)
        c.setFillColorRGB(0.2, 0.2, 0.2)
        text = self._bilingual(en, ar)
        c.drawString(m + 10 * self.mm, self.y, text[:110])
        self.y -= 7 * self.mm

    def finish(self) -> bytes:
        self.c.save()
        self.buf.seek(0)
        return self.buf.read()


def build_claim_pdf(
    *,
    pharmacy_name: str,
    pharmacy_name_ar: str = "",
    pharmacy_address: str,
    pharmacy_address_ar: str = "",
    tax_id: str,
    branch_name: str,
    claim: dict,
    company_name: str,
    plan_name: str,
    invoices: list[dict],
    language: str = "bilingual",
) -> bytes:
    doc = _InsuranceDoc(language=language)
    doc.letterhead(
        pharmacy_name_en=pharmacy_name,
        pharmacy_name_ar=pharmacy_name_ar or pharmacy_name,
        pharmacy_address_en=pharmacy_address,
        pharmacy_address_ar=pharmacy_address_ar or pharmacy_address,
        tax_id=tax_id,
        branch_name=branch_name,
        doc_title_en="Insurance Claim Statement",
        doc_title_ar="كشف مطالبة تأمين",
    )

    doc.section_title("Claim information", "بيانات المطالبة")
    doc.key_value_rows([
        ("Claim number", "رقم المطالبة", claim.get("claim_number", "")),
        ("Insurance company", "شركة التأمين", company_name),
        ("Plan", "الخطة", plan_name or "—"),
        ("Period from", "من تاريخ", _fmt_date(claim.get("period_from"))),
        ("Period to", "إلى تاريخ", _fmt_date(claim.get("period_to"))),
        ("Status", "الحالة", claim.get("status", "")),
    ])

    doc.section_title("Financial summary", "الملخص المالي")
    doc.key_value_rows([
        ("Number of receipts", "عدد الإيصالات", str(claim.get("receipt_count", 0))),
        ("Total sales (EGP)", "إجمالي المبيعات (ج.م)", _fmt_money(claim.get("total_sales"))),
        ("Total discounts (EGP)", "إجمالي الخصومات (ج.م)", _fmt_money(claim.get("total_discounts"))),
        ("Patient share (EGP)", "حصة المريض (ج.م)", _fmt_money(claim.get("patient_share"))),
        ("Covered amount (EGP)", "المبلغ المغطى (ج.م)", _fmt_money(claim.get("covered_amount"))),
        ("Net claim amount (EGP)", "صافي المطالبة (ج.م)", _fmt_money(claim.get("net_claim_amount"))),
    ])

    doc.section_title("Invoice details", "تفاصيل الفواتير")
    table_rows = []
    for inv in invoices:
        snap = inv.get("insurance_snapshot") or {}
        totals = inv.get("insurance_totals") or {}
        patient = (
            inv.get("customer_name")
            or snap.get("patient_name")
            or " ".join(filter(None, [snap.get("patient_first_name"), snap.get("patient_last_name")]))
            or "—"
        )
        table_rows.append([
            inv.get("invoice_number", ""),
            _fmt_date(inv.get("created_at")),
            patient[:28],
            _fmt_money(totals.get("insurance_covered")),
            _fmt_money(totals.get("final_patient_paid")),
        ])

    doc.table(
        [
            ("Invoice", "الفاتورة"),
            ("Date", "التاريخ"),
            ("Patient", "المريض"),
            ("Covered EGP", "المغطى"),
            ("Patient paid EGP", "المريض"),
        ],
        table_rows,
        [32, 22, 48, 24, 24],
    )

    doc.paragraph(
        "This document is issued by the pharmacy for insurance claim submission.",
        "صادر عن الصيدلية لتقديم مطالبة التأمين.",
    )
    return doc.finish()


def build_payment_request_pdf(
    *,
    pharmacy_name: str,
    pharmacy_name_ar: str = "",
    pharmacy_address: str,
    pharmacy_address_ar: str = "",
    tax_id: str,
    branch_name: str,
    claim: dict,
    company_name: str,
    language: str = "bilingual",
) -> bytes:
    doc = _InsuranceDoc(language=language)
    doc.letterhead(
        pharmacy_name_en=pharmacy_name,
        pharmacy_name_ar=pharmacy_name_ar or pharmacy_name,
        pharmacy_address_en=pharmacy_address,
        pharmacy_address_ar=pharmacy_address_ar or pharmacy_address,
        tax_id=tax_id,
        branch_name=branch_name,
        doc_title_en="Insurance Payment Request",
        doc_title_ar="طلب صرف مطالبة تأمين",
    )

    doc.section_title("Payment request", "طلب الصرف")
    doc.key_value_rows([
        ("To / Insurance company", "إلى / شركة التأمين", company_name),
        ("From / Pharmacy", "من / الصيدلية", pharmacy_name),
        ("Claim reference", "مرجع المطالبة", claim.get("claim_number", "")),
        ("Claim period", "فترة المطالبة",
         f"{_fmt_date(claim.get('period_from'))} — {_fmt_date(claim.get('period_to'))}"),
        ("Number of receipts", "عدد الإيصالات", str(claim.get("receipt_count", 0))),
        ("Total covered (EGP)", "إجمالي المغطى (ج.م)", _fmt_money(claim.get("covered_amount"))),
        ("Net amount due (EGP)", "صافي المستحق (ج.م)", _fmt_money(claim.get("net_claim_amount"))),
    ])

    doc.section_title("Request", "الطلب")
    doc.paragraph(
        "Please process payment for the above insurance claim at your earliest convenience.",
        "يرجى صرف المبلغ المستحق للمطالبة التأمينية أعلاه في أقرب وقت ممكن.",
    )
    doc.paragraph(
        f"Pharmacy: {pharmacy_name}" + (f" — {branch_name}" if branch_name else ""),
        f"الصيدلية: {pharmacy_name_ar or pharmacy_name}" + (f" — {branch_name}" if branch_name else ""),
    )
    return doc.finish()
