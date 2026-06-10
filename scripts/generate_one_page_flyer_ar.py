#!/usr/bin/env python3
"""One-page Arabic marketing flyer: logo, features, pricing, contact."""
from __future__ import annotations

from pathlib import Path

import arabic_reshaper
from bidi.algorithm import get_display
from PIL import Image, ImageDraw, ImageFont

# ── Edit contact before regenerating ──
WHATSAPP_DISPLAY = "01000000000"  # your WhatsApp number
WEBSITE = "erp.fratelanza.com"

OUT_DIR = Path("/opt/cursor/artifacts/marketing")
OUT_DIR.mkdir(parents=True, exist_ok=True)

W, H = 1240, 1754  # A4 @ ~150 DPI

FONT_BOLD = "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf"
FONT_EN_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_EN = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

_reshaper = arabic_reshaper.ArabicReshaper(
    configuration={"delete_harakat": False, "support_ligatures": True}
)


def ar(text: str) -> str:
    return get_display(_reshaper.reshape(text))


def fnt(path: str, size: int):
    return ImageFont.truetype(path, size)


def tw(draw, text: str, font) -> float:
    return draw.textbbox((0, 0), text, font=font)[2]


def wrap(draw, text: str, font, max_w: int) -> list[str]:
    words = text.split()
    lines, cur = [], ""
    for w in words:
        t = f"{cur} {w}".strip()
        if tw(draw, ar(t), font) <= max_w:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def rtl(draw, x_r, y, text, font, fill, max_w=None, center=False):
    lines = [text] if not max_w else wrap(draw, text, font, max_w)
    lh = int(font.size * 1.4)
    for line in lines:
        s = ar(line)
        if center:
            draw.text((W // 2, y), s, font=font, fill=fill, anchor="mt")
        else:
            draw.text((x_r, y), s, font=font, fill=fill, anchor="ra")
        y += lh
    return y


def bullet_col(draw, x_r, y, items: list[str], font, color="#E2E8F0", max_w=520):
    for item in items:
        draw.ellipse((x_r - max_w - 28, y + 8, x_r - max_w - 10, y + 26), fill="#10B981")
        y = rtl(draw, x_r, y, item, font, color, max_w=max_w)
        y += 4
    return y


def rounded(draw, box, r, fill, outline=None, w=0):
    draw.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=w)


def draw_logo_mark(draw, cx, cy, size=56):
    """Simple pharmacy cross mark when no logo file."""
    rounded(draw, (cx - size, cy - size // 2, cx + size, cy + size // 2 + 20), 16, "#FFFFFF")
    arm = size // 3
    rounded(draw, (cx - arm // 2, cy - size // 2 + 8, cx + arm // 2, cy + size // 2 + 12), 4, "#10B981")
    rounded(draw, (cx - arm // 2, cy - arm // 2 + 4, cx + arm // 2, cy + arm // 2 + 20), 4, "#10B981")


def main():
    img = Image.new("RGB", (W, H), "#0A1F28")
    draw = ImageDraw.Draw(img)

    for i in range(H):
        t = i / H
        draw.line([(0, i), (W, i)], fill=(int(10 + 12 * t), int(31 + 18 * t), int(40 + 14 * t)))

    # Header
    rounded(draw, (36, 36, W - 36, 200), 22, "#10B981")
    draw_logo_mark(draw, 100, 95, 48)
    draw.text((165, 58), "FRATELANZA ERP", font=fnt(FONT_EN_B, 30), fill="#ECFDF5")
    draw.text((165, 98), "PharmaPOS v2", font=fnt(FONT_EN, 20), fill="#D1FAE5")
    rtl(draw, W - 56, 72, "نظام صيدليات متكامل", fnt(FONT_BOLD, 38), "#FFFFFF")
    rtl(draw, W - 56, 128, "نقطة بيع - مخزون - مشتريات - تقارير", fnt(FONT_REG, 22), "#ECFDF5")

    y = 228
    y = rtl(
        draw, W // 2, y,
        "امسح - بِع - اطبع - والمخزون يتحدّث لوحده",
        fnt(FONT_BOLD, 32), "#6EE7B7", center=True,
    )

    # Features
    rounded(draw, (40, 290, W - 40, 1020), 18, "#122A35", outline="#1F6F5C", w=2)
    rtl(draw, W // 2, 318, "لماذا صيدليات مصر تختارنا؟", fnt(FONT_BOLD, 28), "#34D399", center=True)

    left = [
        "مسح باركود ذكي (فروع وتغليف وGTIN)",
        "خصم على الصنف والفاتورة (ج.م أو %)",
        "نقدي وفيزا ومختلط وانستا باي وفودافون",
        "بيع آجل على حساب العميل",
        "توصيل وطلبات رقمية من نفس الشاشة",
    ]
    right = [
        "إيصال حراري عريض باسم صيدليتك",
        "وردية درج نقدية وتقارير X/Z",
        "روشتات العيادات إلى السلة بنقرة",
        "ملصقات باركود 38مم بعد الشراء",
        "فروع متعددة - عربي وإنجليزي - سحابة",
    ]
    bullet_col(draw, W // 2 - 30, 375, left, fnt(FONT_REG, 21), max_w=500)
    bullet_col(draw, W - 60, 375, right, fnt(FONT_REG, 21), max_w=500)

    # Pricing
    rtl(draw, W // 2, 1055, "باقات الأسعار", fnt(FONT_BOLD, 30), "#FFFFFF", center=True)
    plans = [
        ("شهري", "3,500", "ج.م/شهر", "#0EA5E9", None),
        ("سنوي", "35,000", "ج.م/سنة", "#10B981", "الأكثر طلباً"),
        ("ترخيص", "90,000", "ج.م", "#8B5CF6", "دائم"),
    ]
    pw = (W - 120 - 40) // 3
    for i, (title, price, unit, color, badge) in enumerate(plans):
        x1 = 60 + i * (pw + 20)
        x2 = x1 + pw
        rounded(draw, (x1, 1105, x2, 1385), 14, "#0F2A36", outline=color, w=3)
        if badge:
            rounded(draw, (x2 - 130, 1090, x2 - 10, 1125), 8, color)
            rtl(draw, x2 - 20, 1095, badge, fnt(FONT_BOLD, 16), "#FFF")
        rtl(draw, x2 - 20, 1135, title, fnt(FONT_BOLD, 26), color)
        draw.text((x1 + 24, 1185), price, font=fnt(FONT_EN_B, 44), fill="#FFFFFF")
        rtl(draw, x2 - 20, 1245, unit, fnt(FONT_REG, 20), "#94A3B8")

    # CTA
    rounded(draw, (50, 1420, W - 50, 1700), 20, "#10B981")
    rtl(draw, W // 2, 1455, "عرض تجريبي مجاني - ابدأ اليوم", fnt(FONT_BOLD, 34), "#052E1B", center=True)
    draw.text((W // 2, 1520), WEBSITE, font=fnt(FONT_EN_B, 28), fill="#064E3B", anchor="mt")
    wa = f"واتساب: {WHATSAPP_DISPLAY}"
    rtl(draw, W // 2, 1575, wa, fnt(FONT_BOLD, 26), "#052E1B", center=True)
    rtl(
        draw, W // 2, 1625,
        "نقطة بيع - مسح ذكي - مخزون - صلاحية - مشتريات - تقارير",
        fnt(FONT_REG, 20), "#047857", center=True,
    )

    png = OUT_DIR / "fratelanza-one-page-flyer-ar.png"
    img.save(png, "PNG", optimize=True)

    pdf = OUT_DIR / "fratelanza-one-page-flyer-ar.pdf"
    try:
        import img2pdf
        with open(pdf, "wb") as f:
            f.write(img2pdf.convert(str(png)))
        print(pdf)
    except ImportError:
        pdf = None

    repo = Path("/workspace/docs/marketing")
    repo.mkdir(parents=True, exist_ok=True)
    import shutil
    shutil.copy(png, repo / png.name)
    if pdf and pdf.exists():
        shutil.copy(pdf, repo / pdf.name)

    print(png)
    if not pdf:
        print("Install img2pdf for PDF: pip install img2pdf")


if __name__ == "__main__":
    main()
