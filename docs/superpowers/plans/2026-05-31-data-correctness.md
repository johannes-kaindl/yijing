# Data Correctness & Rendering Implementation Plan (Sub-project A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-source the Wilhelm hexagram texts from Projekt-Gutenberg as the canonical source, fill all audited gaps (6 empty meanings, hex 2 image, hex 1 & 2 seventh line, OCR typos), preserve footnotes and paragraph structure, repair `image_association`, keep DE/EN in sync, and verify the whole corpus.

**Architecture:** A new stdlib-only Python scraper (`scrape_gutenberg.py`) parses all 64 hexagram pages into a committed source asset (`scripts/sources/gutenberg_iging.json`). `build_data.py` merges it (Gutenberg wins for Wilhelm text fields; lookup fields stay from `_archiv`/CSV) into `data/hexagrams.json`. The app renders multi-paragraph text as `<p>`, shows footnotes in an "Anmerkungen" block, and reads the seventh line when hex 1/2 cast all-moving. EN deltas are translated and a full-corpus `review.html` artifact backs a mandatory verification pass.

**Tech Stack:** Python 3 stdlib (`re`, `html`, `json`, `urllib`) — NO bs4/requests. Vanilla ES-module JS (no build, no framework). Lightweight ad-hoc tests (`python3` assert scripts, `node --check`, `node scripts/test-kingwen.mjs`) per AGENTS.md — no pytest, no new test framework.

**Branch:** `data-correctness` (already created; spec committed). **Reference:** spec at `docs/superpowers/specs/2026-05-31-yijing-data-correctness-design.md`.

**Cached fixtures (already fetched):** `scripts/sources/.html_cache/chapter3.html` (hex 1), `chapter12.html` (hex 2). The parser tests run against these. Re-fetch with `python3 scripts/scrape_gutenberg.py --refetch` if absent.

---

## File structure

- `scripts/scrape_gutenberg.py` (new) — fetch+cache, parse, normalize, validate, write `gutenberg_iging.json`. Self-test via `--selftest`.
- `scripts/sources/gutenberg_iging.json` (new, committed) — parsed canonical source, keyed by hexagram number.
- `scripts/sources/.html_cache/` (gitignored) — raw HTML cache.
- `scripts/sources/gutenberg_diff_report.md`, `scripts/sources/review.html` (gitignored) — build/verify artifacts.
- `scripts/build_data.py` (modify) — `load_gutenberg()`, Gutenberg-wins merge incl. `notes`, `load_image_prompts()` fix, `assert_complete()`, diff report.
- `scripts/build_review.py` (new) — renders all 64 hexagrams to `review.html`.
- `data/hexagrams.json`, `data/hexagrams.en.json` (regenerated/edited, committed).
- `web/app.js` (modify) — `renderParagraphs()` helper + apply; hex 1/2 all-moving logic; notes rendering.
- `web/index.html` (modify) — `#notesText` "Anmerkungen" `<details>`.
- `web/i18n.js` (modify) — `reading.notes` (DE/EN).
- `web/style.css` (modify) — `<p>` paragraph spacing, `.note` style, print recheck.
- `docs/DATA.md` (modify) — provenance + `notes` field + resolved gaps.
- `.gitignore` (modify) — cache + artifacts.

---

## Task 0: Setup — .gitignore and source dir

**Files:**
- Modify: `.gitignore`
- Create dir: `scripts/sources/` (the `.html_cache/` already exists from fetching)

- [ ] **Step 1: Append ignore rules**

Add to `.gitignore`:
```
# Gutenberg scrape cache + build/verify artifacts (parsed JSON is committed)
scripts/sources/.html_cache/
scripts/sources/gutenberg_diff_report.md
scripts/sources/review.html
```

- [ ] **Step 2: Verify the cache is ignored but the dir is keepable**

Run: `git -C /Users/Shared/code/yijing check-ignore scripts/sources/.html_cache/chapter3.html`
Expected: prints the path (ignored).

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "build: gitignore Gutenberg HTML cache and build artifacts"
```

---

## Task 1: Scraper — fetch + cache layer

**Files:**
- Create: `scripts/scrape_gutenberg.py`

- [ ] **Step 1: Write the module scaffold + fetch/cache**

```python
#!/usr/bin/env python3
"""Scrapes Richard Wilhelm's I Ging (Projekt-Gutenberg) into a canonical
source asset for build_data.py. Stdlib only — no third-party deps.

Source:  https://projekt-gutenberg.org/authors/richard-wilhelm/books/i-ging/
Chapters 3..66 map to the 64 hexagrams (chapter number != hexagram number;
the hexagram number is parsed from the page heading). Output keyed by
hexagram number → scripts/sources/gutenberg_iging.json.
"""
from __future__ import annotations
import html, json, re, sys, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "scripts" / "sources" / ".html_cache"
OUT = ROOT / "scripts" / "sources" / "gutenberg_iging.json"
BASE = "https://projekt-gutenberg.org/authors/richard-wilhelm/books/i-ging/chapter/{}"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
CHAPTERS = range(3, 67)  # 64 hexagram pages


def fetch(ch: int, refetch: bool = False) -> str:
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"chapter{ch}.html"
    if f.exists() and not refetch:
        return f.read_text(encoding="utf-8")
    req = urllib.request.Request(BASE.format(ch), headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        text = r.read().decode("utf-8")
    f.write_text(text, encoding="utf-8")
    time.sleep(1.0)  # polite
    return text
```

- [ ] **Step 2: Smoke-test the cache path (offline)**

Run: `python3 -c "import scripts.scrape_gutenberg as s; print(len(s.fetch(3)))"` from repo root
(or `cd scripts && python3 -c "import scrape_gutenberg as s; print(len(s.fetch(3)))"`).
Expected: prints a number > 100000 (reads `chapter3.html` from cache, no network).

- [ ] **Step 3: Commit**

```bash
git add scripts/scrape_gutenberg.py
git commit -m "scrape: gutenberg fetch+cache scaffold"
```

---

## Task 2: Scraper — block extraction + page parser

**Files:**
- Modify: `scripts/scrape_gutenberg.py`

The body is a flat run of `<h2>`/`<p>` inside the first
`book-reader__chapter-content-wrapper`. `<p class="...center...">` = oracle/
heading/verse; `<p class="">` = commentary prose. Footnotes = a prose `<p>`
wholly enclosed in `(…)`.

- [ ] **Step 1: Add block extraction + section state machine**

```python
def strip_tags(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()

def content_wrapper(raw: str) -> str:
    i = raw.find("book-reader__chapter-content-wrapper")
    if i < 0:
        raise ValueError("content wrapper not found")
    j = raw.find("book-reader__chapter-content-wrapper", i + 1)  # dedupe reading-mode copy
    return raw[i: j if j > 0 else len(raw)]

def blocks(seg: str):
    """Yield (kind, text) in document order. kind ∈ {'h2','center','prose'}."""
    for tag, attrs, inner in re.findall(r"<(h2|p)\b([^>]*)>(.*?)</\1>", seg, re.S):
        txt = strip_tags(inner)
        if not txt:
            continue
        if tag == "h2":
            yield "h2", txt
        else:
            mcls = re.search(r'class="([^"]*)"', attrs)
            cls = mcls.group(1) if mcls else ""
            yield ("center" if "center" in cls else "prose"), txt

NAME_RE = re.compile(r"^\s*(\d{1,2})\s*\.?\s+(.+?)\s*/\s*(.+)$")
LINE_RE = re.compile(r"bedeutet( das)?:\s*$")
TRIGRAM_RE = re.compile(r"^(oben|unten)\b", re.I)
HEAD_BILD = "DAS BILD"
HEAD_LINES = "Die Einzelnen Linien"

def parse_page(raw: str) -> dict:
    bl = list(blocks(content_wrapper(raw)))
    # 1) name
    h2 = next(t for k, t in bl if k == "h2")
    m = NAME_RE.match(h2)
    if not m:
        raise ValueError(f"unparseable heading: {h2!r}")
    number = int(m.group(1)); name_rom = m.group(2).strip(); name_de = m.group(3).strip()
    # 2) walk sections
    meaning, judg_verse, judg_prose, img_verse, img_prose = [], [], [], [], []
    lines, notes = [], []
    section = "intro"       # intro→meaning→judgment→image→lines
    cur_line = None
    def is_note(t): return t.startswith("(") and t.rstrip().endswith(")")
    for k, t in bl:
        if k == "h2":
            continue
        if k == "center" and TRIGRAM_RE.match(t):
            section = "meaning"; continue
        if t == HEAD_BILD:
            section = "image"; continue
        if t == HEAD_LINES:
            section = "lines"; continue
        if section == "lines" and k == "center" and LINE_RE.search(t):
            cur_line = {"position": t, "text": [], "interpretation": [],
                        "seventh": bool(LINE_RE.search(t).group(1))}
            lines.append(cur_line); continue
        if section == "lines" and cur_line is not None:
            (cur_line["text"] if k == "center" else cur_line["interpretation"]).append(t)
            continue
        # meaning / judgment / image bodies
        if k == "prose" and is_note(t):
            notes.append({"anchor": section, "marker": "*", "text": t})
            continue
        if section in ("intro", "meaning"):
            section = "meaning"; meaning.append(t) if k == "prose" else None
            if k == "center":  # first centered verse after meaning = judgment
                section = "judgment"; judg_verse.append(t)
        elif section == "judgment":
            (judg_verse if k == "center" else judg_prose).append(t)
        elif section == "image":
            (img_verse if k == "center" else img_prose).append(t)
    return {
        "number": number, "name_romanized": name_rom, "name_de": name_de,
        "_meaning": meaning, "_judg_verse": judg_verse, "_judg_prose": judg_prose,
        "_img_verse": img_verse, "_img_prose": img_prose, "_lines": lines, "_notes": notes,
    }
```

- [ ] **Step 2: Write the failing self-test (against cached hex 1 & 2)**

Add at bottom of the file:
```python
def _selftest():
    p1 = parse_page(fetch(3)); p2 = parse_page(fetch(12))
    assert p1["number"] == 1, p1["number"]
    assert p1["name_de"].upper().startswith("DAS SCHÖPFERISCHE"), p1["name_de"]
    assert p2["number"] == 2, p2["number"]
    # hex 1: 6 regular lines + 1 seventh ("lauter Neunen"/"bedeutet das:")
    sev1 = [l for l in p1["_lines"] if l["seventh"]]
    assert len(p1["_lines"]) == 7 and len(sev1) == 1, [len(p1["_lines"]), len(sev1)]
    assert "lauter Neunen" in sev1[0]["position"], sev1[0]["position"]
    # hex 2: seventh = "lauter Sechsen"; image present (was empty in old data)
    sev2 = [l for l in p2["_lines"] if l["seventh"]]
    assert len(sev2) == 1 and "lauter Sechsen" in sev2[0]["position"], sev2[0]["position"]
    assert p2["_img_verse"], "hex 2 image verse must be non-empty"
    # footnotes captured, not in body
    assert any("Zeus" in n["text"] for n in p1["_notes"]), "hex1 Zeus footnote"
    assert any("Luzifer" in n["text"] or "Ikarus" in n["text"] for n in p2["_notes"]), "hex2 note"
    print("selftest OK")

if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
```

Run: `cd /Users/Shared/code/yijing/scripts && python3 scrape_gutenberg.py --selftest`
Expected first run: **FAIL** on an assertion (parser not yet exact) — iterate on `parse_page` against the fixture until it passes. (This is the TDD core: the assertions are fixed; the parser is tuned to satisfy them.)

- [ ] **Step 3: Tune parser until self-test passes**

Run the same command. Expected: `selftest OK`. Adjust `parse_page` (e.g. handling the trigram/judgment boundary, the `bedeutet das:` seventh-line detection, note detection) until all asserts pass.

- [ ] **Step 4: Commit**

```bash
git add scripts/scrape_gutenberg.py
git commit -m "scrape: parse hexagram page into structured sections (selftest on hex 1 & 2)"
```

---

## Task 3: Scraper — normalization, footnote text, finalize records

**Files:**
- Modify: `scripts/scrape_gutenberg.py`

- [ ] **Step 1: Add normalization + record assembly**

```python
OCR_FIXES = {
    "das Schöpferisch,": "das Schöpferische,",  # trigram line, missing final e
    "Dorotbea": "Dorothea",                      # Goethe, Hermann und Dorothea
    "Kungtse::": "Kungtse:",
    "DIE WIEDERKEHRT": "DIE WIEDERKEHR",
    "DAS HAFTENE": "DAS HAFTENDE",
}

def normalize(s: str) -> str:
    for bad, good in OCR_FIXES.items():
        s = s.replace(bad, good)
    # straight double quotes → German guillemets (paired, left-to-right)
    out, open_q = [], True
    for ch in s:
        if ch == '"':
            out.append("»" if open_q else "«"); open_q = not open_q
        else:
            out.append(ch)
    return "".join(out).strip()

def join_paras(parts: list[str]) -> str:
    return "\n\n".join(normalize(p) for p in parts if p.strip())

def note_text(t: str) -> str:
    t = re.sub(r"^\(\*?\s*", "", t).rstrip(")").strip()  # drop wrapping ( ) and leading *
    return normalize(t)

def finalize(p: dict) -> dict:
    lines = []
    for i, l in enumerate(p["_lines"]):
        lines.append({
            "position": normalize(l["position"]),
            "text": join_paras(l["text"]),
            "interpretation": join_paras(l["interpretation"]),
        })
    notes = [{"anchor": n["anchor"], "marker": "*", "text": note_text(n["text"])}
             for n in p["_notes"] if note_text(n["text"])]
    return {
        "number": p["number"],
        "name_romanized": p["name_romanized"],
        "name_de": normalize(p["name_de"]),
        "meaning": join_paras(p["_meaning"]),
        "judgment": "\n\n".join(x for x in ["\n".join(normalize(v) for v in p["_judg_verse"]),
                                            join_paras(p["_judg_prose"])] if x),
        "image": "\n\n".join(x for x in ["\n".join(normalize(v) for v in p["_img_verse"]),
                                         join_paras(p["_img_prose"])] if x),
        "lines": lines,
        "notes": notes,
    }
```

- [ ] **Step 2: Extend self-test for normalization**

Add to `_selftest()`:
```python
    f1 = finalize(p1)
    assert "»" in f1["judgment"] or "»" in f1["meaning"], "guillemets applied"
    assert '"' not in f1["judgment"] and '"' not in f1["meaning"], "no straight quotes"
    assert f1["lines"][0]["position"].startswith("Anfangs eine Neun"), f1["lines"][0]["position"]
    assert all(n["text"] and not n["text"].startswith("(") for n in f1["notes"]), "clean notes"
```

Run: `python3 scrape_gutenberg.py --selftest`
Expected: `selftest OK`.

- [ ] **Step 3: Commit**

```bash
git add scripts/scrape_gutenberg.py
git commit -m "scrape: normalize quotes/OCR, assemble finalized records + footnotes"
```

---

## Task 4: Scraper — full run, validation, write source asset

**Files:**
- Modify: `scripts/scrape_gutenberg.py`
- Create (output, committed): `scripts/sources/gutenberg_iging.json`

- [ ] **Step 1: Add the full build + validation**

```python
def build_all(refetch: bool = False) -> dict:
    out = {}
    for ch in CHAPTERS:
        rec = finalize(parse_page(fetch(ch, refetch)))
        n = rec["number"]
        if n in out:
            raise SystemExit(f"duplicate hexagram {n} (chapter {ch})")
        out[n] = rec
    # validation
    missing = [n for n in range(1, 65) if n not in out]
    if missing:
        raise SystemExit(f"missing hexagrams: {missing}")
    for n, r in out.items():
        if not r["judgment"]: raise SystemExit(f"hex {n}: empty judgment")
        if not r["image"]: raise SystemExit(f"hex {n}: empty image")
        regular = [l for l in r["lines"] if "bedeutet das:" not in l["position"]]
        if len(regular) < 6: raise SystemExit(f"hex {n}: {len(regular)} regular lines")
    for n in (1, 2):
        if not any("bedeutet das:" in l["position"] for l in out[n]["lines"]):
            raise SystemExit(f"hex {n}: missing all-moving (seventh) line")
    return {str(n): out[n] for n in sorted(out)}

def main():
    refetch = "--refetch" in sys.argv
    data = build_all(refetch)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK: {len(data)} hexagrams → {OUT.relative_to(ROOT)}")
```

Update the `__main__` guard:
```python
if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
    else:
        main()
```

- [ ] **Step 2: Run the full scrape (uses cache; fetches the 62 not-yet-cached pages once)**

Run: `cd /Users/Shared/code/yijing/scripts && python3 scrape_gutenberg.py`
Expected: fetches chapters 4..66 (≈1s each, polite), then `OK: 64 hexagrams → scripts/sources/gutenberg_iging.json`. If a page fails validation, fix `parse_page` for that page's quirk and re-run.

- [ ] **Step 3: Sanity-check the output**

Run:
```bash
python3 - <<'PY'
import json
d=json.load(open("scripts/sources/gutenberg_iging.json"))
assert len(d)==64
for n in ("17","25","47","48","53","56"): assert d[n]["meaning"], f"hex {n} meaning empty"
assert d["2"]["image"], "hex 2 image empty"
assert "Dorothea" in d["5"]["image"], "hex5 typo not fixed"
print("counts: notes total", sum(len(v["notes"]) for v in d.values()))
print("sanity OK")
PY
```
Expected: `sanity OK`.

- [ ] **Step 4: Commit the scraper + source asset**

```bash
git add scripts/scrape_gutenberg.py scripts/sources/gutenberg_iging.json
git commit -m "scrape: full 64-hexagram Gutenberg source asset + validation"
```

---

## Task 5: build_data.py — Gutenberg-wins merge (incl. notes)

**Files:**
- Modify: `scripts/build_data.py`

- [ ] **Step 1: Add the Gutenberg loader**

After the imports/constants, add:
```python
SRC_GUTENBERG = ROOT / "scripts" / "sources" / "gutenberg_iging.json"

def load_gutenberg() -> dict[int, dict]:
    if not SRC_GUTENBERG.exists():
        raise SystemExit(f"Gutenberg source fehlt: {SRC_GUTENBERG} — "
                         f"erst `python3 scripts/scrape_gutenberg.py` ausführen.")
    raw = json.loads(SRC_GUTENBERG.read_text(encoding="utf-8"))
    return {int(k): v for k, v in raw.items()}
```

- [ ] **Step 2: Use Gutenberg for the Wilhelm text fields in `build()`**

In `build()`, load it once (next to the other loaders):
```python
    gutenberg = load_gutenberg()
```
Replace the per-hexagram text source. Where the loop currently does
`text = load_wilhelm_text(n)` and builds `meaning/judgment/image/lines`, switch to:
```python
        g = gutenberg.get(n)
        if not g:
            raise SystemExit(f"Gutenberg-Eintrag fehlt für Hexagramm {n}")
        text = load_wilhelm_text(n)  # archive fallback (only used if a g-field is empty)
        meaning = g["meaning"] or text["meaning"]
        judgment = g["judgment"] or text["judgment"]
        image = g["image"] or text["image"]
        lines = g["lines"] if g["lines"] else text["lines"]
        notes = g.get("notes", [])
        if not (g["meaning"] and g["judgment"] and g["image"]):
            print(f"   WARN: Hexagramm {n} nutzt Archiv-Fallback für ein leeres Gutenberg-Feld")
```
and in the appended dict use `meaning`, `judgment`, `image`, `lines`, plus add:
```python
            "notes": notes,
```
(keep `image_association` as-is for now — fixed in Task 6).

- [ ] **Step 3: Run the build**

Run: `cd /Users/Shared/code/yijing && python3 scripts/build_data.py`
Expected: `OK: 64 Hexagramme → data/hexagrams.json` and no WARN lines.

- [ ] **Step 4: Assert the gaps are filled**

Run:
```bash
python3 - <<'PY'
import json
h={x["number"]:x for x in json.load(open("data/hexagrams.json"))}
for n in (17,25,47,48,53,56): assert h[n]["meaning"], f"hex {n} meaning still empty"
assert h[2]["image"], "hex 2 image still empty"
assert "Dorothea" in h[5]["image"]
assert len(h[1]["lines"])==7 and len(h[2]["lines"])==7, "missing seventh line"
assert "notes" in h[1]
print("gap-fill OK")
PY
```
Expected: `gap-fill OK`.

- [ ] **Step 5: Commit (script only; data committed in Task 8)**

```bash
git add scripts/build_data.py
git commit -m "build: gutenberg-wins merge for Wilhelm text fields + notes"
```

---

## Task 6: build_data.py — image_association repair

**Files:**
- Modify: `scripts/build_data.py` (`load_image_prompts`, ~lines 209-235)

- [ ] **Step 1: Fix the suffix-stripping and selection**

Replace the cleaning + selection logic:
```python
            name = f.stem
            if re.match(r"^IMG_\d+$", name, re.IGNORECASE):
                continue
            # strip a trailing " p", "p-N", or a bare "-N" filename-numbering suffix
            cleaned = re.sub(r"\s*p(-\d+)?\s*$", "", name, flags=re.IGNORECASE)
            cleaned = re.sub(r"-\d+\s*$", "", cleaned).strip()
            if cleaned and not re.match(r"^IMG_", cleaned, re.IGNORECASE):
                cleaned = cleaned[0].upper() + cleaned[1:]
                out[n].add(cleaned)
    # Prefer the cleanest (un-suffixed) candidate; tie-break by length.
    def pick(cands):
        return sorted(cands, key=lambda c: (bool(re.search(r"-\d+$", c)), -len(c)))[0]
    return {n: pick(prompts) for n, prompts in out.items() if prompts}
```

Add a small hand-written override map (filesystem-truncated names are not
recoverable) and apply it last in `build()` where `image_association` is set:
```python
IMAGE_ASSOC_OVERRIDE = {
    2: "Open plain under a vast yielding sky, devoted earth",
    3: "Fragile shoot breaking through hard soil after storm",
    4: "Rising sun behind a hill, youthful uncertainty in mist",
    5: "Clouds gathering before rain, patient waiting at the ford",
    6: "Two rivers diverging, tense standoff before conflict",
    7: "Disciplined ranks moving as one beneath a stern banner",
    11: "Heaven and earth meeting, peace and flourishing exchange",
    27: "Open mouth, careful nourishment of body and word",
    28: "Overloaded ridgepole bending under critical weight",
    56: "Lone wanderer at dusk, fire on the mountain, transient rest",
    57: "Gentle persistent wind bending the grasses, repeated influence",
    58: "Twin joyous lakes reflecting, open exchange and delight",
    59: "Wind over water dispersing mist, dissolving rigidity",
    60: "Water held by measured banks, limitation and articulation",
    61: "Wind over lake, inner truth radiating outward",
    62: "Small bird flying low, attention to little things",
    63: "Water over fire in perfect balance, completion already passing",
}
```
In the assembly: `"image_association": IMAGE_ASSOC_OVERRIDE.get(n, image_prompts.get(n, "")),`

> Note: override strings above are placeholders to be confirmed against each
> hexagram's meaning during execution — refine wording before commit. They must
> be clean (no `-\d+`, no truncation) and atmospheric. (Hex 1 & 64 were already
> clean; keep their original derived values if present.)

- [ ] **Step 2: Rebuild + assert no truncation artifacts remain**

Run: `python3 scripts/build_data.py && python3 - <<'PY'`
```python
import json, re
h=json.load(open("data/hexagrams.json"))
bad=[x["number"] for x in h if re.search(r"-\d+$", x.get("image_association",""))]
assert not bad, f"truncated image_association: {bad}"
print("image_association OK")
PY
```
Expected: `image_association OK`.

- [ ] **Step 3: Commit (script only)**

```bash
git add scripts/build_data.py
git commit -m "build: repair image_association truncation + suffix bug"
```

---

## Task 7: build_data.py — completeness guard + diff report

**Files:**
- Modify: `scripts/build_data.py`

- [ ] **Step 1: Add `assert_complete()` and the diff report**

```python
DIFF_REPORT = ROOT / "scripts" / "sources" / "gutenberg_diff_report.md"

def assert_complete(hexagrams: list[dict]) -> None:
    problems = []
    for h in hexagrams:
        n = h["number"]
        for fld in ("meaning", "judgment", "image"):
            if not h[fld]:
                problems.append(f"hex {n}: empty {fld}")
        for i, l in enumerate(h["lines"]):
            for sub in ("position", "text"):
                if not l[sub]:
                    problems.append(f"hex {n} line {i}: empty {sub}")
        if re.search(r"-\d+$", h.get("image_association", "")):
            problems.append(f"hex {n}: truncated image_association")
    if problems:
        raise SystemExit("assert_complete failed:\n  " + "\n  ".join(problems))

def write_diff_report(new: list[dict]) -> None:
    if not OUT_HEX.exists():
        return
    old = {x["number"]: x for x in json.loads(OUT_HEX.read_text(encoding="utf-8"))}
    lines = ["# Gutenberg diff report", ""]
    for h in new:
        o = old.get(h["number"], {})
        for fld in ("meaning", "judgment", "image"):
            a, b = (o.get(fld) or ""), h[fld]
            if a == b:
                continue
            tag = "FILLED" if not a else "CHANGED"
            lines.append(f"- hex {h['number']} `{fld}` **{tag}** "
                         f"(old {len(a)}c → new {len(b)}c)")
    DIFF_REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"   diff report → {DIFF_REPORT.relative_to(ROOT)} ({len(lines)-2} field changes)")
```

Call them in `build()` just before `_write_json_atomic(OUT_HEX, hexagrams)`:
```python
    write_diff_report(hexagrams)   # before overwrite, compares to old file
    assert_complete(hexagrams)
```

- [ ] **Step 2: Rebuild**

Run: `python3 scripts/build_data.py`
Expected: `OK: 64 …`, a diff-report line, no `assert_complete failed`.

- [ ] **Step 3: Commit (script only)**

```bash
git add scripts/build_data.py
git commit -m "build: assert_complete guard + non-blocking diff report"
```

---

## Task 8: Commit regenerated DE data

**Files:**
- Modify: `data/hexagrams.json` (regenerated)

- [ ] **Step 1: Final clean rebuild**

Run: `python3 scripts/build_data.py && node scripts/test-kingwen.mjs`
Expected: build OK; test-kingwen prints its existing pass output (DE side unaffected structurally except added `notes` + seventh line — if it asserts EN parity it will fail until Task 14; note which assertions are DE-only vs EN).

- [ ] **Step 2: Commit the data**

```bash
git add data/hexagrams.json
git commit -m "data: re-source Wilhelm texts from Gutenberg; fill gaps, add notes + seventh line"
```

---

## Task 9: app.js — paragraph rendering

**Files:**
- Modify: `web/app.js` (helper near `escapeHTML` at :318; apply at :348-350, :379, and in `renderChangingLines` :283-296)

- [ ] **Step 1: Add `renderParagraphs` helper**

After `escapeHTML` (~line 323):
```javascript
/** Render a plain-text field (\n\n = paragraph, \n = line break) as escaped <p> HTML. */
function renderParagraphs(s) {
  const text = String(s || "").trim();
  if (!text) return "—";
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHTML(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}
```

- [ ] **Step 2: Apply to the text blocks**

Replace `els.judgmentText.textContent = primaryTexts.judgment || "—";` (and the
`imageText`, `meaningText` siblings at :348-350) with:
```javascript
  els.judgmentText.innerHTML = renderParagraphs(primaryTexts.judgment);
  els.imageText.innerHTML = renderParagraphs(primaryTexts.image);
  els.meaningText.innerHTML = renderParagraphs(primaryTexts.meaning);
```
Replace `els.resultingJudgment.textContent = resultingTexts.judgment || "—";` (~:379) with:
```javascript
    els.resultingJudgment.innerHTML = renderParagraphs(resultingTexts.judgment);
```
In `renderChangingLines` (:289-293), change the `.interp` to paragraphs:
```javascript
      ${ln.interpretation ? `<div class="interp">${renderParagraphs(ln.interpretation)}</div>` : ""}
```
(Keep `.pos` and `.text` as single-line `escapeHTML`.)

Also update the reset path (~:458-460) — `textContent = ""` is fine; no change needed.

- [ ] **Step 3: Syntax check**

Run: `node --check web/app.js`
Expected: no output (pass).

- [ ] **Step 4: Commit**

```bash
git add web/app.js
git commit -m "ui: render hexagram texts as paragraphs"
```

---

## Task 10: app.js — hex 1 & 2 all-moving seventh line

**Files:**
- Modify: `web/app.js` (`renderChangingLines` and/or `showReading` ~:333-360)

- [ ] **Step 1: Branch to the seventh line when all six move**

In `showReading`, where changing lines are rendered, add before the normal
`renderChangingLines` call:
```javascript
  const allMoving = changingIndices.length === 6;
  const hasSeventh = primaryHex.lines.length >= 7;
  if (allMoving && hasSeventh && (primaryHex.number === 1 || primaryHex.number === 2)) {
    renderSeventhLine(primaryHex); // the "use the nine / use the six" oracle
  } else {
    renderChangingLines(primaryHex, changingIndices);
  }
```
Add the renderer (near `renderChangingLines`):
```javascript
function renderSeventhLine(hexData) {
  const ln = lineFieldsForLang(hexData.lines[6]);
  els.changingLines.innerHTML = "";
  const block = document.createElement("div");
  block.className = "changing-line";
  block.innerHTML =
    `<div class="pos">${escapeHTML(ln.position)}</div>` +
    `<div class="text">${escapeHTML(ln.text)}</div>` +
    (ln.interpretation ? `<div class="interp">${renderParagraphs(ln.interpretation)}</div>` : "");
  els.changingLines.appendChild(block);
}
```

- [ ] **Step 2: Syntax check + manual reasoning**

Run: `node --check web/app.js`
Expected: pass. (Behaviour verified in the browser spot-check, Task 16: cast hex 1 with all six lines moving → shows "Es erscheint eine Schar von Drachen ohne Haupt. Heil!".)

- [ ] **Step 3: Commit**

```bash
git add web/app.js
git commit -m "logic: read seventh line for hex 1 & 2 when all lines move"
```

---

## Task 11: Notes ("Anmerkungen") rendering

**Files:**
- Modify: `web/index.html` (texts section, near the other `<details>` ~:120-160)
- Modify: `web/i18n.js` (add `reading.notes` DE/EN)
- Modify: `web/app.js` (els map + render)
- Modify: `web/style.css` (`.note`)

- [ ] **Step 1: Add the DOM block**

In `index.html`, after the association details and before `#changingSection`,
add (match the existing `<details>` structure):
```html
        <details id="notesDetails" hidden>
          <summary class="section-title" data-i18n="reading.notes">Anmerkungen</summary>
          <div id="notesText" class="text-body"></div>
        </details>
```

- [ ] **Step 2: Add i18n keys**

In `web/i18n.js`, add to the DE `reading` block: `notes: "Anmerkungen",` and to
the EN `reading` block: `notes: "Notes",` (match surrounding key style/placement).

- [ ] **Step 3: Wire up els + render in app.js**

Add to the `els` map: `notesDetails: document.getElementById("notesDetails"),` and
`notesText: document.getElementById("notesText"),`.
Add a renderer + helper for note language:
```javascript
function noteTextForLang(note) {
  return getLang() === "en" ? (note.text_en || note.text) : note.text;
}
function renderNotes(hex) {
  const notes = hex.notes || [];
  if (!notes.length) { els.notesDetails.hidden = true; return; }
  els.notesDetails.hidden = false;
  els.notesText.innerHTML = notes
    .map((n) => `<p class="note">${escapeHTML(noteTextForLang(n))}</p>`)
    .join("");
}
```
Call `renderNotes(primaryHex);` in `showReading` (near `renderTrigramDetails`),
and in the reset path hide it: `els.notesDetails.hidden = true;`.

- [ ] **Step 4: Style**

In `web/style.css`, add:
```css
.note { color: var(--ink-soft); font-size: 0.92rem; line-height: 1.6; }
```

- [ ] **Step 5: Syntax check**

Run: `node --check web/app.js && node --check web/i18n.js`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add web/index.html web/i18n.js web/app.js web/style.css
git commit -m "ui: render Wilhelm footnotes in an Anmerkungen block (DE/EN)"
```

---

## Task 12: style.css — paragraph spacing + print recheck

**Files:**
- Modify: `web/style.css` (text-body rule ~:364-369; `@media print` ~:1035-1174)

- [ ] **Step 1: Paragraph spacing for `.text-body p`**

The text-body rule currently relies on `white-space: pre-wrap`. Keep it for
backward safety but add paragraph spacing so `<p>` blocks read well:
```css
.text-body p { margin: 0 0 0.7em; }
.text-body p:last-child { margin-bottom: 0; }
.changing-line .interp p { margin: 0.4em 0 0; }
```
(If a `white-space: pre-wrap` on `.text-body` causes double spacing with real
`<p>`, scope it off the paragraph container — verify in the browser.)

- [ ] **Step 2: Print recheck**

Confirm the `@media print` block still styles `.text-body p` and `.note`
acceptably (no change likely needed; this also benefits sub-project B).

- [ ] **Step 3: Commit**

```bash
git add web/style.css
git commit -m "ui: paragraph spacing for rendered texts; print recheck"
```

---

## Task 13: build_review.py — full-corpus verification artifact

**Files:**
- Create: `scripts/build_review.py`
- Output (gitignored): `scripts/sources/review.html`

- [ ] **Step 1: Write the review renderer**

```python
#!/usr/bin/env python3
"""Renders all 64 hexagrams (DE) to a single scrollable HTML page for the
mandatory verification pass. Output is gitignored. Stdlib only."""
import html, json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = json.loads((ROOT / "data" / "hexagrams.json").read_text(encoding="utf-8"))
OUT = ROOT / "scripts" / "sources" / "review.html"

def paras(s):
    return "".join(f"<p>{html.escape(p)}</p>" for p in (s or "").split("\n\n") if p.strip()) or "<p>—</p>"

parts = ["<!doctype html><meta charset=utf-8><title>Yijing review</title>",
         "<style>body{font:16px/1.6 Georgia,serif;max-width:760px;margin:2rem auto;padding:0 1rem}"
         "h2{margin-top:3rem;border-top:1px solid #ccc;padding-top:1rem}"
         ".note{color:#777;font-size:.9em}.pos{font-weight:bold;margin-top:1em}</style>"]
for h in DATA:
    parts.append(f"<h2>{h['number']}. {html.escape(h['name_de'])} "
                 f"({html.escape(h.get('name_chinese',''))} {html.escape(h.get('pinyin',''))})</h2>")
    parts.append("<h3>Bedeutung</h3>" + paras(h["meaning"]))
    parts.append("<h3>Das Urteil</h3>" + paras(h["judgment"]))
    parts.append("<h3>Das Bild</h3>" + paras(h["image"]))
    parts.append("<h3>Die einzelnen Linien</h3>")
    for l in h["lines"]:
        parts.append(f"<div class=pos>{html.escape(l['position'])}</div>"
                     f"<div>{html.escape(l['text'])}</div>" + paras(l["interpretation"]))
    if h.get("notes"):
        parts.append("<h3>Anmerkungen</h3>" +
                     "".join(f"<p class=note>{html.escape(n['text'])}</p>" for n in h["notes"]))
OUT.write_text("\n".join(parts), encoding="utf-8")
print(f"OK: review → {OUT.relative_to(ROOT)} ({len(DATA)} hexagrams)")
```

- [ ] **Step 2: Generate + integrity-scan**

Run:
```bash
python3 scripts/build_review.py
python3 - <<'PY'
import json, re
h=json.load(open("data/hexagrams.json"))
issues=[]
for x in h:
    for fld in ("meaning","judgment","image"):
        if x[fld].count("(")!=x[fld].count(")"): issues.append(f"hex {x['number']} {fld}: unbalanced ()")
        if "*" in x[fld]: issues.append(f"hex {x['number']} {fld}: stray *")
assert not issues, issues
print("integrity OK")
PY
python3 -c "import os,webbrowser; webbrowser.open('file://'+os.path.abspath('scripts/sources/review.html'))"
```
Expected: `OK: review …`, `integrity OK`, and the page opens for the human scroll-through.

- [ ] **Step 3: Commit (script only)**

```bash
git add scripts/build_review.py
git commit -m "verify: full-corpus review.html artifact + integrity scan"
```

---

## Task 14: EN-delta translation

**Files:**
- Modify: `data/hexagrams.en.json`

- [ ] **Step 1: Compute the delta set**

Run:
```bash
python3 - <<'PY'
import json
de={x["number"]:x for x in json.load(open("data/hexagrams.json"))}
en={x["number"]:x for x in json.load(open("data/hexagrams.en.json"))}
todo=[]
for n,d in de.items():
    e=en.get(n,{})
    for fld in ("meaning","judgment","image"):
        if d[fld] and not e.get(fld+"_en"): todo.append((n,fld))
    if len(d["lines"])>len(e.get("lines",[])): todo.append((n,"lines[6]"))
    if d.get("notes") and len(e.get("notes",[]))<len(d["notes"]): todo.append((n,"notes"))
print(len(todo),"fields to translate:",todo[:40])
PY
```
Expected: a concrete list (the 6 meanings + hex 2 image + hex 1/2 seventh line + notes).

- [ ] **Step 2: Translate the delta (Wilhelm-EN style) and merge**

Dispatch parallel translation subagents (as the original EN was produced) for
each `(hexagram, field)` in the delta, producing `*_en` values matching the
established dignified/contemplative Cary-Baynes-adjacent register. Merge into
`data/hexagrams.en.json`, preserving structure; add `text_en` per note and
`position_en`/`text_en`/`interpretation_en` for the seventh line. Re-apply the
`»…«` normalization where English convention differs (EN uses `"…"`/`'…'` —
match the existing EN file's quote convention, not `»«`).

- [ ] **Step 3: Verify symmetry**

Run: `node scripts/test-kingwen.mjs`
Expected: PASS (DE/EN structural symmetry, including the new fields).

- [ ] **Step 4: Commit**

```bash
git add data/hexagrams.en.json
git commit -m "data(en): translate newly filled DE fields, seventh line, and notes"
```

---

## Task 15: DATA.md — update provenance

**Files:**
- Modify: `docs/DATA.md`

- [ ] **Step 1: Document the changes**

Update `docs/DATA.md`: Wilhelm text fields now sourced from Projekt-Gutenberg
(`scripts/scrape_gutenberg.py` → `scripts/sources/gutenberg_iging.json`),
Gutenberg-wins over `_archiv`; add the new `notes` field to the schema and the
seventh-line entry for hex 1 & 2; note the resolved gaps (the 6 meanings, hex 2
image, the Dorothea fix) and the repaired `image_association`. Keep it English
(canonical docs language).

- [ ] **Step 2: Commit**

```bash
git add docs/DATA.md
git commit -m "docs: DATA.md — Gutenberg provenance, notes field, resolved gaps"
```

---

## Task 16: Final verification pass + handoff

**Files:** none (verification)

- [ ] **Step 1: Run all automated gates**

```bash
cd /Users/Shared/code/yijing
python3 scripts/scrape_gutenberg.py --selftest
python3 scripts/build_data.py
python3 scripts/build_review.py
node scripts/test-kingwen.mjs
node --check web/app.js && node --check web/i18n.js
```
Expected: all pass; no WARN/assert failures.

- [ ] **Step 2: Hand off to the user for the browser spot-check (§7a)**

Ask the user to hard-reload (Cmd+Shift+R) and check hexagrams 1, 2, 5, 17:
paragraphs render; quotes consistent `»…«`; hex 5 "Dorothea"; the 6 once-empty
meanings show; hex 2 image shows; all-six-moving on hex 1/2 shows the seventh
line; the "Anmerkungen" block shows footnotes (Ikarus/Luzifer on hex 2). Also
scroll `scripts/sources/review.html`.

- [ ] **Step 3: Release step (after user approval — NOT part of the autonomous burst)**

`./scripts/sync-pages.sh` to mirror `web/` + `data/` into the `pages` branch.
Merge `data-correctness` → `main` per the user's preferred workflow.

---

## Self-review notes

- **Spec coverage:** scraper (§4.1) → Tasks 1-4; build merge + notes (§4.3) → Task 5; image_association (§4.4) → Task 6; guard + diff (§4.3) → Task 7; paragraph + seventh-line + notes rendering (§4.5) → Tasks 9-12; OCR fix-map (§4.6) → Task 3; EN delta (§4.7) → Task 14; verification (§7a) → Tasks 13, 16; DATA.md (§7.6) → Task 15. Sub-projects B & C explicitly excluded.
- **Known soft spots flagged for execution:** the `IMAGE_ASSOC_OVERRIDE` strings (Task 6) are to be refined per-hexagram before commit; the parser (Task 2) is tuned test-first against the cached fixtures and may need per-page tweaks during the full run (Task 4 Step 2). These are TDD-driven, not placeholders.
- **Type/name consistency:** `renderParagraphs`, `renderNotes`, `renderSeventhLine`, `noteTextForLang`, `load_gutenberg`, `assert_complete`, `write_diff_report`, `IMAGE_ASSOC_OVERRIDE` used consistently across tasks.
