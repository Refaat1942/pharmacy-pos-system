import tkinter as tk
from tkinter import ttk, messagebox
from decimal import Decimal


class UIItemsMixin:

    # ======================================================
    #               إدخال الصنف
    # ======================================================
    def _build_item_entry(self):
        frm = tk.Frame(self, bg="#F3E5F5", pady=5)
        frm.pack(fill="x", padx=20)

        ttk.Label(frm, text="بحث صنف:", background="#F3E5F5").grid(row=0, column=0, padx=5)

        self.entry_search = ttk.Entry(frm, width=30)
        self.entry_search.grid(row=0, column=1, padx=5)
        self.entry_search.bind("<KeyRelease>", self.on_search_keyrelease)

        self.listbox_sug = tk.Listbox(frm, height=4)
        self.listbox_sug.grid(row=1, column=1, sticky="we", padx=5)
        self.listbox_sug.bind("<<ListboxSelect>>", self.on_suggestion_select)
        self.listbox_sug.grid_remove()

        ttk.Label(frm, text="باركود:", background="#F3E5F5").grid(row=0, column=2, padx=5)
        self.entry_code = ttk.Entry(frm, width=20, state="disabled")
        self.entry_code.grid(row=0, column=3, padx=5)
        self.entry_code.bind("<Return>", lambda e: self.add_item())

        ttk.Label(frm, text="كمية:", background="#F3E5F5").grid(row=0, column=4, padx=5)
        self.entry_qty = ttk.Entry(frm, width=8)
        self.entry_qty.grid(row=0, column=5, padx=5)
        self.entry_qty.insert(0, "1")

        self.btn_add = ttk.Button(frm, text="أضف", command=self.add_item, state="disabled")
        self.btn_add.grid(row=0, column=6, padx=20)

    # ======================================================
    #                 جدول الأصناف
    # ======================================================
    def _build_tree(self):
        cols = ("idx", "code", "name", "unit", "qty", "up", "total", "disc", "net")
        headers = ("م", "الكود", "الصنف", "الوحدة", "كمية", "سعر", "المجموع", "خصم", "صافي")
        widths = (50, 100, 400, 100, 80, 100, 120, 100, 120)

        self.tree = ttk.Treeview(self, columns=cols, show="headings", height=15)
        for c, h, w in zip(cols, headers, widths):
            self.tree.heading(c, text=h)
            self.tree.column(c, width=w, anchor="center")

        self.tree.pack(fill="both", expand=True, padx=20, pady=5)
        self.tree.bind("<Double-1>", self._on_double_click)

        self.btn_del = ttk.Button(self, text="حذف صنف", command=self.delete_item, state="disabled")
        self.btn_del.pack(pady=5)

    # ======================================================
    #                البحث أثناء الكتابة
    # ======================================================
    def on_search_keyrelease(self, event):
        txt = self.entry_search.get().strip()
        if len(txt) < 2:
            self.listbox_sug.grid_remove()
            return

        db = self.get_connection()
        cur = db.cursor()
        cur.execute(
            """
            SELECT TOP 10 CAST(ItemCode AS VARCHAR(50)), ItemName
            FROM ProductUnits
            WHERE ItemName LIKE ? OR CAST(ItemCode AS VARCHAR(50)) LIKE ?
            """,
            f"%{txt}%", f"%{txt}%"
        )
        rows = cur.fetchall()
        db.close()

        self.listbox_sug.delete(0, "end")
        for r in rows:
            self.listbox_sug.insert("end", f"{r[0]} | {r[1]}")

        self.listbox_sug.grid() if rows else self.listbox_sug.grid_remove()

    # ======================================================
    #           اختيار صنف
    # ======================================================
    def on_suggestion_select(self, event):
        if not self.listbox_sug.curselection():
            return

        val = self.listbox_sug.get(self.listbox_sug.curselection())
        code = val.split("|")[0].strip()

        self.entry_code.config(state="normal")
        self.entry_code.delete(0, "end")
        self.entry_code.insert(0, code)

        self.listbox_sug.grid_remove()
        self.entry_qty.focus()

    # ======================================================
    #           جلب الوحدات (منطق القديم)
    # ======================================================
    def fetch_units(self, item_code):
        db = self.get_connection()
        cur = db.cursor()
        cur.execute(
            """
            SELECT UnitName, Price
            FROM ProductUnits
            WHERE CAST(ItemCode AS VARCHAR(50)) = ?
            """,
            item_code
        )
        rows = cur.fetchall()
        db.close()

        units = []
        for unit, price in rows:
            units.append({
                "unit": str(unit).strip(),
                "price": Decimal(price).quantize(Decimal("0.01"))
            })

        # fallback زي القديم
        if not units:
            units = [{
                "unit": "",
                "price": Decimal("0.00")
            }]

        return units

    # ======================================================
    #           Double Click (وحدة / كمية)
    # ======================================================
    def _on_double_click(self, event):
        region = self.tree.identify("region", event.x, event.y)
        if region != "cell":
            return

        col = self.tree.identify_column(event.x)
        row = self.tree.identify_row(event.y)
        if not row:
            return

        idx = int(row) - 1
        item = self.items[idx]
        x, y, w, h = self.tree.bbox(row, col)

        # تعديل الوحدة
        if col == "#4":
            cmb = ttk.Combobox(self.tree, values=item["units"], state="readonly")
            cmb.place(x=x, y=y, width=w, height=h)
            cmb.set(item["unit"])

            def change_unit(_):
                u = cmb.get()
                price = item["price_map"].get(u, Decimal("0.00"))
                item["unit"] = u
                item["up"] = float(price)
                item["total"] = float(price * Decimal(item["qty"]))
                self._recalc_item(item)
                cmb.destroy()
                self._refresh_table()

            cmb.bind("<<ComboboxSelected>>", change_unit)

        # تعديل الكمية
        elif col == "#5":
            ent = ttk.Entry(self.tree)
            ent.place(x=x, y=y, width=w, height=h)
            ent.insert(0, item["qty"])
            ent.focus()

            def save_qty(event=None):
                try:
                    qty = Decimal(ent.get())
                except:
                    ent.destroy()
                    return

                item["qty"] = float(qty)
                item["total"] = float(Decimal(item["up"]) * qty)
                self._recalc_item(item)
                ent.destroy()
                self._refresh_table()

            ent.bind("<Return>", save_qty)
            ent.bind("<FocusOut>", lambda e: ent.destroy())

    # ======================================================
    #                إضافة صنف
    # ======================================================
    def add_item(self):
        code = self.entry_code.get().strip()
        if not code:
            return

        db = self.get_connection()
        cur = db.cursor()
        cur.execute(
            "SELECT TOP 1 ItemName FROM ProductUnits WHERE CAST(ItemCode AS VARCHAR(50))=?",
            code
        )
        row = cur.fetchone()
        db.close()

        if not row:
            messagebox.showerror("خطأ", "الصنف غير موجود")
            return

        name = row[0]
        units = self.fetch_units(code)

        unit_names = [u["unit"] for u in units]
        price_map = {u["unit"]: u["price"] for u in units}
        base_unit = unit_names[0]

        if not base_unit:
            messagebox.showerror("خطأ", "لا توجد وحدة صالحة لهذا الصنف")
            return

        qty = Decimal(self.entry_qty.get())
        price = price_map[base_unit]
        total = price * qty

        item = {
            "idx": len(self.items) + 1,
            "id": code,
            "name": name,
            "unit": base_unit,
            "qty": float(qty),
            "up": float(price),
            "total": float(total),
            "disc": 0.0,
            "net": float(total),
            "units": unit_names,
            "price_map": price_map,
        }

        self._recalc_item(item)
        self.items.append(item)
        self._refresh_table()

        self.btn_del.config(state="normal")
        self.btn_save.config(state="normal")

    # ======================================================
    #            إعادة حساب الخصم
    # ======================================================
    def _recalc_item(self, item):
        total = Decimal(item["total"])
        pct = Decimal(0)

        if self.invoice_type == "insurance":
            pct = self.LocalDiscount

        disc = (total * pct / 100).quantize(Decimal("0.01"))
        item["disc"] = float(disc)
        item["net"] = float(total - disc)

    # ======================================================
    #            تحديث الجدول
    # ======================================================
    def _refresh_table(self):
        self.tree.delete(*self.tree.get_children())

        tot = Decimal(0)
        disc = Decimal(0)

        for i in self.items:
            self.tree.insert("", "end", iid=i["idx"], values=(
                i["idx"], i["id"], i["name"], i["unit"],
                i["qty"], i["up"], i["total"], i["disc"], i["net"]
            ))
            tot += Decimal(i["total"])
            disc += Decimal(i["disc"])

        self.lbl_total.config(text=f"{tot:.2f}")
        self.lbl_disc.config(text=f"{disc:.2f}")
        self.lbl_due.config(text=f"{(tot - disc):.2f}")

    # ======================================================
    #                حذف صنف
    # ======================================================
    def delete_item(self):
        sel = self.tree.selection()
        if not sel:
            return

        self.items.pop(int(sel[0]) - 1)
        for i, it in enumerate(self.items):
            it["idx"] = i + 1

        self._refresh_table()
        if not self.items:
            self.btn_del.config(state="disabled")
            self.btn_save.config(state="disabled")
