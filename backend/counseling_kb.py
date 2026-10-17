"""Drug-level counseling for the POS: recognise the drug / class from the item name
(generic or common Egyptian brand), give "how to take" and "warn" points, and
check the cart for interactions and duplicate ingredients.

Text is short, practical counter advice for the pharmacist — not a prescription.
"""
from __future__ import annotations

import re
from typing import Any

# class id → names that identify it (generic + common brands in Egypt). Latin names
# match on word boundaries; Arabic on substring.
CLASS_KEYS: dict[str, list[str]] = {
    "paracetamol": ["paracetamol", "acetaminophen", "panadol", "cetal", "abimol", "adol", "paramol", "tylenol",
                    "comtrex", "congestal", "coldrex", "grippostad", "cold & flu", "night & day", "بنادول", "سيتال", "أبيمول",
                    "ابيمول", "باراسيتامول", "كونجستال", "كومتركس", "أدول"],
    "nsaid": ["ibuprofen", "brufen", "diclofenac", "cataflam", "voltaren", "olfen", "naproxen", "naprosyn",
              "ketoprofen", "ketofan", "profenid", "celecoxib", "celebrex", "etoricoxib", "arcoxia", "meloxicam",
              "mobic", "piroxicam", "feldene", "mefenamic", "ponstan", "ketorolac", "lornoxicam", "xefo",
              "بروفين", "كتافلام", "فولتارين", "كيتوفان", "سيليبركس", "اركوكسيا", "موبيك", "ايبوبروفين"],
    "aspirin_low": ["aspirin", "aspocid", "jusprin", "rivo", "أسبوسيد", "اسبوسيد", "أسبرين", "اسبرين"],
    "antiplatelet": ["clopidogrel", "plavix", "clopex", "ticagrelor", "brilique", "prasugrel", "بلافيكس", "كلوبيدوجريل"],
    "anticoagulant": ["warfarin", "marevan", "apixaban", "eliquis", "rivaroxaban", "xarelto", "dabigatran", "pradaxa",
                      "ماريفان", "وارفارين", "إليكويس", "زاريلتو"],
    "metformin": ["metformin", "glucophage", "cidophage", "glucomin", "جلوكوفاج", "سيدوفاج", "ميتفورمين"],
    "sulfonylurea": ["glimepiride", "amaryl", "gliclazide", "diamicron", "glibenclamide", "daonil", "أماريل", "دياميكرون"],
    "sglt2": ["empagliflozin", "jardiance", "dapagliflozin", "forxiga", "canagliflozin", "جارديانس", "فورسيجا"],
    "insulin": ["insulin", "mixtard", "lantus", "novorapid", "humalog", "levemir", "tresiba", "toujeo", "انسولين", "أنسولين"],
    "levothyroxine": ["levothyroxine", "eltroxin", "euthyrox", "thyroxine", "التروكسين", "يوثيروكس"],
    "statin": ["atorvastatin", "lipitor", "ator", "rosuvastatin", "crestor", "rosuvast", "simvastatin", "zocor",
               "pravastatin", "ليبيتور", "كريستور"],
    "ace_arb": ["captopril", "capoten", "enalapril", "ramipril", "tritace", "perindopril", "coversyl", "lisinopril",
                "valsartan", "diovan", "losartan", "cozaar", "telmisartan", "micardis", "candesartan", "atacand",
                "exforge", "co-diovan", "كابوتين", "ترايتيس", "ديوفان", "كوزار"],
    "beta_blocker": ["bisoprolol", "concor", "atenolol", "tenormin", "propranolol", "inderal", "carvedilol", "dilatrend",
                     "nebivolol", "nevilob", "metoprolol", "betaloc", "كونكور", "اندرال", "تينورمين"],
    "ccb": ["amlodipine", "norvasc", "amlo", "nifedipine", "epilat", "adalat", "نورفاسك", "أملوديبين"],
    "diuretic": ["furosemide", "lasix", "hydrochlorothiazide", "indapamide", "natrilix", "torsemide", "لازكس", "ناتريليكس"],
    "k_sparing": ["spironolactone", "aldactone", "eplerenone", "ألداكتون", "الداكتون"],
    "potassium": ["potassium chloride", "slow-k", "k-lyte", "بوتاسيوم"],
    "nitrate": ["nitroglycerin", "glyceryl trinitrate", "isosorbide", "isordil", "nitromak", "nitro-mack",
                "إيزورديل", "نيتروماك"],
    "pde5": ["sildenafil", "viagra", "tadalafil", "cialis", "vardenafil", "levitra", "فياجرا", "سياليس"],
    "ppi": ["omeprazole", "losec", "esomeprazole", "nexium", "pantoprazole", "controloc", "lansoprazole", "lanzor",
            "rabeprazole", "pariet", "dexlansoprazole", "نيكسيوم", "كونترولوك", "أوميبرازول"],
    # Omeprazole / esomeprazole only (they weaken clopidogrel; pantoprazole does not).
    "ppi_cyp": ["omeprazole", "losec", "esomeprazole", "nexium", "أوميبرازول", "نيكسيوم"],
    "antacid": ["antacid", "gaviscon", "maalox", "mucogel", "rennie", "جافيسكون", "ميوكوجيل"],
    "calcium_iron_zinc": ["calcium", "caltrate", "osteocare", "iron", "ferrous", "feroglobin", "haemojet", "ferrotron",
                          "zinc", "magnesium", "multivitamin", "centrum", "كالسيوم", "حديد", "زنك", "ماغنسيوم"],
    "quinolone": ["ciprofloxacin", "ciprobay", "levofloxacin", "tavanic", "moxifloxacin", "avalox", "ofloxacin",
                  "سيبروباي", "تافانيك"],
    "tetracycline": ["doxycycline", "vibramycin", "minocycline", "tetracycline", "دوكسيسيكلين"],
    "macrolide": ["azithromycin", "zithromax", "xithrone", "clarithromycin", "klacid", "erythromycin",
                  "زيثروماكس", "كلاسيد"],
    "penicillin": ["amoxicillin", "augmentin", "hibiotic", "megamox", "curam", "amoxiclav", "flucloxacillin",
                   "أوجمنتين", "هاي بيوتك", "ميجاموكس", "أموكسيسيلين"],
    "cephalosporin": ["cefuroxime", "zinnat", "cefixime", "suprax", "cefadroxil", "ceftriaxone", "cefotax", "زينات"],
    "metronidazole": ["metronidazole", "flagyl", "tinidazole", "فلاجيل", "ميترونيدازول"],
    "fluconazole": ["fluconazole", "diflucan", "difluzole", "ديفلوكان"],
    "antihistamine_sedating": ["chlorpheniramine", "congestal", "comtrex", "كونجستال", "diphenhydramine", "hydroxyzine", "atarax", "promethazine",
                               "phenergan", "dimenhydrinate", "dramamine", "اتاراكس", "فينرجان"],
    "antihistamine": ["loratadine", "claritine", "desloratadine", "aerius", "cetirizine", "zyrtec",
                      "levocetirizine", "xyzal", "fexofenadine", "telfast", "كلاريتين", "زيرتك", "تلفاست"],
    "decongestant": ["pseudoephedrine", "clarinase", "congestal", "coldrex", "phenylephrine", "otrivin", "xylometazoline",
                     "oxymetazoline", "afrin", "كلارينيز", "أوتريفين"],
    "corticosteroid_oral": ["prednisolone", "solupred", "methylprednisolone", "medrol", "dexamethasone", "betamethasone tab",
                            "سولوبريد", "ميدرول"],
    "inhaled_steroid": ["symbicort", "seretide", "budesonide", "fluticasone inhal", "pulmicort", "foster", "سيريتايد", "سيمبيكورت"],
    "salbutamol": ["salbutamol", "ventolin", "farcolin", "فنتولين", "فاركولين"],
    "montelukast": ["montelukast", "singulair", "airokast", "سينجولير"],
    "ssri": ["escitalopram", "cipralex", "sertraline", "lustral", "fluoxetine", "prozac", "paroxetine", "seroxat",
             "citalopram", "سيبرالكس", "لوسترال"],
    "tramadol": ["tramadol", "tramal", "ترامادول"],
    "benzodiazepine": ["alprazolam", "xanax", "clonazepam", "rivotril", "diazepam", "valium", "bromazepam", "lexotanil",
                       "زاناكس", "ريفوتريل"],
    "alpha_blocker": ["tamsulosin", "omnic", "alfuzosin", "xatral", "doxazosin", "أومنك"],
    "allopurinol": ["allopurinol", "zyloric", "febuxostat", "zurampic", "زيلوريك"],
    "colchicine": ["colchicine", "كولشيسين"],
    "methotrexate": ["methotrexate", "ميثوتريكسات"],
    "bisphosphonate": ["alendronate", "fosamax", "risedronate", "actonel", "ibandronate", "bonviva", "فوساماكس"],
    "contraceptive": ["yasmin", "gynera", "microvlar", "cilest", "diane", "contraceptive", "ياسمين", "جينيرا", "منع حمل"],
    "domperidone": ["domperidone", "motilium", "موتيليوم"],
    "loperamide": ["loperamide", "imodium", "lopera", "إيموديوم"],
    "nasal_steroid": ["mometasone nasal", "nasonex", "avamys", "flixonase", "نازونكس"],
    "topical_steroid": ["hydrocortisone", "betamethasone cream", "betnovate", "dermovate", "mometasone cream", "elocon",
                        "fucicort", "ديرموفيت", "بيتنوفيت"],
    "topical_antifungal": ["clotrimazole", "canesten", "miconazole", "daktarin", "terbinafine", "lamisil",
                           "ketoconazole", "nizoral", "دكتارين", "لاميزيل"],
    "eye_drops": ["eye drop", "ophthalmic", "tobradex", "tears", "قطرة عين"],
    "ors": ["oral rehydration", "ors", "rehydran", "hydrolyte", "محلول جفاف", "ريهيدران"],
    "probiotic": ["probiotic", "lacteol", "enterogermina", "بروبيوتيك", "لاكتيول"],
    "folic_acid": ["folic acid", "folicap", "فوليك"],
    "vitamin_d": ["vitamin d", "devarol", "cholecalciferol", "ديفارول", "فيتامين د"],
    "isotretinoin": ["isotretinoin", "roaccutane", "acnotin", "isotrex gel", "روكيوتان", "أكنوتين"],
    "valproate": ["valproate", "valproic", "depakine", "depakote", "ديباكين"],
    "antispasmodic": ["hyoscine", "buscopan", "mebeverine", "duspatalin", "colospasmin", "spasmo", "otilonium",
                      "spasmomen", "بسكوبان", "دوسباتالين", "كولوسبازمين"],
    "laxative": ["lactulose", "duphalac", "bisacodyl", "dulcolax", "senna", "glycerin supp", "دوفالاك", "دولكولاكس"],
    "acyclovir": ["acyclovir", "aciclovir", "zovirax", "valacyclovir", "valtrex", "زوفيراكس"],
    "anthelmintic": ["mebendazole", "vermox", "albendazole", "alzental", "ivermectin", "iverzine", "فيرموكس", "ألزنتال"],
    "ondansetron": ["ondansetron", "zofran", "danset", "زوفران"],
    "dextromethorphan": ["dextromethorphan", "tussilar", "بلوكوف"],
    "tretinoin_topical": ["tretinoin", "retin-a", "adapalene", "differin", "benzoyl peroxide", "acnevir", "ديفرين"],
    "minoxidil": ["minoxidil", "regaine", "hair grow", "مينوكسيديل"],
    "duphaston": ["dydrogesterone", "duphaston", "دوفاستون"],
}

# Classes to flag when the customer may be pregnant (ask before dispensing).
PREGNANCY_RISK = {
    "ace_arb", "statin", "tetracycline", "quinolone", "methotrexate", "anticoagulant", "isotretinoin",
    "valproate", "minoxidil", "tretinoin_topical", "nsaid", "anthelmintic",
}

# class id → how to take / warnings / suggestions. Short lines; ar + en.
CLASS_TIPS: dict[str, dict[str, list[str] | list]] = {
    "paracetamol": {
        "how_ar": ["كل ٤–٦ ساعات عند الحاجة", "الحد الأقصى للبالغ ٤ جم في اليوم (٨ أقراص ٥٠٠ مجم)، وللطفل ١٥ مجم/كجم للجرعة"],
        "how_en": ["Every 4–6 h when needed", "Adult max 4 g a day (8 × 500 mg); child 15 mg/kg per dose"],
        "warn_ar": ["كتير من أدوية البرد فيها باراسيتامول — متجمعش منتجين", "حذر مع أمراض الكبد"],
        "warn_en": ["Many cold remedies already contain paracetamol — do not double up", "Caution in liver disease"],
        "sug_ar": ["ترمومتر", "محلول جفاف لو فيه حرارة"], "sug_en": ["Thermometer", "ORS if feverish"],
        "related": ["thermometer", "ors", "ترمومتر", "محلول جفاف"],
    },
    "nsaid": {
        "how_ar": ["بعد الأكل مع كوباية ماية", "أقل جرعة لأقصر مدة"],
        "how_en": ["After food with a full glass of water", "Lowest dose for the shortest time"],
        "warn_ar": ["ممنوع مع قرحة المعدة أو أمراض الكلى أو آخر ٣ شهور حمل", "ما يتاخدش مع مسكن تاني من نفس النوع", "ممكن يرفع الضغط"],
        "warn_en": ["Avoid with stomach ulcer, kidney disease or last trimester of pregnancy", "Do not combine with another NSAID", "Can raise blood pressure"],
        "sug_ar": ["واقي للمعدة لو الاستخدام هيطول"], "sug_en": ["Stomach protection if used for long"],
        "related": ["omeprazole", "esomeprazole", "أوميبرازول"],
    },
    "aspirin_low": {
        "how_ar": ["بعد الأكل، نفس الميعاد يومياً"], "how_en": ["After food, same time each day"],
        "warn_ar": ["متوقفهوش من نفسك لو موصوف للقلب", "بلّغ عن أي نزيف أو براز أسود"],
        "warn_en": ["Do not stop on your own if prescribed for the heart", "Report bleeding or black stools"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "antiplatelet": {
        "how_ar": ["يومياً في نفس الميعاد، مع أو بدون أكل"], "how_en": ["Daily at the same time, with or without food"],
        "warn_ar": ["ممنوع إيقافه بدون رأي الطبيب (خصوصاً بعد الدعامة)", "قول لدكتور الأسنان أو الجراح إنك بتاخده", "بلّغ عن أي نزيف"],
        "warn_en": ["Never stop without the doctor (especially after a stent)", "Tell the dentist / surgeon", "Report any bleeding"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "anticoagulant": {
        "how_ar": ["نفس الميعاد يومياً بالظبط", "الوارفارين: تحليل سيولة INR بانتظام وأكل ثابت في الخضار الورقية"],
        "how_en": ["Exactly the same time every day", "Warfarin: regular INR tests and steady leafy-green intake"],
        "warn_ar": ["ممنوع المسكنات زي البروفين والكتافلام — الباراسيتامول أأمن", "أي مضاد حيوي جديد لازم يتراجع مع الطبيب", "علامات النزيف: كدمات، دم في البول، براز أسود"],
        "warn_en": ["No NSAIDs (ibuprofen, diclofenac) — paracetamol is safer", "Any new antibiotic needs a doctor check", "Bleeding signs: bruises, blood in urine, black stool"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "metformin": {
        "how_ar": ["مع الأكل أو بعده مباشرة", "ابدأ بجرعة صغيرة لتقليل تعب المعدة"],
        "how_en": ["With or right after meals", "Start low to limit stomach upset"],
        "warn_ar": ["يتوقف قبل الأشعة بالصبغة وقت ما يقول الطبيب", "مع الاستخدام الطويل اطمن على فيتامين ب١٢"],
        "warn_en": ["Stop before contrast scans as the doctor advises", "Long use: check vitamin B12"],
        "sug_ar": ["جهاز وشرايط قياس السكر"], "sug_en": ["Glucose meter and strips"],
        "related": ["glucometer", "strips", "شرائط", "جهاز سكر"],
    },
    "sulfonylurea": {
        "how_ar": ["مع الفطار"], "how_en": ["With breakfast"],
        "warn_ar": ["ممكن يعمل هبوط سكر — متفوتش وجبات", "علامات الهبوط: عرق ورعشة ودوخة — خد سكر فوراً"],
        "warn_en": ["Can cause low sugar — do not skip meals", "Low-sugar signs: sweating, shaking, dizziness — take sugar at once"],
        "sug_ar": ["جهاز قياس السكر", "أقراص جلوكوز"], "sug_en": ["Glucose meter", "Glucose tablets"],
        "related": ["glucometer", "strips", "glucose", "جهاز سكر"],
    },
    "sglt2": {
        "how_ar": ["الصبح، مع أو بدون أكل"], "how_en": ["In the morning, with or without food"],
        "warn_ar": ["اشرب ماية كفاية", "اهتم بالنظافة الشخصية لتجنب الالتهابات", "يتوقف وقت الصيام الطويل أو الجفاف أو قبل العمليات"],
        "warn_en": ["Drink enough water", "Keep genital hygiene to avoid infections", "Pause when fasting long, dehydrated or before surgery"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "insulin": {
        "how_ar": ["غيّر مكان الحقن كل مرة", "القلم المفتوح في درجة حرارة الغرفة، والجديد في الثلاجة (مش الفريزر)"],
        "how_en": ["Rotate injection sites", "Opened pen at room temperature; spare pens in the fridge (not freezer)"],
        "warn_ar": ["اعرف علامات هبوط السكر وخلي معاك سكر"], "warn_en": ["Know low-sugar signs; carry sugar"],
        "sug_ar": ["سنون قلم الأنسولين", "قطن وكحول", "جهاز قياس السكر"], "sug_en": ["Pen needles", "Alcohol swabs", "Glucose meter"],
        "related": ["pen needle", "needles", "swab", "سنون", "جهاز سكر"],
    },
    "levothyroxine": {
        "how_ar": ["على الريق بكوباية ماية، قبل الفطار بنص ساعة لساعة", "كل يوم في نفس الميعاد"],
        "how_en": ["On an empty stomach with water, 30–60 min before breakfast", "Same time every day"],
        "warn_ar": ["بعيد ٤ ساعات عن الكالسيوم والحديد ومضادات الحموضة"], "warn_en": ["Keep 4 h away from calcium, iron and antacids"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "statin": {
        "how_ar": ["سيمفاستاتين بالليل؛ أتورفاستاتين وروزوفاستاتين أي ميعاد ثابت"], "how_en": ["Simvastatin at night; atorvastatin / rosuvastatin any fixed time"],
        "warn_ar": ["بلّغ عن ألم عضلات غير مبرر", "ممنوع في الحمل", "قلل الجريب فروت"],
        "warn_en": ["Report unexplained muscle pain", "Not in pregnancy", "Limit grapefruit"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "ace_arb": {
        "how_ar": ["نفس الميعاد يومياً", "قوم من النوم أو القعدة بالراحة أول أيام العلاج"],
        "how_en": ["Same time daily", "Stand up slowly in the first days"],
        "warn_ar": ["الكابتوبريل والإنالابريل وأخواتهم ممكن يعملوا كحة ناشفة — بلّغ الطبيب", "ممنوع في الحمل", "متاخدش بوتاسيوم أو ملح بديل من غير استشارة"],
        "warn_en": ["ACE inhibitors may cause a dry cough — tell the doctor", "Not in pregnancy", "No potassium supplements / salt substitutes without advice"],
        "sug_ar": ["جهاز قياس ضغط"], "sug_en": ["Blood pressure monitor"],
        "related": ["blood pressure monitor", "جهاز ضغط"],
    },
    "beta_blocker": {
        "how_ar": ["نفس الميعاد يومياً"], "how_en": ["Same time daily"],
        "warn_ar": ["ممنوع الإيقاف المفاجئ", "ممكن يخفي علامات هبوط السكر عند مريض السكر"],
        "warn_en": ["Never stop suddenly", "May mask low-sugar signs in diabetics"],
        "sug_ar": ["جهاز قياس ضغط"], "sug_en": ["Blood pressure monitor"], "related": ["blood pressure monitor", "جهاز ضغط"],
    },
    "ccb": {
        "how_ar": ["مرة يومياً في نفس الميعاد"], "how_en": ["Once daily at the same time"],
        "warn_ar": ["تورم بسيط في الكعبين ممكن يحصل — بلّغ لو زاد"], "warn_en": ["Mild ankle swelling can happen — report if it worsens"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "diuretic": {
        "how_ar": ["الصبح (عشان متصحاش بالليل للحمام)"], "how_en": ["In the morning (avoid night-time toilet trips)"],
        "warn_ar": ["دوخة أو تقلصات عضلية ممكن تكون نقص أملاح"], "warn_en": ["Dizziness or cramps may mean low salts"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "nitrate": {
        "how_ar": ["تحت اللسان وأنت قاعد عند ألم الصدر؛ لو مفيش تحسن بعد ٥ دقايق كررها واطلب الإسعاف"],
        "how_en": ["Under the tongue while seated for chest pain; if no relief in 5 min repeat and call an ambulance"],
        "warn_ar": ["خطر جداً مع الفياجرا والسياليس"], "warn_en": ["Dangerous with sildenafil / tadalafil"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "pde5": {
        "how_ar": ["قبل العلاقة بنص ساعة لساعة؛ الأكل الدسم بيأخر المفعول (سيلدينافيل)"],
        "how_en": ["30–60 min before; a fatty meal delays sildenafil"],
        "warn_ar": ["ممنوع نهائياً مع أدوية النيترات (أيزورديل، نيتروماك)", "بلّغ فوراً لو الانتصاب استمر أكتر من ٤ ساعات"],
        "warn_en": ["Never with nitrates (isosorbide, nitroglycerin)", "Seek help if an erection lasts over 4 hours"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "ppi": {
        "how_ar": ["قبل الفطار بنص ساعة", "متكسرش أو تمضغ الكبسولة"], "how_en": ["30 min before breakfast", "Do not crush or chew"],
        "warn_ar": ["الاستخدام الطويل يحتاج متابعة (كالسيوم، ماغنسيوم، ب١٢)"], "warn_en": ["Long use needs follow-up (calcium, magnesium, B12)"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "antacid": {
        "how_ar": ["بعد الأكل بساعة وقبل النوم"], "how_en": ["1 h after meals and at bedtime"],
        "warn_ar": ["بعيد ساعتين على الأقل عن باقي الأدوية"], "warn_en": ["Keep 2 h away from other medicines"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "calcium_iron_zinc": {
        "how_ar": ["الحديد على معدة فاضية مع عصير برتقال لو المعدة مستحملة، وبعيد عن الشاي والقهوة", "كربونات الكالسيوم مع الأكل"],
        "how_en": ["Iron on an empty stomach with orange juice if tolerated, away from tea / coffee", "Calcium carbonate with food"],
        "warn_ar": ["الحديد بيغمق لون البراز — ده طبيعي", "بعيد ساعتين على الأقل عن المضاد الحيوي وأدوية الغدة"],
        "warn_en": ["Iron darkens stools — that is normal", "Keep at least 2 h from antibiotics and thyroid tablets"],
        "sug_ar": ["فيتامين سي", "فيتامين د"], "sug_en": ["Vitamin C", "Vitamin D"], "related": ["vitamin c", "vitamin d", "فيتامين"],
    },
    "quinolone": {
        "how_ar": ["بكوباية ماية؛ قبل الكالسيوم والحديد ومضاد الحموضة بساعتين أو بعدهم بست ساعات"],
        "how_en": ["With water; 2 h before or 6 h after calcium, iron or antacids"],
        "warn_ar": ["بلّغ عن ألم في وتر الكعب (أكيليس)", "مش للأطفال والحوامل غالباً", "قلل التعرض للشمس"],
        "warn_en": ["Report heel-tendon pain", "Usually not for children or pregnancy", "Limit sun exposure"],
        "sug_ar": ["بروبيوتيك (بميعاد منفصل)"], "sug_en": ["Probiotic (separate time)"], "related": ["probiotic", "بروبيوتيك"],
    },
    "tetracycline": {
        "how_ar": ["بكوباية ماية كاملة وأنت واقف/قاعد، ومتنامش بعدها بنص ساعة", "بعيد عن اللبن والكالسيوم والحديد بساعتين"],
        "how_en": ["With a full glass of water, upright; do not lie down for 30 min", "2 h away from milk, calcium and iron"],
        "warn_ar": ["حساسية من الشمس — استخدم واقي شمس", "ممنوع للحامل والأطفال تحت ٨ سنين"],
        "warn_en": ["Sun sensitivity — use sunscreen", "Not in pregnancy or under 8 years"],
        "sug_ar": ["واقي شمس"], "sug_en": ["Sunscreen"], "related": ["sunscreen", "spf", "واقي شمس"],
    },
    "macrolide": {
        "how_ar": ["أزيثرومايسين مرة يومياً لمدة ٣–٥ أيام حسب الوصفة"], "how_en": ["Azithromycin once daily for 3–5 days as prescribed"],
        "warn_ar": ["كمّل الكورس للآخر", "الكلاريثرومايسين يتداخل مع أدوية الكوليسترول وغيرها — راجع القائمة"],
        "warn_en": ["Finish the course", "Clarithromycin interacts with statins and others — check the list"],
        "sug_ar": ["بروبيوتيك"], "sug_en": ["Probiotic"], "related": ["probiotic", "بروبيوتيك"],
    },
    "penicillin": {
        "how_ar": ["الأوجمنتين في أول الأكل يقلل تعب المعدة", "مواعيد منتظمة وكمّل الكورس"],
        "how_en": ["Amoxiclav at the start of a meal", "Evenly spaced doses; finish the course"],
        "warn_ar": ["اسأل عن حساسية البنسلين قبل الصرف", "بلّغ عن طفح جلدي أو إسهال شديد"],
        "warn_en": ["Ask about penicillin allergy before dispensing", "Report rash or severe diarrhoea"],
        "sug_ar": ["بروبيوتيك (بعيد عن ميعاد المضاد)"], "sug_en": ["Probiotic (apart from the antibiotic)"], "related": ["probiotic", "بروبيوتيك"],
    },
    "cephalosporin": {
        "how_ar": ["مواعيد منتظمة وكمّل الكورس"], "how_en": ["Evenly spaced doses; finish the course"],
        "warn_ar": ["حذر مع حساسية البنسلين"], "warn_en": ["Caution with penicillin allergy"],
        "sug_ar": ["بروبيوتيك"], "sug_en": ["Probiotic"], "related": ["probiotic", "بروبيوتيك"],
    },
    "metronidazole": {
        "how_ar": ["بعد الأكل"], "how_en": ["After food"],
        "warn_ar": ["ممنوع الكحول أثناء العلاج و٤٨ ساعة بعده", "طعم معدني في البق طبيعي"],
        "warn_en": ["No alcohol during and 48 h after", "A metallic taste is normal"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "fluconazole": {
        "how_ar": ["الالتهاب المهبلي غالباً جرعة واحدة ١٥٠ مجم"], "how_en": ["Vaginal thrush: usually a single 150 mg dose"],
        "warn_ar": ["بيتداخل مع الوارفارين وبعض أدوية القلب"], "warn_en": ["Interacts with warfarin and some heart medicines"],
        "sug_ar": ["غسول نسائي مناسب"], "sug_en": ["Gentle intimate wash"], "related": ["intimate wash", "غسول"],
    },
    "antihistamine_sedating": {
        "how_ar": ["بالليل أفضل"], "how_en": ["Best at night"],
        "warn_ar": ["بيسبب نعاس — ممنوع السواقة", "حذر مع البروستاتا والجلوكوما"], "warn_en": ["Causes drowsiness — do not drive", "Caution with prostate / glaucoma"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "antihistamine": {
        "how_ar": ["مرة يومياً"], "how_en": ["Once daily"],
        "warn_ar": ["نعاس بسيط ممكن مع السيتريزين"], "warn_en": ["Cetirizine can cause mild drowsiness"],
        "sug_ar": ["بخاخ ملح للأنف", "مناديل"], "sug_en": ["Saline nasal spray", "Tissues"], "related": ["saline", "tissue", "مناديل"],
    },
    "decongestant": {
        "how_ar": ["بخاخ الأنف المزيل للاحتقان أقصى حاجة ٥–٧ أيام"], "how_en": ["Decongestant nasal spray: 5–7 days max"],
        "warn_ar": ["بيرفع الضغط ويسبب أرق — حذر مع مرضى الضغط والقلب", "الاستخدام الطويل للبخاخ بيعمل احتقان عكسي"],
        "warn_en": ["Raises blood pressure and can cause insomnia — caution in hypertension / heart disease", "Long spray use causes rebound congestion"],
        "sug_ar": ["بخاخ ملح للأنف"], "sug_en": ["Saline nasal spray"], "related": ["saline", "ملح"],
    },
    "corticosteroid_oral": {
        "how_ar": ["الصبح مع الأكل"], "how_en": ["In the morning with food"],
        "warn_ar": ["متوقفهوش فجأة لو الكورس طويل", "بيرفع السكر والضغط — المريض يتابع"],
        "warn_en": ["Do not stop suddenly after a long course", "Raises sugar and blood pressure — monitor"],
        "sug_ar": ["واقي للمعدة لو موصوف"], "sug_en": ["Stomach protection if prescribed"], "related": [],
    },
    "inhaled_steroid": {
        "how_ar": ["اشطف بقك بالماية بعد كل استخدام", "استخدمه يومياً حتى من غير أعراض"],
        "how_en": ["Rinse mouth after each use", "Use daily even without symptoms"],
        "warn_ar": ["ده مش بخاخ الأزمة السريعة"], "warn_en": ["Not a rescue inhaler"],
        "sug_ar": ["فاصل (سبيسر)"], "sug_en": ["Spacer"], "related": ["spacer", "سبيسر"],
    },
    "salbutamol": {
        "how_ar": ["رجّ البخاخ، نفس عميق بعد البخة واحبس النفس ١٠ ثواني"], "how_en": ["Shake; breathe in deeply and hold for 10 s"],
        "warn_ar": ["لو بتحتاجه أكتر من مرتين في الأسبوع راجع الطبيب", "رعشة بسيطة وسرعة نبض ممكن"],
        "warn_en": ["Needing it more than twice a week → see the doctor", "Mild tremor / fast pulse can happen"],
        "sug_ar": ["فاصل (سبيسر)"], "sug_en": ["Spacer"], "related": ["spacer", "سبيسر"],
    },
    "montelukast": {
        "how_ar": ["بالليل"], "how_en": ["In the evening"],
        "warn_ar": ["بلّغ عن تغيّر في المزاج أو النوم"], "warn_en": ["Report mood or sleep changes"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "ssri": {
        "how_ar": ["التحسن بيبدأ بعد ٢–٤ أسابيع", "نفس الميعاد يومياً"], "how_en": ["Improvement starts after 2–4 weeks", "Same time daily"],
        "warn_ar": ["ممنوع الإيقاف المفاجئ", "حذر مع الترامادول"], "warn_en": ["Do not stop suddenly", "Caution with tramadol"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "tramadol": {
        "how_ar": ["حسب الوصفة فقط"], "how_en": ["Only as prescribed"],
        "warn_ar": ["بيسبب نعاس ودوخة — ممنوع السواقة", "خطر مع مضادات الاكتئاب والمهدئات"],
        "warn_en": ["Drowsiness and dizziness — do not drive", "Risky with antidepressants and sedatives"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "benzodiazepine": {
        "how_ar": ["حسب الوصفة فقط، لأقصر مدة"], "how_en": ["Only as prescribed, shortest time"],
        "warn_ar": ["نعاس — ممنوع السواقة", "ممنوع الإيقاف المفاجئ بعد الاستخدام الطويل"], "warn_en": ["Drowsiness — do not drive", "Do not stop suddenly after long use"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "alpha_blocker": {
        "how_ar": ["بعد نفس الوجبة يومياً، يفضل بالليل"], "how_en": ["After the same meal daily, ideally evening"],
        "warn_ar": ["دوخة عند الوقوف — قوم بالراحة"], "warn_en": ["Dizziness on standing — get up slowly"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "allopurinol": {
        "how_ar": ["بعد الأكل مع ماية كتير"], "how_en": ["After food with plenty of water"],
        "warn_ar": ["متبدأهوش وقت النوبة الحادة", "بلّغ فوراً عن أي طفح جلدي"], "warn_en": ["Do not start during an acute attack", "Report any rash at once"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "colchicine": {
        "how_ar": ["أقل جرعة فعالة حسب الوصفة"], "how_en": ["Lowest effective dose as prescribed"],
        "warn_ar": ["إسهال أو قيء = وقف واستشر", "بيتداخل مع الكلاريثرومايسين"], "warn_en": ["Diarrhoea or vomiting = stop and ask", "Interacts with clarithromycin"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "methotrexate": {
        "how_ar": ["مرة واحدة في الأسبوع بس — مش يومياً", "حمض الفوليك في يوم تاني حسب الوصفة"],
        "how_en": ["ONCE A WEEK only — never daily", "Folic acid on another day as prescribed"],
        "warn_ar": ["تأكد من يوم الجرعة مع المريض", "ممنوع في الحمل"], "warn_en": ["Confirm the weekly day with the patient", "Not in pregnancy"],
        "sug_ar": ["حمض الفوليك"], "sug_en": ["Folic acid"], "related": ["folic", "فوليك"],
    },
    "bisphosphonate": {
        "how_ar": ["الصبح على الريق بكوباية ماية كاملة، وأنت واقف أو قاعد", "متاكلش أو تنام لمدة نص ساعة"],
        "how_en": ["Morning, empty stomach, full glass of water, upright", "No food or lying down for 30 min"],
        "warn_ar": ["بعيد عن الكالسيوم في نفس اليوم الصبح"], "warn_en": ["Not with calcium that morning"],
        "sug_ar": ["كالسيوم وفيتامين د (في ميعاد تاني)"], "sug_en": ["Calcium + vitamin D (another time)"], "related": ["calcium", "vitamin d", "كالسيوم"],
    },
    "contraceptive": {
        "how_ar": ["نفس الميعاد يومياً", "لو نسيتي حباية: خديها أول ما تفتكري واسألي عن الحماية الإضافية"],
        "how_en": ["Same time every day", "Missed pill: take it when remembered and ask about backup protection"],
        "warn_ar": ["القيء أو الإسهال الشديد بيقلل الفاعلية", "بعض الأدوية بتقلل الفاعلية — اسألي الصيدلي"],
        "warn_en": ["Vomiting or severe diarrhoea reduce protection", "Some medicines reduce effect — ask"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "domperidone": {
        "how_ar": ["قبل الأكل بربع ساعة"], "how_en": ["15 min before meals"],
        "warn_ar": ["أقل جرعة لأقصر مدة (أسبوع)", "حذر مع أمراض القلب"], "warn_en": ["Lowest dose, shortest time (1 week)", "Caution in heart disease"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "loperamide": {
        "how_ar": ["بعد كل مرة إسهال، وبحد أقصى حسب العلبة"], "how_en": ["After each loose stool, up to the pack maximum"],
        "warn_ar": ["ممنوع لو فيه دم أو حرارة عالية، وممنوع للأطفال الصغار", "أهم حاجة تعويض السوائل"],
        "warn_en": ["Not with bloody stools or high fever, not for young children", "Rehydration comes first"],
        "sug_ar": ["محلول جفاف"], "sug_en": ["ORS"], "related": ["ors", "oral rehydration", "محلول جفاف"],
    },
    "nasal_steroid": {
        "how_ar": ["يومياً بانتظام، المفعول الكامل بعد أيام"], "how_en": ["Daily; full effect after a few days"],
        "warn_ar": ["وجّه البخة بعيد عن الحاجز الأنفي"], "warn_en": ["Aim away from the nasal septum"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "topical_steroid": {
        "how_ar": ["طبقة رفيعة مرة أو مرتين يومياً"], "how_en": ["Thin layer once or twice daily"],
        "warn_ar": ["متستخدمهوش فترة طويلة على الوش أو للأطفال من غير طبيب"], "warn_en": ["Not long-term on the face or in children without a doctor"],
        "sug_ar": ["مرطب"], "sug_en": ["Moisturiser"], "related": ["moistur", "مرطب"],
    },
    "topical_antifungal": {
        "how_ar": ["كمّل أسبوع لأسبوعين بعد ما الجلد يخف"], "how_en": ["Continue 1–2 weeks after the skin clears"],
        "warn_ar": ["حافظ على المكان ناشف"], "warn_en": ["Keep the area dry"],
        "sug_ar": ["بودرة مضادة للفطريات"], "sug_en": ["Antifungal powder"], "related": ["powder", "بودرة"],
    },
    "eye_drops": {
        "how_ar": ["٥ دقايق بين كل قطرة والتانية", "متلمسش طرف الزجاجة"], "how_en": ["5 min between different drops", "Do not touch the tip"],
        "warn_ar": ["اقلع العدسات اللاصقة قبلها بربع ساعة", "الزجاجة المفتوحة صالحة ٤ أسابيع غالباً"],
        "warn_en": ["Remove contact lenses 15 min before", "Usually discard 4 weeks after opening"],
        "sug_ar": ["دموع صناعية"], "sug_en": ["Artificial tears"], "related": ["tears", "دموع"],
    },
    "ors": {
        "how_ar": ["الكيس على الكمية المكتوبة من الماية بالظبط، رشفات صغيرة"], "how_en": ["Mix with exactly the stated water; small sips"],
        "warn_ar": ["متزودش سكر", "علامات خطر: نعاس شديد، بول قليل جداً، قيء مستمر"],
        "warn_en": ["Do not add sugar", "Danger signs: very drowsy, very little urine, constant vomiting"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "probiotic": {
        "how_ar": ["بعيد ساعتين عن المضاد الحيوي"], "how_en": ["2 h apart from antibiotics"], "warn_ar": [], "warn_en": [],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "folic_acid": {
        "how_ar": ["يفضل قبل الحمل بشهور وأول ٣ شهور"], "how_en": ["Ideally before conception and in the first trimester"], "warn_ar": [], "warn_en": [],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "isotretinoin": {
        "how_ar": ["مع الأكل", "مرطب للشفايف والجلد طول فترة العلاج"], "how_en": ["With food", "Lip balm and moisturiser throughout"],
        "warn_ar": ["ممنوع تماماً في الحمل — اختبار حمل ومنع حمل أثناء العلاج وبعده بشهر", "ممنوع مع التتراسيكلين وفيتامين أ", "تحاليل دهون وكبد دورية"],
        "warn_en": ["Absolutely not in pregnancy — test and contraception during and 1 month after", "Not with tetracyclines or vitamin A", "Regular lipid / liver tests"],
        "sug_ar": ["مرطب شفايف", "واقي شمس"], "sug_en": ["Lip balm", "Sunscreen"], "related": ["lip", "sunscreen", "spf", "واقي شمس"],
    },
    "valproate": {
        "how_ar": ["مع الأكل وفي نفس المواعيد"], "how_en": ["With food at fixed times"],
        "warn_ar": ["خطر كبير على الجنين — السيدات في سن الإنجاب يحتاجوا منع حمل ومتابعة طبيب", "متوقفهوش فجأة"],
        "warn_en": ["High risk to an unborn baby — women of child-bearing age need contraception and a doctor", "Do not stop suddenly"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "antispasmodic": {
        "how_ar": ["قبل الأكل بربع ساعة (الميبيفرين)، أو عند اللزوم (البسكوبان)"], "how_en": ["15 min before meals (mebeverine) or when needed (hyoscine)"],
        "warn_ar": ["ألم شديد مستمر أو مع حرارة أو قيء = طبيب"], "warn_en": ["Severe or persistent pain, or with fever / vomiting = see a doctor"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "laxative": {
        "how_ar": ["اشرب ماية كتير وزوّد الألياف", "البيساكوديل بالليل والمفعول الصبح"], "how_en": ["Plenty of water and fibre", "Bisacodyl at night works by morning"],
        "warn_ar": ["متستخدمهوش أكتر من أسبوع من غير استشارة"], "warn_en": ["Not for more than a week without advice"],
        "sug_ar": ["ألياف"], "sug_en": ["Fibre supplement"], "related": ["fibre", "fiber", "ألياف"],
    },
    "acyclovir": {
        "how_ar": ["ابدأ أول ما تظهر الأعراض", "الكريم ٥ مرات في اليوم"], "how_en": ["Start at the first sign", "Cream 5 times a day"],
        "warn_ar": ["اشرب ماية كفاية مع الأقراص"], "warn_en": ["Drink enough water with tablets"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "anthelmintic": {
        "how_ar": ["الأسرة كلها تتعالج في نفس الوقت", "جرعة تانية بعد أسبوعين غالباً"], "how_en": ["Treat the whole family together", "Usually a second dose after 2 weeks"],
        "warn_ar": ["مش للأطفال تحت سنتين والحوامل من غير طبيب", "اغسل الإيد كويس وقص الضوافر"], "warn_en": ["Not under 2 years or in pregnancy without a doctor", "Wash hands and cut nails"],
        "sug_ar": [], "sug_en": [], "related": [],
    },
    "ondansetron": {
        "how_ar": ["قبل السبب (أكل/علاج) بنص ساعة، الأقراص الذايبة على اللسان"], "how_en": ["30 min before the trigger; melt tablets on the tongue"],
        "warn_ar": ["ممكن إمساك أو صداع"], "warn_en": ["May cause constipation or headache"],
        "sug_ar": ["محلول جفاف"], "sug_en": ["ORS"], "related": ["ors", "محلول جفاف"],
    },
    "dextromethorphan": {
        "how_ar": ["للكحة الناشفة بس"], "how_en": ["For dry cough only"],
        "warn_ar": ["مش مع الكحة اللي فيها بلغم", "حذر مع مضادات الاكتئاب"], "warn_en": ["Not for chesty cough", "Caution with antidepressants"],
        "sug_ar": ["أقراص استحلاب", "عسل"], "sug_en": ["Lozenges", "Honey"], "related": ["lozenge", "honey", "عسل"],
    },
    "tretinoin_topical": {
        "how_ar": ["طبقة رفيعة بالليل على جلد ناشف", "النتيجة بعد ٦–٨ أسابيع"], "how_en": ["Thin layer at night on dry skin", "Results after 6–8 weeks"],
        "warn_ar": ["احمرار وتقشير أول أسابيع طبيعي", "واقي شمس الصبح ضروري", "ممنوع في الحمل"],
        "warn_en": ["Redness and peeling in the first weeks is normal", "Sunscreen every morning", "Not in pregnancy"],
        "sug_ar": ["واقي شمس", "مرطب خفيف"], "sug_en": ["Sunscreen", "Light moisturiser"], "related": ["sunscreen", "spf", "moistur", "واقي شمس"],
    },
    "minoxidil": {
        "how_ar": ["مرتين يومياً على فروة ناشفة", "النتيجة بعد ٣–٦ شهور ولازم الاستمرار"], "how_en": ["Twice daily on a dry scalp", "Results after 3–6 months; keep using"],
        "warn_ar": ["تساقط زيادة أول أسابيع طبيعي", "ممنوع في الحمل والرضاعة"], "warn_en": ["Extra shedding in the first weeks is normal", "Not in pregnancy or breastfeeding"],
        "sug_ar": ["شامبو مناسب"], "sug_en": ["Suitable shampoo"], "related": ["shampoo", "شامبو"],
    },
    "duphaston": {
        "how_ar": ["حسب جدول الطبيب بالظبط"], "how_en": ["Exactly per the doctor's schedule"],
        "warn_ar": ["متوقفهوش من نفسك في الحمل"], "warn_en": ["Do not stop on your own in pregnancy"],
        "sug_ar": ["حمض الفوليك"], "sug_en": ["Folic acid"], "related": ["folic", "فوليك"],
    },
    "vitamin_d": {
        "how_ar": ["مع وجبة فيها دهون"], "how_en": ["With a meal that has some fat"],
        "warn_ar": ["متزودش عن الجرعة الموصوفة"], "warn_en": ["Do not exceed the prescribed dose"],
        "sug_ar": ["كالسيوم"], "sug_en": ["Calcium"], "related": ["calcium", "كالسيوم"],
    },
}

# (class A, class B, severity, ar, en). "same" = two different products of one class.
INTERACTIONS: list[tuple[str, str, str, str, str]] = [
    ("nsaid", "same", "high", "مسكنين من نفس النوع (مضادات الالتهاب) — خطر على المعدة والكلى، كفاية واحد.",
     "Two NSAIDs together — stomach and kidney risk; use one."),
    ("paracetamol", "same", "high", "أكتر من منتج فيه باراسيتامول — خطر جرعة زايدة على الكبد.",
     "More than one paracetamol product — overdose risk to the liver."),
    ("nsaid", "anticoagulant", "high", "مسكن مضاد للالتهاب مع مسيّل للدم — خطر نزيف. الباراسيتامول أأمن.",
     "NSAID with an anticoagulant — bleeding risk. Prefer paracetamol."),
    ("nsaid", "antiplatelet", "high", "مسكن مضاد للالتهاب مع بلافيكس/مضاد صفائح — خطر نزيف.",
     "NSAID with an antiplatelet — bleeding risk."),
    ("nsaid", "aspirin_low", "medium", "البروفين وأخواته مع الأسبرين يزودوا نزيف المعدة ويقللوا حماية الأسبرين.",
     "NSAIDs with aspirin raise GI bleeding and can blunt aspirin's protection."),
    ("anticoagulant", "antiplatelet", "high", "مسيّل دم مع مضاد صفائح — لازم يكون بتعليمات الطبيب ومتابعة نزيف.",
     "Anticoagulant with an antiplatelet — only on doctor's orders; watch for bleeding."),
    ("anticoagulant", "quinolone", "high", "المضاد الحيوي ده بيزود مفعول مسيّل الدم — يحتاج تحليل سيولة.",
     "This antibiotic boosts the anticoagulant — INR check needed."),
    ("anticoagulant", "metronidazole", "high", "الفلاجيل بيزود مفعول الوارفارين جداً — خطر نزيف.",
     "Metronidazole strongly boosts warfarin — bleeding risk."),
    ("anticoagulant", "fluconazole", "high", "الفلوكونازول بيزود مفعول مسيّل الدم — يحتاج متابعة.",
     "Fluconazole boosts the anticoagulant — monitor."),
    ("anticoagulant", "macrolide", "medium", "المضاد الحيوي ده ممكن يزود السيولة — متابعة INR.",
     "This antibiotic may raise INR — monitor."),
    ("pde5", "nitrate", "high", "خطر جداً: الفياجرا/السياليس مع النيترات بتنزل الضغط بشكل خطير. ممنوع.",
     "Dangerous: PDE5 inhibitor with nitrates can crash blood pressure. Do not combine."),
    ("quinolone", "calcium_iron_zinc", "medium", "الكالسيوم/الحديد/الزنك بيبوظ امتصاص المضاد الحيوي — المضاد قبلهم بساعتين أو بعدهم بست ساعات.",
     "Calcium / iron / zinc block absorption — give the antibiotic 2 h before or 6 h after."),
    ("quinolone", "antacid", "medium", "مضاد الحموضة بيقلل امتصاص المضاد الحيوي — فرّق بينهم.",
     "Antacids reduce absorption — separate the doses."),
    ("tetracycline", "calcium_iron_zinc", "medium", "الكالسيوم/الحديد بيقلل امتصاص الدوكسيسيكلين — فرّق ساعتين.",
     "Calcium / iron reduce doxycycline absorption — separate by 2 h."),
    ("tetracycline", "antacid", "medium", "مضاد الحموضة بيقلل امتصاص الدوكسيسيكلين — فرّق ساعتين.",
     "Antacids reduce doxycycline absorption — separate by 2 h."),
    ("levothyroxine", "calcium_iron_zinc", "medium", "الكالسيوم/الحديد بيقلل امتصاص دوا الغدة — فرّق ٤ ساعات.",
     "Calcium / iron reduce levothyroxine absorption — separate by 4 h."),
    ("levothyroxine", "antacid", "medium", "مضاد الحموضة بيقلل امتصاص دوا الغدة — فرّق ٤ ساعات.",
     "Antacids reduce levothyroxine absorption — separate by 4 h."),
    ("bisphosphonate", "calcium_iron_zinc", "medium", "الكالسيوم بيمنع امتصاص دوا العضم — في ميعاد تاني.",
     "Calcium blocks the bisphosphonate — take at another time."),
    ("ace_arb", "potassium", "high", "دوا الضغط ده مع البوتاسيوم ممكن يرفع البوتاسيوم في الدم.",
     "This BP drug with potassium can raise blood potassium."),
    ("ace_arb", "k_sparing", "medium", "مع الألداكتون: خطر ارتفاع البوتاسيوم — يحتاج تحليل.",
     "With spironolactone: high-potassium risk — needs a blood test."),
    ("ace_arb", "nsaid", "medium", "المسكنات دي بتقلل مفعول دوا الضغط وبتأثر على الكلى.",
     "NSAIDs reduce the BP effect and stress the kidneys."),
    ("diuretic", "nsaid", "medium", "المسكن بيقلل مفعول مدر البول ويأثر على الكلى.",
     "NSAIDs blunt the diuretic and stress the kidneys."),
    ("antiplatelet", "ppi_cyp", "low", "مع البلافيكس: البانتوبرازول (كونترولوك) أفضل من الأوميبرازول والإيزوميبرازول.",
     "With clopidogrel: pantoprazole is preferred over omeprazole / esomeprazole."),
    ("macrolide", "statin", "medium", "الكلاريثرومايسين مع أدوية الكوليسترول بيزود خطر ألم العضلات — يفضل أزيثرومايسين أو إيقاف مؤقت.",
     "Clarithromycin with statins raises muscle risk — prefer azithromycin or pause the statin."),
    ("macrolide", "colchicine", "high", "الكلاريثرومايسين مع الكولشيسين ممكن يسبب تسمم.",
     "Clarithromycin with colchicine can cause toxicity."),
    ("ssri", "tramadol", "high", "مضاد اكتئاب مع ترامادول — خطر تشنجات ومتلازمة السيروتونين.",
     "SSRI with tramadol — seizure and serotonin-syndrome risk."),
    ("benzodiazepine", "tramadol", "high", "مهدئ مع ترامادول — خطر نعاس شديد وتثبيط تنفس.",
     "Benzodiazepine with tramadol — heavy sedation and breathing risk."),
    ("antihistamine_sedating", "benzodiazepine", "medium", "مضاد حساسية منوّم مع مهدئ — نعاس شديد.",
     "Sedating antihistamine with a benzodiazepine — heavy drowsiness."),
    ("antihistamine_sedating", "tramadol", "medium", "مضاد حساسية منوّم مع ترامادول — نعاس شديد.",
     "Sedating antihistamine with tramadol — heavy drowsiness."),
    ("decongestant", "beta_blocker", "medium", "مزيل الاحتقان بيرفع الضغط — حذر مع مرضى الضغط والقلب.",
     "Decongestants raise blood pressure — caution in hypertension / heart disease."),
    ("decongestant", "ace_arb", "medium", "مزيل الاحتقان بيرفع الضغط — حذر مع مرضى الضغط.",
     "Decongestants raise blood pressure — caution in hypertension."),
    ("decongestant", "ccb", "medium", "مزيل الاحتقان بيرفع الضغط — حذر مع مرضى الضغط.",
     "Decongestants raise blood pressure — caution in hypertension."),
    ("decongestant", "same", "medium", "منتجين مزيل احتقان — جرعة زايدة من نفس المادة.",
     "Two decongestant products — doubling up."),
    ("metformin", "corticosteroid_oral", "low", "الكورتيزون بيرفع السكر — المريض يتابع القياس.",
     "Steroids raise blood sugar — monitor glucose."),
    ("insulin", "corticosteroid_oral", "low", "الكورتيزون بيرفع السكر — المريض يتابع القياس.",
     "Steroids raise blood sugar — monitor glucose."),
    ("beta_blocker", "salbutamol", "medium", "بعض حاصرات بيتا ممكن تضيّق الشعب — حذر مع الربو.",
     "Some beta-blockers can tighten airways — caution in asthma."),
    ("isotretinoin", "tetracycline", "high", "الروكيوتان مع الدوكسيسيكلين/التتراسيكلين — خطر ارتفاع ضغط المخ. ممنوع.",
     "Isotretinoin with a tetracycline — risk of raised brain pressure. Do not combine."),
    ("dextromethorphan", "ssri", "medium", "دواء الكحة ده مع مضاد الاكتئاب — خطر متلازمة السيروتونين.",
     "Dextromethorphan with an SSRI — serotonin-syndrome risk."),
    ("ondansetron", "ssri", "low", "الأوندانسيترون مع مضادات الاكتئاب — راقب أعراض السيروتونين.",
     "Ondansetron with SSRIs — watch for serotonin symptoms."),
    ("methotrexate", "nsaid", "high", "الميثوتريكسات مع مضادات الالتهاب — خطر سمية. استشر الطبيب.",
     "Methotrexate with NSAIDs — toxicity risk. Check with the doctor."),
]

_LATIN = re.compile(r"[a-z]")


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower().replace("أ", "ا").replace("إ", "ا").strip())


def _hit(key: str, blob: str) -> bool:
    k = _norm(key)
    if _LATIN.search(k):
        return re.search(rf"(?<![a-z]){re.escape(k)}(?![a-z])", blob) is not None
    return k in blob


def classes_for(name_en: str, name_ar: str, category: str | None = None) -> list[str]:
    blob = _norm(f"{name_en} {name_ar} {category or ''}")
    return [cid for cid, keys in CLASS_KEYS.items() if any(_hit(k, blob) for k in keys)]


def tips_for(classes: list[str], lang: str) -> dict[str, Any]:
    ar = lang == "ar"
    how, warn, sug, related = [], [], [], []
    for c in classes:
        t = CLASS_TIPS.get(c)
        if not t:
            continue
        for src, dst in (("how", how), ("warn", warn), ("sug", sug)):
            for line in t.get(f"{src}_{'ar' if ar else 'en'}", []):
                if line not in dst:
                    dst.append(line)
        related += [r for r in t.get("related", []) if r not in related]
    pregnancy = any(c in PREGNANCY_RISK for c in classes)
    return {"how_to": how[:4], "warnings": warn[:4], "suggestions": sug[:3], "related_terms": related,
            "pregnancy_caution": pregnancy}


_CONC = re.compile(r"(\d+(?:\.\d+)?)\s*mg\s*/\s*(\d+(?:\.\d+)?)\s*ml", re.I)
_IBU = ("ibuprofen", "brufen", "ايبوبروفين", "بروفين", "kidofen", "cetafen")


def dose_helper(name_en: str, name_ar: str, classes: list[str]) -> dict | None:
    """Weight-based child dose for paracetamol / ibuprofen liquids, from the strength
    printed in the name (e.g. 120mg/5ml). Paracetamol 15 mg/kg up to 4 times a day;
    ibuprofen 10 mg/kg up to 3 times a day, from 3 months / 5 kg."""
    blob = _norm(f"{name_en} {name_ar}").translate(str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789"))
    m = _CONC.search(blob)
    if not m:
        return None
    mg_per_ml = float(m.group(1)) / float(m.group(2))
    if "paracetamol" in classes:
        return {"drug": "paracetamol", "mg_per_ml": round(mg_per_ml, 3), "mg_per_kg": 15, "times_per_day": 4,
                "min_weight_kg": 3, "max_dose_mg": 1000}
    if "nsaid" in classes and any(_hit(k, blob) for k in _IBU):
        return {"drug": "ibuprofen", "mg_per_ml": round(mg_per_ml, 3), "mg_per_kg": 10, "times_per_day": 3,
                "min_weight_kg": 5, "max_dose_mg": 400}
    return None


def cart_interactions(new_classes: list[str], cart: list[tuple[str, list[str]]], lang: str) -> list[dict]:
    """Interactions between the scanned item and what is already in the cart.
    cart = [(product name, classes)]."""
    ar = lang == "ar"
    out, seen = [], set()
    for other_name, other_classes in cart:
        for a, b, sev, msg_ar, msg_en in INTERACTIONS:
            pairs = []
            if b == "same":
                pairs = [(a, a)]
            else:
                pairs = [(a, b), (b, a)]
            for x, y in pairs:
                if x in new_classes and y in other_classes:
                    key = (a, b, other_name)
                    if key in seen:
                        continue
                    seen.add(key)
                    out.append({"severity": sev, "with": other_name, "message": msg_ar if ar else msg_en})
    rank = {"high": 0, "medium": 1, "low": 2}
    out.sort(key=lambda r: rank.get(r["severity"], 3))
    return out[:4]
