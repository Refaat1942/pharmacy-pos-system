import tkinter as tk
from tkinter import ttk, messagebox, simpledialog
from datetime import datetime
from decimal import Decimal

from invoice_table_cleaner import insert_clean
from invoice_id_wrapper import clean_invoice_id
from invoice_details_wrapper import open_invoice_details
from invoice_wrapper import print_pdf_safe
from invoice_fix_wrapper import print_invoice_safe


class InvoicesMixin:

    # ======================================================
    #              شاشة عرض الفواتير
    # ======================================================
    def show_invoices(self):
        win = tk.Toplevel(self)
        win.title("عرض الفواتير")
        win.state("zoomed")
        win.configure(bg="white")

        # ===================== Filters =====================
        frm = tk.LabelFrame(
            win,
            text="فلترة الفواتير",
            font=("Cairo", 14, "bold"),
            padx=10,
            pady=10,
            bg="white",
        )
        frm.pack(fill="x", padx=20, pady=10)

        tk.Label(frm, text="النوع:", bg="white").grid(row=0, column=0)
        cmb_type = ttk.Combobox(
            frm,
            width=15,
            state="readonly",
            values=["ALL", "CASH", "insurance", "DELIVERY", "RETURN"],
        )
        cmb_type.set("ALL")
        cmb_type.grid(row=0, column=1, padx=5)

        tk.Label(frm, text="من تاريخ:", bg="white").grid(row=0, column=2)
        dt_from = ttk.Entry(frm, width=12)
        dt_from.insert(0, datetime.now().strftime("%Y-%m-%d"))
        dt_from.grid(row=0, column=3, padx=5)

        tk.Label(frm, text="إلى تاريخ:", bg="white").grid(row=0, column=4)
        dt_to = ttk.Entry(frm, width=12)
        dt_to.insert(0, datetime.now().strftime("%Y-%m-%d"))
        dt_to.grid(row=0, column=5, padx=5)

        tk.Label(frm, text="هاتف:", bg="white").grid(row=1, column=0)
        ph = ttk.Entry(frm, width=15)
        ph.grid(row=1, column=1, padx=5)

        ttk.Button(frm, text="بحث", command=lambda: load_invoices()).grid(
            row=0, column=6, rowspan=2, padx=20
        )

        # ===================== Table =====================
        cols = ("ID", "Date", "Type", "Customer", "Phone", "Insurance", "Net")
        tree = ttk.Treeview(win, columns=cols, show="headings", height=20)
        for c in cols:
            tree.heading(c, text=c)
            tree.column(c, anchor="center", width=140)
        tree.pack(fill="both", expand=True, padx=20, pady=10)

        # ===================== Load =====================
        def load_invoices():
            tree.delete(*tree.get_children())

            q = """
                SELECT i.InvoiceID,
                       CONVERT(VARCHAR(19), i.InvoiceDate, 120),
                       i.InvoiceType,
                       ISNULL(c.FirstName,'') + ' ' + ISNULL(c.LastName,''),
                       ISNULL(c.PhoneNumber,''),
                       ISNULL(ic.CompanyName,''),
                       i.NetAmount
                FROM Invoices i
                LEFT JOIN Customers c ON i.CustomerID = c.CustomerID
                LEFT JOIN insuranceCompanies ic ON i.insuranceCompanyID = ic.CompanyID
                WHERE CAST(i.InvoiceDate AS DATE) BETWEEN ? AND ?
            """

            params = [dt_from.get(), dt_to.get()]

            if cmb_type.get() != "ALL":
                q += " AND i.InvoiceType=?"
                params.append(cmb_type.get())

            if ph.get().strip():
                q += " AND c.PhoneNumber LIKE ?"
                params.append(ph.get() + "%")

            db = self.get_connection()
            cur = db.cursor()
            cur.execute(q, params)
            rows = cur.fetchall()
            db.close()

            for r in rows:
                insert_clean(tree, r)

        # ===================== Open Details =====================
        def open_selected(_=None):
            sel = tree.selection()
            if not sel:
                return
            raw = tree.item(sel[0])["values"][0]
            inv_id = clean_invoice_id(raw)
            open_invoice_details(self, inv_id)

        tree.bind("<Double-1>", open_selected)

        # ===================== Buttons =====================
        btns = tk.Frame(win, bg="white")
        btns.pack(pady=10)

        def print_pdf():
            sel = tree.selection()
            if not sel:
                messagebox.showwarning("تنبيه", "اختر فاتورة أولاً")
                return
            raw = tree.item(sel[0])["values"][0]
            real_id = print_pdf_safe(self, raw)
            messagebox.showinfo("تم", f"تم إنشاء PDF للفاتورة رقم {real_id}")

        ttk.Button(btns, text="🖨 طباعة", command=print_pdf).pack(side="left", padx=6)

        ttk.Button(btns, text="إغلاق", command=win.destroy).pack(side="left", padx=6)

        load_invoices()

    # ======================================================
    #                 إنشاء فاتورة جديدة
    # ======================================================
    def new_invoice(self):
        self.entry_cust.delete(0, "end")
        self.lbl_cust.config(text="")
        self.cmb_emp.set("")
        self.emp_code = None
        self.customer_id = None

        self.entry_code.config(state="disabled")
        self.btn_add.config(state="disabled")

        self.entry_qty.delete(0, "end")
        self.entry_qty.insert(0, "1")

        try:
            self.entry_card.delete(0, "end")
        except:
            pass

        self.entry_copay.delete(0, "end")
        self.entry_copay.insert(0, "0")

        self.entry_delivery.delete(0, "end")
        self.entry_delivery.insert(0, "0.00")

        self.ins_frame.pack_forget()
        self.dlv_frame.pack_forget()

        self.items.clear()
        self._refresh_table()
        self.btn_del.config(state="disabled")
        self.btn_save.config(state="disabled")

        self.return_mode = False
