"""Common active-ingredient dosing reference (adults + pediatrics) for the AI assistant."""
from __future__ import annotations

from typing import Optional

# mg/kg per dose unless noted. Always verify against current formulary / EDA label.
DRUGS = [
    {
        "id": "paracetamol",
        "name_en": "Paracetamol (Acetaminophen)",
        "name_ar": "باراسيتامول",
        "active_en": "Paracetamol",
        "active_ar": "باراسيتامول",
        "forms": [
            {
                "form_en": "Tablets 500 mg",
                "form_ar": "أقراص 500 مج",
                "adult_dose_en": "500–1000 mg every 4–6 h (max 4 g/day)",
                "adult_dose_ar": "500–1000 مج كل 4–6 ساعات (حد أقصى 4 جم/يوم)",
                "pediatric_mg_kg": 15,
                "pediatric_max_mg": 1000,
                "frequency_hours": 6,
                "max_daily_mg_kg": 60,
            },
            {
                "form_en": "Suspension 120 mg/5 ml",
                "form_ar": "معلق 120 مج/5 مل",
                "adult_dose_en": "10–20 ml every 4–6 h (max 4 g/day)",
                "adult_dose_ar": "10–20 مل كل 4–6 ساعات (حد أقصى 4 جم/يوم)",
                "pediatric_mg_kg": 15,
                "pediatric_max_mg": 1000,
                "frequency_hours": 6,
                "max_daily_mg_kg": 60,
                "concentration_mg_per_ml": 24,
            },
        ],
    },
    {
        "id": "ibuprofen",
        "name_en": "Ibuprofen",
        "name_ar": "إيبوبروفين",
        "active_en": "Ibuprofen",
        "active_ar": "إيبوبروفين",
        "forms": [
            {
                "form_en": "Tablets 400 mg",
                "form_ar": "أقراص 400 مج",
                "adult_dose_en": "400 mg every 6–8 h after food (max 1.2 g/day OTC)",
                "adult_dose_ar": "400 مج كل 6–8 ساعات بعد الأكل (حد أقصى 1.2 جم/يوم)",
                "pediatric_mg_kg": 10,
                "pediatric_max_mg": 400,
                "frequency_hours": 8,
                "max_daily_mg_kg": 30,
            },
        ],
    },
    {
        "id": "amoxicillin",
        "name_en": "Amoxicillin",
        "name_ar": "أموكسيسيلين",
        "active_en": "Amoxicillin",
        "active_ar": "أموكسيسيلين",
        "forms": [
            {
                "form_en": "Capsules 500 mg / Suspension 250 mg/5 ml",
                "form_ar": "كبسولات 500 مج / معلق 250 مج/5 مل",
                "adult_dose_en": "500 mg every 8 h or 875 mg every 12 h (adjust per indication)",
                "adult_dose_ar": "500 مج كل 8 ساعات أو 875 مج كل 12 ساعة (حسب الحالة)",
                "pediatric_mg_kg": 25,
                "pediatric_max_mg": 500,
                "frequency_hours": 8,
                "max_daily_mg_kg": 75,
                "concentration_mg_per_ml": 50,
            },
        ],
    },
    {
        "id": "azithromycin",
        "name_en": "Azithromycin",
        "name_ar": "أزithromycin",
        "active_en": "Azithromycin",
        "active_ar": "أزithromycin",
        "forms": [
            {
                "form_en": "Tablets 500 mg / Suspension 200 mg/5 ml",
                "form_ar": "أقراص 500 مج / معلق 200 مج/5 مل",
                "adult_dose_en": "500 mg once daily × 3 days (typical outpatient)",
                "adult_dose_ar": "500 مج مرة يومياً × 3 أيام (حسب الحالة)",
                "pediatric_mg_kg": 10,
                "pediatric_max_mg": 500,
                "frequency_hours": 24,
                "max_daily_mg_kg": 10,
                "concentration_mg_per_ml": 40,
            },
        ],
    },
    {
        "id": "cetirizine",
        "name_en": "Cetirizine",
        "name_ar": "سيتirizine",
        "active_en": "Cetirizine",
        "active_ar": "سيتirizine",
        "forms": [
            {
                "form_en": "Tablets 10 mg / Syrup 5 mg/5 ml",
                "form_ar": "أقراص 10 مج / شراب 5 مج/5 مل",
                "adult_dose_en": "10 mg once daily",
                "adult_dose_ar": "10 مج مرة يومياً",
                "pediatric_mg_kg": 0,
                "pediatric_fixed_mg": 5,
                "pediatric_max_mg": 10,
                "frequency_hours": 24,
                "max_daily_mg_kg": 0,
                "concentration_mg_per_ml": 1,
                "pediatric_age_note_en": "6–12 y: 5 mg; ≥12 y or ≥30 kg: 10 mg",
                "pediatric_age_note_ar": "6–12 سنة: 5 مج؛ ≥12 سنة أو ≥30 كجم: 10 مج",
            },
        ],
    },
    {
        "id": "omeprazole",
        "name_en": "Omeprazole",
        "name_ar": "أومeprazole",
        "active_en": "Omeprazole",
        "active_ar": "أومeprazole",
        "forms": [
            {
                "form_en": "Capsules 20 mg",
                "form_ar": "كبسولات 20 مج",
                "adult_dose_en": "20 mg once daily before breakfast",
                "adult_dose_ar": "20 مج مرة يومياً قبل الإفطار",
                "pediatric_mg_kg": 1,
                "pediatric_max_mg": 20,
                "frequency_hours": 24,
                "max_daily_mg_kg": 2,
            },
        ],
    },
    {
        "id": "metronidazole",
        "name_en": "Metronidazole",
        "name_ar": "مetronidazole",
        "active_en": "Metronidazole",
        "active_ar": "مetronidazole",
        "forms": [
            {
                "form_en": "Tablets 500 mg / Suspension 200 mg/5 ml",
                "form_ar": "أقراص 500 مج / معلق 200 مج/5 مل",
                "adult_dose_en": "500 mg every 8 h (adjust per indication)",
                "adult_dose_ar": "500 مج كل 8 ساعات (حسب الحالة)",
                "pediatric_mg_kg": 15,
                "pediatric_max_mg": 500,
                "frequency_hours": 8,
                "max_daily_mg_kg": 45,
                "concentration_mg_per_ml": 40,
            },
        ],
    },
    {
        "id": "salbutamol",
        "name_en": "Salbutamol (Albuterol)",
        "name_ar": "سalbutamol",
        "active_en": "Salbutamol",
        "active_ar": "سalbutamol",
        "forms": [
            {
                "form_en": "Syrup 2 mg/5 ml / Inhaler",
                "form_ar": "شراب 2 مج/5 مل / بخاخ",
                "adult_dose_en": "Syrup: 5–10 ml every 6–8 h; Inhaler: 1–2 puffs PRN",
                "adult_dose_ar": "شراب: 5–10 مل كل 6–8 ساعات؛ بخاخ: 1–2 بخة عند الحاجة",
                "pediatric_mg_kg": 0.1,
                "pediatric_max_mg": 5,
                "frequency_hours": 8,
                "max_daily_mg_kg": 0.3,
                "concentration_mg_per_ml": 0.4,
            },
        ],
    },
    {
        "id": "amoxicillin_clav",
        "name_en": "Amoxicillin + Clavulanic acid",
        "name_ar": "أموكسيسillin + clavulanic",
        "active_en": "Amoxicillin/Clavulanate",
        "active_ar": "أموكسيسillin/clavulanate",
        "forms": [
            {
                "form_en": "Suspension 156 mg/5 ml (125+31.25)",
                "form_ar": "معلق 156 مج/5 مل",
                "adult_dose_en": "625 mg every 8 h or 875 mg every 12 h",
                "adult_dose_ar": "625 مج كل 8 ساعات أو 875 مج كل 12 ساعة",
                "pediatric_mg_kg": 25,
                "pediatric_max_mg": 500,
                "frequency_hours": 8,
                "max_daily_mg_kg": 75,
                "concentration_mg_per_ml": 31.2,
            },
        ],
    },
    {
        "id": "domperidone",
        "name_en": "Domperidone",
        "name_ar": "domperidone",
        "active_en": "Domperidone",
        "active_ar": "domperidone",
        "forms": [
            {
                "form_en": "Tablets 10 mg / Suspension 1 mg/ml",
                "form_ar": "أقراص 10 مج / معلق 1 مج/مل",
                "adult_dose_en": "10 mg up to 3 times daily before meals",
                "adult_dose_ar": "10 مج حتى 3 مرات يومياً قبل الأكل",
                "pediatric_mg_kg": 0.25,
                "pediatric_max_mg": 10,
                "frequency_hours": 8,
                "max_daily_mg_kg": 0.75,
                "concentration_mg_per_ml": 1,
            },
        ],
    },
]

DRUG_BY_ID = {d["id"]: d for d in DRUGS}


def search_drugs(q: str, limit: int = 20) -> list[dict]:
    q = (q or "").strip().lower()
    out = []
    for d in DRUGS:
        hay = " ".join([
            d["name_en"], d["name_ar"], d["active_en"], d["active_ar"], d["id"],
        ]).lower()
        if not q or q in hay or any(w in hay for w in q.split() if len(w) >= 2):
            out.append({
                "id": d["id"],
                "name_en": d["name_en"],
                "name_ar": d["name_ar"],
                "active_en": d["active_en"],
                "active_ar": d["active_ar"],
            })
        if len(out) >= limit:
            break
    return out


def calculate_dose(
    drug_id: str,
    *,
    weight_kg: Optional[float] = None,
    age_years: Optional[float] = None,
    is_adult: bool = False,
    form_index: int = 0,
    lang: str = "en",
) -> dict:
    drug = DRUG_BY_ID.get(drug_id)
    if not drug:
        raise ValueError("Drug not found")
    forms = drug["forms"]
    if form_index < 0 or form_index >= len(forms):
        form_index = 0
    form = forms[form_index]
    ar = lang == "ar"

    if is_adult or (age_years is not None and age_years >= 12) or (weight_kg is not None and weight_kg >= 40):
        return {
            "drug_id": drug_id,
            "patient_type": "adult" if ar else "adult",
            "patient_type_label": "بالغ" if ar else "Adult",
            "form": form["form_ar"] if ar else form["form_en"],
            "dose_text": form["adult_dose_ar"] if ar else form["adult_dose_en"],
            "frequency_hours": form.get("frequency_hours"),
            "disclaimer": (
                "مرجع إرشادي فقط — راجع النشرة الرسمية وقرار الطبيب."
                if ar else
                "Guidance only — verify with official label and prescriber."
            ),
        }

    if weight_kg is None or weight_kg <= 0:
        raise ValueError("Weight (kg) required for pediatric dosing")

    fixed = form.get("pediatric_fixed_mg")
    if fixed and (age_years is not None or weight_kg < 40):
        mg = min(float(fixed), float(form.get("pediatric_max_mg") or fixed))
        note = form.get("pediatric_age_note_ar" if ar else "pediatric_age_note_en") or ""
    else:
        mg_kg = float(form.get("pediatric_mg_kg") or 0)
        if mg_kg <= 0:
            raise ValueError("No pediatric mg/kg rule for this form")
        mg = weight_kg * mg_kg
        cap = float(form.get("pediatric_max_mg") or mg)
        mg = min(mg, cap)
        max_daily = float(form.get("max_daily_mg_kg") or 0) * weight_kg
        note = ""
        if max_daily > 0:
            doses_per_day = max(1, round(24 / float(form.get("frequency_hours") or 8)))
            if mg * doses_per_day > max_daily:
                mg = max_daily / doses_per_day
            note = (
                f"الحد اليومي ≈ {max_daily:.0f} مج"
                if ar else
                f"Daily max ≈ {max_daily:.0f} mg"
            )

    mg = round(mg, 1)
    freq = int(form.get("frequency_hours") or 8)
    vol_ml = None
    conc = form.get("concentration_mg_per_ml")
    if conc and float(conc) > 0:
        vol_ml = round(mg / float(conc), 1)

    dose_parts = [f"{mg:.0f} mg" if not ar else f"{mg:.0f} مج"]
    if vol_ml is not None:
        dose_parts.append(f"{vol_ml} ml" if not ar else f"{vol_ml} مل")

    return {
        "drug_id": drug_id,
        "patient_type": "pediatric",
        "patient_type_label": "طفل" if ar else "Pediatric",
        "weight_kg": weight_kg,
        "age_years": age_years,
        "form": form["form_ar"] if ar else form["form_en"],
        "dose_mg": mg,
        "dose_volume_ml": vol_ml,
        "frequency_hours": freq,
        "dose_text": (
            f"{' + '.join(dose_parts)} كل {freq} ساعات"
            if ar else
            f"{' + '.join(dose_parts)} every {freq} hours"
        ),
        "note": note or (form.get("pediatric_age_note_ar" if ar else "pediatric_age_note_en") or ""),
        "disclaimer": (
            "مرجع إرشادي — تحقق من النشرة ووزن/عمر الطفل."
            if ar else
            "Guidance only — verify label, weight, and prescriber instructions."
        ),
    }
