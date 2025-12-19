import tkinter as tk
from tkinter import ttk, messagebox
import customtkinter as ctk
import ui_base  # تفعيل الثيم
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
    """شاشة تفاصيل فاتورة – UI مطور بدون لمس الـ Logic"""

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
    # نافذة العرض
    # -------------------------
    win = tk.Toplevel(app)
    win.title(f"تفاصيل الفاتورة رقم {inv_id}")
    win.geometry("1100x650")
    win.configure(bg="#f5f7fa")

    # -------------------------
    # Header (بيانات الفاتورة)
    # -------------------------
    header = ctk.CTkFrame(win)
    header.pack(fill="x", padx=20, pady=20)

    def add_row(lbl, val):
        row = ctk.CTkFrame(header, fg_color="transparent")
        row.pack(anchor="e", pady=4)

        tk.Label(
            row,
            text=f"{lbl}: ",
            font=("Cairo", 13, "bold"),
            bg=win["bg"],
        ).pack(side="right")

        tk.Label(
            row,
            text=str(val),
            font=("Cairo", 13),
            bg=win["bg"],
        ).pack(side="right")

    add_row("رقم الفاتورة", inv_id)
    add_row("التاريخ", nice_format_date(inv_date))
    add_row("النوع", inv_type)
    add_row("العميل", f"{fname} {lname}".strip())
    add_row("الهاتف", phone if phone else "-")
    add_row("شركة التأمين", ins_comp if ins_comp else "-")
    add_row("إجمالي المشتريات", f"{total:.2f}")
    add_row("إجمالي الخصم", f"{disc:.2f}")
    add_row("الصافي", f"{net:.2f}")
    add_row("رسوم التوصيل", f"{delivery:.2f}")

    # -------------------------
    # جدول الأصناف (سيبناه ttk)
    # -------------------------
    cols = ("code", "name", "unit", "qty", "up", "total", "disc", "net")
    tv = ttk.Treeview(win, columns=cols, show="headings", height=15)
    tv.pack(fill="both", expand=True, padx=20, pady=10)

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
    # أزرار أسفل الشاشة
    # -------------------------
    btn_frame = ctk.CTkFrame(win)
    btn_frame.pack(pady=15)

    ctk.CTkButton(
        btn_frame,
        text="🖨 طباعة الفاتورة",
        command=lambda: app.generate_pdf(inv_id),
        width=160,
    ).pack(side="right", padx=8)

    ctk.CTkButton(
        btn_frame,
        text="↩ مرتجع جزئي",
        command=lambda: messagebox.showinfo(
            "قريبًا", "سيتم تفعيل المرتجع الجزئي مع هذا الشكل"
        ),
        width=160,
    ).pack(side="right", padx=8)

    ctk.CTkButton(
        btn_frame,
        text="إغلاق",
        fg_color="#9ca3af",
        hover_color="#6b7280",
        command=win.destroy,
        width=120,
    ).pack(side="right", padx=8)

    apply_arabic_font(win)
