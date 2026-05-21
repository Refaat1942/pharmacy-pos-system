# Fratelanza ERP — Troubleshooting Guide / دليل حل المشاكل

A bilingual quick-reference for the most common issues. Each problem is shown in **English** then **العربية**.
دليل ثنائي اللغة لأكثر المشاكل شيوعاً. كل مشكلة معروضة **بالإنجليزية** ثم **بالعربية**.

---

## How to use this guide / كيفية استخدام هذا الدليل

1. Find the symptom in the left column / ابحث عن العَرَض في العمود الأيمن
2. Try the fixes in order — usually the first one works / جرب الحلول بالترتيب — عادةً الحل الأول ينفع
3. If nothing works, copy the error message and contact support / إذا لم ينفع شيء، انسخ رسالة الخطأ واتصل بالدعم

---

## 1. Cannot Open the Site / لا يفتح الموقع

### EN
**Symptom:** Browser shows "This site can't be reached", "DNS error", or a blank page.
**Fixes:**
1. Open https://erp.fratelanza.com on your **phone using mobile data** (turn off WiFi). If it works there → the problem is your local WiFi/router, not the ERP. Restart the router.
2. Clear browser cache: `Ctrl + Shift + Delete` → clear "Cached images and files".
3. Try a different browser (Chrome ↔ Edge).
4. Flush DNS on Windows: open Command Prompt → type `ipconfig /flushdns` → press Enter.
5. Restart the device.

### AR / بالعربية
**العرَض:** المتصفح يعرض "تعذر الوصول إلى الموقع" أو "خطأ في DNS" أو صفحة فارغة.
**الحلول:**
1. افتح https://erp.fratelanza.com على **هاتفك ببيانات الجوال** (أوقف الواي فاي). إذا فُتح هناك → المشكلة في الواي فاي/الراوتر عندك وليس في النظام. أعد تشغيل الراوتر.
2. امسح ذاكرة المتصفح: `Ctrl + Shift + Delete` → امسح "الصور والملفات المخزنة مؤقتاً".
3. جرب متصفح آخر (Chrome ↔ Edge).
4. على ويندوز: افتح Command Prompt → اكتب `ipconfig /flushdns` → اضغط Enter.
5. أعد تشغيل الجهاز.

---

## 2. Login Fails / لا يمكن تسجيل الدخول

### EN
**Symptom:** "Invalid username or password" even though you're sure they're correct.
**Fixes:**
1. Check **Caps Lock** is off and keyboard language is English.
2. Check your device's **date and time** are correct — set to "Automatic". Wrong time breaks login.
3. Make sure you're typing the username exactly as created (case-sensitive).
4. If recently changed: the password may have been updated by another admin.
5. Last resort: ask the admin to reset your password from the **Users** page.

### AR / بالعربية
**العرَض:** "اسم المستخدم أو كلمة المرور غير صحيحة" مع تأكدك أنها صحيحة.
**الحلول:**
1. تأكد من إيقاف **Caps Lock** ولغة لوحة المفاتيح بالإنجليزية.
2. تأكد من **التاريخ والوقت** في الجهاز — اضبطهما على "تلقائي". الوقت الخاطئ يمنع تسجيل الدخول.
3. اكتب اسم المستخدم بنفس الأحرف الكبيرة/الصغيرة كما أُنشئ.
4. إذا تم تغييرها مؤخراً: قد يكون مسؤول آخر غيّر كلمة المرور.
5. الحل الأخير: اطلب من المسؤول إعادة تعيين كلمة المرور من صفحة **المستخدمون**.

---

## 3. POS Slow or Freezing / نقطة البيع بطيئة أو متجمدة

### EN
**Symptom:** Buttons don't respond, page takes long to load.
**Fixes:**
1. Refresh the page: `Ctrl + R` or `F5`.
2. Close and reopen the browser tab.
3. Close other heavy tabs/programs (YouTube, big Excel files).
4. Test your internet speed at https://fast.com — should be at least 2 Mbps.
5. If only one PC is slow → restart that PC. If all PCs are slow → call your ISP.

### AR / بالعربية
**العرَض:** الأزرار لا تستجيب، الصفحة تأخذ وقتاً في التحميل.
**الحلول:**
1. حدّث الصفحة: `Ctrl + R` أو `F5`.
2. أغلق علامة التبويب وأعد فتحها.
3. أغلق التطبيقات الأخرى الثقيلة (يوتيوب، ملفات Excel كبيرة).
4. اختبر سرعة الإنترنت على https://fast.com — يجب أن تكون 2 Mbps على الأقل.
5. إذا جهاز واحد فقط بطيء → أعد تشغيله. إذا كل الأجهزة بطيئة → اتصل بشركة الإنترنت.

---

## 4. Receipt Printer Not Printing / الفاتورة لا تطبع

### EN
**Symptom:** Sale completes but nothing comes out of the printer.
**Fixes:**
1. Check the printer is **ON**, paper loaded, USB/network cable connected.
2. Make sure the printer is set as the **default printer** in Windows.
3. In the browser print dialog: select the correct thermal printer (not "Microsoft Print to PDF").
4. Set paper size to **80mm** (or 58mm for small printers).
5. Print a test page from Windows printer settings — if that fails, it's a printer problem, not the ERP.

### AR / بالعربية
**العرَض:** البيع يكتمل لكن لا يخرج شيء من الطابعة.
**الحلول:**
1. تأكد من أن الطابعة **مُشغّلة** والورق موجود والكابل (USB/شبكة) متصل.
2. تأكد من أن الطابعة هي **الافتراضية** في ويندوز.
3. في نافذة الطباعة بالمتصفح: اختر الطابعة الحرارية الصحيحة (وليس "Microsoft Print to PDF").
4. اضبط حجم الورق على **80mm** (أو 58mm للطابعات الصغيرة).
5. اطبع صفحة اختبار من إعدادات الطابعة في ويندوز — إذا فشلت، فالمشكلة في الطابعة وليس النظام.

---

## 5. Barcode Scanner Not Working / الباركود لا يقرأ

### EN
**Symptom:** Scanner beeps but nothing appears on screen, or wrong characters appear.
**Fixes:**
1. **Click once inside the search/input box** before scanning — the cursor must be in that field.
2. Open Notepad and scan a product: if the code appears in Notepad, the scanner is fine — it's a focus problem in the ERP page.
3. Make sure the scanner is set to **USB Keyboard** mode (factory default for most scanners — check its manual).
4. Try a different USB port.
5. For QR codes on employee cards, you need a **2D scanner** (square scan area). 1D laser scanners (red line) only read the barcode below the QR — that's why we print both.

### AR / بالعربية
**العرَض:** الماسح يصدر صوت لكن لا يظهر شيء على الشاشة، أو تظهر حروف خاطئة.
**الحلول:**
1. **انقر مرة داخل خانة البحث/الإدخال** قبل المسح — يجب أن يكون المؤشر في تلك الخانة.
2. افتح Notepad وامسح منتج: إذا ظهر الكود في Notepad، فالماسح يعمل — المشكلة في تركيز الصفحة فقط.
3. تأكد من أن الماسح في وضع **USB Keyboard** (الإعداد الافتراضي لمعظم الماسحات — راجع دليل الجهاز).
4. جرب منفذ USB آخر.
5. لمسح QR في بطاقات الموظفين، تحتاج ماسح **2D** (مساحة مسح مربعة). الماسح 1D (خط أحمر) يقرأ فقط الباركود تحت QR — لهذا نطبع الاثنين معاً.

---

## 6. Cannot Clock In/Out on Tablet / تعذر تسجيل الحضور على التابلت

### EN
**Symptom:** Scanning the employee QR card does nothing on `/clock` page.
**Fixes:**
1. Click once inside the input box on the page.
2. Refresh the page (`F5`) and try again.
3. Make sure the tablet is connected to the internet.
4. Test with the **typed code** (printed under the QR on the card) — if typing works but scanning doesn't, the scanner is the issue.
5. Make sure the employee is **active** and **not deleted** in HR settings.

### AR / بالعربية
**العرَض:** مسح بطاقة QR للموظف لا يفعل شيء في صفحة `/clock`.
**الحلول:**
1. انقر مرة داخل خانة الإدخال في الصفحة.
2. حدّث الصفحة (`F5`) وحاول مرة أخرى.
3. تأكد أن التابلت متصل بالإنترنت.
4. جرب إدخال **الكود يدوياً** (المطبوع تحت QR على البطاقة) — إذا الكتابة تعمل والمسح لا يعمل، المشكلة في الماسح.
5. تأكد أن الموظف **نشط** و**غير محذوف** في إعدادات HR.

---

## 7. Wrong Stock / Stock Doesn't Match / المخزون غير صحيح

### EN
**Symptom:** The displayed quantity doesn't match what's actually on the shelf.
**Fixes:**
1. Check **Inventory → Stock Movements** for that product — every change is logged with date, user, and reason.
2. Did a sale, return, or transfer happen recently that wasn't accounted for?
3. To correct: go to Inventory → click the product → **Adjust Stock** (add a stock-take adjustment with the real number, write a note explaining why).
4. **Never** edit stock directly without writing a reason — you'll lose the audit trail.
5. For multi-branch pharmacies, check **Inventory → Branch Stock** tab to see the breakdown per branch.

### AR / بالعربية
**العرَض:** الكمية المعروضة لا تطابق الواقع على الرف.
**الحلول:**
1. راجع **المخزون ← حركة المخزون** للمنتج — كل تغيير مُسجَّل بالتاريخ والمستخدم والسبب.
2. هل حدث بيع أو إرجاع أو تحويل مؤخراً لم يُحسب؟
3. للتصحيح: المخزون ← انقر على المنتج ← **تعديل المخزون** (أضف جرد بالرقم الحقيقي مع كتابة السبب).
4. **لا تعدّل المخزون مباشرة بدون سبب** — ستفقد سجل المراجعة.
5. للصيدليات متعددة الفروع، راجع تبويب **المخزون ← أرصدة الفروع** لرؤية التفاصيل لكل فرع.

---

## 8. Sale Stuck or Failed / عملية البيع متوقفة أو فشلت

### EN
**Symptom:** Click "Save & Print" and nothing happens, or you get an error.
**Fixes:**
1. Wait 10 seconds — slow internet may delay the response. Do **not** click "Save" again — you may create a duplicate invoice.
2. Refresh the page after waiting. Check **Sales → Today's Invoices** to see if the sale was actually saved.
3. If duplicated: open the duplicate invoice → click **Return** to cancel one.
4. If error says "Insufficient stock": check actual stock for that product.
5. If error says "Shift not open": open a shift first from the POS page.

### AR / بالعربية
**العرَض:** عند النقر على "حفظ وطباعة" لا يحدث شيء، أو تظهر رسالة خطأ.
**الحلول:**
1. انتظر 10 ثوانٍ — الإنترنت البطيء قد يؤخر الاستجابة. **لا تنقر "حفظ" مرة أخرى** — قد تنشئ فاتورة مكررة.
2. حدّث الصفحة بعد الانتظار. راجع **المبيعات ← فواتير اليوم** لمعرفة إن كانت الفاتورة حُفظت فعلاً.
3. إذا تكررت: افتح الفاتورة المكررة ← انقر **إرجاع** لإلغاء واحدة.
4. إذا الخطأ "المخزون غير كافٍ": راجع المخزون الفعلي لذلك المنتج.
5. إذا الخطأ "لا توجد وردية مفتوحة": افتح وردية أولاً من صفحة نقطة البيع.

---

## 9. Reports Show Wrong Numbers / التقارير تعرض أرقام خاطئة

### EN
**Symptom:** Sales total doesn't match cash in drawer, or numbers seem wrong.
**Fixes:**
1. Check the **date range** at the top of the report.
2. Check the **branch filter** — make sure you're looking at the right branch (or "All").
3. Check if **cancelled/refunded** invoices are included (toggle in filters).
4. Compare to the **Shift Close Report** for the day — it shows expected vs actual cash.
5. If still wrong: filter to the specific day and review each invoice in the list — find the discrepancy invoice.

### AR / بالعربية
**العرَض:** إجمالي المبيعات لا يطابق النقود في الدرج، أو الأرقام تبدو خاطئة.
**الحلول:**
1. راجع **النطاق الزمني** أعلى التقرير.
2. راجع **فلتر الفرع** — تأكد أنك تنظر إلى الفرع الصحيح (أو "الكل").
3. تحقق إن كانت الفواتير **الملغاة/المُرجعة** مشمولة (مفتاح في الفلاتر).
4. قارن مع **تقرير إغلاق الوردية** لذلك اليوم — يعرض المتوقع مقابل الفعلي.
5. إذا لا يزال خاطئاً: فلتر اليوم المحدد وراجع كل فاتورة في القائمة — اعثر على فاتورة الفرق.

---

## 10. HTTPS Warning / Browser Shows "Not Secure" / تحذير "الموقع غير آمن"

### EN
**Symptom:** Browser shows red warning "Your connection is not private".
**Fixes:**
1. Check the URL is exactly `https://erp.fratelanza.com` (with `s` after http).
2. Check your device's **date and time** are correct — wrong date breaks HTTPS validation.
3. Tell your developer/admin — the certificate may have expired. They run:
   `sudo certbot renew && sudo systemctl reload nginx`

### AR / بالعربية
**العرَض:** المتصفح يعرض تحذير أحمر "اتصالك ليس خاصاً".
**الحلول:**
1. تأكد أن الرابط بالضبط `https://erp.fratelanza.com` (مع `s` بعد http).
2. تأكد من **تاريخ ووقت الجهاز** — التاريخ الخاطئ يكسر التحقق من شهادة HTTPS.
3. أبلغ المطور/المسؤول — قد تكون الشهادة منتهية. ينفذ هذا الأمر على السيرفر:
   `sudo certbot renew && sudo systemctl reload nginx`

---

## 11. Page Shows Old Version After Update / الصفحة تعرض إصدار قديم بعد التحديث

### EN
**Symptom:** New features don't appear even after the update is deployed.
**Fixes:**
1. **Hard refresh**: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac).
2. Clear browser cache: `Ctrl + Shift + Delete` → cached files only.
3. Open in **Incognito/Private window** to test.
4. Confirm the deployment finished successfully on the server.

### AR / بالعربية
**العرَض:** الميزات الجديدة لا تظهر حتى بعد نشر التحديث.
**الحلول:**
1. **تحديث قوي**: `Ctrl + Shift + R` (ويندوز) أو `Cmd + Shift + R` (ماك).
2. امسح ذاكرة المتصفح: `Ctrl + Shift + Delete` → الملفات المخزنة فقط.
3. افتح في **نافذة تصفح خاص (Incognito)** للاختبار.
4. تأكد من اكتمال النشر بنجاح على السيرفر.

---

## 12. Backup or Restore Issues / مشاكل النسخ الاحتياطي والاستعادة

### EN
**Symptom:** Want to check backups are running, or need to restore data.
**Fixes:**
1. Check backup status: `tail -50 /var/log/pharmapos-backup.log`
2. List backup files: `ls -lh /var/backups/pharmapos/`
3. Restore from a backup file:
   `sudo bash /opt/pharmapos/deploy/restore.sh pharmapos_db /var/backups/pharmapos/FILE.sql.gz`
4. **NEVER** restore on production without backing up the current state first.

### AR / بالعربية
**العرَض:** التحقق من النسخ الاحتياطي، أو الحاجة لاستعادة بيانات.
**الحلول:**
1. راجع حالة النسخ الاحتياطي: `tail -50 /var/log/pharmapos-backup.log`
2. اعرض ملفات النسخ: `ls -lh /var/backups/pharmapos/`
3. استعادة من ملف:
   `sudo bash /opt/pharmapos/deploy/restore.sh pharmapos_db /var/backups/pharmapos/FILE.sql.gz`
4. **لا تستعيد أبداً** على الإنتاج بدون أخذ نسخة احتياطية من الحالة الحالية أولاً.

---

## 🛑 Deleting Data — Read This Before You Delete Anything / حذف البيانات — اقرأ هذا قبل أي حذف

### EN
**Golden rule: deletions are permanent. There is no Undo button.**

Before deleting **anything** (employee, product, invoice, customer, branch, etc.), do these in order:

1. **Ask yourself: do I really need to delete, or can I just deactivate?**
   Most items have an "Active / Inactive" toggle. Deactivating hides them from daily use but keeps history intact. **This is almost always the better choice.**

2. **Check what's linked to it:**
   - Employee → has sales? attendance? payroll? **Deactivate, don't delete.**
   - Product → has sales history? stock movements? **Deactivate, don't delete.**
   - Customer → has invoices? loyalty points? **Deactivate, don't delete.**
   - Invoice → almost always **issue a Return instead of deleting.**

3. **Take a manual backup first** (only takes 30 seconds):
   `sudo bash /opt/pharmapos/deploy/backup.sh`

4. **Tell support** before deleting anything that affects reports or finances.

5. **Confirmation policy in the app:** anywhere you can delete, the app will ask you to type the name or click "I understand this is permanent" before proceeding. If you don't see that prompt, **stop** — you might be using an older version or the wrong button.

### AR / بالعربية
**القاعدة الذهبية: الحذف نهائي. لا يوجد زر تراجع.**

قبل حذف **أي شيء** (موظف، منتج، فاتورة، عميل، فرع، إلخ)، نفّذ هذه الخطوات بالترتيب:

1. **اسأل نفسك: هل أحتاج فعلاً للحذف، أم يكفي التعطيل؟**
   معظم العناصر لديها مفتاح "نشط / غير نشط". التعطيل يخفيها من الاستخدام اليومي مع الحفاظ على السجل التاريخي. **هذا هو الخيار الأفضل في معظم الحالات.**

2. **افحص ما يرتبط بها:**
   - موظف → لديه مبيعات؟ حضور؟ رواتب؟ **عطّله، لا تحذفه.**
   - منتج → لديه سجل مبيعات؟ حركات مخزون؟ **عطّله، لا تحذفه.**
   - عميل → لديه فواتير؟ نقاط ولاء؟ **عطّله، لا تحذفه.**
   - فاتورة → دائماً تقريباً **اعمل إرجاع بدلاً من الحذف.**

3. **خذ نسخة احتياطية يدوية أولاً** (تأخذ 30 ثانية فقط):
   `sudo bash /opt/pharmapos/deploy/backup.sh`

4. **أبلغ الدعم** قبل حذف أي شيء يؤثر على التقارير أو المالية.

5. **سياسة التأكيد في التطبيق:** في أي مكان فيه إمكانية حذف، التطبيق سيطلب منك كتابة الاسم أو الضغط على "أفهم أن هذا نهائي" قبل المتابعة. إذا لم ترَ هذا التأكيد، **توقف** — قد تستخدم إصدار قديم أو الزر الخاطئ.

---

## When to Call Support / متى تتصل بالدعم

### EN
Call support immediately if:
- Data is missing from reports unexpectedly
- The site is down for everyone (test on phone mobile data first)
- You see error messages with words like "database", "tenant", "schema"
- Numbers in reports don't add up after checking filters
- You deleted something by accident

Provide:
- The exact error message (take a screenshot)
- The time it happened
- What you were doing right before the error

### AR / بالعربية
اتصل بالدعم فوراً إذا:
- اختفت بيانات من التقارير بشكل غير متوقع
- الموقع لا يعمل للجميع (اختبر على بيانات الجوال أولاً)
- ظهرت رسائل خطأ تحتوي كلمات مثل "database"، "tenant"، "schema"
- الأرقام في التقارير لا تتطابق بعد فحص الفلاتر
- حذفت شيئاً بالخطأ

قدّم:
- نص الخطأ بالضبط (التقط لقطة شاشة)
- وقت حدوث المشكلة
- ما كنت تفعله مباشرة قبل الخطأ

---

*Last updated: May 2026 — Print this guide and keep a copy at every workstation.*
*آخر تحديث: مايو 2026 — اطبع هذا الدليل واحتفظ بنسخة عند كل محطة عمل.*
