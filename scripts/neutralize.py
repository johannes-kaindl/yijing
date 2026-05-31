#!/usr/bin/env python3
"""Sub-project A2 step 1: deterministic regex pass that neutralizes the generic
gendered ROLE NOUNS in the Wilhelm text (DE + EN). It produces a *draft* and a
diff report — the LLM polish pass (a workflow) then finalizes pronouns/fluency.
Content-specific gendered imagery (Mädchen, Vater/Mutter/Sohn/Tochter, Drache,
Frau, …) is deliberately NOT touched.

  python3 scripts/neutralize.py
    -> scripts/sources/neutral_draft.json   (regex draft, only changed fields)
    -> scripts/sources/neutral_diff_report.md (before/after, for control)
"""
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DE = {x["number"]: x for x in json.loads((ROOT / "data" / "hexagrams.json").read_text(encoding="utf-8"))}
EN = {x["number"]: x for x in json.loads((ROOT / "data" / "hexagrams.en.json").read_text(encoding="utf-8"))}
DRAFT = ROOT / "scripts" / "sources" / "neutral_draft.json"
REPORT = ROOT / "scripts" / "sources" / "neutral_diff_report.md"

# Ordered (longest/most-specific first). Generic role nouns only.
DE_RULES = [
    (r"\bdes großen Mannes\b", "des großen Menschen"),
    (r"\bdem großen Manne?\b", "dem großen Menschen"),
    (r"\bden großen Mann\b", "den großen Menschen"),
    (r"\bder große Mann\b", "der große Mensch"),
    (r"\bdes Edlen\b", "der edlen Person"),
    (r"\bdem Edlen\b", "der edlen Person"),
    (r"\bden Edlen\b", "die edle Person"),
    (r"\bdie Edlen\b", "die edlen Personen"),
    (r"\bder Edle\b", "die edle Person"),
    (r"\bdes Weisen\b", "der weisen Person"),
    (r"\bdem Weisen\b", "der weisen Person"),
    (r"\bder Weise\b", "die weise Person"),
    (r"\bder Berufene\b", "die berufene Person"),
    (r"\bdes Berufenen\b", "der berufenen Person"),
]
EN_RULES = [
    (r"\bthe superior man\b", "the superior person"),
    (r"\bthe great man\b", "the great person"),
    (r"\bthe inferior man\b", "the inferior person"),
    (r"\bthe holy man\b", "the holy person"),
    (r"\bthe wise man\b", "the wise person"),
    (r"\bsuperior man\b", "superior person"),
    (r"\bgreat man\b", "great person"),
    (r"\binferior man\b", "inferior person"),
]


def _preserve_cap(repl, m):
    out = repl
    if m.group(0)[:1].isupper():
        out = out[:1].upper() + out[1:]
    return out


def apply_rules(text, rules):
    if not text:
        return text, 0
    n = 0
    for pat, repl in rules:
        def sub(m):
            nonlocal n
            n += 1
            return _preserve_cap(repl, m)
        text = re.sub(pat, sub, text, flags=re.IGNORECASE)
    return text, n


# translatable fields, with their EN suffix
HEX_FIELDS = ["meaning", "judgment", "image"]

draft = {}
report = ["# Gender-neutral regex draft — before/after", ""]
total_de = total_en = 0

for num in range(1, 65):
    d, e = DE[num], EN[num]
    entry = {}
    # hex-level fields
    for fld in HEX_FIELDS:
        nde, cde = apply_rules(d.get(fld, ""), DE_RULES)
        nen, cen = apply_rules(e.get(fld + "_en", ""), EN_RULES)
        if cde or cen:
            entry[fld] = {"de": nde, "en": nen}
            total_de += cde
            total_en += cen
    # lines
    for i, ln in enumerate(d["lines"]):
        for sub in ("text", "interpretation"):
            nde, cde = apply_rules(ln.get(sub, ""), DE_RULES)
            een = e["lines"][i].get(sub + "_en", "") if i < len(e.get("lines", [])) else ""
            nen, cen = apply_rules(een, EN_RULES)
            if cde or cen:
                entry[f"line{i}.{sub}"] = {"de": nde, "en": nen}
                total_de += cde
                total_en += cen
    # notes
    for k, nt in enumerate(d.get("notes", [])):
        nde, cde = apply_rules(nt.get("text", ""), DE_RULES)
        een = e.get("notes", [{}] * (k + 1))[k].get("text_en", "") if e.get("notes") and k < len(e["notes"]) else ""
        nen, cen = apply_rules(een, EN_RULES)
        if cde or cen:
            entry[f"note{k}.text"] = {"de": nde, "en": nen}
            total_de += cde
            total_en += cen
    if entry:
        draft[str(num)] = entry

DRAFT.write_text(json.dumps(draft, ensure_ascii=False, indent=2), encoding="utf-8")

# Build a readable diff report (word-level highlight of changed substrings)
report = ["# Gender-neutral regex draft — summary", "",
          f"- hexagrams touched: {len(draft)}",
          f"- DE substitutions: {total_de}",
          f"- EN substitutions: {total_en}", "",
          "## Per-field changes", ""]
for num_s, entry in draft.items():
    for fld, vals in entry.items():
        report.append(f"### hex {num_s} · {fld}")
        report.append(f"  DE→ …{vals['de'][:160]}…")
        if vals["en"]:
            report.append(f"  EN→ …{vals['en'][:160]}…")
REPORT.write_text("\n".join(report) + "\n", encoding="utf-8")
print(f"OK: {len(draft)} hexagrams, DE subs {total_de}, EN subs {total_en}")
print(f"   draft  -> {DRAFT.relative_to(ROOT)}")
print(f"   report -> {REPORT.relative_to(ROOT)}")
