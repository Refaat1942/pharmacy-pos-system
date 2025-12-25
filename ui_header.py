import tkinter as tk
from tkinter import ttk
from datetime import datetime
from decimal import Decimal


class UIHeaderMixin:

    # ======================================================
    #                 Header
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
            hdr,
            state="readonly",
            width=20,
            values=["كاش", "تأمين", "توصيل منزلي"],
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

        # الموظف
        tk.Label(hdr, text="الموظف:", bg="#1976D2", fg="white").pack(
            side="left", padx=5
        )
        self.cmb_emp = ttk.Combobox(hdr, width=20, state="readonly")
        self.cmb_emp["values"] = self.load_employees()
        self.cmb_emp.pack(side="left")
        self.cmb_emp.bind("<<ComboboxSelected>>", lambda e: self.on_emp())

        now = datetime.now().strftime("%Y/%m/%d  %H:%M:%S")
        tk.Label(hdr, text=now, bg="#1976D2", fg="white").pack(
            side="right", padx=20
        )

    # ======================================================
    #            تغيير نوع الفاتورة
    # ======================================================
    def on_type_change(self):
        val = self.cmb_type.get()

        # Reset
        self.invoice_type = "CASH"
        self.ins_frame.pack_forget()
        self.dlv_frame.pack_forget()

        if val == "كاش":
            self.invoice_type = "CASH"

        elif val == "تأمين":
            self.invoice_type = "insurance"
            self.ins_frame.pack(fill="x", padx=20, pady=5)

        elif val == "توصيل منزلي":
            self.invoice_type = "DELIVERY"
            self.dlv_frame.pack(fill="x", padx=20, pady=5)

        self._refresh_table()

    # ======================================================
    #                Insurance Frame
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
        self.entry_card.grid(row=0, column=3, columnspan=2, padx=5)

        tk.Label(fr, text="خصم محلي (%):", bg="#FFF8E1").grid(row=1, column=0, padx=5)
        self.entry_LocalDiscount = ttk.Entry(fr, width=8, state="readonly")
        self.entry_LocalDiscount.grid(row=1, column=1, padx=5)

        tk.Label(fr, text="خصم مستورد (%):", bg="#FFF8E1").grid(row=1, column=2, padx=5)
        self.entry_ImportedDiscount = ttk.Entry(fr, width=8, state="readonly")
        self.entry_ImportedDiscount.grid(row=1, column=3, padx=5)

        tk.Label(fr, text="نسبة التحمل (%):", bg="#FFF8E1").grid(row=1, column=4, padx=5)
        self.entry_copay = ttk.Entry(fr, width=8)
        self.entry_copay.insert(0, "0")
        self.entry_copay.grid(row=1, column=5, padx=5)
        self.entry_copay.bind("<KeyRelease>", lambda e: self._refresh_table())

    # ======================================================
    #         عند اختيار شركة التأمين
    # ======================================================
    def on_insurance_select(self):
        name = self.cmb_ins.get()
        comp = next((c for c in self.ins_companies if c["name"] == name), None)
        if not comp:
            return

        self.LocalDiscount = Decimal(comp["local"])
        self.ImportedDiscount = Decimal(comp["imported"])

        self.entry_LocalDiscount.config(state="normal")
        self.entry_ImportedDiscount.config(state="normal")

        self.entry_LocalDiscount.delete(0, "end")
        self.entry_LocalDiscount.insert(0, str(self.LocalDiscount))

        self.entry_ImportedDiscount.delete(0, "end")
        self.entry_ImportedDiscount.insert(0, str(self.ImportedDiscount))

        self.entry_LocalDiscount.config(state="readonly")
        self.entry_ImportedDiscount.config(state="readonly")

        self._refresh_table()

    # ======================================================
    #                Delivery Frame
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
    #            تغيير رسوم التوصيل
    # ======================================================
    def on_delivery_fee_change(self):
        try:
            self.delivery_fee = Decimal(self.entry_delivery.get())
        except:
            self.delivery_fee = Decimal(0)

        self._refresh_table()
