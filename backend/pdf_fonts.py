"""Register fonts for bilingual PDF documents (Arabic + English)."""
from __future__ import annotations

import os
from pathlib import Path

_REGISTERED = False
ARABIC_FONT = "Helvetica"
ARABIC_FONT_BOLD = "Helvetica-Bold"


def _try_register(name: str, path: str) -> bool:
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    if not os.path.isfile(path):
        return False
    try:
        pdfmetrics.registerFont(TTFont(name, path))
        return True
    except Exception:
        return False


def ensure_pdf_fonts() -> tuple[str, str]:
    """Register Arabic-capable fonts once; return (regular, bold) font names."""
    global _REGISTERED, ARABIC_FONT, ARABIC_FONT_BOLD
    if _REGISTERED:
        return ARABIC_FONT, ARABIC_FONT_BOLD

    base = Path(__file__).resolve().parent
    candidates = [
        (base / "fonts" / "NotoNaskhArabic-Regular.ttf", base / "fonts" / "NotoNaskhArabic-Bold.ttf"),
        (Path("C:/Windows/Fonts/tahoma.ttf"), Path("C:/Windows/Fonts/tahomabd.ttf")),
        (Path("C:/Windows/Fonts/segoeui.ttf"), Path("C:/Windows/Fonts/segoeuib.ttf")),
        (Path("/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf"),
         Path("/usr/share/fonts/truetype/noto/NotoNaskhArabic-Bold.ttf")),
        (Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
         Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")),
    ]
    for reg, bold in candidates:
        if _try_register("DocRegular", str(reg)):
            ARABIC_FONT = "DocRegular"
            if bold and _try_register("DocBold", str(bold)):
                ARABIC_FONT_BOLD = "DocBold"
            else:
                ARABIC_FONT_BOLD = "DocRegular"
            _REGISTERED = True
            return ARABIC_FONT, ARABIC_FONT_BOLD

    _REGISTERED = True
    return ARABIC_FONT, ARABIC_FONT_BOLD


def shape_ar(text: str) -> str:
    """Reshape Arabic for PDF rendering when bidi libs are available."""
    if not text:
        return ""
    try:
        import arabic_reshaper
        from bidi.algorithm import get_display

        return get_display(arabic_reshaper.reshape(text))
    except Exception:
        return text
