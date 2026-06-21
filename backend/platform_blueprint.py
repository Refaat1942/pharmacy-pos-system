"""Sales blueprint content for the Control Platform (customer sign-off & demo videos)."""
from __future__ import annotations

import platform_db

FEATURE_LABELS_AR = {
    "dashboard": "لوحة التحكم",
    "pos": "نقطة البيع",
    "sales": "سجل المبيعات",
    "returns": "المرتجعات",
    "inventory": "المخزون",
    "transfers": "تحويلات الفروع",
    "branches_stock": "مخزون الفروع",
    "expiry": "تواريخ الصلاحية",
    "purchases": "أوامر الشراء",
    "suppliers": "الموردون",
    "customers": "العملاء / الآجل",
    "clinics": "العيادات والروشتات",
    "reports": "التقارير والتحليلات",
    "fraud_surveillance": "مراقبة الاحتيال",
    "stock_reallocation": "إعادة توزيع المخزون",
    "offers": "العروض الترويجية",
    "shifts": "درج النقدية / الورديات",
    "hr": "الموارد البشرية والمرتبات",
    "settings": "الإعدادات",
    "ai_assistant": "المساعد الذكي",
    "loyalty": "برنامج الولاء",
    "pos_counseling": "نصائح ذكية في نقطة البيع",
}

BLUEPRINT_META = {
    "title_en": "Fratelanza Pharmacy ERP",
    "title_ar": "نظام فراتيلانزا لإدارة الصيدليات",
    "subtitle_en": "Product Blueprint & Feature Overview",
    "subtitle_ar": "مخطط المنتج وعرض المميزات",
    "tagline_en": "Bilingual cloud POS and ERP built for Egyptian pharmacies.",
    "tagline_ar": "نظام نقطة بيع وإدارة موارد سحابي ثنائي اللغة مصمم للصيدليات المصرية.",
    "version": "2026",
}

BLUEPRINT_SECTIONS = [
    {
        "id": "overview",
        "always_show": True,
        "title_en": "1. What you get",
        "title_ar": "١. ما الذي تحصل عليه",
        "summary_en": "A complete pharmacy management system — hosted securely in the cloud with your own private database.",
        "summary_ar": "نظام إدارة صيدلية متكامل — مستضاف بأمان على السحابة مع قاعدة بيانات خاصة بصيدليتك فقط.",
        "bullets_en": [
            "English & Arabic interface with RTL support",
            "Works on PC, tablet, and phone browser",
            "Each pharmacy gets an isolated database",
            "Role-based access: admin, cashier, inventory, HR",
            "Receipt printing (58mm / 80mm / A4) with your logo",
        ],
        "bullets_ar": [
            "واجهة عربية وإنجليزية مع دعم الكتابة من اليمين لليسار",
            "يعمل على الكمبيوتر والتابلت والموبايل",
            "كل صيدلية لها قاعدة بيانات معزولة",
            "صلاحيات حسب الدور: مدير، كاشير، مخزون، موارد بشرية",
            "طباعة إيصالات (58مم / 80مم / A4) مع شعار الصيدلية",
        ],
    },
    {
        "id": "pos",
        "feature_keys": ["pos"],
        "title_en": "2. Point of Sale (POS)",
        "title_ar": "٢. نقطة البيع (POS)",
        "summary_en": "Fast checkout designed for busy pharmacy counters.",
        "summary_ar": "بيع سريع مصمم لكاونتر الصيدلية المزدحم.",
        "bullets_en": [
            "Barcode scan or search by name / international barcode",
            "Sell by box or sub-unit (strip, tablet); negative stock allowed when needed",
            "Cash, Visa, hybrid, InstaPay, Vodafone Cash, on-account, insurance & digital sales",
            "Select or scan seller (login card QR); optional walk-in customer on cash sales",
            "Promo offers, loyalty redeem, suspend / recall carts",
            "Load clinic prescriptions into the cart",
            "Dose labels & customizable receipts with logo and tax ID",
        ],
        "bullets_ar": [
            "مسح الباركود أو البحث بالاسم / الباركود الدولي",
            "البيع بالعلبة أو الوحدة الفرعية؛ السماح بالمخزون السالب عند الحاجة",
            "نقدي، فيزا، مختلط، InstaPay، فودافون كاش، آجل، تأمين ومبيعات المنصات",
            "اختيار أو مسح البائع (QR بطاقة الدخول)； عميل اختياري في البيع النقدي",
            "عروض ترويجية، استبدال نقاط الولاء، تعليق / استرجاع السلة",
            "تحميل روشتات العيادات إلى السلة",
            "ملصقات الجرعات وإيصالات قابلة للتخصيص",
        ],
    },
    {
        "id": "sales",
        "feature_keys": ["sales", "returns"],
        "title_en": "3. Sales history & returns",
        "title_ar": "٣. سجل المبيعات والمرتجعات",
        "summary_en": "Full audit trail of every transaction.",
        "summary_ar": "سجل كامل لكل عملية بيع ومرتجع.",
        "bullets_en": [
            "Search sales by date, branch, seller, payment type",
            "Reprint any receipt",
            "Returns linked to original invoice",
            "Delivery queue management",
        ],
        "bullets_ar": [
            "بحث المبيعات بالتاريخ والفرع والبائع وطريقة الدفع",
            "إعادة طباعة أي إيصال",
            "مرتجعات مربوطة بالفاتورة الأصلية",
            "إدارة طابور التوصيل",
        ],
    },
    {
        "id": "inventory",
        "feature_keys": ["inventory", "expiry"],
        "title_en": "4. Inventory & stock control",
        "title_ar": "٤. المخزون ومراقبة الأصناف",
        "summary_en": "Know what you have, where it is, and when it expires.",
        "summary_ar": "اعرف ما لديك، أين هو، ومتى ينتهي.",
        "bullets_en": [
            "Product catalog with cost, price, min stock alerts",
            "Bulk Excel upload",
            "Stock take with variance report",
            "Multiple expiry batches per product",
            "Barcode designer & label printing",
        ],
        "bullets_ar": [
            "كتالوج أصناف مع التكلفة والسعر وتنبيه الحد الأدنى",
            "رفع جماعي من Excel",
            "جرد مخزون مع تقرير الفروقات",
            "دفعات صلاحية متعددة لكل صنف",
            "مصمم باركود وطباعة ملصقات",
        ],
    },
    {
        "id": "purchases",
        "feature_keys": ["purchases", "suppliers"],
        "title_en": "5. Purchases & suppliers",
        "title_ar": "٥. المشتريات والموردون",
        "summary_en": "Record incoming goods and track supplier balances.",
        "summary_ar": "تسجيل البضاعة الواردة ومتابعة أرصدة الموردين.",
        "bullets_en": [
            "Supplier directory with balances",
            "Purchase orders with discounts and VAT",
            "Receive stock into branch inventory",
            "Supplier payment history",
        ],
        "bullets_ar": [
            "دليل الموردين مع الأرصدة",
            "أوامر شراء مع خصومات وضريبة",
            "استلام البضاعة إلى مخزون الفرع",
            "سجل مدفوعات الموردين",
        ],
    },
    {
        "id": "customers",
        "feature_keys": ["customers"],
        "title_en": "6. Customers & on-account",
        "title_ar": "٦. العملاء والبيع الآجل",
        "summary_en": "Manage credit customers and corporate accounts.",
        "summary_ar": "إدارة عملاء الآجل والحسابات الجملة.",
        "bullets_en": [
            "Customer profiles with credit limits",
            "On-account sales with statement",
            "Payment recording",
            "Bulk customer upload",
        ],
        "bullets_ar": [
            "ملفات عملاء مع حدود ائتمان",
            "بيع آجل مع كشف حساب",
            "تسجيل المدفوعات",
            "رفع عملاء جماعي",
        ],
    },
    {
        "id": "branches",
        "feature_keys": ["transfers", "branches_stock"],
        "title_en": "7. Multi-branch operations",
        "title_ar": "٧. إدارة الفروع المتعددة",
        "summary_en": "For pharmacy chains with more than one location.",
        "summary_ar": "لسلاسل الصيدليات ذات أكثر من فرع.",
        "bullets_en": [
            "Separate stock per branch",
            "Stock transfers with print slip",
            "Central branch stock overview",
            "Per-branch users and permissions",
        ],
        "bullets_ar": [
            "مخزون منفصل لكل فرع",
            "تحويلات مخزون مع إذن طباعة",
            "نظرة شاملة على مخزون الفروع",
            "مستخدمون وصلاحيات لكل فرع",
        ],
    },
    {
        "id": "shifts",
        "feature_keys": ["shifts"],
        "title_en": "8. Cash drawer & shifts",
        "title_ar": "٨. درج النقدية والورديات",
        "summary_en": "End-of-day control for cashiers.",
        "summary_ar": "رقابة نهاية اليوم للكاشير.",
        "bullets_en": [
            "Open / close shift with opening float",
            "Morning / evening / night shifts",
            "X and Z reports; cash & Visa variance",
            "Block close if deliveries pending",
        ],
        "bullets_ar": [
            "فتح / إغلاق وردية مع رصيد افتتاحي",
            "ورديات صباحية / مسائية / ليلية",
            "تقارير X و Z؛ فروقات النقدي والفيزا",
            "منع الإغلاق إذا توصيل معلق",
        ],
    },
    {
        "id": "clinics",
        "feature_keys": ["clinics"],
        "title_en": "9. Clinics & prescriptions",
        "title_ar": "٩. العيادات والروشتات",
        "summary_en": "Partner clinics send prescriptions digitally.",
        "summary_ar": "العيادات الشريكة ترسل الروشتات إلكترونياً.",
        "bullets_en": [
            "Clinic portal with private link",
            "Prescription loads in POS cart",
            "Track pending vs handled",
        ],
        "bullets_ar": [
            "بوابة عيادة برابط خاص",
            "تحميل الروشتة في سلة نقطة البيع",
            "متابعة المعلق والمنفذ",
        ],
    },
    {
        "id": "reports",
        "feature_keys": ["dashboard", "reports", "fraud_surveillance", "stock_reallocation"],
        "title_en": "10. Reports & analytics",
        "title_ar": "١٠. التقارير والتحليلات",
        "summary_en": "Decisions backed by real numbers.",
        "summary_ar": "قرارات مبنية على أرقام حقيقية.",
        "bullets_en": [
            "Dashboard KPIs",
            "Sales reports with Excel export",
            "Fraud surveillance",
            "Smart stock reallocation",
        ],
        "bullets_ar": [
            "مؤشرات لوحة التحكم",
            "تقارير مبيعات مع تصدير Excel",
            "مراقبة الاحتيال",
            "إعادة توزيع المخزون الذكية",
        ],
    },
    {
        "id": "hr",
        "feature_keys": ["hr"],
        "title_en": "11. HR & payroll",
        "title_ar": "١١. الموارد البشرية والمرتبات",
        "summary_en": "Employees, attendance, and payslips.",
        "summary_ar": "الموظفون والحضور وكشوف المرتبات.",
        "bullets_en": [
            "Employee records linked to users",
            "QR clock-in attendance & employee login cards",
            "Payroll, performance, printable salary slips",
        ],
        "bullets_ar": [
            "سجلات موظفين مربوطة بالمستخدمين",
            "حضور بمسح QR وبطاقات دخول الموظفين",
            "مرتبات، أداء، كشوف مرتبات قابلة للطباعة",
        ],
    },
    {
        "id": "insurance",
        "feature_keys": ["insurance"],
        "title_en": "12. Insurance billing",
        "title_ar": "١٢. فواتير التأمين",
        "summary_en": "Egyptian insurance companies, claims, and POS billing.",
        "summary_ar": "شركات التأمين المصرية والمطالبات والفوترة من نقطة البيع.",
        "bullets_en": [
            "Manage companies, coverage rules & patient share",
            "Insurance checkout at POS with bilingual claim PDFs",
            "Claims queue, audit log, insurance reports",
        ],
        "bullets_ar": [
            "إدارة الشركات وقواعد التغطية وحصة المريض",
            "إتمام بيع التأمين من نقطة البيع مع PDF مطالبات ثنائي",
            "قائمة المطالبات، سجل تدقيق، تقارير التأمين",
        ],
    },
    {
        "id": "loyalty_offers",
        "feature_keys": ["loyalty", "offers", "discount_cards"],
        "title_en": "13. Loyalty, offers & discount cards",
        "title_ar": "١٣. الولاء والعروض وبطاقات الخصم",
        "summary_en": "Grow repeat business and controlled promotions.",
        "summary_ar": "زيادة العملاء المتكررين والعروض المضبوطة.",
        "bullets_en": [
            "Points earn/redeem at POS",
            "Auto-applied promo offers & offer sales reports",
            "Corporate / card-based discount rules",
        ],
        "bullets_ar": [
            "كسب واستبدال النقاط في نقطة البيع",
            "عروض تطبّق تلقائياً وتقارير مبيعات العروض",
            "خصومات بطاقات / شركات",
        ],
    },
    {
        "id": "ai",
        "feature_keys": ["ai_assistant", "pos_counseling"],
        "title_en": "14. Smart assistant & counseling",
        "title_ar": "١٤. المساعد الذكي والنصائح",
        "summary_en": "In-app help and optional AI guidance at the counter.",
        "summary_ar": "مساعدة داخل النظام وإرشاد اختياري عند الكاونتر.",
        "bullets_en": [
            "Floating bilingual assistant widget",
            "POS counseling tips for related products",
        ],
        "bullets_ar": [
            "ودجت مساعد ثنائي اللغة",
            "نصائح استشارة في نقطة البيع لمنتجات مرتبطة",
        ],
    },
    {
        "id": "platform",
        "always_show": True,
        "title_en": "15. Hosting, plans & support",
        "title_ar": "١٥. الاستضافة والباقات والدعم",
        "summary_en": "We run the servers; you run the pharmacy.",
        "summary_ar": "نحن نشغّل السيرفرات؛ أنت تشغّل الصيدلية.",
        "bullets_en": [
            "Secure HTTPS with your pharmacy code",
            "Plans: Basic, Pro, Enterprise — modules scale with you",
            "Shareable demo links for trials (all features, read-only exports)",
            "Automatic updates, daily backups, isolated data",
            "Training and onboarding support",
        ],
        "bullets_ar": [
            "اتصال آمن HTTPS بكود صيدليتك",
            "باقات: Basic و Pro و Enterprise — الوحدات تنمو معك",
            "روابط تجريبية قابلة للمشاركة (كل المميزات، بدون تصدير حساس)",
            "تحديثات تلقائية، نسخ احتياطي يومي، بيانات معزولة",
            "تدريب ودعم عند التشغيل",
        ],
    },
]

POS_VIDEO_SCRIPT = [
    {
        "time": "0:00–0:45",
        "scene_en": "Introduction & login",
        "scene_ar": "المقدمة وتسجيل الدخول",
        "script_en": "Welcome to Fratelanza Pharmacy ERP. Every pharmacy has its own private system. Enter your pharmacy code, username, and password — or use a demo link from your sales contact. Switch language Arabic/English anytime.",
        "script_ar": "مرحباً بكم في نظام فراتيلانزا للصيدليات. كل صيدلية لها نظام خاص معزول. أدخل كود الصيدلية واسم المستخدم وكلمة المرور — أو استخدم رابط تجريبي من فريق المبيعات. بدّل اللغة في أي وقت.",
        "steps_en": ["Open erp.fratelanza.com", "Enter pharmacy code or demo link", "Login as cashier", "Toggle AR/EN language"],
        "steps_ar": ["افتح erp.fratelanza.com", "أدخل كود الصيدلية أو رابط التجربة", "سجّل دخول ككاشير", "بدّل اللغة"],
    },
    {
        "time": "0:45–1:15",
        "scene_en": "Select seller",
        "scene_ar": "اختيار البائع",
        "script_en": "Before scanning products, select the seller from the list or scan their login card QR. If you forgot, you can still assign the seller in the payment window.",
        "script_ar": "قبل مسح الأصناف، اختر البائع من القائمة أو امسح QR بطاقة الدخول. إذا نسيت، يمكنك تعيين البائع في نافذة الدفع.",
        "steps_en": ["Open POS sidebar", "Pick seller or scan card", "Optional: Me button", "Continue to sale"],
        "steps_ar": ["افتح شريط نقطة البيع", "اختر البائع أو امسح البطاقة", "زر «أنا» اختياري", "تابع البيع"],
    },
    {
        "time": "1:15–2:00",
        "scene_en": "Open cash shift",
        "scene_ar": "فتح وردية النقدية",
        "script_en": "Before selling, open a cash shift. Choose morning, evening, or night. Enter opening float. Explain that all sales in this session link to this shift for Z report at close.",
        "script_ar": "قبل البيع، افتح وردية نقدية. اختر صباحية أو مسائية أو ليلية. أدخل رصيد الافتتاح. كل المبيعات في هذه الجلسة ترتبط بالوردية لتقرير الإغلاق Z.",
        "steps_en": ["Go to Cash Drawer / Shifts", "Click Open Shift", "Select shift type", "Enter opening cash amount", "Confirm"],
        "steps_ar": ["اذهب إلى درج النقدية / الورديات", "اضغط فتح وردية", "اختر نوع الوردية", "أدخل رصيد الافتتاح", "أكّد"],
    },
    {
        "time": "1:30–2:30",
        "scene_en": "Barcode scan sale",
        "scene_ar": "بيع بمسح الباركود",
        "script_en": "Scan a product barcode — item adds to cart instantly with price and stock check. Change quantity with +/−. Show product name in Arabic and English on screen and receipt.",
        "script_ar": "امسح باركود الصنف — يُضاف للسلة فوراً مع التحقق من السعر والمخزون. غيّر الكمية بـ +/−. اعرض اسم الصنف بالعربية والإنجليزية على الشاشة والإيصال.",
        "steps_en": ["Focus barcode field", "Scan or type barcode", "Item appears in cart", "Adjust quantity", "Show running total"],
        "steps_ar": ["ركّز حقل الباركود", "امسح أو اكتب الباركود", "يظهر الصنف في السلة", "عدّل الكمية", "اعرض الإجمالي"],
    },
    {
        "time": "2:30–3:15",
        "scene_en": "Search & multi-unit sale",
        "scene_ar": "البحث والبيع بوحدة فرعية",
        "script_en": "Search by product name if no barcode. For medicines sold by strip inside a box, switch unit to strip — stock deducts correctly per sub-unit. Show pack size on screen.",
        "script_ar": "ابحث بالاسم إذا لا يوجد باركود. للأدوية المباعة بالشريط داخل العلبة، حوّل الوحدة إلى شريط — يُخصم المخزون بالوحدة الصحيحة. اعرض حجم العبوة على الشاشة.",
        "steps_en": ["Type product name in search", "Select from results", "Click unit toggle box/strip", "Set quantity in strips", "Verify line total"],
        "steps_ar": ["اكتب اسم الصنف", "اختر من النتائج", "بدّل الوحدة علبة/شريط", "حدد الكمية بالشرائط", "تحقق من إجمالي السطر"],
    },
    {
        "time": "3:15–4:00",
        "scene_en": "Discounts",
        "scene_ar": "الخصومات",
        "script_en": "Apply a line discount on one item, then an invoice discount on the whole sale. Show net total updating live. Mention discount limits follow user permissions.",
        "script_ar": "طبّق خصماً على سطر واحد، ثم خصماً على الفاتورة كاملة. اعرض صافي الإجمالي يتحدث مباشرة. الخصومات تخضع لصلاحيات المستخدم.",
        "steps_en": ["Select cart line", "Apply line discount % or amount", "Apply invoice-level discount", "Show subtotal → net total"],
        "steps_ar": ["اختر سطراً في السلة", "طبّق خصم السطر", "طبّق خصم الفاتورة", "اعرض المجموع → الصافي"],
    },
    {
        "time": "4:00–4:45",
        "scene_en": "Cash payment",
        "scene_ar": "الدفع نقداً",
        "script_en": "Click checkout. Choose Cash. Enter amount received — system shows change. Complete sale and print 80mm receipt with pharmacy logo, seller, date, and invoice barcode.",
        "script_ar": "اضغط إتمام البيع. اختر نقدي. أدخل المبلغ المستلم — النظام يحسب الباقي. أكمِل البيع واطبع إيصال 80مم مع الشعار والبائع والتاريخ وباركود الفاتورة.",
        "steps_en": ["Click Pay / Checkout", "Select Cash", "Enter cash received", "Show change amount", "Print receipt", "New sale"],
        "steps_ar": ["اضغط الدفع", "اختر نقدي", "أدخل المبلغ", "اعرض الباقي", "اطبع الإيصال", "بيع جديد"],
    },
    {
        "time": "4:45–5:30",
        "scene_en": "Visa & mixed payment",
        "scene_ar": "الفيزا والدفع المختلط",
        "script_en": "Second sale: pay with Visa only, then a third sale with part cash + part Visa. Show both amounts recorded on invoice for shift reconciliation.",
        "script_ar": "بيع ثانٍ: ادفع بالفيزا فقط، ثم بيع ثالث جزء نقدي + جزء فيزا. اعرض المبلغين مسجلين على الفاتورة لمطابقة الوردية.",
        "steps_en": ["Checkout → Visa", "Enter visa amount = total", "Checkout → Mixed", "Split cash + visa", "Complete & print"],
        "steps_ar": ["دفع → فيزا", "مبلغ الفيزا = الإجمالي", "دفع → مختلط", "قسّم نقدي + فيزا", "أكمل واطبع"],
    },
    {
        "time": "5:30–6:15",
        "scene_en": "On-account customer",
        "scene_ar": "البيع الآجل",
        "script_en": "Select an authorized customer. Choose On Account payment — sale records as debt. Show customer balance update. Mention credit limit warning if exceeded.",
        "script_ar": "اختر عميلاً مفوضاً. اختر الدفع آجل — تُسجّل الفاتورة كدين. اعرض تحديث رصيد العميل. تنبيه عند تجاوز حد الائتمان.",
        "steps_en": ["Attach customer to sale", "Payment → On account", "Complete sale", "Open customer statement", "Show new balance"],
        "steps_ar": ["اربط عميلاً بالبيع", "الدفع → آجل", "أكمل البيع", "افتح كشف العميل", "اعرض الرصيد الجديد"],
    },
    {
        "time": "6:15–7:00",
        "scene_en": "Digital platform sale",
        "scene_ar": "بيع منصة رقمية",
        "script_en": "Create a digital sale (Talabat / Vezeeta / etc.). Select platform account customer. Show on-account billing for later partner settlement.",
        "script_ar": "أنشئ بيعاً رقمياً (طلبات / فيزيتا / إلخ). اختر حساب المنصة. يُسجّل آجل للتسوية لاحقاً مع الشريك.",
        "steps_en": ["Sale type → Digital", "Pick platform", "Add items", "On account payment", "Complete"],
        "steps_ar": ["نوع البيع → رقمي", "اختر المنصة", "أضف الأصناف", "دفع آجل", "أكمل"],
    },
    {
        "time": "7:00–7:45",
        "scene_en": "Delivery order",
        "scene_ar": "طلب توصيل",
        "script_en": "Switch to delivery sale. Enter customer name, phone, address, delivery fee. Assign driver. Show order appearing on Deliveries page.",
        "script_ar": "حوّل لبيع توصيل. أدخل اسم العميل والهاتف والعنوان ورسوم التوصيل. عيّن مندوباً. اعرض الطلب في صفحة التوصيل.",
        "steps_en": ["Sale type → Delivery", "Fill delivery fields", "Set delivery fee", "Choose driver", "Complete payment", "Open Deliveries queue"],
        "steps_ar": ["نوع البيع → توصيل", "املأ بيانات التوصيل", "رسوم التوصيل", "اختر المندوب", "أكمل الدفع", "افتح طابور التوصيل"],
    },
    {
        "time": "7:45–8:30",
        "scene_en": "Clinic prescription",
        "scene_ar": "روشتة عيادة",
        "script_en": "Open pending prescriptions. Load clinic Rx into POS cart — medicines and quantities pre-filled. Cashier reviews and completes sale.",
        "script_ar": "افتح الروشتات المعلقة. حمّل روشتة العيادة في السلة — الأدوية والكميات جاهزة. الكاشير يراجع ويكمل البيع.",
        "steps_en": ["POS → Load prescription", "Select pending Rx", "Items fill cart", "Adjust if needed", "Checkout normally"],
        "steps_ar": ["نقطة البيع → تحميل روشتة", "اختر روشتة معلقة", "تملأ السلة", "عدّل إن لزم", "أتمم الدفع"],
    },
    {
        "time": "8:30–9:15",
        "scene_en": "Receipt reprint & sales lookup",
        "scene_ar": "إعادة طباعة الإيصال",
        "script_en": "Go to Sales History. Find today's invoice by number or barcode scan. Reprint receipt for customer copy.",
        "script_ar": "اذهب لسجل المبيعات. ابحث عن فاتورة اليوم برقمها أو باركود. أعد طباعة الإيصال لنسخة العميل.",
        "steps_en": ["Open Sales menu", "Filter by today", "Search invoice #", "Open detail", "Reprint receipt"],
        "steps_ar": ["افتح المبيعات", "فلتر اليوم", "ابحث برقم الفاتورة", "افتح التفاصيل", "أعد الطباعة"],
    },
    {
        "time": "9:15–10:00",
        "scene_en": "Return from invoice",
        "scene_ar": "مرتجع من فاتورة",
        "script_en": "From sales detail, start a return. Select items and quantities — refund and restock calculated from original sale data. Print return receipt.",
        "script_ar": "من تفاصيل البيع، ابدأ مرتجعاً. اختر الأصناف والكميات — الاسترداد وإعادة المخزون من بيانات البيع الأصلية. اطبع إيصال المرتجع.",
        "steps_en": ["Open original invoice", "Click Return", "Select lines & qty", "Confirm refund method", "Stock restored"],
        "steps_ar": ["افتح الفاتورة الأصلية", "اضغط مرتجع", "اختر الأسطر والكمية", "أكّد الاسترداد", "يُعاد المخزون"],
    },
    {
        "time": "10:00–10:45",
        "scene_en": "Close shift (Z report)",
        "scene_ar": "إغلاق الوردية (تقرير Z)",
        "script_en": "End of day: close shift. Enter counted cash and counted Visa. System shows expected vs actual and variance. Print Z report. Mention pending deliveries block close.",
        "script_ar": "نهاية اليوم: أغلق الوردية. أدخل النقدي المعدود والفيزا المعدودة. النظام يعرض المتوقع مقابل الفعلي والفرق. اطبع تقرير Z. التوصيل المعلق يمنع الإغلاق.",
        "steps_en": ["Shifts → Close", "Count cash drawer", "Enter counted cash & visa", "Review variance", "Confirm close", "Print Z report"],
        "steps_ar": ["الورديات → إغلاق", "عدّ الدرج", "أدخل النقدي والفيزا", "راجع الفروقات", "أكّد الإغلاق", "اطبع Z"],
    },
    {
        "time": "10:45–11:30",
        "scene_en": "Call to action",
        "scene_ar": "الختام والتواصل",
        "script_en": "Fratelanza gives your pharmacy one bilingual POS with isolated data, Egyptian pound pricing, and modules that grow with you. Contact us for your pharmacy code and demo account.",
        "script_ar": "فراتيلانزا تمنح صيدليتك نقطة بيع ثنائية اللغة وبيانات معزولة وأسعار بالجنيه المصري ووحدات تنمو معك. تواصل معنا لكود الصيدلية وحساب تجريبي.",
        "steps_en": ["Show logo & website", "Mention plans", "Contact phone/email", "Thank you"],
        "steps_ar": ["اعرض الشعار والموقع", "اذكر الباقات", "هاتف/إيميل التواصل", "شكراً"],
    },
]


def sections_for_features(feature_keys: list[str] | None) -> list[dict]:
    feats = set(feature_keys or [])
    out = []
    for sec in BLUEPRINT_SECTIONS:
        if sec.get("always_show"):
            out.append(sec)
            continue
        keys = sec.get("feature_keys") or []
        if any(k in feats for k in keys):
            out.append(sec)
    return out


def resolve_tenant_features(tenant: dict) -> list[str]:
    """Use the tenant's enabled modules; fall back to plan preset if unset."""
    feats = platform_db.normalize_features(tenant.get("features"))
    if feats:
        return feats
    plan = platform_db.get_plan(tenant.get("plan") or "basic") or {}
    return platform_db.normalize_features(plan.get("features"))


def get_blueprint_for_tenant(tenant: dict) -> dict:
    feats = resolve_tenant_features(tenant)
    plan = platform_db.get_plan(tenant.get("plan") or "basic") or {}
    limits = platform_db.get_tenant_limits(tenant)
    base = get_blueprint()
    return {
        **base,
        "sections": sections_for_features(feats),
        "tenant": {
            "id": tenant["id"],
            "slug": tenant["slug"],
            "name": tenant["name"],
            "plan_key": tenant.get("plan"),
            "plan_label": plan.get("label") or (tenant.get("plan") or "basic"),
            "contact_name": tenant.get("contact_name"),
            "contact_email": tenant.get("contact_email"),
            "contact_phone": tenant.get("contact_phone"),
            "features": feats,
            "max_users": limits.get("max_users"),
            "max_branches": limits.get("max_branches"),
        },
    }


def video_script_markdown() -> str:
    lines = [
        "# Fratelanza POS — Demo Video Script",
        "# سكربت فيديو نقطة البيع — فراتيلانزا",
        "",
        "Bilingual script for sales & training videos (~11 minutes).",
        "سكربت ثنائي اللغة لفيديوهات البيع والتدريب.",
        "",
        "---",
        "",
    ]
    for i, s in enumerate(POS_VIDEO_SCRIPT, 1):
        lines.append(f"## Scene {i} · {s['time']}")
        lines.append(f"### {s['scene_en']} / {s['scene_ar']}")
        lines.append("")
        lines.append("**English**")
        lines.append(s["script_en"])
        lines.append("")
        lines.append("*Steps:*")
        for step in s["steps_en"]:
            lines.append(f"- {step}")
        lines.append("")
        lines.append("**العربية**")
        lines.append(s["script_ar"])
        lines.append("")
        lines.append("*الخطوات:*")
        for step in s["steps_ar"]:
            lines.append(f"- {step}")
        lines.append("")
        lines.append("---")
        lines.append("")
    lines.append("© 2026 Fratelanza. All rights reserved.")
    return "\n".join(lines)


def features_overview_markdown() -> str:
    """Printable feature list aligned with FEATURES_CATALOG and subscription plans."""
    plans = platform_db.list_plans()
    lines = [
        "# Fratelanza Pharmacy ERP — Features Overview",
        "# نظام فراتيلانزا — عرض المميزات",
        "",
        f"Updated {BLUEPRINT_META['version']} · Bilingual cloud POS for Egyptian pharmacies.",
        "",
        "## Subscription plans · الباقات",
        "",
        "| Plan | Max users | Max branches | Price (LE/mo) |",
        "|------|-----------|--------------|---------------|",
    ]
    for p in plans:
        mu = "∞" if p.get("max_users") is None else str(p["max_users"])
        mb = "∞" if p.get("max_branches") is None else str(p["max_branches"])
        lines.append(f"| {p['label']} | {mu} | {mb} | {p.get('price_le', 0):,} |")
    lines.extend(["", "## Modules · الوحدات", ""])
    for sec in BLUEPRINT_SECTIONS:
        if sec.get("id") == "platform":
            continue
        lines.append(f"### {sec['title_en']} / {sec['title_ar']}")
        lines.append(sec["summary_en"])
        for b in sec.get("bullets_en", []):
            lines.append(f"- {b}")
        lines.append("")
    lines.extend([
        "## Demo trials",
        "- Superadmin can generate shareable demo links with all modules enabled.",
        "- Demo accounts cannot export master data, bulk import, or change passwords.",
        "",
        "© 2026 Fratelanza. All rights reserved.",
    ])
    return "\n".join(lines)


def get_blueprint() -> dict:
    plans = platform_db.list_plans()
    features = platform_db.FEATURES_CATALOG
    return {
        "meta": BLUEPRINT_META,
        "sections": BLUEPRINT_SECTIONS,
        "pos_video_script": POS_VIDEO_SCRIPT,
        "plans": plans,
        "features": features,
        "feature_labels_ar": FEATURE_LABELS_AR,
    }
