# ui_font_fix.py
import tkinter as tk

ARABIC_FONT = ("Cairo", 13)

def apply_arabic_font(widget):
    """
    يضبط خط أي Widget عربي تلقائيًا.
    """
    try:
        widget.configure(font=ARABIC_FONT)
    except:
        pass

    # لو فيه أبناء (في الفريمات مثلاً)
    for child in widget.winfo_children():
        apply_arabic_font(child)
