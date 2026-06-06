# test Pharmacy POS — Full Customer Demo Video Script
# سكربت فيديو العرض الكامل لنقطة البيع — صيدلية test

**Purpose:** Record a detailed bilingual (Arabic + English) walkthrough of every customer-facing POS/ERP module.  
**Do NOT show:** Superadmin / Control Platform (`/platform`).

| Demo setting | Value |
|---|---|
| Pharmacy code | `test` |
| Pharmacy display name | `test` (Arabic & English receipts) |
| Admin login | `admin` / `test123` |
| Cashier login | `cashier1` / `cash123` |
| Primary UI language | Arabic (عربي) — toggle to English in Scene 2 & Scene 32 |
| Sample barcode | `6223001001` (Paracetamol) |

**Estimated length:** ~38–42 minutes  
**Recording tip:** Pause 3–5 seconds on each screen. Narrate Arabic first, then English (or split audio tracks).

---

## Part 1 — Introduction & Access

### Scene 1 · 0:00–1:15 · Login & Arabic interface
**English / الإنجليزية**

Welcome to the **test** pharmacy management system. Each pharmacy has its own private, isolated database in the cloud. Open the login page, enter pharmacy code **test**, username **admin**, and password **test123**. Click the globe icon and switch to **عربي** — the entire interface flips to right-to-left Arabic. Show the sidebar, top bar with user name, and branch selector.

**Steps**
- Open `/login`
- Pharmacy code: `test`
- Username: `admin`, Password: `test123`
- Click **عربي** (globe icon, top-right)
- Point out RTL layout and Arabic menu labels

**العربية**

مرحباً بكم في نظام **test** لإدارة الصيدلية. كل صيدلية لها قاعدة بيانات خاصة معزولة على السحابة. افتح صفحة الدخول، أدخل كود الصيدلية **test** واسم المستخدم **admin** وكلمة المرور **test123**. اضغط أيقونة الكرة الأرضية واختر **عربي** — تتحول الواجهة بالكامل للكتابة من اليمين لليسار. اعرض القائمة الجانبية وشريط المستخدم واختيار الفرع.

---

### Scene 2 · 1:15–2:00 · Language toggle & roles overview
**English**

Briefly switch to **English** and back to **عربي** to show bilingual support. Explain roles: Admin sees everything; Pharmacist sells and manages stock; Cashier focuses on POS and shifts. Lock screen auto-activates after 15 minutes idle (not during active POS sale).

**العربية**

بدّل سريعاً إلى **English** ثم عُد لـ **عربي** لإظهار الدعم ثنائي اللغة. اشرح الأدوار: المدير يرى كل شيء؛ الصيدلي يبيع ويدير المخزون؛ الكاشير يركز على نقطة البيع والورديات. شاشة القفل تُفعّل تلقائياً بعد ١٥ دقيقة خمول (ما عدا أثناء بيع نشط).

---

## Part 2 — Dashboard & Point of Sale

### Scene 3 · 2:00–2:45 · Dashboard (لوحة التحكم)
**English**

Open **Dashboard**. Show today's sales total, transaction count, low-stock alerts, and near-expiry warnings. These KPIs update in real time as sales happen.

**العربية**

افتح **لوحة التحكم**. اعرض إجمالي مبيعات اليوم وعدد العمليات وتنبيهات نقص المخزون وتواريخ الصلاحية القريبة. هذه المؤشرات تتحدث فوراً مع كل عملية بيع.

**Route:** `/dashboard`

---

### Scene 4 · 2:45–3:30 · Open cash shift (فتح وردية)
**English**

Before selling, go to **Cash Drawer / Shifts**. Click **Open Shift**, choose morning/evening/night, enter opening float (e.g. 500 EGP). All sales in this session link to this shift for the Z report at close.

**العربية**

قبل البيع، اذهب إلى **درج النقدية / الورديات**. اضغط **فتح وردية**، اختر صباحية/مسائية/ليلية، أدخل رصيد الافتتاح (مثلاً ٥٠٠ ج.م). كل المبيعات في هذه الجلسة ترتبط بالوردية لتقرير الإغلاق Z.

**Route:** `/shifts`

---

### Scene 5 · 3:30–4:30 · Barcode scan sale (بيع بالباركود)
**English**

Go to **Point of Sale**. Select seller name. Scan barcode `6223001001` — item adds instantly with price and stock check. Adjust quantity with +/−. Product names appear in Arabic and English.

**العربية**

اذهب إلى **نقطة البيع**. اختر اسم البائع. امسح الباركود `6223001001` — يُضاف الصنف فوراً مع التحقق من السعر والمخزون. عدّل الكمية بـ +/−. أسماء الأصناف تظهر بالعربية والإنجليزية.

**Route:** `/`

---

### Scene 6 · 4:30–5:15 · Search & sub-unit sale (بحث وبيع بالشريط)
**English**

Search by product name (Arabic or English). For medicines sold by strip inside a box, toggle unit to **strip** — stock deducts per sub-unit correctly. Show pack size on screen.

**العربية**

ابحث باسم الصنف (عربي أو إنجليزي). للأدوية المباعة بالشريط داخل العلبة، حوّل الوحدة إلى **شريط** — يُخصم المخزون بالوحدة الصحيحة. اعرض حجم العبوة على الشاشة.

---

### Scene 7 · 5:15–6:00 · Discounts (الخصومات)
**English**

Apply a **line discount** on one item (% or EGP amount), then an **invoice discount** on the whole sale. Show net total updating live. Mention discount limits follow user permissions.

**العربية**

طبّق **خصم سطر** على صنف واحد (نسبة أو مبلغ ج.م)، ثم **خصم فاتورة** على البيع كاملاً. اعرض صافي الإجمالي يتحدث مباشرة. الخصومات تخضع لصلاحيات المستخدم.

---

### Scene 8 · 6:00–6:45 · Cash payment & receipt (دفع نقدي وإيصال)
**English**

Click **Pay**. Choose **Cash**, enter amount received — system shows change. Complete sale. Open receipt preview — pharmacy name shows **test**, with seller, date, invoice barcode, and branch info. Mention 58mm / 80mm / A4 paper options in Settings.

**العربية**

اضغط **الدفع**. اختر **نقدي**، أدخل المبلغ المستلم — النظام يحسب الباقي. أكمِل البيع. افتح معاينة الإيصال — اسم الصيدلية **test** مع البائع والتاريخ وباركود الفاتورة وبيانات الفرع. اذكر خيارات ورق 58مم / 80مم / A4 في الإعدادات.

---

### Scene 9 · 6:45–7:30 · Visa & mixed payment (فيزا ومختلط)
**English**

Second sale: pay with **Visa** only. Third sale: **Mixed** — part cash + part Visa. Show both amounts on invoice for shift reconciliation.

**العربية**

بيع ثانٍ: ادفع **فيزا** فقط. بيع ثالث: **مختلط** — جزء نقدي + جزء فيزا. اعرض المبلغين على الفاتورة لمطابقة الوردية.

---

### Scene 10 · 7:30–8:15 · On-account customer (بيع آجل)
**English**

Attach a credit customer to the sale. Choose **On Account** payment — sale records as debt. Open customer statement and show balance update. Mention credit limit warning if exceeded.

**العربية**

اربط عميلاً آجلاً بالبيع. اختر الدفع **آجل** — تُسجّل الفاتورة كدين. افتح كشف العميل واعرض تحديث الرصيد. تنبيه عند تجاوز حد الائتمان.

---

### Scene 11 · 8:15–9:00 · Digital platform sale (منصة رقمية)
**English**

Set sale type to **Digital** (Talabat / Vezeeta / other). Select platform account customer. Complete as on-account for later partner settlement.

**العربية**

اختر نوع البيع **رقمي** (طلبات / فيزيتا / أخرى). اختر حساب المنصة. أكمِل كآجل للتسوية لاحقاً مع الشريك.

---

### Scene 12 · 9:00–9:45 · Delivery order (طلب توصيل)
**English**

Switch to **Delivery** sale type. Enter customer name, phone, address, delivery fee. Assign driver. Complete payment. Show order in **Deliveries** queue.

**العربية**

حوّل لنوع بيع **توصيل**. أدخل اسم العميل والهاتف والعنوان ورسوم التوصيل. عيّن مندوباً. أكمِل الدفع. اعرض الطلب في طابور **التوصيل**.

---

### Scene 13 · 9:45–10:30 · Clinic prescription (روشتة عيادة)
**English**

From POS, click **Load prescription** bell icon. Select a pending clinic Rx — medicines and quantities pre-fill the cart. Cashier reviews and completes checkout normally.

**العربية**

من نقطة البيع، اضغط أيقونة **تحميل روشتة**. اختر روشتة عيادة معلقة — الأدوية والكميات تملأ السلة. الكاشير يراجع ويكمل الدفع.

---

### Scene 14 · 10:30–11:00 · Suspend & recall cart (تعليق واسترجاع)
**English**

If customer steps away, **suspend** the current cart. Start a new sale for another customer. **Recall** the suspended cart and complete it.

**العربية**

إذا ابتعد العميل، **علّق** السلة الحالية. ابدأ بيعاً جديداً لعميل آخر. **استرجع** السلة المعلقة وأكملها.

---

## Part 3 — Sales History & Returns

### Scene 15 · 11:00–11:45 · Sales history & reprint (سجل المبيعات)
**English**

Open **Sales History**. Filter by today. Search by invoice number or scan invoice barcode. Open detail and **reprint receipt** for customer copy.

**العربية**

افتح **سجل المبيعات**. فلتر باليوم. ابحث برقم الفاتورة أو امسح باركودها. افتح التفاصيل و**أعد طباعة الإيصال** لنسخة العميل.

**Route:** `/sales`

---

### Scene 16 · 11:45–12:15 · Deliveries queue (طابور التوصيل)
**English**

Open **Deliveries**. Show pending, out-for-delivery, and completed orders. Update status as driver delivers.

**العربية**

افتح **التوصيل**. اعرض الطلبات المعلقة وقيد التوصيل والمكتملة. حدّث الحالة عند تسليم المندوب.

**Route:** `/deliveries`

---

### Scene 17 · 12:15–13:00 · Returns (المرتجعات)
**English**

From sales detail, start a **Return**. Select items and quantities — refund and restock calculated from original sale. Print return receipt. Also show standalone **Returns** page for browsing all returns.

**العربية**

من تفاصيل البيع، ابدأ **مرتجعاً**. اختر الأصناف والكميات — الاسترداد وإعادة المخزون من بيانات البيع الأصلية. اطبع إيصال المرتجع. اعرض أيضاً صفحة **المرتجعات** لاستعراض كل المرتجعات.

**Route:** `/returns`

---

## Part 4 — Inventory & Stock

### Scene 18 · 13:00–14:00 · Product catalog (كتالوج الأصناف)
**English**

Open **Inventory**. Browse products with barcode, Arabic/English names, cost, price, stock, min-stock alert. Add a new product. Show category filter and search.

**العربية**

افتح **المخزون**. استعرض الأصناف مع الباركود والأسماء بالعربية والإنجليزية والتكلفة والسعر والمخزون وتنبيه الحد الأدنى. أضف صنفاً جديداً. اعرض الفلتر والبحث.

**Route:** `/inventory`

---

### Scene 19 · 14:00–14:45 · Bulk Excel upload (رفع جماعي)
**English**

Show **Bulk Upload** — download template, fill products in Excel, upload. System validates rows and imports in batch.

**العربية**

اعرض **الرفع الجماعي** — حمّل القالب، املأ الأصناف في Excel، ارفع الملف. النظام يتحقق من الصفوف ويستورد دفعة واحدة.

---

### Scene 20 · 14:45–15:30 · Stock take & barcode designer (جرد وباركود)
**English**

Demonstrate **Stock Take** with variance report. Open **Barcode Designer** — generate and print labels for products without barcodes.

**العربية**

أظهر **جرد المخزون** مع تقرير الفروقات. افتح **مصمم الباركود** — أنشئ واطبع ملصقات للأصناف بدون باركود.

---

### Scene 21 · 15:30–16:15 · Expiry tracking (تواريخ الصلاحية)
**English**

Open **Expiry**. Show near-expiry and expired batches. Explain multiple expiry batches per product and FEFO logic.

**العربية**

افتح **الصلاحية**. اعرض الدفعات قريبة الانتهاء والمنتهية. اشرح دفعات صلاحية متعددة لكل صنف ومنطق FEFO.

**Route:** `/expiry`

---

### Scene 22 · 16:15–17:00 · Branch transfers (تحويلات الفروع)
**English**

Open **Transfers**. Create a transfer request between branches. Show print slip and receiving confirmation on destination branch.

**العربية**

افتح **التحويلات**. أنشئ طلب تحويل بين فرعين. اعرض إذن الطباعة وتأكيد الاستلام في الفرع المستلم.

**Route:** `/transfers`

---

### Scene 23 · 17:00–17:30 · Branches stock overview (مخزون الفروع)
**English**

Open **Branches Stock** — central view of stock levels across all branches. Useful for chains with multiple locations.

**العربية**

افتح **مخزون الفروع** — نظرة مركزية على مستويات المخزون في كل الفروع. مفيد لسلاسل الصيدليات متعددة الفروع.

**Route:** `/branches-stock`

---

## Part 5 — Purchasing & Suppliers

### Scene 24 · 17:30–18:30 · Purchase orders (أوامر الشراء)
**English**

Open **Purchases**. Create a purchase order — select supplier, add items with cost and quantity, apply discount and VAT. **Receive** goods into branch inventory (GRN).

**العربية**

افتح **المشتريات**. أنشئ أمر شراء — اختر المورد، أضف الأصناف بالتكلفة والكمية، طبّق الخصم والضريبة. **استلم** البضاعة إلى مخزون الفرع.

**Route:** `/purchases`

---

### Scene 25 · 18:30–19:15 · Suppliers (الموردون)
**English**

Open **Suppliers**. Show supplier directory, current balance, payment history. Record a supplier payment.

**العربية**

افتح **الموردون**. اعرض دليل الموردين والرصيد الحالي وسجل المدفوعات. سجّل دفعة لمورد.

**Route:** `/suppliers`

---

## Part 6 — Customers & Clinics

### Scene 26 · 19:15–20:00 · Customers & credit (العملاء والآجل)
**English**

Open **Customers**. Add customer with credit limit. Show statement, on-account balance, and payment recording. Mention bulk customer Excel upload.

**العربية**

افتح **العملاء**. أضف عميلاً بحد ائتمان. اعرض كشف الحساب ورصيد الآجل وتسجيل المدفوعات. اذكر الرفع الجماعي من Excel.

**Route:** `/customers`

---

### Scene 27 · 20:00–21:00 · Clinics & prescription portal (العيادات)
**English**

Open **Clinics** (admin). Create a clinic partner with private portal link. Show how clinic sends prescription digitally. Demonstrate pending vs handled status and POS integration from Scene 13.

**العربية**

افتح **العيادات** (مدير). أنشئ عيادة شريكة برابط بوابة خاص. اعرض كيف ترسل العيادة الروشتة إلكترونياً. أظهر حالة المعلق والمنفذ والربط مع نقطة البيع.

**Route:** `/clinics`

---

## Part 7 — Reports & Analytics

### Scene 28 · 21:00–21:45 · Sales reports (تقارير المبيعات)
**English**

Open **Reports**. Filter by date range, branch, seller, payment type. Export to Excel. Show summary totals.

**العربية**

افتح **التقارير**. فلتر بالتاريخ والفرع والبائع وطريقة الدفع. صدّر إلى Excel. اعرض الإجماليات.

**Route:** `/reports`

---

### Scene 29 · 21:45–22:30 · Fraud surveillance (مراقبة الاحتيال)
**English**

Open **Fraud Surveillance** (admin). Show alerts for suspicious patterns — voided sales, excessive discounts, after-hours activity.

**العربية**

افتح **مراقبة الاحتيال** (مدير). اعرض تنبيهات الأنماط المشبوهة — مبيعات ملغاة، خصومات مفرطة، نشاط خارج الدوام.

**Route:** `/fraud`

---

### Scene 30 · 22:30–23:15 · Smart stock reallocation (إعادة توزيع المخزون)
**English**

Open **Stock Reallocation**. System suggests moving slow stock between branches or flagging overstock. Show recommendations and action buttons.

**العربية**

افتح **إعادة توزيع المخزون**. النظام يقترح نقل المخزون البطيء بين الفروع أو تنبيه الفائض. اعرض التوصيات وأزرار التنفيذ.

**Route:** `/stock-reallocation`

---

## Part 8 — Cash Drawer & HR

### Scene 31 · 23:15–24:15 · Close shift & Z report (إغلاق الوردية)
**English**

Return to **Shifts**. Close shift — enter counted cash and counted Visa. System shows expected vs actual and variance. Print **Z report**. Note: pending deliveries block close.

**العربية**

عُد إلى **الورديات**. أغلق الوردية — أدخل النقدي المعدود والفيزا المعدودة. النظام يعرض المتوقع مقابل الفعلي والفرق. اطبع **تقرير Z**. التوصيل المعلق يمنع الإغلاق.

**Route:** `/shifts`

---

### Scene 32 · 24:15–25:00 · Time clock kiosk (ساعة الحضور)
**English**

Open **Time Clock**. Show QR scan attendance kiosk — employees scan their card to clock in/out. Display today's attendance log.

**العربية**

افتح **ساعة الحضور**. اعرض كشك مسح QR للحضور — الموظفون يمسحون كارتهم لتسجيل الدخول/الخروج. اعرض سجل حضور اليوم.

**Route:** `/clock`

---

### Scene 33 · 25:00–26:15 · HR & payroll (الموارد البشرية)
**English**

Open **HR**. Show employee records linked to system users. Demonstrate attendance tab, payroll calculation, and printable salary slips. Show **Print Employee QR Cards** at `/hr/cards`.

**العربية**

افتح **الموارد البشرية**. اعرض سجلات الموظفين المربوطة بمستخدمي النظام. أظهر تبويب الحضور وحساب المرتبات وكشوف المرتبات القابلة للطباعة. اعرض **طباعة كروت QR للموظفين**.

**Route:** `/hr`, `/hr/cards`

---

## Part 9 — Settings & Wrap-up

### Scene 34 · 26:15–27:30 · Settings (الإعدادات)
**English**

Open **Settings** (admin only). Walk through tabs:
- **Users** — add user, assign role and permissions
- **Branches** — add branch, address for receipts
- **Pharmacy** — name **test**, logo, tax ID, receipt language Arabic, paper size
- **Manual** — download Arabic user manual PDF
- **Login Cards** — print QR login cards for cashiers

**العربية**

افتح **الإعدادات** (مدير فقط). مرّ على التبويبات:
- **المستخدمون** — إضافة مستخدم وتعيين الدور والصلاحيات
- **الفروع** — إضافة فرع وعنوان للإيصالات
- **الصيدلية** — الاسم **test** والشعار والرقم الضريبي ولغة الإيصال عربي وحجم الورق
- **الدليل** — تحميل دليل المستخدم العربي
- **كروت الدخول** — طباعة كروت QR للكاشير

**Route:** `/settings`, `/settings/login-cards`

---

### Scene 35 · 27:30–28:00 · English interface recap
**English**

Toggle interface to **English**. Quickly scroll sidebar to show all modules in English. Toggle back to **عربي**.

**العربية**

بدّل الواجهة إلى **English**. مرّ سريعاً على القائمة لإظهار كل الوحدات بالإنجليزية. عُد إلى **عربي**.

---

### Scene 36 · 28:00–28:45 · Closing (الختام)
**English**

The **test** pharmacy system gives you one bilingual POS with isolated data, Egyptian pound pricing, and modules that grow with your business — from single counter to multi-branch chain. Contact your provider for your pharmacy code and onboarding.

**العربية**

نظام **test** يمنحك نقطة بيع ثنائية اللغة وبيانات معزولة وأسعار بالجنيه المصري ووحدات تنمو مع عملك — من كاونتر واحد إلى سلسلة فروع. تواصل مع مزود الخدمة لكود صيدليتك والتشغيل.

---

## Recording checklist

- [ ] Pharmacy code and receipt header show **test** only (no other customer names)
- [ ] UI primarily in **Arabic** (RTL)
- [ ] **Do not** open `/platform` or superadmin screens
- [ ] Open shift before POS demos; close shift at end
- [ ] Use seeded barcode `6223001001` for scan demo
- [ ] Show at least one receipt with pharmacy name **test**
- [ ] Narrate each scene in Arabic then English (or use subtitles)

---

© 2026 — Demo script for pharmacy code **test**
