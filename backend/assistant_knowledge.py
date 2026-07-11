"""Curated ERP help text for the in-app AI assistant (system prompt + FAQ fallback)."""

SYSTEM_GUIDE_EN = """
You are Fratelanza PharmaPOS Assistant — a helpful expert for pharmacy staff using this ERP.
Answer clearly and practically. Always reply in the same language the user writes in (Arabic Egyptian or English).
You help with: Point of Sale, sales, returns, inventory, purchases, customers, suppliers,
transfers, expiry, reports, cash shifts, settings, barcode labels, dose labels, small items on POS,
deliveries, clinics/prescriptions, fraud surveillance (admin), stock reallocation, HR (if enabled).
Do NOT invent features that are not listed in ENABLED FEATURES below.
If unsure, say what menu path to check. Keep answers short (2-6 sentences) unless they ask for steps.

POS essentials:
- Each employee logs in with their own account — sales are recorded under the logged-in user automatically.
- Scan barcode or search product. Cart on the right.
- Payment types: cash, visa, hybrid, account (credit customer), delivery, digital platforms.
- Multiple POS windows: "New POS window" opens separate cart.
- Suspend/Held carts for serving another customer.
- Invoice discount and per-line discount available.
- Sales History for reprint and returns. Returns restore stock.
- Open shift required before selling (Cash Drawer / Shifts).

Inventory: Items tab add/edit, bulk upload Excel, branch stock, stocktake, movements.
Barcode Labels tab: search, select, print thermal 38mm labels.
Purchases: PO, bonus qty, Save & Receive adds stock. Print labels after receive.
Customers: accounts, credit sales, payments, bulk upload.
Settings (admin): users, branches, pharmacy receipt branding, POS small items list.
Backup runs on server at 3 AM — admin uses VPS scripts, not in-app button.

When giving steps, use menu names exactly as shown in the app sidebar.
"""

SYSTEM_GUIDE_AR = """
أنت مساعد نظام صيدلية فراتيلانزا — خبير يساعد موظفي الصيدلية على استخدام النظام.
أجب بوضوح وعملياً بنفس لغة المستخدم (عربي مصري أو إنجليزي).
تساعد في: نقطة البيع، المبيعات، المرتجعات، المخزون، المشتريات، العملاء، الموردين،
التحويلات، الصلاحية، التقارير، درج الكاش، الإعدادات، ملصقات الباركود، ملصقات الجرعة،
المستلزمات الصغيرة في نقطة البيع، التوصيل، العيادات/الروشتات، مراقبة الاحتيال (مدير)، إعادة توزيع المخزون.
لا تخترع ميزات غير موجودة في الميزات المفعّلة أدناه.
إذا لم تكن متأكداً، اذكر مسار القائمة. إجابات مختصرة إلا إذا طلبوا خطوات.

نقطة البيع: كل موظف يسجّل دخوله بحسابه — البيع يُسجّل باسم المستخدم تلقائياً. امسح الباركود أو ابحث. السلة على اليمين.
طرق الدفع: نقدي، فيزا، مختلط، آجل (عميل)، توصيل، منصات رقمية.
نافذة بيع جديدة = سلة مستقلة. تعليق/سلال معلقة. خصم على الفاتورة أو الصنف.
سجل المبيعات للطباعة والمرتجعات. افتح وردية قبل البيع من درج الكاش.

المخزون: إضافة أصناف، رفع جماعي، جرد، حركات. تبويب ملصقات الباركود للطباعة الحرارية.
المشتريات: أمر شراء، استلام، زيادة المخزون. العملاء: حسابات ودفعات.
الإعدادات (مدير): مستخدمون، فروع، بيانات الصيدلية، قائمة المستلزمات الصغيرة في نقطة البيع.
"""

FAQ_ENTRIES = [
    {
        "keys": ["sale", "sell", "pos", "pay", "checkout", "بيع", "دفع", "كاشير"],
        "en": "POS sale: 1) Scan/search products. 2) Click Checkout → choose payment → Confirm. You need an open cash shift first (Cash Drawer → Start Shift). The sale is saved under your login.",
        "ar": "البيع: ١) امسح/ابحث عن الأصناف. ٢) الدفع → اختر طريقة الدفع → تأكيد. يجب فتح وردية أولاً من درج الكاش. البيع يُسجّل باسم حسابك تلقائياً.",
    },
    {
        "keys": ["return", "refund", "مرتجع", "استرجاع"],
        "en": "Returns: Sales History → open invoice → Return → pick items and reason. Stock is restored automatically.",
        "ar": "المرتجعات: سجل المبيعات → افتح الفاتورة → مرتجع → اختر الأصناف والسبب. المخزون يُعاد تلقائياً.",
    },
    {
        "keys": ["barcode", "label", "print", "thermal", "ملصق", "باركود", "طباعة"],
        "en": "Barcode labels: Inventory → Barcode Labels tab → search product → select → Print. Choose thermal 38mm in print dialog for Xprinter.",
        "ar": "ملصقات الباركود: المخزون → تبويب ملصقات الباركود → ابحث → حدّد → طباعة. اختر حراري 38مم في نافذة الطباعة.",
    },
    {
        "keys": ["dose", "جرعة", "direction"],
        "en": "Dose labels: Inventory → Dose Labels → select product → pick preset (once daily, before meals…) or type custom → Print.",
        "ar": "ملصقات الجرعة: المخزون → ملصقات الجرعة → اختر صنفاً → جرعة جاهزة أو نص مخصص → طباعة.",
    },
    {
        "keys": ["shift", "cash", "drawer", "وردية", "درج"],
        "en": "Cash shift: Shifts → Start Shift (opening cash) at day start. Close Shift at end — system compares expected vs counted cash.",
        "ar": "الوردية: درج الكاش → بدء وردية (رصيد افتتاحي). إغلاق وردية في النهاية — النظام يقارن المتوقع بالفعلي.",
    },
    {
        "keys": ["purchase", "po", "receive", "شراء", "مورد"],
        "en": "Purchases: Purchases → New → supplier, branch, lines with cost/expiry → Save or Save & Receive to add stock immediately.",
        "ar": "المشتريات: المشتريات → جديد → مورد وفرع وأصناف → حفظ أو حفظ واستلام لزيادة المخزون فوراً.",
    },
    {
        "keys": ["customer", "credit", "account", "عميل", "آجل"],
        "en": "Credit sales: add customer in Customers, then POS → select customer → payment method Account. Record payments in Customers → $ icon.",
        "ar": "البيع الآجل: أضف العميل من العملاء، ثم نقطة البيع → اختر العميل → دفع آجل. سجّل الدفعات من أيقونة الدولار في العملاء.",
    },
    {
        "keys": ["inventory", "stock", "مخزون", "صنف"],
        "en": "Inventory: add products under Items tab. Adjust stock via Purchases (correct way) or manual adjustment with a reason note.",
        "ar": "المخزون: أضف الأصناف من تبويب الأصناف. زِد المخزون بالمشتريات (الطريقة الصحيحة) أو تعديل يدوي مع سبب.",
    },
    {
        "keys": ["tissue", "small", "extra", "change", "مناديل", "مستلزمات", "باقي"],
        "en": "Small items on POS: Settings → Pharmacy → POS small items — add tissues etc. They appear as quick buttons below the search bar on POS.",
        "ar": "المستلزمات الصغيرة: الإعدادات → الصيدلية → أصناف صغيرة في نقطة البيع. تظهر كأزرار سريعة تحت البحث في نقطة البيع.",
    },
    {
        "keys": ["report", "تقرير"],
        "en": "Reports: sidebar Reports (admin/pharmacist) — pick report type, set dates, Apply. Export to Excel where available.",
        "ar": "التقارير: من القائمة تقارير — اختر النوع والفترة → تطبيق. تصدير إكسل حيث متاح.",
    },
    {
        "keys": ["backup", "نسخ"],
        "en": "Database backup runs automatically on the server at 3 AM. Ask your IT admin to verify /var/backups/pharmapos on the VPS.",
        "ar": "النسخ الاحتياطي يعمل تلقائياً على السيرفر الساعة ٣ صباحاً. اطلب من مسؤول السيرفر التحقق من /var/backups/pharmapos.",
    },
    {
        "keys": ["offer", "promo", "عرض", "ترويج"],
        "en": "Promo offers (if enabled): Admin → Promo Offers to create groups. POS auto-applies when scanning qualifying items. Reports → Offer Sales.",
        "ar": "العروض (إن كانت مفعّلة): العروض الترويجية للمدير. نقطة البيع تطبّق تلقائياً عند مسح أصناف العرض. تقرير مبيعات العروض.",
    },
]


def faq_fallback(question: str, lang: str) -> str:
    q = (question or "").lower()
    best = None
    best_score = 0
    for entry in FAQ_ENTRIES:
        score = sum(1 for k in entry["keys"] if k.lower() in q)
        if score > best_score:
            best_score = score
            best = entry
    if best and best_score > 0:
        return best["ar"] if lang == "ar" else best["en"]
    if lang == "ar":
        return (
            "يمكنني مساعدتك في نقطة البيع، المخزون، المشتريات، العملاء، الورديات، والتقارير. "
            "اسأل سؤالاً محدداً مثل: كيف أعمل بيع؟ أو كيف أطبع ملصق باركود؟"
        )
    return (
        "I can help with POS, inventory, purchases, customers, shifts, and reports. "
        "Try a specific question like: How do I make a sale? or How to print barcode labels?"
    )


def build_system_prompt(lang: str, enabled_features: list[str], user_role: str, page_context: str | None) -> str:
    guide = SYSTEM_GUIDE_AR if lang == "ar" else SYSTEM_GUIDE_EN
    feats = ", ".join(enabled_features) if enabled_features else "pos, sales, inventory"
    ctx = f"\nCurrent screen context: {page_context}" if page_context else ""
    lang_rule = (
        "اكتب بالعربية المصرية الواضحة إذا سأل بالعربي؛ وبالإنجليزية إذا سأل بالإنجليزي."
        if lang == "ar"
        else "Use clear Egyptian Arabic if the user writes in Arabic; English if they write in English."
    )
    return (
        f"{guide}\n\nENABLED FEATURES: {feats}\nUSER ROLE: {user_role}{ctx}\n"
        f"{lang_rule}\nAnswer only about this pharmacy ERP. Be friendly and professional."
    )
