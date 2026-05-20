from decimal import Decimal

class POSState:
    def init_state(self):
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
