#!/usr/bin/env python3
"""Renders all 64 hexagrams (DE) to one scrollable HTML page for the manual
verification pass (§7a of the spec). Output is gitignored. Stdlib only.

  python3 scripts/build_review.py   ->   scripts/sources/review.html
"""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = json.loads((ROOT / "data" / "hexagrams.json").read_text(encoding="utf-8"))
OUT = ROOT / "scripts" / "sources" / "review.html"


def paras(s: str) -> str:
    blocks = [html.escape(p).replace("\n", "<br>")
              for p in (s or "").split("\n\n") if p.strip()]
    return "".join(f"<p>{b}</p>" for b in blocks) or "<p>—</p>"


parts = [
    "<!doctype html><meta charset=utf-8><title>Yijing data review</title>",
    "<style>"
    "body{font:16px/1.65 Georgia,'Iowan Old Style',serif;max-width:780px;"
    "margin:2rem auto;padding:0 1rem;color:#2a2620;background:#f4efe4}"
    "h2{margin:3rem 0 .3rem;border-top:1px solid #ccc;padding-top:1rem}"
    "h3{font-size:.8rem;letter-spacing:.15em;text-transform:uppercase;"
    "color:#9c7220;margin:1.3rem 0 .3rem}"
    ".pos{font-weight:bold;color:#9c7220;margin-top:1em}"
    ".verse{font-weight:500}.note{color:#777;font-size:.9em}</style>",
]
for h in DATA:
    parts.append(f"<h2>{h['number']}. {html.escape(h['name_de'])} "
                 f"<small>{html.escape(h.get('name_chinese', ''))} "
                 f"{html.escape(h.get('pinyin', ''))}</small></h2>")
    parts.append("<h3>Bedeutung</h3>" + paras(h["meaning"]))
    parts.append("<h3>Das Urteil</h3>" + paras(h["judgment"]))
    parts.append("<h3>Das Bild</h3>" + paras(h["image"]))
    if h.get("image_association"):
        parts.append("<h3>Bildmeditation</h3>"
                     f"<p>{html.escape(h['image_association'])}</p>")
    parts.append("<h3>Die einzelnen Linien</h3>")
    for l in h["lines"]:
        parts.append(f"<div class=pos>{html.escape(l['position'])}</div>"
                     f"<div class=verse>{html.escape(l['text']).replace(chr(10), '<br>')}</div>"
                     + paras(l["interpretation"]))
    if h.get("notes"):
        parts.append("<h3>Anmerkungen</h3>"
                     + "".join(f"<p class=note>{html.escape(n['text'])}</p>" for n in h["notes"]))

OUT.write_text("\n".join(parts), encoding="utf-8")
print(f"OK: review -> {OUT.relative_to(ROOT)} ({len(DATA)} hexagrams)")
