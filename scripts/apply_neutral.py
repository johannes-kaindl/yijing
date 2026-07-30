#!/usr/bin/env python3
"""Sub-project A2: merge the committed neutral overrides into the data files,
adding *_neutral (DE) / *_en_neutral (EN) fields. Idempotent. Run after
build_data.py (a DE rebuild drops the neutral fields until this re-applies them).

  python3 scripts/apply_neutral.py

Source of truth: scripts/sources/neutral_overrides.json
  { "<hex>": { "<field>": {"de": "...", "en": "..."}, ... }, ... }
  field ∈ meaning | judgment | image | line<i>.<sub> | note<k>.text
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HEX = ROOT / "data" / "hexagrams.json"
EN = ROOT / "data" / "hexagrams.en.json"
OVERRIDES = ROOT / "scripts" / "sources" / "neutral_overrides.json"

HEX_FIELDS = {"meaning", "judgment", "image"}


def main() -> None:
    if not OVERRIDES.exists():
        raise SystemExit(f"fehlt: {OVERRIDES} (erst neutralize.py + Politur ausführen)")
    de = json.loads(HEX.read_text(encoding="utf-8"))
    en = json.loads(EN.read_text(encoding="utf-8"))
    de_by = {x["number"]: x for x in de}
    en_by = {x["number"]: x for x in en}
    ov = json.loads(OVERRIDES.read_text(encoding="utf-8"))

    n_de = n_en = 0
    for hex_s, fields in ov.items():
        num = int(hex_s)
        d, e = de_by[num], en_by.get(num, {})
        for field, vals in fields.items():
            de_txt, en_txt = vals.get("de", ""), vals.get("en", "")
            if field in HEX_FIELDS:
                if de_txt:
                    d[field + "_neutral"] = de_txt; n_de += 1
                if en_txt:
                    e[field + "_en_neutral"] = en_txt; n_en += 1
            elif field.startswith("line"):
                i = int(field[4:field.index(".")])
                sub = field.split(".", 1)[1]  # text | interpretation
                if de_txt and i < len(d["lines"]):
                    d["lines"][i][sub + "_neutral"] = de_txt; n_de += 1
                if en_txt and e.get("lines") and i < len(e["lines"]):
                    e["lines"][i][sub + "_en_neutral"] = en_txt; n_en += 1
            elif field.startswith("note"):
                k = int(field[4:field.index(".")])
                if de_txt and d.get("notes") and k < len(d["notes"]):
                    d["notes"][k]["text_neutral"] = de_txt; n_de += 1
                if en_txt and e.get("notes") and k < len(e["notes"]):
                    e["notes"][k]["text_en_neutral"] = en_txt; n_en += 1

    _write(HEX, de)
    _write(EN, en)
    print(f"OK: applied neutral overrides — DE fields {n_de}, EN fields {n_en} "
          f"({len(ov)} hexagrams)")


def _write(path: Path, data) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    # Abschließendes \n wie sync_image_seeds_to_en.py / build_widget_slice.py —
    # ohne das nimmt ein Lauf hier der en.json die Newline wieder weg, die der
    # spätere Pipeline-Schritt gesetzt hat (Diff-Rauschen bei jedem Re-Apply).
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


if __name__ == "__main__":
    main()
