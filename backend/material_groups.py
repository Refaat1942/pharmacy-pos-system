"""Material group codes (MetLife / RMS-style) for local vs imported coverage."""
from __future__ import annotations

import re
from typing import Optional

MATERIAL_GROUP_CODES = (
    "DL",
    "DI",
    "DII",
    "CL",
    "CI",
    "DNDISC",
    "ML",
    "MI",
    "DLAB",
    "SERV",
)

# kind: drug | cosmetic | medical_supply | lab | service | non_discountable
MATERIAL_GROUP_META: dict[str, dict] = {
    "DL": {
        "label_en": "Drug Local",
        "label_ar": "دواء محلي",
        "origin": "local",
        "kind": "drug",
        "discountable": True,
    },
    "DI": {
        "label_en": "Drug Imported",
        "label_ar": "دواء مستورد",
        "origin": "imported",
        "kind": "drug",
        "discountable": True,
    },
    "DII": {
        "label_en": "Drug Illegal Imported",
        "label_ar": "دواء مستورد غير قانوني",
        "origin": "imported",
        "kind": "drug",
        "discountable": True,
    },
    "CL": {
        "label_en": "Cosmetics Local",
        "label_ar": "مستحضرات محلية",
        "origin": "local",
        "kind": "cosmetic",
        "discountable": True,
    },
    "CI": {
        "label_en": "Cosmetics Imported",
        "label_ar": "مستحضرات مستوردة",
        "origin": "imported",
        "kind": "cosmetic",
        "discountable": True,
    },
    "DNDISC": {
        "label_en": "Drug Non Discountable",
        "label_ar": "دواء غير قابل للخصم",
        "origin": "local",
        "kind": "non_discountable",
        "discountable": False,
    },
    "ML": {
        "label_en": "Medical Accessories Local",
        "label_ar": "مستلزمات طبية محلية",
        "origin": "local",
        "kind": "medical_supply",
        "discountable": True,
    },
    "MI": {
        "label_en": "Medical Accessories Imported",
        "label_ar": "مستلزمات طبية مستوردة",
        "origin": "imported",
        "kind": "medical_supply",
        "discountable": True,
    },
    "DLAB": {
        "label_en": "Lab",
        "label_ar": "تحاليل",
        "origin": "local",
        "kind": "lab",
        "discountable": True,
        "is_service": True,
    },
    "SERV": {
        "label_en": "Services",
        "label_ar": "خدمات",
        "origin": "local",
        "kind": "service",
        "discountable": True,
        "is_service": True,
    },
}

DEFAULT_MATERIAL_GROUP = "DL"


def _compact(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").strip().lower())


def _build_alias_map() -> dict[str, str]:
    aliases: dict[str, str] = {}
    extra: dict[str, list[str]] = {
        "DL": [
            "druglocal", "localdrug", "localdrugs", "localmedicine", "medicinelocal",
            "medicineslocal", "drugslocal", "l", "locdrug", "drug loc", "drug-l",
            "material group dl", "mg dl",
        ],
        "DI": [
            "drugimported", "importeddrug", "importeddrugs", "importedmedicine",
            "medicineimported", "idrug", "drug imp", "drug-import", "drug imported",
        ],
        "DII": [
            "drugillegalimported", "illegalimported", "illegalimporteddrug",
            "illegal drug", "drug illegal", "drugillegal", "diillegal",
        ],
        "CL": [
            "cosmeticslocal", "localcosmetics", "localcosmetic", "cosmeticlocal",
            "cosmetics local", "cosmetic local",
        ],
        "CI": [
            "cosmeticsimported", "importedcosmetics", "importedcosmetic",
            "cosmeticimported", "cosmetics imported", "cosmetic imported",
        ],
        "DNDISC": [
            "drugnondiscountable", "nondiscountable", "non discountable",
            "nodiscount", "no discount", "drug no discount", "drug nondisc",
            "nondisc", "dndisc", "dn disc",
        ],
        "ML": [
            "medicalaccessorieslocal", "medicalaccessorylocal", "localmedicalaccessories",
            "localmedicalsupplies", "medicalsupplieslocal", "medical supplies local",
            "accessories local", "medical accessories local",
        ],
        "MI": [
            "medicalaccessoriesimported", "medicalaccessoryimported",
            "importedmedicalaccessories", "importedmedicalsupplies",
            "medical supplies imported", "accessories imported",
        ],
        "DLAB": [
            "lab", "laboratory", "laboratorytest", "labtest", "lab tests",
            "analysis", "analyses", "تحاليل",
        ],
        "SERV": [
            "service", "services", "srv", "serv", "خدمات", "خدمة",
        ],
    }
    for code, meta in MATERIAL_GROUP_META.items():
        aliases[_compact(code)] = code
        aliases[code.lower()] = code
        aliases[_compact(meta["label_en"])] = code
        aliases[_compact(meta["label_ar"])] = code
        for part in meta["label_en"].split():
            if len(part) > 2:
                aliases[_compact(part)] = code
        for a in extra.get(code, []):
            aliases[_compact(a)] = code
    # Common header variants from ERP exports
    aliases[_compact("material group")] = ""
    return aliases


_ALIAS_MAP = _build_alias_map()


def normalize_material_group(raw: Optional[str]) -> Optional[str]:
    """Return canonical material group code or None."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    upper = s.upper().replace(" ", "").replace("-", "").replace("_", "")
    if upper in MATERIAL_GROUP_META:
        return upper
    compact = _compact(s)
    if compact in _ALIAS_MAP and _ALIAS_MAP[compact]:
        return _ALIAS_MAP[compact]
    # Partial text match on English labels
    for code, meta in MATERIAL_GROUP_META.items():
        if compact == _compact(meta["label_en"]) or compact == _compact(meta["label_ar"]):
            return code
    return None


def infer_material_group(
    *,
    material_group: Optional[str] = None,
    origin_type: Optional[str] = None,
    is_service: Optional[bool] = None,
    category: Optional[str] = None,
) -> str:
    """Best material group when not explicitly set."""
    mg = normalize_material_group(material_group)
    if mg:
        return mg
    if is_service:
        cat = (category or "").lower()
        if "lab" in cat or "analysis" in cat:
            return "DLAB"
        return "SERV"
    origin = (origin_type or "local").strip().lower()
    cat = (category or "").lower()
    if "cosmetic" in cat:
        return "CI" if origin == "imported" else "CL"
    if "medical suppl" in cat or "accessory" in cat or "accessories" in cat:
        return "MI" if origin == "imported" else "ML"
    return "DI" if origin == "imported" else "DL"


def product_fields_from_material_group(code: str) -> dict:
    """Derive origin_type / is_service from material group."""
    mg = normalize_material_group(code) or DEFAULT_MATERIAL_GROUP
    meta = MATERIAL_GROUP_META[mg]
    return {
        "material_group": mg,
        "origin_type": meta["origin"],
        "is_service": bool(meta.get("is_service")),
    }


def resolve_product_origin(product: dict) -> str:
    mg = normalize_material_group(product.get("material_group"))
    if mg and mg in MATERIAL_GROUP_META:
        return MATERIAL_GROUP_META[mg]["origin"]
    return (product.get("origin_type") or "local").strip().lower()


def resolve_product_kind(product: dict) -> str:
    mg = normalize_material_group(product.get("material_group"))
    if mg and mg in MATERIAL_GROUP_META:
        return MATERIAL_GROUP_META[mg]["kind"]
    if product.get("is_service"):
        return "service"
    cat = (product.get("category") or "").lower()
    if "cosmetic" in cat:
        return "cosmetic"
    if "medical suppl" in cat:
        return "medical_supply"
    return "drug"


def is_discountable_product(product: dict) -> bool:
    mg = normalize_material_group(product.get("material_group"))
    if mg == "DNDISC":
        return False
    if mg and mg in MATERIAL_GROUP_META:
        return bool(MATERIAL_GROUP_META[mg]["discountable"])
    return True


def material_group_list() -> list[dict]:
    return [
        {"code": c, **MATERIAL_GROUP_META[c]}
        for c in MATERIAL_GROUP_CODES
    ]
