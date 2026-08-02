#!/usr/bin/env python3
"""Scan ../assets and write catalog.json for Tile Craft Navigator."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT.parent / "assets"
OUT = ROOT / "catalog.json"

# Preferred category order; unknown folders append alphabetically
PREFERRED = ["abstract", "ART", "masterpiece", "oriental", "POP", "Typography"]


def set_base_name(folder_name: str) -> str:
    return folder_name[:-5] if folder_name.endswith("_1SET") else folder_name


def read_product_name(set_dir: Path, fallback: str) -> str:
    pj = set_dir / "product.json"
    if not pj.exists():
        return fallback
    try:
        data = json.loads(pj.read_text(encoding="utf-8"))
        return data.get("productName") or fallback
    except Exception:
        return fallback


def scan_catalog() -> list[dict]:
    if not ASSETS.is_dir():
        return []

    found: dict[str, dict] = {}
    for cat_dir in ASSETS.iterdir():
        if not cat_dir.is_dir():
            continue
        sets = []
        for set_dir in sorted(cat_dir.iterdir(), key=lambda p: p.name.lower()):
            if not set_dir.is_dir():
                continue
            base = set_base_name(set_dir.name)
            preview = set_dir / f"{base}_preview.png"
            grid = set_dir / f"{base}_grid.png"
            if not preview.exists() and not grid.exists():
                continue
            name = read_product_name(set_dir, base)
            sets.append(
                {
                    "id": set_dir.name,
                    "name": name,
                    "base": base,
                    "hasPreview": preview.exists(),
                    "hasGrid": grid.exists(),
                }
            )
        if sets:
            found[cat_dir.name] = {
                "id": cat_dir.name,
                "label": cat_dir.name,
                "sets": sets,
            }

    ordered: list[dict] = []
    seen = set()
    for key in PREFERRED:
        if key in found:
            ordered.append(found[key])
            seen.add(key)
    for key in sorted(found.keys(), key=lambda s: s.lower()):
        if key not in seen:
            ordered.append(found[key])
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
    return 0


if __name__ == "__main__":
    sys.exit(main())
