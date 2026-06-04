"""Ismailia governorate regions — shared with frontend regions.ts."""
from __future__ import annotations

REGIONS = [
    {"key": "ismailia_city", "en": "Ismailia City", "ar": "مدينة الإسماعيلية", "group": "markaz"},
    {"key": "fayed", "en": "Fayed", "ar": "فايد", "group": "markaz"},
    {"key": "qantara_sharq", "en": "Qantara Sharq", "ar": "القنطرة شرق", "group": "markaz"},
    {"key": "qantara_gharb", "en": "Qantara Gharb", "ar": "القنطرة غرب", "group": "markaz"},
    {"key": "tell_el_kebir", "en": "Tell El Kebir", "ar": "التل الكبير", "group": "markaz"},
    {"key": "abu_sweir", "en": "Abu Sweir", "ar": "أبو صوير", "group": "markaz"},
    {"key": "kasaseen", "en": "Kasaseen El Gedida", "ar": "القصاصين الجديدة", "group": "markaz"},
    {"key": "sheikh_zayed", "en": "Sheikh Zayed District", "ar": "حي الشيخ زايد", "group": "area"},
    {"key": "numra_sitta", "en": "Numra Sitta (No. 6)", "ar": "نمرة ستة", "group": "area"},
    {"key": "el_hekr", "en": "El Hekr", "ar": "الحكر", "group": "area"},
    {"key": "el_mahatta", "en": "El Mahatta", "ar": "المحطة", "group": "area"},
    {"key": "el_salam", "en": "El Salam District", "ar": "حي السلام", "group": "area"},
    {"key": "el_manakh", "en": "El Manakh", "ar": "المناخ", "group": "area"},
    {"key": "el_forsan", "en": "El Forsan", "ar": "الفرسان", "group": "area"},
    {"key": "el_arashiya", "en": "El Arashiya", "ar": "العرايشية", "group": "area"},
    {"key": "first_district", "en": "1st District", "ar": "الحي الأول", "group": "area"},
    {"key": "second_district", "en": "2nd District", "ar": "الحي الثاني", "group": "area"},
    {"key": "third_district", "en": "3rd District", "ar": "الحي الثالث", "group": "area"},
    {"key": "abtal", "en": "Abtal El Tahrir", "ar": "أبطال التحرير", "group": "area"},
]

REGION_BY_KEY = {r["key"]: r for r in REGIONS}

# Longer names first so "Qantara Sharq" matches before "Qantara"
_MATCH_TERMS: list[tuple[str, str]] = []
for r in REGIONS:
    _MATCH_TERMS.append((r["key"], r["en"].lower()))
    _MATCH_TERMS.append((r["key"], r["ar"]))
_MATCH_TERMS.sort(key=lambda x: -len(x[1]))


def resolve_region_key(*texts: str | None, customer_region: str | None = None) -> str:
    """Map free-text address or customer.region to a region key."""
    if customer_region and customer_region in REGION_BY_KEY:
        return customer_region
    if customer_region:
        cr = customer_region.strip().lower()
        for key, term in _MATCH_TERMS:
            if cr == term.lower() or cr == key:
                return key
    combined = " ".join(t for t in texts if t).strip()
    if not combined:
        return "unknown"
    blob = combined.lower()
    for key, term in _MATCH_TERMS:
        if term in combined or term.lower() in blob:
            return key
    return "unknown"


def region_display(key: str, lang: str = "en") -> str:
    if key == "unknown":
        return "Unknown / Other" if lang == "en" else "غير محدد / أخرى"
    r = REGION_BY_KEY.get(key)
    if not r:
        return key
    return r["ar"] if lang == "ar" else r["en"]
