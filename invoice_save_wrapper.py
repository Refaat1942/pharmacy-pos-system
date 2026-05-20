from decimal import Decimal
from tkinter import messagebox
from db import get_connection
from datetime import datetime


def extract_ins_company_id(app):
    """
    يرجع رقم شركة التأمين المختارة.
    """
    if app.invoice_type != "insurance":
        return None

    selected = app.cmb_ins.get().strip()
    for comp in app.ins_companies:
        if comp["name"] == selected:
            return comp["id"]

    return None


def _safe_decimal(val, default=Decimal(0)):
    """
    تحويل آمن لأي قيمة لـ Decimal
    """
    try:
        return Decimal(str(val))
    except:
        return default


def safe_save_order(app):
    """
    Wrapper يحمي عملية حفظ الفاتورة
    ومتوافق مع UI بعد الـ refactor
    """

    # ================== Validations ==================
    if not app.emp_code:
        messagebox.showerror("خطأ", "لم يتم اختيار الموظف.")
        return

    if not app.customer_id:
        messagebox.showerror("خطأ", "لم يتم تحميل بيانات العميل.")
        return

    if not app.items:
        messagebox.showerror("خطأ", "لا توجد أصناف داخل الفاتورة.")
        return

    # ================== Totals ==================
    tot = _safe_decimal(app.lbl_total.cget("text"))
    disc = _safe_decimal(app.lbl_disc.cget("text"))
    due = _safe_decimal(app.lbl_due.cget("text"))

    # copay (من Entry)
    if hasattr(app, "entry_copay"):
        cop = _safe_decimal(app.entry_copay.get())
    else:
        cop = Decimal(0)

    # delivery fee (من Entry)
    if hasattr(app, "entry_delivery"):
        dlv = _safe_decimal(app.entry_delivery.get())
    else:
        dlv = Decimal(0)

    insurance_id = extract_ins_company_id(app)

    # ================== Save ==================
    try:
        db = get_connection()
        cur = db.cursor()

        # -------- Invoice Header --------
        cur.execute(
            """
            INSERT INTO dbo.Invoices
              (InvoiceDate, EmployeeCode, InvoiceType,
               TotalAmount, TotalDiscount, NetAmount,
               DeliveryFee, CustomerID, insuranceCompanyID)
            OUTPUT inserted.InvoiceID
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            datetime.now(),
            app.emp_code,
            app.invoice_type,
            float(tot),
            float(disc + cop),
            float(due),
            float(dlv),
            app.customer_id,
            insurance_id,
        )

        inv_id = cur.fetchone()[0]

        # -------- Invoice Items --------
        for it in app.items:
            cur.execute(
                """
                INSERT INTO dbo.InvoiceItems
                (InvoiceID, ProductCode, Unit, Quantity,
                 UnitPrice, TotalPrice, Discount, NetPrice)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                inv_id,
                it["id"],
                it["unit"],
                it["qty"],
                it["up"],
                it["total"],
                it["disc"],
                it["net"],
            )

        db.commit()
        db.close()

        messagebox.showinfo("تم", f"تم حفظ الفاتورة رقم {inv_id} بنجاح.")
        app.new_invoice()

    except Exception as e:
        messagebox.showerror("خطأ", f"حدث خطأ أثناء الحفظ:\n{e}")
