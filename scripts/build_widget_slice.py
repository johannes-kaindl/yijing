#!/usr/bin/env python3
"""Emit data/widget-hexagrams.json — a slim slice for the native Widget extension.

Reads the FINAL data/hexagrams.json (DE) + data/hexagrams.en.json (EN) — after the
full build pipeline, so the *_neutral / *_en variants exist — and keeps, per
hexagram, only what a widget / complication needs: number, binary, both names, and
the FIRST SENTENCE of each language/register judgment ("Kernsatz"). The full Wilhelm
texts stay out of the widget's tight memory budget.

Single source: the two hexagram JSONs. Run as the LAST pipeline step:
  build_data.py → apply_neutral.py → sync_image_seeds_to_en.py → build_widget_slice.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DE = ROOT / "data" / "hexagrams.json"
EN = ROOT / "data" / "hexagrams.en.json"
OUT = ROOT / "data" / "widget-hexagrams.json"


def lead(s: str | None) -> str:
    """The "Kernsatz": the FIRST paragraph of the judgment = the oracular Judgment
    line itself (Wilhelm's commentary follows after a blank line). Internal verse
    newlines are collapsed; an unusually long single paragraph falls back to its
    first sentence."""
    if not s:
        return ""
    para = s.strip().split("\n\n", 1)[0]
    para = " ".join(para.split())
    if len(para) > 140:
        i = para.find(". ")
        if i >= 0:
            return para[: i + 1]
    return para


def main() -> None:
    de = {x["number"]: x for x in json.loads(DE.read_text(encoding="utf-8"))}
    en = {x["number"]: x for x in json.loads(EN.read_text(encoding="utf-8"))}
    slim = []
    for n in sorted(de):
        d = de[n]
        e = en.get(n, {})
        slim.append(
            {
                "number": n,
                "binary": d["binary"],
                "name_de": d.get("name_de"),
                "name_en": e.get("name_en"),
                "lead_de_neutral": lead(d.get("judgment_neutral") or d.get("judgment")),
                "lead_de_historical": lead(d.get("judgment")),
                "lead_en_neutral": lead(e.get("judgment_en_neutral") or e.get("judgment_en")),
                "lead_en_historical": lead(e.get("judgment_en")),
            }
        )
    OUT.write_text(json.dumps(slim, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    print(f"OK: {len(slim)} Hexagramme → {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
