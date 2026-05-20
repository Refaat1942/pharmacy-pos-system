import os
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import arabic_reshaper
from bidi.algorithm import get_display
from db import get_connection


def generate_pdf(app, invoice_id):
    if not os.path.exists("receipts"):
        os.makedirs("receipts")

    pdfmetrics.registerFont(TTFont("Cairo", "Cairo-Regular.ttf"))

    file_path = f"receipts/invoice_{invoice_id}.pdf"
    c = canvas.Canvas(file_path)
    c.setFont("Cairo", 12)

    def ar(txt, x, y):
        c.drawRightString(x, y, get_display(arabic_reshaper.reshape(txt)))

    ar(app.shop_name, 560, 820)
    ar(app.shop_address, 560, 800)
    ar(f"موبايل: {app.shop_phone}", 560, 780)

    c.save()
    return file_path
