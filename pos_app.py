print("POS STARTED OK")
import os
import pyodbc
import tkinter as tk
from knowledge_app import open_knowledge_window
from invoice_id_wrapper import safe_open_details
from tkinter import ttk, messagebox, simpledialog
from tkcalendar import DateEntry
from datetime import datetime
from decimal import Decimal, InvalidOperation

# ====== إعداد اتصال SQL Server ======
DB_CONFIG = {
    "DRIVER": "{ODBC Driver 17 for SQL Server}",
    "SERVER": "DESKTOP-8PMOIFI",
    "DATABASE": "DrAhmedCRM",
    "Trusted_Connection": "yes",
}


def get_connection():
    """إرجاع اتصال بقاعدة البيانات"""
    return pyodbc.connect(";".join(f"{k}={v}" for k, v in DB_CONFIG.items()))


# إنشاء مجلد الريسيت لو مش موجود
if not os.path.exists("receipts"):
    os.makedirs("receipts")


# ======================================================
#                واجهة نقطة البيع POS
# ======================================================
class POSApp(tk.Tk):
    def __init__(self):
        super().__init__()

        self.app = self
        self.title("نقطة البيع")
        self.state("zoomed")
        self.attributes("-fullscreen", True)
        self.configure(bg="#E3F2FD")
        self.bind("<Escape>", lambda e: self.on_back())

        # ---------------------------------------
        #            الحالة الابتدائية
        # ---------------------------------------
        self.invoice_type = "CASH"
        self.emp_code = None
        self.customer_id = None
        self.items = []
        self.LocalDiscount = Decimal(0)
        self.ImportedDiscount = Decimal(0)
        self.delivery_fee = Decimal(0)
        self.return_mode = False
        self.return_invoice = None

        # بيانات الصيدلية
        self.shop_name = "صيدلية أحمد رفعت العفيفي"
        self.shop_address = "ارض الجمعيات — قطعه 45 — بلوك 43"
        self.shop_phone = "01033316088"

        # ---------------------------------------
        #       تحميل شركات التأمين من SQL
        # ---------------------------------------
        self.ins_companies = []
        with get_connection() as db:
            cur = db.cursor()
            cur.execute(
                """
                SELECT [CompanyID], [CompanyName],
                       [Local Discount], [Imported Discount]
                  FROM dbo.insuranceCompanies
            """
            )
            for cid, name, ld, idc in cur.fetchall():
                self.ins_companies.append(
                    {
                        "id": cid,
                        "name": name,
                        "local": Decimal(ld or 0),
                        "imported": Decimal(idc or 0),
                    }
                )

        # ---------------------------------------
        #          بناء الواجهة UI
        # ---------------------------------------
        self._build_header()
        self._build_insurance_frame()
        self._build_delivery_frame()
        self._build_item_entry()
        self._build_tree()
        self._build_footer()

    # ======================================================
    #           واجهة الــ UI — الهيدر
    # ======================================================
    def _build_header(self):
        hdr = tk.Frame(self, bg="#1976D2", pady=10)
        hdr.pack(fill="x")

        tk.Label(
            hdr,
            text="نوع الفاتورة:",
            bg="#1976D2",
            fg="white",
            font=("Segoe UI", 12, "bold"),
        ).pack(side="left", padx=20)

        self.cmb_type = ttk.Combobox(
            hdr, state="readonly", width=20, values=["كاش", "تأمين", "توصيل منزلي"]
        )
        self.cmb_type.set("كاش")
        self.cmb_type.pack(side="left")
        self.cmb_type.bind("<<ComboboxSelected>>", lambda e: self.on_type_change())

        # رقم العميل
        tk.Label(hdr, text="تليفون العميل:", bg="#1976D2", fg="white").pack(
            side="left", padx=40
        )
        self.entry_cust = ttk.Entry(hdr, width=20)
        self.entry_cust.pack(side="left")
        self.entry_cust.bind("<Return>", lambda e: self.load_customer())

        # اسم العميل
        self.lbl_cust = tk.Label(
            hdr,
            text="",
            bg="#1976D2",
            fg="white",
            font=("Segoe UI", 12),
            anchor="w",
            wraplength=500,
            justify="left",
        )
        self.lbl_cust.pack(side="left", fill="x", expand=True, padx=20)

        # اسم الموظف
        tk.Label(hdr, text="الموظف:", bg="#1976D2", fg="white").pack(
            side="left", padx=5
        )
        self.cmb_emp = ttk.Combobox(hdr, width=20, state="readonly")
        self.cmb_emp["values"] = self.load_employees()
        self.cmb_emp.pack(side="left")
        self.cmb_emp.bind("<<ComboboxSelected>>", lambda e: self.on_emp())

        # التاريخ والوقت
        now = datetime.now().strftime("%Y/%m/%d  %H:%M:%S")
        tk.Label(hdr, text=now, bg="#1976D2", fg="white").pack(side="right", padx=20)

    # ======================================================
    #              واجهة التأمين
    # ======================================================
    def _build_insurance_frame(self):
        fr = tk.Frame(self, bg="#FFF8E1", bd=1, relief="groove", pady=5)
        self.ins_frame = fr

        tk.Label(fr, text="شركة التأمين:", bg="#FFF8E1").grid(row=0, column=0, padx=5)
        names = [c["name"] for c in self.ins_companies]
        self.cmb_ins = ttk.Combobox(fr, state="readonly", values=names, width=25)
        self.cmb_ins.grid(row=0, column=1, padx=5)
        self.cmb_ins.bind("<<ComboboxSelected>>", lambda e: self.on_insurance_select())

        tk.Label(fr, text="رقم الكارت الطبي:", bg="#FFF8E1").grid(
            row=0, column=2, padx=5
        )
        self.entry_card = ttk.Entry(fr, width=30)
        self.entry_card.grid(row=0, column=3, columnspan=2, padx=5, sticky="we")

        tk.Label(fr, text="خصم محلي (%):", bg="#FFF8E1").grid(
            row=1, column=0, padx=5, pady=5
        )
        self.entry_LocalDiscount = ttk.Entry(fr, width=8, state="readonly")
        self.entry_LocalDiscount.grid(row=1, column=1, padx=5, pady=5)

        tk.Label(fr, text="خصم مستورد (%):", bg="#FFF8E1").grid(
            row=1, column=2, padx=5, pady=5
        )
        self.entry_ImportedDiscount = ttk.Entry(fr, width=8, state="readonly")
        self.entry_ImportedDiscount.grid(row=1, column=3, padx=5, pady=5)

        tk.Label(fr, text="نسبة التحمل (%):", bg="#FFF8E1").grid(
            row=1, column=4, padx=5, pady=5
        )
        self.entry_copay = ttk.Entry(fr, width=8)
        self.entry_copay.insert(0, "0")
        self.entry_copay.grid(row=1, column=5, padx=5, pady=5)
        self.entry_copay.bind("<KeyRelease>", lambda e: self._refresh_table())

    # ======================================================
    #              واجهة التوصيل
    # ======================================================
    def _build_delivery_frame(self):
        fr = tk.Frame(self, bg="#E8F5E9", bd=1, relief="groove", pady=5)
        self.dlv_frame = fr
        tk.Label(fr, text="رسوم التوصيل:", bg="#E8F5E9").grid(row=0, column=0, padx=5)
        self.entry_delivery = ttk.Entry(fr, width=10)
        self.entry_delivery.insert(0, "0.00")
        self.entry_delivery.grid(row=0, column=1, padx=5)
        self.entry_delivery.bind(
            "<KeyRelease>", lambda e: self.on_delivery_fee_change()
        )

    # ======================================================
    #                 إدخال الصنف
    # ======================================================
    def _build_item_entry(self):
        frm = tk.Frame(self, bg="#F3E5F5", pady=5)
        frm.pack(fill="x", padx=20)

        ttk.Label(frm, text="بحث صنف:", background="#F3E5F5").grid(
            row=0, column=0, padx=5
        )
        self.entry_search = ttk.Entry(frm, width=30)
        self.entry_search.grid(row=0, column=1, padx=5)
        self.entry_search.bind("<KeyRelease>", self.on_search_keyrelease)

        self.listbox_sug = tk.Listbox(frm, height=4)
        self.listbox_sug.grid(row=1, column=1, sticky="we", padx=5)
        self.listbox_sug.bind(
            "<<ListboxSelect>>", lambda e: self.on_suggestion_select(e)
        )
        self.listbox_sug.grid_remove()

        ttk.Label(frm, text="باركود:", background="#F3E5F5").grid(
            row=0, column=2, padx=5
        )
        self.entry_code = ttk.Entry(frm, width=20, state="disabled")
        self.entry_code.grid(row=0, column=3, padx=5)
        self.entry_code.bind("<Return>", lambda e: self.add_item())

        ttk.Label(frm, text="كمية:", background="#F3E5F5").grid(row=0, column=4, padx=5)
        self.entry_qty = ttk.Entry(frm, width=8)
        self.entry_qty.grid(row=0, column=5, padx=5)
        self.entry_qty.insert(0, "1")

        self.btn_add = ttk.Button(
            frm, text="أضف", command=self.add_item, state="disabled"
        )
        self.btn_add.grid(row=0, column=6, padx=20)

    # ======================================================
    #                 جدول الأصناف
    # ======================================================
    def _build_tree(self):
        cols = ("idx", "code", "name", "unit", "qty", "up", "total", "disc", "net")
        headers = (
            "م",
            "الكود",
            "الصنف",
            "الوحدة",
            "كمية",
            "سعر",
            "المجموع",
            "خصم",
            "صافي",
        )
        widths = (50, 100, 400, 100, 80, 100, 120, 100, 120)

        self.tree = ttk.Treeview(self, columns=cols, show="headings", height=15)
        for c, h, w in zip(cols, headers, widths):
            self.tree.heading(c, text=h)
            self.tree.column(c, width=w, anchor="center")

        self.tree.pack(fill="both", expand=True, padx=20, pady=5)

        self.btn_del = ttk.Button(
            self, text="حذف صنف", command=self.delete_item, state="disabled"
        )
        self.btn_del.pack(pady=5)

        self.tree.bind("<Double-1>", lambda e: self._on_double_click(e))

        # ======================================================
        #       دالة الدبل كليك لتعديل الوحدة أو الصنف
        # ======================================================

    def _on_double_click(self, event):
        # تحديد الخلية المضغوطة
        region = self.tree.identify("region", event.x, event.y)
        if region != "cell":
            return

        col = self.tree.identify_column(event.x)
        row = self.tree.identify_row(event.y)

        # العمود رقم 4 هو عمود "الوحدة"
        if col != "#4":
            return

        item_index = int(row) - 1
        item = self.items[item_index]

        code = item["id"]
        units_info = self.fetch_units(code)

        units = [u["unit"] for u in units_info]
        prices = {u["unit"]: u["price"] for u in units_info}

        # عمل Combobox مكان الخلية
        x, y, w, h = self.tree.bbox(row, col)
        cmb = ttk.Combobox(self.tree, values=units, state="readonly")
        cmb.place(x=x, y=y, width=w, height=h)
        cmb.set(item["unit"])

        from decimal import Decimal

        def on_select(event):
            chosen = cmb.get()
            price = Decimal(str(prices[chosen]))
            qty = Decimal(str(item["qty"]))

            item["unit"] = chosen
            item["up"] = float(price)
            item["total"] = float(price * qty)
            item["disc"] = 0.0
            item["net"] = item["total"]

            cmb.destroy()
            self._refresh_table()

        cmb.bind("<<ComboboxSelected>>", on_select)

    # ======================================================
    #                  الفوتر
    # ======================================================
    def _build_footer(self):
        foot = tk.Frame(self, bg="#F3E5F5", pady=5)
        foot.pack(fill="x", padx=20)

        summary = tk.Frame(foot, bg="#F3E5F5")
        summary.pack(side="left")

        for txt, var in [
            ("الإجمالي:", "total"),
            ("قيمة الخصم:", "disc"),
            ("مبلغ التحمل:", "copay"),
            ("رسوم التوصيل:", "dlv"),
            ("المتبقي:", "due"),
        ]:
            tk.Label(
                summary, text=txt, bg="#F3E5F5", font=("Segoe UI", 11, "bold")
            ).pack(anchor="e")
            lbl = tk.Label(
                summary,
                text="0.00",
                bg="#F3E5F5",
                font=("Segoe UI", 13, "bold"),
                width=12,
                anchor="e",
            )
            lbl.pack(anchor="e", pady=2)
            setattr(self, f"lbl_{var}", lbl)

        actions = tk.Frame(foot, bg="#F3E5F5")
        actions.pack(side="right")

        ttk.Button(actions, text="عرض الفواتير", command=self.show_invoices).pack(
            side="left", padx=5
        )
        ttk.Button(actions, text="مرتجع", command=self.on_return).pack(
            side="left", padx=5
        )
        ttk.Button(actions, text="جديد", command=self.new_invoice).pack(
            side="left", padx=5
        )
        ttk.Button(actions, text="قاعدة المعرفة", command=open_knowledge_window).pack(
            side="left", padx=5
        )

        from invoice_save_wrapper import safe_save_order

        self.btn_save = ttk.Button(
            actions, text="حفظ", command=lambda: safe_save_order(self), state="disabled"
        )
        self.btn_save.pack(side="left", padx=5)

    # ======================================================
    #      تحميل بيانات الموظفين من قاعدة البيانات
    # ======================================================
    def load_employees(self):
        db = get_connection()
        cur = db.cursor()
        cur.execute("SELECT EmployeeCode, EmployeeName FROM dbo.Employees")
        rows = cur.fetchall()
        db.close()

        self.emp_map = {r.EmployeeName: r.EmployeeCode for r in rows}
        return list(self.emp_map.keys())

    # ======================================================
    #           عند اختيار الموظف
    # ======================================================
    def on_emp(self):
        self.emp_code = self.emp_map[self.cmb_emp.get()]
        self.entry_code.config(state="normal")
        self.entry_code.focus()
        self.btn_add.config(state="normal")

    # ======================================================
    #         تحميل بيانات العميل من الهاتف
    # ======================================================
    def load_customer(self):
        phone = self.entry_cust.get().strip()
        if not phone:
            return

        db = get_connection()
        cur = db.cursor()
        cur.execute(
            """
            SELECT CustomerID, FirstName, LastName, PhoneNumber
            FROM dbo.Customers
            WHERE PhoneNumber = ?
        """,
            phone,
        )
        r = cur.fetchone()
        db.close()

        if not r:
            if messagebox.askyesno("تنبيه", "العميل غير موجود — إضافة جديد؟"):
                self.open_add_customer_window()
            return

        self.customer_id = r.CustomerID
        self.lbl_cust.config(text=f"{r.FirstName} {r.LastName} — {r.PhoneNumber}")

    def open_add_customer_window(self):
        win = tk.Toplevel(self)

        win.title("➕ إضافة عميل جديد")
        win.geometry("900x650")
        win.configure(bg="#e0f7fa")

        # -------- حقول العميل --------
        fields = [
            "FirstName",
            "LastName",
            "PhoneNumber",
            "Region",
            "City",
            "District",
            "Area",
            "StreetName",
            "Building",
            "Floor",
            "FlatNumber",
            "Landmark",
        ]

        entries = {}

        frm = tk.Frame(win, bg="#e0f7fa")
        frm.pack(pady=20)

        for i, field in enumerate(fields):
            tk.Label(frm, text=field, bg="#e0f7fa", font=("Cairo", 12, "bold")).grid(
                row=i, column=0, sticky="e", padx=10, pady=6
            )

            ent = tk.Entry(frm, font=("Cairo", 12), width=40)
            ent.grid(row=i, column=1, pady=6)
            entries[field] = ent

        # -------- حفظ العميل --------
        def save_new_customer():
            data = [entries[f].get() for f in fields]

            try:
                conn = get_connection()
                cur = conn.cursor()

                cur.execute(
                    f"""
                    INSERT INTO Customers (
                        {', '.join(fields)}
                    ) VALUES ({', '.join(['?' for _ in fields])})
                """,
                    data,
                )

                conn.commit()
                conn.close()

                messagebox.showinfo("✔ تم", "تم إضافة العميل بنجاح")

                # بعد الحفظ نحمل العميل إلى الفاتورة
                phone = entries["PhoneNumber"].get()
                self.entry_cust.delete(0, "end")
                self.entry_cust.insert(0, phone)
                win.destroy()
                self.load_customer()

            except Exception as e:
                messagebox.showerror("خطأ", f"حدث خطأ أثناء الحفظ:\n{e}")

        tk.Button(
            win,
            text="💾 حفظ",
            bg="#00796b",
            fg="white",
            font=("Cairo", 14, "bold"),
            padx=20,
            pady=8,
            command=save_new_customer,
        ).pack(pady=20)

    # ======================================================
    #     جلب الوحدات والسعر الحقيقي لكل وحدة
    # ======================================================
    def fetch_units(self, code):
        db = get_connection()
        cur = db.cursor()
        cur.execute(
            """
            SELECT AllUnit, BaseUnit, Price, SmallUnit, MaterialGroup
            FROM dbo.ProductUnits
            WHERE CAST(ItemCode AS VARCHAR(50)) = ?
        """,
            code,
        )
        rows = cur.fetchall()
        db.close()

        units = []
        for r in rows:
            allunit = getattr(r, "AllUnit", r[0])
            baseunit = getattr(r, "BaseUnit", r[1])
            price_raw = getattr(r, "Price", r[2])
            small_raw = getattr(r, "SmallUnit", r[3])
            group_raw = getattr(r, "MaterialGroup", r[4])

            try:
                small = int(small_raw) if small_raw else 1
            except:
                small = 1

            try:
                real_price = Decimal(price_raw or 0) / Decimal(small)
            except:
                real_price = Decimal(0)

            units.append(
                {
                    "unit": str(allunit).strip(),
                    "base": str(baseunit).strip(),
                    "price": real_price.quantize(Decimal("0.01")),
                    "small": small,
                    "group": (str(group_raw).strip().upper() if group_raw else ""),
                }
            )

        if not units:
            units = [
                {
                    "unit": "",
                    "base": "",
                    "price": Decimal("0.00"),
                    "small": 1,
                    "group": "",
                }
            ]

        return units

    # ======================================================
    #        جلب MaterialGroup الصحيح للصنف
    # ======================================================
    def fetch_material_group(self, code):
        db = get_connection()
        cur = db.cursor()
        cur.execute(
            """
            SELECT TOP 1 MaterialGroup
            FROM dbo.ProductUnits
            WHERE CAST(ItemCode AS VARCHAR(50)) = ?
        """,
            code,
        )
        row = cur.fetchone()
        db.close()

        return (row[0] or "").strip().upper() if row else ""

    # ======================================================
    #             عند تغيير نوع الفاتورة
    # ======================================================
    def on_type_change(self):
        mp = {"كاش": "CASH", "تأمين": "insurance", "توصيل منزلي": "DELIVERY"}
        self.invoice_type = mp.get(self.cmb_type.get(), "CASH")

        self.new_invoice()

        if self.invoice_type == "insurance":
            self.ins_frame.pack(
                fill="x", padx=20, pady=5, before=self.entry_search.master
            )
            self.dlv_frame.pack_forget()

        elif self.invoice_type == "DELIVERY":
            self.dlv_frame.pack(
                fill="x", padx=20, pady=5, before=self.entry_search.master
            )
            self.ins_frame.pack_forget()

        else:
            self.ins_frame.pack_forget()
            self.dlv_frame.pack_forget()

        self._refresh_table()

    # ======================================================
    #           عند اختيار شركة التأمين
    # ======================================================
    def on_insurance_select(self):
        comp = next(c for c in self.ins_companies if c["name"] == self.cmb_ins.get())

        self.entry_LocalDiscount.config(state="normal")
        self.entry_LocalDiscount.delete(0, "end")
        self.entry_LocalDiscount.insert(0, str(comp["local"]))
        self.entry_LocalDiscount.config(state="readonly")

        self.entry_ImportedDiscount.config(state="normal")
        self.entry_ImportedDiscount.delete(0, "end")
        self.entry_ImportedDiscount.insert(0, str(comp["imported"]))
        self.entry_ImportedDiscount.config(state="readonly")

        self.LocalDiscount = comp["local"]
        self.ImportedDiscount = comp["imported"]

        self.return_invoice = None
        self._refresh_table()

    # ======================================================
    #            عند تغيير رسوم التوصيل
    # ======================================================
    def on_delivery_fee_change(self):
        try:
            self.delivery_fee = Decimal(self.entry_delivery.get())
        except:
            self.delivery_fee = Decimal(0)

        self._refresh_table()

    # ======================================================
    #     البحث عن صنف & تحميل الاقتراحات
    # ======================================================
    def on_search_keyrelease(self, event):
        txt = self.entry_search.get().strip()
        if len(txt) < 2:
            self.listbox_sug.grid_remove()
            return

        db = get_connection()
        cur = db.cursor()
        cur.execute(
            """
            SELECT DISTINCT CAST(ItemCode AS VARCHAR(50)), ItemName
            FROM dbo.ProductUnits
            WHERE ItemCode LIKE ? + '%' OR ItemName LIKE ? + '%'
        """,
            txt,
            txt,
        )
        self._suggestions = cur.fetchall()
        db.close()

        self.listbox_sug.delete(0, "end")
        for _, name in self._suggestions:
            self.listbox_sug.insert("end", name)

        self.listbox_sug.grid()

    # ======================================================
    #        عند اختيار صنف من الاقتراحات
    # ======================================================
    def on_suggestion_select(self, event):
        sel = self.listbox_sug.curselection()
        if not sel:
            return

        code, _ = self._suggestions[sel[0]]
        self.entry_code.config(state="normal")
        self.entry_code.delete(0, "end")
        self.entry_code.insert(0, code)
        self.entry_code.config(state="disabled")

        self.btn_add.config(state="normal")
        self.listbox_sug.grid_remove()

    # ======================================================
    #                تفعيل وضع المرتجع
    # ======================================================
    def on_return(self):
        if not self.return_invoice:
            inv = simpledialog.askinteger("مرتجع", "أدخل رقم الفاتورة للمرتجع")
            if not inv:
                return

            self.return_invoice = inv

        self.return_mode = not self.return_mode
        msg = "وضع المرتجع مفعل" if self.return_mode else "وضع المرتجع ملغي"
        messagebox.showinfo("مرتجع", msg)

        self._refresh_table()

    # ======================================================
    #              إضافة صنف داخل الفاتورة
    # ======================================================
    def add_item(self):
        if not self.emp_code or not self.customer_id:
            messagebox.showwarning("تنبيه", "اختر موظفًا واحمل عميل أولاً.")
            return

        if self.invoice_type == "insurance" and not self.cmb_ins.get():
            messagebox.showwarning("تنبيه", "اختر شركة التأمين أولاً.")
            return

        raw = self.entry_code.get().strip()
        code = raw[:-2] if raw.endswith(".0") else raw

        db = get_connection()
        cur = db.cursor()
        cur.execute(
            "SELECT TOP 1 ItemName FROM dbo.ProductUnits WHERE CAST(ItemCode AS VARCHAR(50))=?",
            code,
        )
        row = cur.fetchone()
        db.close()

        if not row:
            messagebox.showwarning("خطأ", "الصنف غير موجود.")
            return

        name = row.ItemName if hasattr(row, "ItemName") else row[0]

        units = self.fetch_units(code)

        default_unit = None
        for u in units:
            if u["unit"] == u["base"]:
                default_unit = u
                break

        if not default_unit:
            default_unit = units[0]

        base_unit = default_unit["unit"]

        price_map = {u["unit"]: u["price"] for u in units}
        price = price_map.get(base_unit, units[0]["price"])

        try:
            qty = Decimal(self.entry_qty.get())
        except:
            messagebox.showwarning("خطأ", "أدخل كمية صحيحة.")
            return

        if self.return_mode:
            qty = -qty

        total = (price * qty).quantize(Decimal("0.01"))

        grp = units[0].get("group") or self.fetch_material_group(code)

        # --------------------------
        #        خصومات التأمين
        # --------------------------
        if self.invoice_type == "insurance":
            if grp in ("DL", "ML"):
                pct = self.LocalDiscount
            elif grp in ("DI", "MI"):
                pct = self.ImportedDiscount
            else:
                pct = Decimal(0)
        else:
            pct = Decimal(0)

        disc_amt = (total * pct / Decimal(100)).quantize(Decimal("0.01"))
        net = (total - disc_amt).quantize(Decimal("0.01"))

        idx = len(self.items) + 1

        self.items.append(
            {
                "idx": idx,
                "id": code,
                "name": name,
                "unit": base_unit,
                "qty": float(qty),
                "up": float(price),
                "total": float(total),
                "disc": float(disc_amt),
                "net": float(net),
                "units": [u["unit"] for u in units],
                "price_map": price_map,
            }
        )

        self._refresh_table()
        self.btn_del.config(state="normal")
        self.btn_save.config(state="normal")

        self.entry_code.delete(0, "end")

    # ======================================================
    #         تحديث جدول الفاتورة + الإجماليات
    # ======================================================
    def _refresh_table(self):
        tot = sum(Decimal(it["total"]) for it in self.items)
        disc = sum(Decimal(it["disc"]) for it in self.items)

        copay_amt = Decimal(0)
        dlv_amt = Decimal(0)

        if self.invoice_type == "insurance":
            try:
                pct = Decimal(self.entry_copay.get())
            except:
                pct = Decimal(0)

            copay_amt = ((tot - disc) * pct / Decimal(100)).quantize(Decimal("0.01"))

        elif self.invoice_type == "DELIVERY":
            dlv_amt = self.delivery_fee

        due_amt = (tot - disc - copay_amt + dlv_amt).quantize(Decimal("0.01"))

        self.tree.delete(*self.tree.get_children())

        for it in self.items:
            self.tree.insert(
                "",
                "end",
                iid=it["idx"],
                values=(
                    it["idx"],
                    it["id"],
                    it["name"],
                    it["unit"],
                    it["qty"],
                    it["up"],
                    it["total"],
                    it["disc"],
                    it["net"],
                ),
            )

        self.lbl_total.config(text=f"{tot:.2f}")
        self.lbl_disc.config(text=f"{disc:.2f}")
        self.lbl_copay.config(text=f"{copay_amt:.2f}")
        self.lbl_dlv.config(text=f"{dlv_amt:.2f}")
        self.lbl_due.config(text=f"{due_amt:.2f}")

    # ======================================================
    #                  حذف صنف من الجدول
    # ======================================================
    def delete_item(self):
        sel = self.tree.selection()
        if not sel:
            return

        try:
            del self.items[int(sel[0]) - 1]
        except:
            if self.items:
                self.items.pop()

        for i, it in enumerate(self.items):
            it["idx"] = i + 1

        self._refresh_table()

        if not self.items:
            self.btn_del.config(state="disabled")
            self.btn_save.config(state="disabled")

    # ======================================================
    #                    حفظ الفاتورة
    # ======================================================
    def save_order(self):
        if not self.emp_code or not self.items:
            messagebox.showwarning("تنبيه", "اكمل البيانات أولاً.")
            return

        now = datetime.now()

        tot = Decimal(self.lbl_total.cget("text"))
        disc = Decimal(self.lbl_disc.cget("text"))
        cop = Decimal(self.lbl_copay.cget("text"))
        dlv = Decimal(self.lbl_dlv.cget("text"))
        due = Decimal(self.lbl_due.cget("text"))

        db = get_connection()
        cur = db.cursor()

        cur.execute(
            """
            INSERT INTO dbo.Invoices
              (InvoiceDate, EmployeeCode, InvoiceType,
               TotalAmount, TotalDiscount, NetAmount, DeliveryFee)
            OUTPUT inserted.InvoiceID
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
            now,
            self.emp_code,
            self.invoice_type,
            float(tot),
            float(disc + cop),
            float(due),
            float(dlv),
        )

        inv_id = cur.fetchone()[0]

        for it in self.items:
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

        messagebox.showinfo("تم", f"تم حفظ الفاتورة بنجاح (رقم {inv_id})")

        if self.return_mode:
            messagebox.showinfo("مرتجع", "تم تسجيل المرتجع كفاتورة بكميات سالبة.")

        self.new_invoice()

    # ======================================================
    #                   إنشاء فاتورة جديدة
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

        self.entry_LocalDiscount.config(state="normal")
        self.entry_LocalDiscount.delete(0, "end")
        self.entry_LocalDiscount.config(state="readonly")

        self.entry_ImportedDiscount.config(state="normal")
        self.entry_ImportedDiscount.delete(0, "end")
        self.entry_ImportedDiscount.config(state="readonly")

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

        if self.return_mode:
            self.return_mode = False

    # ======================================================
    #                 شاشة عرض الفواتير
    # ======================================================

    def show_invoices(self):
        win = tk.Toplevel(self)
        win.title("عرض الفواتير")
        win.state("zoomed")
        win.configure(bg="white")

        # =====================  إطار الفلاتر =====================
        frm = tk.LabelFrame(
            win,
            text="فلترة الفواتير",
            font=("Cairo", 14, "bold"),
            padx=10,
            pady=10,
            bg="white",
        )
        frm.pack(fill="x", padx=20, pady=10)

        # النوع
        tk.Label(frm, text="النوع:", bg="white", font=("Cairo", 12)).grid(
            row=0, column=0
        )
        cmb_type = ttk.Combobox(
            frm,
            width=15,
            state="readonly",
            values=["ALL", "CASH", "insurance", "DELIVERY"],
        )
        cmb_type.set("ALL")
        cmb_type.grid(row=0, column=1, padx=5)

        # التاريخ من
        tk.Label(frm, text="من تاريخ:", bg="white", font=("Cairo", 12)).grid(
            row=0, column=2
        )
        dt_from = DateEntry(frm, width=12, date_pattern="yyyy-MM-dd")
        dt_from.grid(row=0, column=3, padx=5)

        # التاريخ إلى
        tk.Label(frm, text="إلى تاريخ:", bg="white", font=("Cairo", 12)).grid(
            row=0, column=4
        )
        dt_to = DateEntry(frm, width=12, date_pattern="yyyy-MM-dd")
        dt_to.grid(row=0, column=5, padx=5)

        # قيمة من
        tk.Label(frm, text="قيمة من:", bg="white", font=("Cairo", 12)).grid(
            row=1, column=0
        )
        val_min = ttk.Entry(frm, width=10)
        val_min.grid(row=1, column=1, padx=5)

        # قيمة إلى
        tk.Label(frm, text="إلى:", bg="white", font=("Cairo", 12)).grid(row=1, column=2)
        val_max = ttk.Entry(frm, width=10)
        val_max.grid(row=1, column=3, padx=5)

        # هاتف العميل
        tk.Label(frm, text="هاتف:", bg="white", font=("Cairo", 12)).grid(
            row=1, column=4
        )
        ph = ttk.Entry(frm, width=15)
        ph.grid(row=1, column=5, padx=5)

        # اسم العميل
        tk.Label(frm, text="اسم العميل:", bg="white", font=("Cairo", 12)).grid(
            row=2, column=0
        )
        cust_name = ttk.Entry(frm, width=20)
        cust_name.grid(row=2, column=1, padx=5)

        # شركة التأمين
        tk.Label(frm, text="شركة التأمين:", bg="white", font=("Cairo", 12)).grid(
            row=2, column=2
        )
        cmb_ins = ttk.Combobox(
            frm,
            width=25,
            state="readonly",
            values=["ALL"] + [c["name"] for c in self.ins_companies],
        )
        cmb_ins.set("ALL")
        cmb_ins.grid(row=2, column=3, padx=5)

        # زر بحث
        ttk.Button(frm, text="بحث", width=15, command=lambda: load_invoices()).grid(
            row=0, column=6, rowspan=3, padx=20
        )

        # ===================== جدول الفواتير =====================
        cols = ("ID", "Date", "Type", "Customer", "Phone", "Insurance", "Net", "Due")
        tree = ttk.Treeview(win, columns=cols, show="headings", height=20)
        for c in cols:
            tree.heading(c, text=c)
            tree.column(c, anchor="center", width=130)
        tree.pack(fill="both", expand=True, padx=20, pady=10)

        # طباعة PDF
        ttk.Button(
            win, text="🖨 طباعة الفاتورة", width=20, command=lambda: print_pdf()
        ).pack(pady=10)

        # =====================================================
        #               تحميل الفواتير من قاعدة البيانات
        # =====================================================
        def load_invoices():
            tree.delete(*tree.get_children())

            q = """
                SELECT i.InvoiceID,
                       CONVERT(VARCHAR(19), i.InvoiceDate, 120),
                       i.InvoiceType,
                       ISNULL(c.FirstName,'') + ' ' + ISNULL(c.LastName,''),
                       ISNULL(c.PhoneNumber,''),
                       ISNULL(ic.CompanyName,''),
                       i.NetAmount,
                       (i.NetAmount - i.TotalDiscount)
                FROM Invoices i
                LEFT JOIN Customers c ON i.CustomerID = c.CustomerID
                LEFT JOIN insuranceCompanies ic ON i.insuranceCompanyID = ic.CompanyID
                WHERE 1=1
            """

            params = []

            if cmb_type.get() != "ALL":
                q += " AND i.InvoiceType=?"
                params.append(cmb_type.get())

            q += " AND CAST(i.InvoiceDate AS DATE)>=?"
            params.append(dt_from.get())

            q += " AND CAST(i.InvoiceDate AS DATE)<=?"
            params.append(dt_to.get())

            if val_min.get().strip():
                q += " AND i.NetAmount>=?"
                params.append(float(val_min.get()))

            if val_max.get().strip():
                q += " AND i.NetAmount<=?"
                params.append(float(val_max.get()))

            if ph.get().strip():
                q += " AND c.PhoneNumber LIKE ?"
                params.append(ph.get() + "%")

            if cust_name.get().strip():
                q += " AND (c.FirstName + ' ' + c.LastName) LIKE ?"
                params.append("%" + cust_name.get() + "%")

            if cmb_ins.get() != "ALL":
                q += " AND ic.CompanyName=?"
                params.append(cmb_ins.get())

            db = get_connection()
            cur = db.cursor()

            cur.execute(q, params)
            rows = cur.fetchall()
            db.close()

            from invoice_table_cleaner import insert_clean

            for r in rows:
                insert_clean(tree, r)

            if not rows:
                messagebox.showinfo("تنبيه", "لا توجد فواتير.")

        # =====================================================
        #  فتح تفاصيل الفاتورة (نسخة جديدة بالـ Wrapper)
        # =====================================================

        app = self

        from invoice_id_wrapper import clean_invoice_id
        from invoice_details_wrapper import open_invoice_details

        def _open_selected_invoice(event=None):
            sel = tree.selection()
            if not sel:
                return

            try:

                raw = tree.item(sel[0])["values"][0]
                inv_id = clean_invoice_id(raw)
                # افتح شاشة التفاصيل الجديدة
                open_invoice_details(self, inv_id)

            except Exception as e:
                messagebox.showerror("خطأ", f"تعذّر قراءة رقم الفاتورة:\n{e}")

        tree.bind("<Double-1>", _open_selected_invoice)

        from ui_font_fix import apply_arabic_font

        apply_arabic_font(win)

        # =====================================================
        #                      طباعة PDF
        # =====================================================

        from invoice_wrapper import print_pdf_safe

        from invoice_fix_wrapper import print_invoice_safe

        def print_pdf():
            sel = tree.selection()
            if not sel:
                messagebox.showwarning("تنبيه", "اختر فاتورة أولاً.")
                return

            raw_id = tree.item(sel[0])["values"][0]

            try:

                real_id = print_pdf_safe(self, raw_id)
                messagebox.showinfo("تم", f"تم إنشاء ملف PDF للفاتورة رقم {real_id}.")
            except Exception as e:
                messagebox.showerror("خطأ", f"حدث خطأ أثناء الطباعة: {e}")

        # ===================== جدول الأصناف =====================
        cols = ("code", "name", "unit", "qty", "up", "total", "disc", "net")
        tv = ttk.Treeview(win, columns=cols, show="headings", height=15)
        for c in cols:
            tv.heading(c, text=c, anchor="center")
            tv.column(c, anchor="center", width=110)
        tv.pack(fill="both", expand=True, padx=20)

        # تحميل الأصناف من InvoiceItems
        cur.execute(
            """
            SELECT ProductCode, Unit, Quantity, UnitPrice, TotalPrice, Discount, NetPrice
            FROM InvoiceItems WHERE InvoiceID=?
        """,
            inv_id,
        )
        rows = cur.fetchall()

        for r in rows:
            # نحاول جلب اسم الصنف من ProductUnits
            try:
                cur.execute(
                    "SELECT TOP 1 ItemName FROM ProductUnits WHERE CAST(ItemCode AS VARCHAR(50))=?",
                    r[0],
                )
                nm = cur.fetchone()
                name = nm[0] if nm else "?"
            except Exception:
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

        # ===================== أزرار الطباعة والمرتجع =====================
        btn_frame = tk.Frame(win, bg="white")
        btn_frame.pack(pady=8)

        def print_this():
            # توليد PDF عن طريق الدالة الموجودة
            self.generate_pdf(inv_id)
            messagebox.showinfo("تم", "تم إنشاء ملف PDF للفاتورة.")

        ttk.Button(btn_frame, text="🖨 طباعة الفاتورة", command=print_this).pack(
            side="left", padx=6
        )

        # دالة المرتجع الجزئي — تدعم اختيار أصناف متعددة
        def partial_return():
            sel = tv.selection()
            if not sel:
                messagebox.showwarning("تنبيه", "اختر صنف أو عدة أصناف لإجراء المرتجع.")
                return

            # نجمع الأصناف المختارة مع الكميات الأصلية
            items_to_return = []
            for s in sel:
                vals = tv.item(s)["values"]
                code, name, unit, qty, up, total, disc, net = vals
                items_to_return.append(
                    {
                        "code": code,
                        "name": name,
                        "unit": unit,
                        "orig_qty": float(qty),
                        "unit_price": float(up),
                        "total": float(total),
                        "discount": float(disc),
                        "net": float(net),
                    }
                )

            # نافذة تطلب كمية المرتجع لكل صنف
            ret_win = tk.Toplevel(win)
            ret_win.title("إدخال كميات المرتجع")
            ret_win.geometry("480x400")
            frames = []
            entries = []

            tk.Label(
                ret_win,
                text="ادخل الكمية المراد إرجاعها لكل صنف (يمكن ترك 0):",
                font=("Cairo", 11),
            ).pack(pady=6)

            canvas = tk.Canvas(ret_win)
            fr = tk.Frame(canvas)
            scrollbar = ttk.Scrollbar(ret_win, orient="vertical", command=canvas.yview)
            canvas.configure(yscrollcommand=scrollbar.set)
            scrollbar.pack(side="right", fill="y")
            canvas.pack(side="left", fill="both", expand=True)
            canvas.create_window((0, 0), window=fr, anchor="nw")
            fr.bind(
                "<Configure>",
                lambda e: canvas.configure(scrollregion=canvas.bbox("all")),
            )

            for it in items_to_return:
                f = tk.Frame(fr)
                f.pack(fill="x", pady=4, padx=6)
                tk.Label(
                    f,
                    text=f"{it['name']} (الكمية الأصلية: {it['orig_qty']})",
                    anchor="w",
                    width=40,
                ).pack(side="left")
                ent = ttk.Entry(f, width=8)
                ent.insert(0, "0")
                ent.pack(side="right", padx=6)
                entries.append((it, ent))

            def confirm_return():
                # تجميع الكميات > 0
                returns = []
                for it, ent in entries:
                    try:
                        rqty = float(ent.get())
                    except:
                        messagebox.showerror("خطأ", "ادخل أعداد صحيحة أو عشرية صحيحة.")
                        return
                    if rqty < 0:
                        messagebox.showerror("خطأ", "الكمية لا يمكن أن تكون سالبة هنا.")
                        return
                    if rqty > it["orig_qty"]:
                        messagebox.showerror(
                            "خطأ",
                            f"لا يمكن إرجاع كمية أكبر من الأصلية للصنف {it['name']}.",
                        )
                        return
                    if rqty > 0:
                        returns.append((it, rqty))

                if not returns:
                    messagebox.showinfo("تنبيه", "لم تدخل أي كميات للمرتجع.")
                    return

                # إدخال الفاتورة الجديدة بالكمية السالبة
                try:
                    db = get_connection()
                    cur = db.cursor()
                    now = datetime.now()

                    # نحسب مجموعات الفواتير المرتجعة للحقل الإجمالي (نجمع بالموجب ثم نضرب بالسالب)
                    total_amount = 0.0
                    total_discount = 0.0
                    total_net = 0.0

                    for it, rqty in returns:
                        # حسابات per unit
                        per_unit_total = (
                            (it["total"] / it["orig_qty"])
                            if it["orig_qty"]
                            else it["unit_price"]
                        )
                        per_unit_disc = (
                            (it["discount"] / it["orig_qty"]) if it["orig_qty"] else 0.0
                        )
                        per_unit_net = (
                            (it["net"] / it["orig_qty"])
                            if it["orig_qty"]
                            else (per_unit_total - per_unit_disc)
                        )

                        total_amount += per_unit_total * rqty
                        total_discount += per_unit_disc * rqty
                        total_net += per_unit_net * rqty

                    # ندرج رأس الفاتورة كـ RETURN وبقيم سالبة
                    cur.execute(
                        """
                        INSERT INTO Invoices
                          (InvoiceDate, EmployeeCode, InvoiceType,
                           TotalAmount, TotalDiscount, NetAmount, DeliveryFee)
                        OUTPUT inserted.InvoiceID
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                        now,
                        self.emp_code,
                        "RETURN",
                        -float(total_amount),
                        -float(total_discount),
                        -float(total_net),
                        0.0,
                    )
                    new_inv = cur.fetchone()[0]

                    # إدخال كل بند بكمية سالبة
                    for it, rqty in returns:
                        per_unit_total = (
                            (it["total"] / it["orig_qty"])
                            if it["orig_qty"]
                            else it["unit_price"]
                        )
                        per_unit_disc = (
                            (it["discount"] / it["orig_qty"]) if it["orig_qty"] else 0.0
                        )
                        per_unit_net = (
                            (it["net"] / it["orig_qty"])
                            if it["orig_qty"]
                            else (per_unit_total - per_unit_disc)
                        )

                        cur.execute(
                            """
                            INSERT INTO InvoiceItems
                              (InvoiceID, ProductCode, Unit, Quantity,
                               UnitPrice, TotalPrice, Discount, NetPrice)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                            new_inv,
                            it["code"],
                            it["unit"],
                            -float(rqty),
                            float(it["unit_price"]),
                            -float(per_unit_total * rqty),
                            -float(per_unit_disc * rqty),
                            -float(per_unit_net * rqty),
                        )

                    db.commit()
                    db.close()
                except Exception as e:
                    messagebox.showerror("خطأ", f"حدث خطأ أثناء تسجيل المرتجع: {e}")
                    return

                messagebox.showinfo("تم", f"تم إنشاء فاتورة مرتجع رقم {new_inv}")
                ret_win.destroy()
                win.destroy()  # اغلق تفاصيل الفاتورة بعد نجاح المرتجع
                return

            ttk.Button(ret_win, text="تأكيد المرتجع", command=confirm_return).pack(
                pady=8
            )

        ttk.Button(btn_frame, text="مرتجع جزئي", command=partial_return).pack(
            side="left", padx=6
        )

        # زر اغلاق
        ttk.Button(btn_frame, text="إغلاق", command=win.destroy).pack(
            side="left", padx=6
        )

    # ======================================================
    #                إنشاء ملف PDF للفاتورة
    # ======================================================
    def generate_pdf(self, invoice_id):

        import os
        from reportlab.pdfgen import canvas
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        import arabic_reshaper
        from bidi.algorithm import get_display

        # ------------------------------
        #   إنشاء فولدر لو مش موجود
        # ------------------------------
        if not os.path.exists("receipts"):
            os.makedirs("receipts")

        # ------------------------------
        #   تحميل خط عربي
        # ------------------------------
        font_path = "Cairo-Regular.ttf"  # يجب وضع الخط بجانب الملف
        if not os.path.exists(font_path):
            messagebox.showerror("خطأ", "ملف الخط Cairo-Regular.ttf غير موجود.")
            return

        pdfmetrics.registerFont(TTFont("Cairo", font_path))

        file_path = f"receipts/invoice_{invoice_id}.pdf"
        c = canvas.Canvas(file_path)
        c.setFont("Cairo", 12)

        # ------------------------------
        #   دالة الكتابة بالعربي
        # ------------------------------
        def draw_arabic(text, x, y):
            reshaped = arabic_reshaper.reshape(text)
            bidi = get_display(reshaped)
            c.drawRightString(x, y, bidi)

        # ------------------------------
        #   بيانات الصيدلية
        # ------------------------------
        draw_arabic(self.shop_name, 560, 820)
        draw_arabic(self.shop_address, 560, 800)
        draw_arabic(f"موبايل: {self.shop_phone}", 560, 780)
        c.line(50, 765, 560, 765)

        # ------------------------------
        #   جلب بيانات الفاتورة
        # ------------------------------
        db = get_connection()
        cur = db.cursor()
        cur.execute(
            """
            SELECT InvoiceID, InvoiceDate, InvoiceType,
                   TotalAmount, TotalDiscount, NetAmount, DeliveryFee
            FROM Invoices WHERE InvoiceID = ?
        """,
            invoice_id,
        )
        inv = cur.fetchone()

        y = 750
        draw_arabic(f"فاتورة رقم: {inv[0]}", 560, y)
        y -= 25
        draw_arabic(f"التاريخ: {inv[1]}", 560, y)
        y -= 25
        draw_arabic(f"النوع: {inv[2]}", 560, y)
        y -= 25

        c.line(50, y, 560, y)
        y -= 30

        # ------------------------------
        #      تفاصيل الأصناف
        # ------------------------------
        draw_arabic("الأصناف:", 560, y)
        y -= 30

        cur.execute(
            """
            SELECT ProductCode, Unit, Quantity, UnitPrice,
                   TotalPrice, Discount, NetPrice
            FROM InvoiceItems WHERE InvoiceID = ?
        """,
            invoice_id,
        )
        rows = cur.fetchall()

        for r in rows:
            cur.execute(
                "SELECT TOP 1 ItemName FROM ProductUnits WHERE ItemCode=?", r[0]
            )
            nm = cur.fetchone()
            name = nm[0] if nm else "صنف"

            draw_arabic(f"{name}", 560, y)
            draw_arabic(f"الكمية: {r[2]}", 400, y)
            draw_arabic(f"السعر: {r[3]}", 260, y)
            draw_arabic(f"الصافي: {r[6]}", 140, y)
            y -= 25

            if y < 80:
                c.showPage()
                c.setFont("Cairo", 12)
                y = 820

        c.line(50, y, 560, y)
        y -= 30

        # ------------------------------
        #   الإجماليات النهائية
        # ------------------------------
        draw_arabic(f"إجمالي المشتريات: {inv[3]}", 560, y)
        y -= 25
        draw_arabic(f"إجمالي الخصم: {inv[4]}", 560, y)
        y -= 25
        draw_arabic(f"رسوم التوصيل: {inv[6]}", 560, y)
        y -= 25
        draw_arabic(f"الصافي: {inv[5]}", 560, y)
        y -= 30

        draw_arabic("شكراً لزيارتكم", 560, y)

        c.save()
        db.close()

    # ======================================================
    #      طباعة ريسيت حراري Thermal 80mm (PDF)
    # ======================================================
    def generate_thermal_pdf(self, invoice_id):

        import os
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import portrait
        from reportlab.lib.units import mm
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        import arabic_reshaper
        from bidi.algorithm import get_display

        if not os.path.exists("receipts"):
            os.makedirs("receipts")

        font_path = "Cairo-Regular.ttf"
        if not os.path.exists(font_path):
            messagebox.showerror("خطأ", "ملف الخط Cairo-Regular.ttf غير موجود.")
            return

        pdfmetrics.registerFont(TTFont("Cairo", font_path))

        width = 80 * mm
        height = 500 * mm
        file_path = f"receipts/thermal_{invoice_id}.pdf"

        c = canvas.Canvas(file_path, pagesize=portrait((width, height)))
        c.setFont("Cairo", 10)

        def draw_ar(text, x, y):
            reshaped = arabic_reshaper.reshape(text)
            bidi = get_display(reshaped)
            c.drawRightString(x, y, bidi)

        y = 480

        draw_ar(self.shop_name, 75 * mm, y)
        y -= 12
        draw_ar(self.shop_address, 75 * mm, y)
        y -= 12
        draw_ar(f"موبايل: {self.shop_phone}", 75 * mm, y)
        y -= 18

        c.line(5 * mm, y, 75 * mm, y)
        y -= 18

        db = get_connection()
        cur = db.cursor()
        cur.execute(
            """
            SELECT InvoiceID, InvoiceDate, InvoiceType,
                   TotalAmount, TotalDiscount, NetAmount, DeliveryFee
            FROM Invoices WHERE InvoiceID = ?
        """,
            invoice_id,
        )
        inv = cur.fetchone()

        draw_ar(f"رقم الفاتورة: {inv[0]}", 75 * mm, y)
        y -= 12
        draw_ar(f"التاريخ: {inv[1]}", 75 * mm, y)
        y -= 12
        draw_ar(f"النوع: {inv[2]}", 75 * mm, y)
        y -= 18

        c.line(5 * mm, y, 75 * mm, y)
        y -= 15

        draw_ar("الأصناف:", 75 * mm, y)
        y -= 15

        cur.execute(
            """
            SELECT ProductCode, Unit, Quantity, UnitPrice,
                   TotalPrice, Discount, NetPrice
            FROM InvoiceItems WHERE InvoiceID = ?
        """,
            invoice_id,
        )
        rows = cur.fetchall()

        for r in rows:
            cur.execute(
                "SELECT TOP 1 ItemName FROM ProductUnits WHERE ItemCode=?", r[0]
            )
            nm = cur.fetchone()
            name = nm[0] if nm else "صنف"

            draw_ar(name, 75 * mm, y)
            y -= 12
            draw_ar(f"الكمية: {r[2]}   السعر: {r[3]}   الصافي: {r[6]}", 75 * mm, y)
            y -= 15

            if y <= 40:
                c.showPage()
                c.setFont("Cairo", 10)
                y = 480

        c.line(5 * mm, y, 75 * mm, y)
        y -= 15

        draw_ar(f"إجمالي: {inv[3]}", 75 * mm, y)
        y -= 12
        draw_ar(f"خصم: {inv[4]}", 75 * mm, y)
        y -= 12
        draw_ar(f"توصيل: {inv[6]}", 75 * mm, y)
        y -= 12
        draw_ar(f"الصافي: {inv[5]}", 75 * mm, y)
        y -= 18

        draw_ar("شكراً لزيارتكم", 75 * mm, y)

        c.save()
        db.close()

        messagebox.showinfo("طباعة", f"تم إنشاء ملف PDF حراري: {file_path}")

    # ======================================================


#         نقطة تشغيل البرنامج (MAIN ENTRY POINT)
# ======================================================
if __name__ == "__main__":
    print("🔵 POS APP STARTING...")

    try:
        app = POSApp()
        print("🟢 POSApp() LOADED OK")

        app.mainloop()
        print("🟡 MAINLOOP CLOSED")

    except Exception as e:
        print("🔴 ERROR OCCURRED:")
        print(str(e))

        import traceback

        traceback.print_exc()

        input("\nاضغط Enter للخروج...")
