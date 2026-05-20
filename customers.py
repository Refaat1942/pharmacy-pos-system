import tkinter as tk
from tkinter import messagebox


class CustomersMixin:

    # ======================================================
    #         تحميل بيانات الموظفين من قاعدة البيانات
    # ======================================================
    def load_employees(self):
        db = self.get_connection()
        cur = db.cursor()
        cur.execute(
            "SELECT EmployeeCode, EmployeeName FROM Employees"
        )
        rows = cur.fetchall()
        db.close()

        # خريطة الاسم -> الكود
        self.emp_map = {r[1]: r[0] for r in rows}
        return list(self.emp_map.keys())

    # ======================================================
    #           عند اختيار الموظف
    # ======================================================
    def on_emp(self):
        name = self.cmb_emp.get()
        if not name:
            return

        self.emp_code = self.emp_map.get(name)
        self.entry_code.config(state="normal")
        self.entry_code.focus()
        self.btn_add.config(state="normal")

    # ======================================================
    #           تحميل بيانات العميل من الهاتف
    # ======================================================
    def load_customer(self):
        phone = self.entry_cust.get().strip()
        if not phone:
            return

        db = self.get_connection()
        cur = db.cursor()
        cur.execute(
            """
            SELECT CustomerID, FirstName, LastName, PhoneNumber
            FROM Customers
            WHERE PhoneNumber = ?
            """,
            phone,
        )
        row = cur.fetchone()
        db.close()

        if not row:
            if messagebox.askyesno("تنبيه", "العميل غير موجود — إضافة جديد؟"):
                self.open_add_customer_window()
            return

        self.customer_id = row[0]
        self.lbl_cust.config(text=f"{row[1]} {row[2]} — {row[3]}")

    # ======================================================
    #              نافذة إضافة عميل جديد
    # ======================================================
    def open_add_customer_window(self):
        win = tk.Toplevel(self)
        win.title("➕ إضافة عميل جديد")
        win.geometry("900x650")
        win.configure(bg="#e0f7fa")

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
            tk.Label(
                frm,
                text=field,
                bg="#e0f7fa",
                font=("Cairo", 12, "bold"),
            ).grid(row=i, column=0, sticky="e", padx=10, pady=6)

            ent = tk.Entry(frm, font=("Cairo", 12), width=40)
            ent.grid(row=i, column=1, pady=6)
            entries[field] = ent

        # ==================================================
        #                  حفظ العميل
        # ==================================================
        def save_new_customer():
            data = [entries[f].get().strip() for f in fields]

            if not data[2]:
                messagebox.showerror("خطأ", "رقم الهاتف مطلوب")
                return

            try:
                db = self.get_connection()
                cur = db.cursor()

                cur.execute(
                    f"""
                    INSERT INTO Customers ({", ".join(fields)})
                    VALUES ({", ".join(["?" for _ in fields])})
                    """,
                    data,
                )

                db.commit()
                db.close()

                messagebox.showinfo("تم", "تم إضافة العميل بنجاح")

                # ربط العميل بالفاتورة الحالية
                self.entry_cust.delete(0, "end")
                self.entry_cust.insert(0, data[2])
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
