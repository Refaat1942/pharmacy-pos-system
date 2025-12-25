print("POS STARTED OK")

import tkinter as tk
from decimal import Decimal

# ================== Core ==================
from db import get_connection
from pos_state import POSState

# ================== UI Mixins ==================
from ui_header import UIHeaderMixin
from ui_items import UIItemsMixin
from customers import CustomersMixin
from invoices import InvoicesMixin

# ================== External ==================
from knowledge_app import open_knowledge_window
from invoice_save_wrapper import safe_save_order


class POSApp(
    tk.Tk,
    POSState,
    UIHeaderMixin,
    UIItemsMixin,
    CustomersMixin,
    InvoicesMixin,
):
    def __init__(self):
        super().__init__()

        # -------- Window --------
        self.title("نقطة البيع")
        self.state("zoomed")
        self.attributes("-fullscreen", True)
        self.configure(bg="#E3F2FD")
        self.bind("<Escape>", lambda e: self.destroy())

        # -------- DB --------
        self.get_connection = get_connection

        # -------- State --------
        self.init_state()

        # -------- Load insurance companies --------
        self.ins_companies = []
        with self.get_connection() as db:
            cur = db.cursor()
            cur.execute(
                """
                SELECT CompanyID, CompanyName,
                       [Local Discount], [Imported Discount]
                FROM insuranceCompanies
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

        # -------- UI --------
        self._build_header()
        self._build_insurance_frame()
        self._build_delivery_frame()
        self._build_item_entry()
        self._build_tree()
        self._build_footer()

    # ======================================================
    #                     Footer
    # ======================================================
    def _build_footer(self):
        foot = tk.Frame(self, bg="#F3E5F5", pady=5)
        foot.pack(fill="x", padx=20)

        summary = tk.Frame(foot, bg="#F3E5F5")
        summary.pack(side="left")

        for txt, var in [
            ("الإجمالي:", "total"),
            ("قيمة الخصم:", "disc"),
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

        tk.Button(actions, text="عرض الفواتير", command=self.show_invoices).pack(
            side="left", padx=5
        )
        tk.Button(actions, text="جديد", command=self.new_invoice).pack(
            side="left", padx=5
        )
        tk.Button(actions, text="قاعدة المعرفة", command=open_knowledge_window).pack(
            side="left", padx=5
        )

        self.btn_save = tk.Button(
            actions,
            text="حفظ",
            command=lambda: safe_save_order(self),
            state="disabled",
        )
        self.btn_save.pack(side="left", padx=5)


# ======================================================
#                     Run App
# ======================================================
if __name__ == "__main__":
    app = POSApp()
    app.mainloop()
