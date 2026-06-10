#!/usr/bin/env python3
"""Generate Arabic pricing poster for Fratelanza PharmaPOS."""
from pathlib import Path

import arabic_reshaper
from bidi.algorithm import get_display
from PIL import Image, ImageDraw, ImageFont

OUT = Path("/opt/cursor/artifacts/marketing")
OUT.mkdir(parents=True, exist_ok=True)

FONT_BOLD = "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf"
FONT_EN = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

_config = {"delete_harakat": False, "support_ligatures": True}
_reshaper = arabic_reshaper.ArabicReshaper(configuration=_config)


def ar(text: str) -> str:
    return get_display(_reshaper.reshape(text))


def font(path: str, size: int):
    return ImageFont.truetype(path, size)


def text_width(draw, shaped: str, fnt) -> float:
    return draw.textbbox((0, 0), shaped, font=fnt)[2]


def wrap_ar(draw, text: str, fnt, max_w: int) -> list[str]:
    words = text.split()
    lines, cur = [], ""
    for w in words:
        test = f"{cur} {w}".strip()
        if text_width(draw, ar(test), fnt) <= max_w:
            cur = test
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def draw_rtl_block(draw, x_right, y, text, fnt, fill, max_w=None, align_center=False):
    lines = [text] if max_w is None else wrap_ar(draw, text, fnt, max_w)
    lh = int(fnt.size * 1.55)
    for line in lines:
        shaped = ar(line)
        if align_center:
            draw.text((W // 2, y), shaped, font=fnt, fill=fill, anchor="mt")
        else:
            draw.text((x_right, y), shaped, font=fnt, fill=fill, anchor="ra")
        y += lh
    return y


def rounded_rect(draw, xy, r, fill, outline=None, width=0):
    draw.rounded_rectangle(xy, radius=r, fill=fill, outline=outline, width=width)


def main():
    global W, H
    W, H = 1080, 1920
    img = Image.new("RGB", (W, H), "#0B1F2A")
    draw = ImageDraw.Draw(img)

    # gradient bands
    for i in range(H):
        t = i / H
        c = (
            int(11 + 8 * t),
            int(31 + 20 * t),
            int(42 + 18 * t),
        )
        draw.line([(0, i), (W, i)], fill=c)

    # top accent
    rounded_rect(draw, (40, 40, W - 40, 200), 24, "#10B981")
    draw.text((60, 62), "FRATELANZA ERP", font=font(FONT_EN, 28), fill="#D1FAE5")
    y = draw_rtl_block(draw, W - 60, 95, "نظام إدارة الصيدليات الذكي", font(FONT_BOLD, 44), "#FFFFFF", align_center=False)
    draw.text((60, 155), "PharmaPOS v2", font=font(FONT_EN, 22), fill="#ECFDF5")

    # hook
    y = 240
    y = draw_rtl_block(
        draw, W - 60, y,
        "بيع أسرع - مخزون تحت السيطرة - فروع متصلة في نظام واحد",
        font(FONT_BOLD, 34), "#6EE7B7", max_w=W - 120, align_center=True,
    )
    y = draw_rtl_block(
        draw, W - 60, y + 10,
        "صُمّم للصيدليات المصرية — عربي بالكامل مع دعم الإنجليزية",
        font(FONT_REG, 26), "#A7F3D0", max_w=W - 120, align_center=True,
    )

    # features box
    y = 400
    rounded_rect(draw, (50, y, W - 50, y + 520), 20, "#132F3D", outline="#1F6F5C", width=2)
    fy = y + 28
    fy = draw_rtl_block(draw, W - 80, fy, "مميزات تجذب عملاءك وتريح فريقك", font(FONT_BOLD, 30), "#34D399", align_center=True)
    features = [
        "نقطة بيع POS مع مسح باركود ذكي وإيصال حراري احترافي",
        "مخزون، فروع، صلاحية، أوامر شراء واستلام بضاعة",
        "طباعة ملصقات باركود حرارية 38مم (Xprinter)",
        "مكافآت الموردين (10+2) وتسعير تلقائي عند الاستلام",
        "توصيل، عملاء، عيادات، صندوق وشيفتات",
        "تقارير، تنبيهات نقص المخزون، ولوحة تحكم",
        "جاهز للسحابة — خطة العمل دون إنترنت قيد التطوير",
    ]
    fy += 16
    for feat in features:
        draw.ellipse((80, fy + 10, 96, fy + 26), fill="#10B981")
        fy = draw_rtl_block(draw, W - 110, fy, feat, font(FONT_REG, 24), "#E2E8F0", max_w=W - 200)

    # pricing
    py = 960
    draw_rtl_block(draw, W - 60, py, "اختر الباقة المناسبة لصيدليتك", font(FONT_BOLD, 36), "#FFFFFF", align_center=True)

    plans = [
        ("الاشتراك الشهري", "3,500", "ج.م / شهر", "مرونة كاملة - دعم فني - تحديثات مستمرة", "#0EA5E9", None),
        ("الاشتراك السنوي", "35,000", "ج.م / سنة", "وفر شهرين - أولوية دعم - تدريب مجاني", "#10B981", "الأكثر طلباً"),
        ("ترخيص دائم", "90,000", "ج.م مرة واحدة", "ملكية كاملة - دعم سنة - تخصيص حسب الفرع", "#8B5CF6", None),
    ]

    card_y = 1040
    card_h = 260
    gap = 24
    for i, plan in enumerate(plans):
        badge = plan[5] if len(plan) > 5 else None
        color = plan[4]
        cy = card_y + i * (card_h + gap)
        rounded_rect(draw, (55, cy, W - 55, cy + card_h), 18, "#0F2A36", outline=color, width=3)
        if badge:
            rounded_rect(draw, (W - 280, cy - 18, W - 70, cy + 22), 12, color)
            draw_rtl_block(draw, W - 90, cy - 6, badge, font(FONT_BOLD, 20), "#FFFFFF", align_center=False)
        ty = cy + 28
        ty = draw_rtl_block(draw, W - 80, ty, plan[0], font(FONT_BOLD, 30), color)
        draw.text((80, ty + 8), plan[1], font=font(FONT_EN, 52), fill="#FFFFFF")
        draw_rtl_block(draw, W - 80, ty + 10, plan[2], font(FONT_REG, 26), "#CBD5E1")
        draw_rtl_block(draw, W - 80, ty + 58, plan[3], font(FONT_REG, 22), "#94A3B8", max_w=W - 160)

    # CTA
    cta_y = 1780
    rounded_rect(draw, (80, cta_y, W - 80, cta_y + 100), 20, "#10B981")
    draw_rtl_block(draw, W - 100, cta_y + 18, "ابدأ تجربتك المجانية اليوم — تواصل معنا", font(FONT_BOLD, 32), "#052E1B", align_center=True)
    draw_rtl_block(draw, W - 100, cta_y + 58, "erp.fratelanza.com - واتساب للاستفسار والعرض التوضيحي", font(FONT_REG, 22), "#064E3B", align_center=True)

    out = OUT / "fratelanza-pricing-poster-ar.png"
    img.save(out, "PNG", optimize=True)
    print(out)


if __name__ == "__main__":
    main()
