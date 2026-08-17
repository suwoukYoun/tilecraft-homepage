#!/usr/bin/env python3
"""Scan ../assets and write catalog.json for Tile Craft Navigator.

Order rules:
- Nav / catalog consumers use categories[] array order as written.
- Never sort by folder name. Preserve order from the existing catalog.json;
  newly discovered categories/sets are appended in scan encounter order.
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT.parent / "assets"
OUT = ROOT / "catalog.json"
ORDER_FILE = ASSETS / "category-order.json"
SKIP_CAT_DIRS = {"tiles"}


def normalize_id(name: str) -> str:
    """Collapse whitespace / unicode so near-duplicate folder names map together."""
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", str(name or ""))).strip()


def set_base_name(folder_name: str) -> str:
    return folder_name[:-5] if folder_name.endswith("_1SET") else folder_name


def read_product_meta(set_dir: Path) -> dict:
    pj = set_dir / "product.json"
    if not pj.exists():
        return {"hasProduct": False, "productName": "", "palette": []}
    try:
        data = json.loads(pj.read_text(encoding="utf-8"))
        pal = data.get("palette") or []
        return {
            "hasProduct": True,
            "productName": str(data.get("productName") or ""),
            "palette": pal if isinstance(pal, list) else [],
        }
    except Exception:
        return {"hasProduct": True, "productName": "", "palette": []}


def load_category_order_file() -> list[str]:
    if not ORDER_FILE.is_file():
        return []
    try:
        data = json.loads(ORDER_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []
    cats = data.get("categories") if isinstance(data, dict) else data
    if not isinstance(cats, list):
        return []
    return [str(c) for c in cats if c]


def load_existing_order(path: Path = OUT) -> tuple[list[str], dict[str, list[str]], dict[str, str]]:
    """Return (cat_ids, {cat_id: [set_ids]}, {cat_id: label}) from catalog.json."""
    if not path.is_file():
        return [], {}, {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return [], {}, {}
    cats = data.get("categories") if isinstance(data, dict) else data
    if not isinstance(cats, list):
        return [], {}, {}

    cat_ids: list[str] = []
    set_order: dict[str, list[str]] = {}
    labels: dict[str, str] = {}
    for cat in cats:
        if not isinstance(cat, dict) or not cat.get("id"):
            continue
        cid = str(cat["id"])
        cat_ids.append(cid)
        if cat.get("label"):
            labels[cid] = str(cat["label"])
        sets = cat.get("sets") or []
        set_order[cid] = [
            str(s["id"]) for s in sets if isinstance(s, dict) and s.get("id")
        ]
    return cat_ids, set_order, labels


def scan_set_dir(set_dir: Path) -> dict | None:
    if not set_dir.is_dir():
        return None
    base = set_base_name(set_dir.name)
    preview = set_dir / f"{base}_preview.png"
    if not preview.exists():
        preview = set_dir / "preview.png"
    grid = set_dir / f"{base}_grid.png"
    if not preview.exists() and not grid.exists():
        return None
    meta = read_product_meta(set_dir)
    name = meta["productName"] or base
    return {
        "id": set_dir.name,
        "name": name,
        "base": base,
        "hasPreview": preview.exists(),
        "hasGrid": grid.exists(),
        "hasProduct": meta["hasProduct"],
        "palette": meta["palette"],
    }


def order_items(preferred: list[str], available: dict[str, object]) -> list[str]:
    """Keep preferred order for known ids; append remaining in encounter order.

    Ids match exactly first, then after whitespace/unicode normalize, so
    `MASTERPIECE(명화  동양화)` and `MASTERPIECE(명화 동양화)` are the same slot.
    """
    ordered: list[str] = []
    seen: set[str] = set()
    available_by_norm: dict[str, str] = {}
    for key in available:
        norm = normalize_id(key)
        if norm and norm not in available_by_norm:
            available_by_norm[norm] = key

    for key in preferred:
        real = key if key in available else available_by_norm.get(normalize_id(key))
        if real is not None and real not in seen:
            ordered.append(real)
            seen.add(real)
    for key in available:
        if key not in seen:
            ordered.append(key)
            seen.add(key)
    return ordered


def prefer_canonical_dir(
    old_name: str,
    new_name: str,
    old_nsets: int,
    new_nsets: int,
    prev_ids: list[str],
) -> bool:
    """True if new_name should replace old_name as the catalog category id."""
    if new_nsets != old_nsets:
        return new_nsets > old_nsets
    prev_exact = set(prev_ids)
    if new_name in prev_exact and old_name not in prev_exact:
        return True
    if old_name in prev_exact and new_name not in prev_exact:
        return False
    return len(new_name) < len(old_name)


def scan_catalog() -> list[dict]:
    if not ASSETS.is_dir():
        return []

    prev_cat_ids, prev_set_order, prev_labels = load_existing_order()
    preferred_cats = []
    for cid in load_category_order_file() + prev_cat_ids:
        if cid not in preferred_cats:
            preferred_cats.append(cid)

    # normalized cat id -> (actual folder name, {set_id: entry})
    found: dict[str, tuple[str, dict[str, dict]]] = {}
    # dict preserves insertion/encounter order (no name sort)
    for cat_dir in ASSETS.iterdir():
        if not cat_dir.is_dir():
            continue
        cat_norm = normalize_id(cat_dir.name)
        if not cat_norm or cat_dir.name in SKIP_CAT_DIRS or cat_norm in SKIP_CAT_DIRS:
            continue
        sets_by_id: dict[str, dict] = {}
        sets_by_norm: dict[str, str] = {}
        for set_dir in cat_dir.iterdir():
            entry = scan_set_dir(set_dir)
            if not entry:
                continue
            set_norm = normalize_id(entry["id"])
            existing_id = sets_by_norm.get(set_norm)
            if existing_id is None:
                sets_by_id[entry["id"]] = entry
                sets_by_norm[set_norm] = entry["id"]
            elif len(entry["id"]) < len(existing_id):
                del sets_by_id[existing_id]
                sets_by_id[entry["id"]] = entry
                sets_by_norm[set_norm] = entry["id"]
        if not sets_by_id:
            continue
        if cat_norm not in found:
            found[cat_norm] = (cat_dir.name, sets_by_id)
            continue
        old_name, old_sets = found[cat_norm]
        if prefer_canonical_dir(
            old_name, cat_dir.name, len(old_sets), len(sets_by_id), prev_cat_ids
        ):
            found[cat_norm] = (cat_dir.name, sets_by_id)

    found_by_id = {actual: sets for actual, sets in found.values()}
    prev_set_by_norm = {normalize_id(cid): sids for cid, sids in prev_set_order.items()}
    prev_label_by_norm = {normalize_id(cid): label for cid, label in prev_labels.items()}

    ordered: list[dict] = []
    for cat_id in order_items(preferred_cats, found_by_id):
        sets_by_id = found_by_id[cat_id]
        preferred_sets = prev_set_order.get(cat_id) or prev_set_by_norm.get(
            normalize_id(cat_id), []
        )
        set_ids = order_items(preferred_sets, sets_by_id)
        ordered.append(
            {
                "id": cat_id,
                "label": prev_labels.get(cat_id)
                or prev_label_by_norm.get(normalize_id(cat_id))
                or cat_id,
                "sets": [sets_by_id[sid] for sid in set_ids],
            }
        )
    return ordered


def write_catalog(categories: list[dict] | None = None) -> Path:
    cats = categories if categories is not None else scan_catalog()
    payload = {
        "generatedAt": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
        "assetRoot": "../assets",
        "categories": cats,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return OUT


def main() -> int:
    path = write_catalog()
    cats = json.loads(path.read_text(encoding="utf-8"))["categories"]
    total = sum(len(c["sets"]) for c in cats)
    print(f"Wrote {path} ({len(cats)} categories, {total} sets)")
    print("Order:", " → ".join(c["id"] for c in cats))
    return 0


if __name__ == "__main__":
    sys.exit(main())
