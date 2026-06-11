"""Curated pharmacy counseling + cross-sell hints for POS scan suggestions."""
from __future__ import annotations

import re
from typing import Any

# Each rule: match product name/category keywords → advice + related inventory search terms.
COUNSELING_RULES: list[dict[str, Any]] = [
    {
        "id": "pain_fever",
        "keys": [
            "paracetamol", "panadol", "acetaminophen", "ibuprofen", "brufen", "cataflam",
            "باراسيتامول", "بنادول", "ايبوبروفين", "مسكن", "خافض حرارة",
        ],
        "categories": ["analgesic", "pain", "fever", "مسكن", "حرارة"],
        "advice_en": "Remind: take with food if stomach is sensitive; do not combine multiple pain killers; watch total daily paracetamol dose (max ~4g/day for adults).",
        "advice_ar": "نبّه العميل: يُفضّل مع الطعام عند حساسية المعدة؛ لا يُجمع أكثر من مسكن؛ راقب جرعة الباراسيتامول اليومية (حد أقصى ~٤ جم للبالغ).",
        "suggest_en": "Suggest: oral rehydration if fever, tissues, vitamin C, or thermometer if needed.",
        "suggest_ar": "اقترح: محلول جفاف عند الحرارة، مناديل، فيتامين سي، أو ترمومتر عند الحاجة.",
        "related_terms": ["oral rehydration", "ors", "tissue", "vitamin c", "thermometer", "محلول جفاف", "مناديل", "فيتامين"],
    },
    {
        "id": "cold_flu",
        "keys": [
            "cold", "flu", "cough", "decongest", "antihistamine", "clarinase", "congest",
            "برد", "انفلونزا", "سعال", "احتقان", "مضاد حساسية",
        ],
        "categories": ["cold", "cough", "antihistamine", "برد", "سعال"],
        "advice_en": "Warn about drowsiness with some antihistamines — avoid driving. Increase fluids and rest; check for fever or persistent cough needing a doctor.",
        "advice_ar": "حذّر من النعاس مع بعض مضادات الحساسية — تجنّب القيادة. أكثر من السوائل والراحة؛ راقب الحرارة أو السعال المستمر الذي يحتاج طبيباً.",
        "suggest_en": "Suggest: saline nasal spray, honey lozenges, tissues, vitamin C, or steam inhalation support.",
        "suggest_ar": "اقترح: بخاخ ملحي للأنف، أقراص عسل للحلق، مناديل، فيتامين سي، أو بخار للاحتقان.",
        "related_terms": ["saline", "nasal", "honey", "lozenge", "tissue", "vitamin c", "بخاخ", "عسل", "مناديل"],
    },
    {
        "id": "antibiotic",
        "keys": [
            "amoxicillin", "augmentin", "azithromycin", "ciprofloxacin", "antibiotic",
            "مضاد حيوي", "اموكسيسيلين", "اوجمنتين", "ازيثرومايسين",
        ],
        "categories": ["antibiotic", "مضاد"],
        "advice_en": "Stress: complete the full course even if feeling better; take at evenly spaced times; report rash or severe diarrhea immediately.",
        "advice_ar": "أكّد: إكمال الجرعة كاملة حتى مع التحسّن؛ التزم بالمواعيد؛ أبلغ فوراً عن طفح جلدي أو إسهال شديد.",
        "suggest_en": "Suggest: probiotic (separate timing from antibiotic), ORS if diarrhea, gentle stomach support.",
        "suggest_ar": "اقترح: بروبيوتيك (بعيداً عن موعد المضاد)، محلول جفاف عند الإسهال، دعم للمعدة.",
        "related_terms": ["probiotic", "ors", "oral rehydration", "بروبيوتيك", "جفاف"],
    },
    {
        "id": "gi_stomach",
        "keys": [
            "omeprazole", "antacid", "gaviscon", "loperamide", "motilium", "stomach",
            "معدة", "حموضة", "اسهال", "إسهال", "غثيان", "لانسر",
        ],
        "categories": ["gi", "stomach", "antacid", "معدة"],
        "advice_en": "Take antacids/PPIs as directed (often before meals for PPI). For diarrhea: hydrate; seek care if blood in stool, high fever, or dehydration signs.",
        "advice_ar": "التزم بتعليمات مضاد الحموضة/مثبط الحموضة (غالباً قبل الأكل). مع الإسهال: سوائل كافية؛ راجع الطبيب عند دم أو حرارة عالية أو علامات جفاف.",
        "suggest_en": "Suggest: ORS, probiotics, bland diet guidance, electrolyte drinks.",
        "suggest_ar": "اقترح: محلول جفاف، بروبيوتيك، مشروبات أملاح.",
        "related_terms": ["oral rehydration", "ors", "probiotic", "electrolyte", "جفاف", "بروبيوتيك"],
    },
    {
        "id": "diabetes",
        "keys": [
            "metformin", "insulin", "glimepiride", "diabetes", "glucose", "sugar test",
            "سكر", "انسولين", "ميتفورمين", "ضغط سكر",
        ],
        "categories": ["diabetes", "سكر"],
        "advice_en": "Remind: take at prescribed times with meals as directed; monitor blood sugar; carry glucose if on insulin/sulfonylureas; foot care and regular follow-up.",
        "advice_ar": "نبّه: التزم بالمواعيد مع الوجبات حسب الوصفة؛ راقب السكر؛ احمل سكر سريع مع الأنسولين؛ عناية بالقدم ومتابعة دورية.",
        "suggest_en": "Suggest: glucose strips/lancets, sugar-free cough option if sick, foot cream.",
        "suggest_ar": "اقترح: شرائط قياس السكر، خيار علاج برد خالٍ من السكر، كريم للقدم.",
        "related_terms": ["glucose", "strip", "lancet", "sugar free", "شرائط", "سكر"],
    },
    {
        "id": "hypertension",
        "keys": [
            "amlodipine", "losartan", "telmisartan", "atenolol", "blood pressure",
            "ضغط", "ضغط عالي", "كوليسترول",
        ],
        "categories": ["cardiovascular", "hypertension", "ضغط"],
        "advice_en": "Take regularly at the same time daily; do not stop suddenly without doctor advice; low-salt diet; monitor BP at home if possible.",
        "advice_ar": "التزم يومياً بنفس الموعد؛ لا تتوقف فجأة دون الطبيب؛ قلّل الملح؛ راقب الضغط في المنزل إن أمكن.",
        "suggest_en": "Suggest: BP monitor cuff, low-sodium lifestyle reminder.",
        "suggest_ar": "اقترح: جهاز قياس ضغط منزلي.",
        "related_terms": ["blood pressure", "monitor", "cuff", "ضغط"],
    },
    {
        "id": "topical_skin",
        "keys": [
            "cream", "ointment", "gel", "hydrocortisone", "antifungal", "clotrimazole",
            "كريم", "مرهم", "جل", "فطريات", "جلد",
        ],
        "categories": ["topical", "dermatology", "جلد", "كريم"],
        "advice_en": "Apply thin layer to clean dry skin; wash hands after; avoid eyes/mouth unless eye product; stop if irritation worsens.",
        "advice_ar": "طبقة رقيقة على جلد نظيف جاف؛ اغسل يديك بعدها؛ تجنّب العين والفم إلا إن كان للعين؛ أوقف عند زيادة التهيّج.",
        "suggest_en": "Suggest: gentle cleanser, moisturizer, cotton gauze if needed.",
        "suggest_ar": "اقترح: غسول لطيف، مرطب، شاش طبي.",
        "related_terms": ["moisturizer", "cleanser", "gauze", "مرطب", "شاش"],
    },
    {
        "id": "eye_ear",
        "keys": ["eye drop", "ear drop", "ophthalmic", "قطرة عين", "قطرة اذن", "عين"],
        "categories": ["ophthalmic", "otic", "عين"],
        "advice_en": "For eye drops: discard open bottle after period on label; do not share; remove contacts unless product allows; press inner corner 1 min to reduce systemic absorption.",
        "advice_ar": "للعين: لا تشارك القطارة؛ التزم بمدة الاستخدام بعد الفتح؛ أزل العدسات إلا إذا سمح المنتج؛ اضغط الزاوية الداخلية دقيقة.",
        "suggest_en": "Suggest: artificial tears, lens solution, sterile wipes.",
        "suggest_ar": "اقترح: دموع صناعية، محلول عدسات.",
        "related_terms": ["artificial tear", "lens", "عدسات", "عين"],
    },
    {
        "id": "pediatric",
        "keys": [
            "syrup", "pediatric", "children", "baby", "infant", "suspension",
            "شراب", "اطفال", "أطفال", "رضع", "معلق",
        ],
        "categories": ["pediatric", "اطفال"],
        "advice_en": "Confirm child age/weight for dosing; use measuring syringe not kitchen spoon; store safely out of children's reach.",
        "advice_ar": "تأكد من العمر/الوزن للجرعة؛ استخدم سرنجة القياس وليس ملعقة المطبخ؛ احفظ بعيداً عن متناول الأطفال.",
        "suggest_en": "Suggest: children's thermometer, ORS sachets, gentle fever reducer if appropriate.",
        "suggest_ar": "اقترح: ترمومتر أطفال، أكياس جفاف، خافض حرارة مناسب للعمر.",
        "related_terms": ["pediatric", "syringe", "thermometer", "اطفال", "ترمومتر"],
    },
    {
        "id": "vitamin_supplement",
        "keys": [
            "vitamin", "zinc", "omega", "calcium", "iron", "multivitamin", "supplement",
            "فيتامين", "حديد", "كالسيوم", "زنك", "مكمل",
        ],
        "categories": ["vitamin", "supplement", "فيتامين"],
        "advice_en": "Take with food if stomach upset; iron away from tea/calcium; check interactions with chronic medicines.",
        "advice_ar": "مع الطعام عند اضطراب المعدة؛ الحديد بعيداً عن الشاي والكالسيوم؛ راجع التداخلات مع أدوية مزمنة.",
        "suggest_en": "Suggest: complementary mineral or immune support if appropriate to customer needs.",
        "suggest_ar": "اقترح مكملاً مكملاً حسب احتياج العميل.",
        "related_terms": ["vitamin", "zinc", "فيتامين"],
    },
    {
        "id": "inhaler_respiratory",
        "keys": [
            "inhaler", "ventolin", "salbutamol", "nebul", "asthma", "بخاخ صدر", "ربو", "سالبوتامول",
        ],
        "categories": ["respiratory", "asthma", "صدر"],
        "advice_en": "Review inhaler technique; rinse mouth after steroid inhalers; carry rescue inhaler; seek emergency care if worsening breathlessness.",
        "advice_ar": "راجع طريقة استخدام البخاخ؛ اشطف الفم بعد الكورتيزون الاستنشاقي؛ احمل بخاخ الطوارئ؛ اطلب طوارئ عند ضيق تنفس شديد.",
        "suggest_en": "Suggest: spacer device, peak flow log, saline nebul solution if prescribed.",
        "suggest_ar": "اقترح: spacer، محلول نيبول ملحي إن وُصف.",
        "related_terms": ["spacer", "saline", "nebul", "بخاخ"],
    },
    {
        "id": "sun_skin_care",
        "keys": ["sunscreen", "spf", "sun block", "واقي شمس", "شمس"],
        "categories": ["sunscreen", "شمس"],
        "advice_en": "Apply generously 15–30 min before sun; reapply every 2 hours and after swimming; combine with hat/shade.",
        "advice_ar": "ضع كمية كافية قبل الشمس ١٥–٣٠ دقيقة؛ أعد كل ساعتين وبعد السباحة؛ مع قبعة وظل.",
        "suggest_en": "Suggest: after-sun gel, lip SPF, aloe moisturizer.",
        "suggest_ar": "اقترح: مرطب بعد الشمس، واقي شفاه.",
        "related_terms": ["after sun", "aloe", "lip", "شمس", "مرطب"],
    },
]


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower().strip())


def match_counseling_rule(
    name_en: str,
    name_ar: str,
    category: str | None,
) -> dict[str, Any] | None:
    blob = _norm(f"{name_en} {name_ar} {category or ''}")
    best: dict[str, Any] | None = None
    best_score = 0
    for rule in COUNSELING_RULES:
        score = 0
        for k in rule.get("keys", []):
            if _norm(k) in blob:
                score += 2
        for c in rule.get("categories", []):
            if _norm(c) in blob:
                score += 1
        if score > best_score:
            best_score = score
            best = rule
    return best if best_score > 0 else None


def build_counseling_message(rule: dict, lang: str) -> dict[str, str]:
    ar = lang == "ar"
    return {
        "advice": rule["advice_ar"] if ar else rule["advice_en"],
        "suggest": rule["suggest_ar"] if ar else rule["suggest_en"],
        "rule_id": rule["id"],
    }
