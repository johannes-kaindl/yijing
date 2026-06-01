#!/usr/bin/env python3
"""Scrapes Richard Wilhelm's I Ging (Projekt-Gutenberg) into a canonical
source asset for build_data.py. Stdlib only — no third-party deps.

Source:  https://projekt-gutenberg.org/authors/richard-wilhelm/books/i-ging/
Chapters 3..66 map to the 64 hexagrams (chapter number != hexagram number;
the hexagram number is parsed from the page heading). Output keyed by
hexagram number -> scripts/sources/gutenberg_iging.json.

Block model (verified against the cached fixtures):
  <h2 class="title">      hexagram name ("1. KIEN / DAS SCHOEPFERISCHE")
  <p class="...center..."> oracle / heading / verse (trigram lines, the
                           Judgment verse, DAS BILD, the Image verse,
                           "Die Einzelnen Linien", each line position + text)
  <p class="">            commentary prose
A commentary <p> whose text is wholly enclosed in (...) is a footnote.

Usage:
  python3 scrape_gutenberg.py            # build from cache (fetch missing), write JSON
  python3 scrape_gutenberg.py --refetch  # re-fetch every page
  python3 scrape_gutenberg.py --selftest # parse cached hex 1 & 2 and assert
"""
from __future__ import annotations

import html
import json
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "scripts" / "sources" / ".html_cache"
OUT = ROOT / "scripts" / "sources" / "gutenberg_iging.json"
BASE = "https://projekt-gutenberg.org/authors/richard-wilhelm/books/i-ging/chapter/{}"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
CHAPTERS = range(3, 67)  # 64 hexagram pages

# Known OCR / scan artifacts in the public-domain source — conservative,
# only unambiguous fixes. "Gutenberg wins" without importing scan errors.
OCR_FIXES = {
    "das Schöpferisch,": "das Schöpferische,",  # trigram line, missing final e
    "Dorotbea": "Dorothea",                      # Goethe, Hermann und Dorothea
    "Kungtse::": "Kungtse:",
    "DIE WIEDERKEHRT": "DIE WIEDERKEHR",
    "DAS HAFTENE": "DAS HAFTENDE",
    # Single-word OCR glitches, confirmed against the older _archiv extraction:
    "seIber": "selber",                          # capital-I for l (hex 8)
    "Fa11": "Fall",                              # digit-ones for ll (hex 8)
    "der Denen moralischen": "der eigenen moralischen",  # hex 53
    "treiben laßt": "treiben läßt",              # missing umlaut (hex 54)
    "ober Dschen": "oben Dschen",                # hex 16 trigram line (also fixes the skip)
    # digit-for-letter glitches surfaced by the read-through audit (1->l, 9->fl):
    "A1s": "Als", "a1s": "als",                 # hex 5,7,16,22,32,37,50,54,56,60
    "al1er": "aller",                            # hex 52, 59
    "al1mählichen": "allmählichen",             # hex 64
    "al1mahlich": "allmählich",                 # hex 58
    "gänz1ich": "gänzlich",                      # hex 37
    "p9egen": "pflegen",                         # hex 7 (fl -> 9)
    "tei1s": "teils",                            # hex 48
}


def apply_ocr(s: str) -> str:
    for bad, good in OCR_FIXES.items():
        s = s.replace(bad, good)
    return s

NAME_RE = re.compile(r"^\s*(\d{1,2})\s*\.?\s+(.+?)\s*/\s*(.+)$")
# A changing-line position marker: an ordinal phrase up to "bedeutet:" — the
# group(2) " das" variant marks the hex 1/2 all-moving (seventh) line. group(3)
# captures any line text that sits in the same paragraph as the marker.
POS_RE = re.compile(
    r"^(?:[O○•*○]\s+)?"  # tolerate a stray leading OCR marker (e.g. "O Sechs…")
    r"((?:Anfangs|Neun|Sechs|Oben|Oberste|Wenn lauter)\b.{0,45}?bedeutet( das)?:)\s*(.*)$",
    re.S | re.I,
)
TRIGRAM_RE = re.compile(r"^(oben|unten)\b", re.I)
HEAD_BILD = "DAS BILD"
HEAD_LINES = "Die Einzelnen Linien"


# ---------- fetch + cache -------------------------------------------------

def fetch(ch: int, refetch: bool = False) -> str:
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"chapter{ch}.html"
    if f.exists() and not refetch:
        return f.read_text(encoding="utf-8")
    url = BASE.format(ch)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=30) as r:
            text = r.read().decode("utf-8")
    except Exception:
        # Fallback to curl — uses the system trust store, so it works behind a
        # TLS-intercepting proxy where Python's verification fails.
        text = subprocess.run(
            ["curl", "-sSL", "-A", UA, url],
            capture_output=True, text=True, timeout=60, check=True,
        ).stdout
    if "book-reader__chapter-content-wrapper" not in text:
        raise SystemExit(f"chapter {ch}: empty or unexpected response")
    f.write_text(text, encoding="utf-8")
    time.sleep(1.0)  # polite
    return text


# ---------- block extraction ---------------------------------------------

def strip_tags(s: str) -> str:
    """Inline tags -> text; <br> -> newline; collapse spaces but keep newlines."""
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r" *\n *", "\n", s)
    # A single source block is never a paragraph break: collapse its internal
    # multi-line gaps (from <br><br>) to single line breaks. Paragraph breaks
    # (\n\n) come only from joining separate blocks (see _join_paras).
    s = re.sub(r"\n{2,}", "\n", s)
    return s.strip()


def content_wrapper(raw: str) -> str:
    """Isolate the first chapter content block (dedupe the reading-mode copy)."""
    key = "book-reader__chapter-content-wrapper"
    i = raw.find(key)
    if i < 0:
        raise ValueError("content wrapper not found")
    j = raw.find(key, i + 1)
    return raw[i: j if j > 0 else len(raw)]


def blocks(seg: str):
    """Yield (kind, text) in document order. kind in {'h2','center','prose'}."""
    for tag, attrs, inner in re.findall(r"<(h2|p)\b([^>]*)>(.*?)</\1>", seg, re.S):
        txt = apply_ocr(strip_tags(inner))  # fix OCR before parsing (e.g. trigram skip)
        if not txt:
            continue
        if tag == "h2":
            yield "h2", txt
        else:
            mcls = re.search(r'class="([^"]*)"', attrs)
            cls = mcls.group(1) if mcls else ""
            yield ("center" if "center" in cls else "prose"), txt


# ---------- page parser ---------------------------------------------------

def _is_note(t: str) -> bool:
    t = t.strip()
    return t.startswith("(") and t.endswith(")")


def parse_page(raw: str) -> dict:
    bl = list(blocks(content_wrapper(raw)))
    h2 = next((t for k, t in bl if k == "h2"), "")
    h2_first = h2.split("\n")[0].strip()  # alt-names (e.g. hex 57) sit on a 2nd line
    m = NAME_RE.match(h2_first)
    if not m:
        raise ValueError(f"unparseable heading: {h2!r}")
    number, name_rom, name_de = int(m.group(1)), m.group(2).strip(), m.group(3).strip()

    meaning: list[str] = []
    judg_v: list[str] = []
    judg_p: list[str] = []
    img_v: list[str] = []
    img_p: list[str] = []
    lines: list[dict] = []
    notes: list[dict] = []
    section = "pre"          # pre -> meaning -> judgment -> image -> lines
    judg_done = img_done = False
    cur: dict | None = None

    for k, t in bl:
        if k == "h2":
            continue
        # section-switching headings (capitalization varies across pages)
        tl = t.strip().lower()
        if tl == HEAD_BILD.lower():
            section = "image"
            continue
        if tl == HEAD_LINES.lower():
            section = "lines"
            cur = None
            continue
        # skip trigram lines (oben.../unten...) at the top
        if section in ("pre", "meaning") and k == "center" and TRIGRAM_RE.match(t):
            section = "meaning"
            continue
        # lines section
        if section == "lines":
            if k == "prose" and _is_note(t):   # footnote attached to the current line
                notes.append({"anchor": f"line:{len(lines)}", "text": t})
                continue
            pm = POS_RE.match(t)               # position marker (center OR prose)
            if pm:
                cur = {"position": pm.group(1).strip(), "text": [], "interpretation": [],
                       "seventh": bool(pm.group(2)), "pverse": False}
                if pm.group(3).strip():        # line text in the same paragraph
                    cur["text"].append(pm.group(3).strip())
                lines.append(cur)
                continue
            if cur is not None:
                if k == "center":
                    (cur["text"] if not cur["interpretation"] else cur["interpretation"]).append(t)
                    cur["pverse"] = False
                else:  # prose — normally commentary; but a run of short prose right
                       # after the position on a center-less line is the verse text
                    first = not cur["text"] and not cur["interpretation"]
                    if first and len(t) <= 140:
                        cur["pverse"] = True
                    if cur["pverse"] and not cur["interpretation"] and len(t) <= 140:
                        cur["text"].append(t)
                    else:
                        cur["pverse"] = False
                        cur["interpretation"].append(t)
            continue
        # footnotes anywhere in meaning/judgment/image prose
        if k == "prose" and _is_note(t):
            notes.append({"anchor": section if section != "pre" else "meaning",
                          "text": t})
            continue
        # body accumulation
        if section in ("pre", "meaning"):
            if k == "prose":
                section = "meaning"
                meaning.append(t)
            else:  # first centered verse after the meaning -> judgment
                section = "judgment"
                judg_v.append(t)
        elif section == "judgment":
            if k == "prose":
                judg_done = True
                judg_p.append(t)
            elif not judg_done:
                judg_v.append(t)
            else:
                judg_p.append(t)
        elif section == "image":
            if k == "prose":
                img_done = True
                img_p.append(t)
            elif not img_done:
                img_v.append(t)
            else:
                img_p.append(t)

    return {
        "number": number, "name_romanized": name_rom, "name_de": name_de,
        "_meaning": meaning, "_judg_v": judg_v, "_judg_p": judg_p,
        "_img_v": img_v, "_img_p": img_p, "_lines": lines, "_notes": notes,
    }


# ---------- normalization + record assembly ------------------------------

def normalize(s: str) -> str:
    # OCR fixes are applied earlier in blocks(); here only quote normalization.
    # straight double quotes -> German guillemets (paired)
    out, open_q = [], True
    for ch in s:
        if ch == '"':
            out.append("»" if open_q else "«")
            open_q = not open_q
        else:
            out.append(ch)
    return "".join(out).strip()


def _join_verse(parts: list[str]) -> str:
    return "\n".join(normalize(p) for p in parts if p.strip())


def _join_paras(parts: list[str]) -> str:
    return "\n\n".join(normalize(p) for p in parts if p.strip())


def _combine(verse: str, prose: str) -> str:
    return "\n\n".join(x for x in (verse, prose) if x)


def _note_text(t: str) -> str:
    t = re.sub(r"^\(\*?\s*", "", t).rstrip()
    t = re.sub(r"\)\s*$", "", t)
    return normalize(t.strip())


def finalize(p: dict) -> dict:
    lines = []
    for l in p["_lines"]:
        lines.append({
            "position": normalize(l["position"]),
            "text": _join_verse(l["text"]),
            "interpretation": _join_paras(l["interpretation"]),
        })
    notes = []
    for n in p["_notes"]:
        txt = _note_text(n["text"])
        if txt:
            notes.append({"anchor": n["anchor"], "marker": "*", "text": txt})
    return {
        "number": p["number"],
        "name_romanized": p["name_romanized"],
        "name_de": normalize(p["name_de"]),
        "meaning": _join_paras(p["_meaning"]),
        "judgment": _combine(_join_verse(p["_judg_v"]), _join_paras(p["_judg_p"])),
        "image": _combine(_join_verse(p["_img_v"]), _join_paras(p["_img_p"])),
        "lines": lines,
        "notes": notes,
    }


# ---------- full build + validation --------------------------------------

def build_all(refetch: bool = False) -> dict:
    out: dict[int, dict] = {}
    for ch in CHAPTERS:
        rec = finalize(parse_page(fetch(ch, refetch)))
        n = rec["number"]
        if n in out:
            raise SystemExit(f"duplicate hexagram {n} (chapter {ch})")
        out[n] = rec
    missing = [n for n in range(1, 65) if n not in out]
    if missing:
        raise SystemExit(f"missing hexagrams: {missing}")
    # Hard structural failures
    for n, r in out.items():
        if not r["judgment"]:
            raise SystemExit(f"hex {n}: empty judgment")
        regular = [l for l in r["lines"] if "bedeutet das:" not in l["position"]]
        if len(regular) != 6:
            raise SystemExit(f"hex {n}: {len(regular)} regular lines (expected 6)")
    for n in (1, 2):
        if not any("bedeutet das:" in l["position"] for l in out[n]["lines"]):
            raise SystemExit(f"hex {n}: missing all-moving (seventh) line")
    # Soft: the Gutenberg edition genuinely lacks a "DAS BILD" section for some
    # hexagrams (e.g. hex 2). Report — build_data fills these from canonical Wilhelm.
    no_image = [n for n, r in out.items() if not r["image"]]
    if no_image:
        print(f"   NOTE: no image section on Gutenberg for hexagrams {no_image} "
              f"(filled in build_data via GAP_FILL)")
    return {str(n): out[n] for n in sorted(out)}


def main() -> None:
    refetch = "--refetch" in sys.argv
    data = build_all(refetch)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK: {len(data)} hexagrams -> {OUT.relative_to(ROOT)}")


# ---------- self-test (cached hex 1 & 2) ---------------------------------

def _selftest() -> None:
    p1 = parse_page(fetch(3))
    p2 = parse_page(fetch(12))
    assert p1["number"] == 1, p1["number"]
    assert p1["name_de"].upper().startswith("DAS SCHÖPFERISCHE"), p1["name_de"]
    assert p2["number"] == 2, p2["number"]

    f1 = finalize(p1)
    f2 = finalize(p2)
    # 6 regular + 1 seventh line for hex 1 & 2
    sev1 = [l for l in p1["_lines"] if l["seventh"]]
    sev2 = [l for l in p2["_lines"] if l["seventh"]]
    assert len(p1["_lines"]) == 7 and len(sev1) == 1, [len(p1["_lines"]), len(sev1)]
    assert len(p2["_lines"]) == 7 and len(sev2) == 1, [len(p2["_lines"]), len(sev2)]
    assert "lauter Neunen" in sev1[0]["position"], sev1[0]["position"]
    assert "lauter Sechsen" in sev2[0]["position"], sev2[0]["position"]
    # hex 1 has a DAS BILD section; hex 2 genuinely lacks one on Gutenberg
    # (filled from canonical Wilhelm in build_data) — so f2 image is empty here.
    assert f1["image"], "hex 1 image empty"
    assert not f2["image"], "hex 2 unexpectedly has an image on Gutenberg"
    # quotes normalized
    assert '"' not in f1["judgment"] and '"' not in f1["meaning"], "straight quotes remain"
    assert f1["lines"][0]["position"].startswith("Anfangs eine Neun"), f1["lines"][0]["position"]
    # footnotes captured, cleaned, and not left in the body
    assert any("Zeus" in n["text"] for n in f1["notes"]), "hex1 Zeus footnote missing"
    assert any(("Luzifer" in n["text"] or "Ikarus" in n["text"]) for n in f2["notes"]), \
        "hex2 Ikarus/Luzifer footnote missing"
    assert all(n["text"] and not n["text"].startswith("(") for n in f1["notes"]), "unclean note"
    print("selftest OK")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
    else:
        main()
