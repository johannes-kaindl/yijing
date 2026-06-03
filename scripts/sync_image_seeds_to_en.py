#!/usr/bin/env python3
"""Spiegelt die kuratierten Bild-Seeds (image_association) von der DE-Basis nach
data/hexagrams.en.json. Der Seed ist sprach-unabhängig (ein interner englischer
Prompt-Seed fürs On-Device-Meditationsbild), darum derselbe Wert in beiden Dateien.

Quelle der Wahrheit: IMAGE_SEEDS in scripts/build_data.py → data/hexagrams.json.
Nach jedem `python3 scripts/build_data.py` ausführen, damit der EN-Modus dieselben
Seeds nutzt. Idempotent. Entfernt zudem das veraltete image_association_en
(seit die App hex.image_association direkt liest, ungenutzt).

  python3 scripts/sync_image_seeds_to_en.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DE = ROOT / "data" / "hexagrams.json"
EN = ROOT / "data" / "hexagrams.en.json"


def main() -> None:
    de = {h["number"]: h.get("image_association", "") for h in json.loads(DE.read_text(encoding="utf-8"))}
    en = json.loads(EN.read_text(encoding="utf-8"))

    changed = 0
    for h in en:
        seed = de.get(h["number"], "")
        if h.get("image_association", "") != seed:
            h["image_association"] = seed
            changed += 1
        h.pop("image_association_en", None)  # veraltet, nicht mehr gelesen

    tmp = EN.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(en, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(EN)

    filled = sum(1 for h in en if (h.get("image_association") or "").strip())
    print(f"OK: image_association → data/hexagrams.en.json ({changed} geändert, {filled}/64 befüllt)")


if __name__ == "__main__":
    main()
