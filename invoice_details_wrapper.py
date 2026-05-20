import tkinter as tk
from tkinter import ttk, messagebox
import customtkinter as ctk
import ui_base
from ui_font_fix import apply_arabic_font
from datetime import datetime


def nice_format_date(dt):
    """تنسيق التاريخ: 14-11-2025 18:40"""
    try:
        if isinstance(dt, str):
            dt = datetime.fromisoformat(dt.replace(" ", ""))
        return dt.strftime("%d-%m-%Y  %H:%M")
    except:
        return str(dt)


def open_invoice_details(app, invoice_id):
    """شاشة تفاصيل فاتورة – تحديث الشكل فقط"""

    # -------------------------
    # جلب بيانات الفاتورة
    # -------------------------
    from pos_app import get_connection

    db = get_connection()
    cur = db.cursor()
    cur.execute(
        """
        SELECT i.InvoiceID, i.InvoiceDate, i.InvoiceType,
               ISNULL(c.FirstName,''), ISNULL(c.LastName,''),
               ISNULL(c.PhoneNumber,''),
               ISNULL(ic.CompanyName,''),
               i.TotalAmount, i.TotalDiscount, i.NetAmount, i.DeliveryFee
        FROM Invoices i
        LEFT JOIN Customers c ON i.CustomerID = c.CustomerID
        LEFT JOIN insuranceCompanies ic ON i.insuranceCompanyID = ic.CompanyID
        WHERE i.InvoiceID = ?
        """,
        invoice_id,
    )
    inv = cur.fetchone()

    if not inv:
        messagebox.showerror("خطأ", "لم يتم العثور على بيانات الفاتورة.")
        return

    (
        inv_id,
        inv_date,
        inv_type,
        fname,
        lname,
        phone,
        ins_comp,
        total,
        disc,
        net,
        delivery,
    ) = inv

    # -------------------------
    # نافذة العرض (حديثة)
    # -------------------------
    win = ctk.CTkToplevel(app)
    win.title(f"تفاصيل الفاتورة رقم {inv_id}")
    win.geometry("1100x650")
    win.configure(fg_color=ui_base.BG_MAIN)

    # -------------------------
    # كارت بيانات الفاتورة
    # -------------------------
    card = ctk.CTkFrame(
        win,
        fg_color=ui_base.CARD_BG,
        corner_radius=18
    )
    card.pack(fill="x", padx=20, pady=20)

    ctk.CTkLabel(
        card,
        text="تفاصيل الفاتورة",
        font=ui_base.TITLE_FONT,
        text_color=ui_base.TEXT
    ).pack(anchor="e", pady=(10, 15), padx=20)

    def add_row(lbl, val):
        row = ctk.CTkFrame(card, fg_color="transparent")
        row.pack(anchor="e", padx=20, pady=4)

        ctk.CTkLabel(
            row,
            text=f"{lbl}:",
            font=("Cairo", 13, "bold"),
            text_color=ui_base.TEXT
        ).pack(side="right", padx=(0, 6))

        ctk.CTkLabel(
            row,
            text=str(val),
            font=("Cairo", 13),
            text_color=ui_base.TEXT
        ).pack(side="right")

    add_row("رقم الفاتورة", inv_id)
    add_row("التاريخ", nice_format_date(inv_date))
    add_row("النوع", inv_type)
    add_row("العميل", f"{fname} {lname}".strip())
    add_row("الهاتف", phone if phone else "-")
    add_row("شركة التأمين", ins_comp if ins_comp else "-")
    add_row("إجمالي", f"{total:.2f}")
    add_row("خصم", f"{disc:.2f}")
    add_row("الصافي", f"{net:.2f}")
    add_row("التوصيل", f"{delivery:.2f}")

    # -------------------------
    # جدول الأصناف (ttk زي ما هو)
    # -------------------------
    table_frame = ctk.CTkFrame(
        win,
        fg_color=ui_base.CARD_BG,
        corner_radius=18
    )
    table_frame.pack(fill="both", expand=True, padx=20, pady=10)

    cols = ("code", "name", "unit", "qty", "up", "total", "disc", "net")
    tv = ttk.Treeview(table_frame, columns=cols, show="headings", height=14)
    tv.pack(fill="both", expand=True, padx=10, pady=10)

    for c in cols:
        tv.heading(c, text=c)
        tv.column(c, anchor="center", width=110)

    cur.execute(
        """
        SELECT ProductCode, Unit, Quantity, UnitPrice,
               TotalPrice, Discount, NetPrice
        FROM InvoiceItems WHERE InvoiceID=?
        """,
        inv_id,
    )
    rows = cur.fetchall()

    for r in rows:
        try:
            cur.execute(
                "SELECT TOP 1 ItemName FROM ProductUnits WHERE CAST(ItemCode AS VARCHAR(50))=?",
                r[0],
            )
            nm = cur.fetchone()
            name = nm[0] if nm else "?"
        except:
            name = "?"

        tv.insert(
            "",
            "end",
            values=(
                r[0],
                name,
                r[1],
                float(r[2]),
                float(r[3]),
                float(r[4]),
                float(r[5]),
                float(r[6]),
            ),
        )

    db.close()

    # -------------------------
    # أزرار التحكم
    # -------------------------
    btns = ctk.CTkFrame(win, fg_color="transparent")
    btns.pack(pady=15)

    ctk.CTkButton(
        btns,
        text="🖨 طباعة الفاتورة",
        command=lambda: app.generate_pdf(inv_id),
        fg_color=ui_base.PRIMARY,
        font=ui_base.FONT,
        height=40,
        corner_radius=12,
        width=160,
    ).pack(side="right", padx=8)

    ctk.CTkButton(
        btns,
        text="↩ مرتجع جزئي",
        command=lambda: messagebox.showinfo("قريبًا", "سيتم تفعيل المرتجع الجزئي"),
        font=ui_base.FONT,
        height=40,
        corner_radius=12,
        width=160,
    ).pack(side="right", padx=8)

    ctk.CTkButton(
        btns,
        text="إغلاق",
        fg_color="#9ca3af",
        hover_color="#6b7280",
        command=win.destroy,
        height=40,
        corner_radius=12,
        width=120,
    ).pack(side="right", padx=8)

    apply_arabic_font(win)
