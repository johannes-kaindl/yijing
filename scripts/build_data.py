#!/usr/bin/env python3
"""Konsolidiert die 64 Hexagramme aus den _archiv-Quellen nach data/hexagrams.json.

Quellen:
  - _archiv/Yijing_6 → Wilhelm-Texte (Urteil, Bild, Bedeutung, Linientexte)
  - _archiv/yijing_5 → chinesisches Schriftzeichen, Pinyin, lateinischer Name
  - IMAGE_SEEDS (unten) → kuratierte Bild-Seeds für das Meditationsbild

Trigramme werden aus der Binärdarstellung abgeleitet und mit reichen Stammdaten
(Familie, Natur, Jahreszeit, Himmelsrichtung) verknüpft.
"""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path

HEXAGRAM_COUNT = 64

ROOT = Path(__file__).resolve().parent.parent
ARCHIV = ROOT / "_archiv"
SRC_HEX_JSON = ARCHIV / "Yijing_6" / "yijing" / "resources" / "hexagram_json"
SRC_HEX_CSV = ARCHIV / "yijing_5" / "data" / "processed" / "hexagram_df.csv"
SRC_TRIGRAM_CSV = ARCHIV / "yijing_5" / "data" / "processed" / "trigram_df.csv"
SRC_GUTENBERG = ROOT / "scripts" / "sources" / "gutenberg_iging.json"
OUT_HEX = ROOT / "data" / "hexagrams.json"
OUT_TRIGRAMS = ROOT / "data" / "trigrams.json"
DIFF_REPORT = ROOT / "scripts" / "sources" / "gutenberg_diff_report.md"

# Bottom-to-top Binärstring → King-Wen-Nummer (1–64).
KING_WEN_BINARY = {
    1:  "111111", 2:  "000000", 3:  "100010", 4:  "010001",
    5:  "111010", 6:  "010111", 7:  "010000", 8:  "000010",
    9:  "111011", 10: "110111", 11: "111000", 12: "000111",
    13: "101111", 14: "111101", 15: "001000", 16: "000100",
    17: "100110", 18: "011001", 19: "110000", 20: "000011",
    21: "100101", 22: "101001", 23: "000001", 24: "100000",
    25: "100111", 26: "111001", 27: "100001", 28: "011110",
    29: "010010", 30: "101101", 31: "001110", 32: "011100",
    33: "001111", 34: "111100", 35: "000101", 36: "101000",
    37: "101011", 38: "110101", 39: "010100", 40: "001010",
    41: "110001", 42: "100011", 43: "111110", 44: "011111",
    45: "000110", 46: "011000", 47: "010110", 48: "011010",
    49: "101110", 50: "011101", 51: "100100", 52: "001001",
    53: "001011", 54: "110100", 55: "101100", 56: "001101",
    57: "011011", 58: "110110", 59: "010011", 60: "110010",
    61: "110011", 62: "001100", 63: "101010", 64: "010101",
}

# Lücken in yijing_5 für Hex 26 & 42 manuell ergänzen.
FALLBACK_NAMES = {
    26: {"chinese": "大畜", "pinyin": "dà chù", "latin": "Da Tschu"},
    42: {"chinese": "益", "pinyin": "yì", "latin": "I"},
}

# Inhalt, der in der Gutenberg-Ausgabe GENUIN fehlt — aus dem kanonischen
# Wilhelm-Text 1924 ergänzt (Provenienz dokumentiert). REVIEW-FLAG: vom
# Menschen gegenprüfen lassen. Hex 2 hat auf Gutenberg keine „Das Bild"-Sektion;
# das Bild-Orakel des Empfangenden ist hier kanonisch eingesetzt.
GAP_FILL = {
    (2, "image"): (
        "Die Erdbeschaffenheit ist Hingebung.\n"
        "So trägt der Edle in der Fülle seines Wesens die Außenwelt."
    ),
}

# Bild-Motive für das On-Device-Meditationsbild (Apple Image Playground, sketch).
# KEIN Nutzertext, nicht in der UI sichtbar — ein interner englischer Bild-Prompt je
# Hexagramm: EIN kurzes, distinktes Bildsubjekt (Tier/Pflanze/Objekt/Himmel), das die
# Essenz einfängt. Bewusst KEIN Apple FM mehr (zu unzuverlässig + ignoriert die Frage)
# und KEIN „ink-wash"-Zusatz (erzeugte nur generisches Berg-Wasser). Die native Schicht
# hängt einen Frage-abhängigen Modifikator (Tageszeit/Jahreszeit, web-seitig gewählt)
# an und schickt „<Motiv>, <Modifikator>" direkt an ImageCreator. Zeit-neutral gehalten,
# damit der Modifikator frei variieren kann; filter-sicher (keine harten Trigger, keine
# Menschen). Single source of truth: sync_image_seeds_to_en.py spiegelt nach
# data/hexagrams.en.json (sprach-unabhängig).
IMAGE_SEEDS = {
    1:  "a soaring eagle",
    2:  "a wide field of golden grain",
    3:  "a sprout breaking through cracked earth",
    4:  "a spring bubbling among rocks",
    5:  "a heron standing in shallow water",
    6:  "a river splitting around a great rock",
    7:  "wild geese flying in formation",
    8:  "many streams joining one river",
    9:  "a small cloud above a wide plain",
    10:  "a deer stepping across river stones",
    11:  "cherry blossoms beside a still pond",
    12:  "a bare tree on a barren hill",
    13:  "a ring of glowing lanterns",
    14:  "a great sun over golden hills",
    15:  "a low hill beneath a vast sky",
    16:  "a flock of birds rising together",
    17:  "ducklings swimming in a row",
    18:  "moss spreading over old stones",
    19:  "a winding path toward a lake",
    20:  "a hawk surveying from a high cliff",
    21:  "a shaft of light breaking through dark clouds",
    22:  "a peacock with open feathers",
    23:  "bare leaves falling from a tree",
    24:  "a single green shoot in dark soil",
    25:  "a fawn in a meadow",
    26:  "a bull resting beneath a mountain",
    27:  "a deer grazing in a clearing",
    28:  "a willow bending low over water",
    29:  "a dark river between steep cliffs",
    30:  "a glowing lantern in darkness",
    31:  "two birds courting on a branch",
    32:  "an ancient oak standing alone",
    33:  "a deer slipping into a forest",
    34:  "a strong stag on a high ridge",
    35:  "the sun rising over a wide plain",
    36:  "a lantern dimmed in thick fog",
    37:  "a bird's nest full of eggs",
    38:  "the sun and moon in one sky",
    39:  "a path blocked by fallen boulders",
    40:  "ice melting into a flowing stream",
    41:  "a single leaf drifting down",
    42:  "a tree heavy with ripe fruit",
    43:  "a wave cresting over rocks",
    44:  "a butterfly settling on a blossom",
    45:  "a great flock gathered at a lake",
    46:  "bamboo shoots rising from the earth",
    47:  "a dry cracked riverbed",
    48:  "an old stone well",
    49:  "new buds on an old bare branch",
    50:  "a bronze cauldron with rising steam",
    51:  "startled birds scattering from a tree",
    52:  "a still mountain peak",
    53:  "a pine growing from a cliff",
    54:  "cherry petals floating on water",
    55:  "a full harvest moon",
    56:  "a single lantern on a mountain path",
    57:  "wind rippling through tall grass",
    58:  "two otters playing in a lake",
    59:  "mist dissolving over water",
    60:  "a stream divided by stepping stones",
    61:  "a crane beside still water",
    62:  "a small bird above a great mountain",
    63:  "a stone bridge over a still river",
    64:  "a fox crossing thin ice",
}


def clean_text(s: str) -> str:
    return re.sub(r"[ \t]+", " ", (s or "").strip())


def join_text(value) -> str:
    if isinstance(value, list):
        return "\n".join(clean_text(str(p)) for p in value if str(p).strip())
    return clean_text(str(value or ""))


# ---------- Wilhelm-Texte aus yijing_6 -----------------------------------

def load_wilhelm_text(number: int) -> dict:
    path = SRC_HEX_JSON / f"hexagram_{number:02d}.json"
    try:
        with path.open(encoding="utf-8") as f:
            raw = json.load(f)
    except FileNotFoundError:
        raise SystemExit(f"Hexagramm-Quelldatei fehlt: {path}")
    except json.JSONDecodeError as e:
        raise SystemExit(f"JSON-Fehler in {path}: {e}")
    return normalize_text(raw, number)


def normalize_text(raw: dict, number: int) -> dict:
    if "hexagram" in raw:
        return _norm_v1(raw)
    return _norm_v2(raw)


def _norm_v1(raw: dict) -> dict:
    hx = raw.get("hexagram", {})
    return {
        "name_full": clean_text(hx.get("name", "")),
        "meaning": clean_text((hx.get("meaning", {}) or {}).get("description", "")),
        "judgment": clean_text((raw.get("judgment", {}) or {}).get("description", "")),
        "image": clean_text((raw.get("image", {}) or {}).get("description", "")),
        "lines": [
            {
                "position": clean_text(ln.get("position", "")),
                "text": clean_text(ln.get("text", "")),
                "interpretation": clean_text(ln.get("interpretation", "")),
            }
            for ln in raw.get("lines", []) or []
        ],
    }


def _norm_v2(raw: dict) -> dict:
    """Schema-Variante für Hex 16."""
    lines = []
    for ln in raw.get("lines", []) or []:
        parts = ln.get("text", []) or []
        if isinstance(parts, list) and parts:
            text = clean_text(parts[0])
            interp = "\n".join(clean_text(p) for p in parts[1:] if str(p).strip())
        else:
            text = clean_text(str(parts))
            interp = ""
        lines.append({
            "position": clean_text(ln.get("position", "")),
            "text": text,
            "interpretation": interp,
        })
    return {
        "name_full": clean_text(raw.get("title", "")),
        "meaning": join_text(raw.get("description", [])),
        "judgment": join_text((raw.get("judgment", {}) or {}).get("text", [])),
        "image": join_text((raw.get("image", {}) or {}).get("text", [])),
        "lines": lines,
    }


# ---------- Wilhelm-Texte aus Projekt-Gutenberg (kanonisch) --------------

def load_gutenberg() -> dict[int, dict]:
    """Geparste Gutenberg-Quelle (scripts/scrape_gutenberg.py). Kanonisch für
    die Wilhelm-Textfelder (meaning/judgment/image/lines/notes)."""
    if not SRC_GUTENBERG.exists():
        raise SystemExit(
            f"Gutenberg-Quelle fehlt: {SRC_GUTENBERG}\n"
            f"Erst `python3 scripts/scrape_gutenberg.py` ausführen.")
    raw = json.loads(SRC_GUTENBERG.read_text(encoding="utf-8"))
    return {int(k): v for k, v in raw.items()}


# ---------- chinesische Bezeichnungen aus yijing_5 -----------------------

def load_chinese_names() -> dict[int, dict]:
    out: dict[int, dict] = {}
    if not SRC_HEX_CSV.exists():
        return out
    with SRC_HEX_CSV.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            try:
                n = int(row["hexagram_number"])
            except (ValueError, KeyError):
                continue
            out[n] = {
                "chinese": (row.get("Schriftzeichen") or "").strip(),
                "pinyin": (row.get("Pīnyīn") or "").strip(),
                "latin": (row.get("title_name") or "").strip(),
            }
    return out


# ---------- Trigramme aus yijing_5 ---------------------------------------

# Bottom-to-top 3-Bit → Unicode-Symbol
TRIGRAM_BINARY_TO_SYMBOL = {
    "111": "☰",
    "110": "☱",
    "101": "☲",
    "100": "☳",
    "011": "☴",
    "010": "☵",
    "001": "☶",
    "000": "☷",
}


def load_trigrams() -> dict[str, dict]:
    """Mappt Symbol → Stammdaten."""
    if not SRC_TRIGRAM_CSV.exists():
        return {}
    out: dict[str, dict] = {}
    with SRC_TRIGRAM_CSV.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            sym = (row.get("symbol") or "").strip()
            if not sym:
                continue
            binary = next(
                (b for b, s in TRIGRAM_BINARY_TO_SYMBOL.items() if s == sym),
                None,
            )
            if binary is None:
                continue  # Unbekanntes Trigramm-Symbol in der CSV — überspringen.
            out[sym] = {
                "symbol": sym,
                "binary": binary,
                "name": (row.get("familie_zeichen") or "").strip(),       # 乾
                "pinyin": (row.get("familie_aussprache") or "").strip(),  # qián
                "family": (row.get("familie") or "").strip(),             # Vater
                "nature": (row.get("natur") or "").strip(),               # Himmel
                "season": (row.get("eh_saison") or "").strip(),
                "direction": (row.get("eh_richtung") or "").strip(),
                "associations": clean_text(row.get("trigramm_assoziationen") or ""),
            }
    return out


def trigrams_for(binary: str, trigrams: dict[str, dict]) -> dict:
    """Aus bottom-to-top Binärstring die zwei Trigramme bestimmen."""
    lower = binary[:3]
    upper = binary[3:]
    return {
        "below": dict(trigrams.get(TRIGRAM_BINARY_TO_SYMBOL[lower], {})),
        "above": dict(trigrams.get(TRIGRAM_BINARY_TO_SYMBOL[upper], {})),
    }


# Bild-Seeds werden nicht mehr aus yijing_3-Dateinamen abgeleitet, sondern
# kuratiert oben in IMAGE_SEEDS gepflegt (siehe dortigen Kommentar).


# ---------- Zusammenführen -----------------------------------------------

def build() -> None:
    if not SRC_HEX_JSON.exists():
        raise SystemExit(f"Quellordner fehlt: {SRC_HEX_JSON}")

    chinese = load_chinese_names()
    trigrams_db = load_trigrams()
    gutenberg = load_gutenberg()

    hexagrams = []
    for n in range(1, HEXAGRAM_COUNT + 1):
        binary = KING_WEN_BINARY[n]

        # Name (lateinisch/deutsch) weiterhin aus den _archiv-Quellen ableiten;
        # text dient zudem als Fallback für ein leeres Gutenberg-Feld.
        text = load_wilhelm_text(n)
        name_full = text["name_full"]
        m = re.match(r"^\d+\.?\s+(.+?)\s*/\s*(.+)$", name_full)
        latin_name = m.group(1).strip().rstrip(".").title() if m else ""
        german_name = m.group(2).strip() if m else name_full
        ch = chinese.get(n) or FALLBACK_NAMES.get(n) or {}

        # Wilhelm-Textfelder: Gutenberg gewinnt, Archiv nur als Fallback.
        g = gutenberg.get(n)
        if not g:
            raise SystemExit(f"Gutenberg-Eintrag fehlt für Hexagramm {n}")
        meaning = g["meaning"] or text["meaning"]
        judgment = g["judgment"] or text["judgment"]
        image = g["image"] or text["image"] or GAP_FILL.get((n, "image"), "")
        lines = g["lines"] or text["lines"]
        notes = g.get("notes", [])
        if not g["image"] and (n, "image") in GAP_FILL:
            print(f"   GAP_FILL: Hexagramm {n} 'image' aus kanonischem Wilhelm (REVIEW)")

        image_assoc = IMAGE_SEEDS.get(n, "")

        hexagrams.append({
            "number": n,
            "binary": binary,
            "unicode": chr(0x4DC0 + n - 1),
            "name_de": german_name,
            "name_latin": ch.get("latin") or latin_name,
            "name_chinese": ch.get("chinese", ""),
            "pinyin": ch.get("pinyin", ""),
            "trigrams": trigrams_for(binary, trigrams_db),
            "meaning": meaning,
            "judgment": judgment,
            "image": image,
            "image_association": image_assoc,
            "lines": lines,
            "notes": notes,
        })

    write_diff_report(hexagrams)   # vor dem Überschreiben — Vergleich mit altem File
    assert_complete(hexagrams)

    OUT_HEX.parent.mkdir(exist_ok=True)
    _write_json_atomic(OUT_HEX, hexagrams)
    print(f"OK: {len(hexagrams)} Hexagramme → {OUT_HEX.relative_to(ROOT)}")

    # Trigramm-Stammdaten separat (für UI-Tooltips)
    _write_json_atomic(OUT_TRIGRAMS, list(trigrams_db.values()))
    print(f"OK: {len(trigrams_db)} Trigramme → {OUT_TRIGRAMS.relative_to(ROOT)}")

    # Statistik
    with_img = sum(1 for h in hexagrams if h["image_association"])
    with_chinese = sum(1 for h in hexagrams if h["name_chinese"])
    with_notes = sum(1 for h in hexagrams if h["notes"])
    print(f"   Schriftzeichen: {with_chinese}/{HEXAGRAM_COUNT}, "
          f"Bild-Assoziationen: {with_img}/{HEXAGRAM_COUNT}, "
          f"Hexagramme mit Anmerkungen: {with_notes}")
    print("   Hinweis: für die geschlechtsneutrale Fassung danach "
          "`python3 scripts/apply_neutral.py` ausführen (ein Rebuild verwirft die *_neutral-Felder).")


def _write_json_atomic(target: Path, data) -> None:
    """Schreibt JSON über ein temporäres File und benennt am Ende um —
    so kann ein Abbruch mitten im Dump kein halbfertiges Ziel hinterlassen."""
    tmp = target.with_suffix(target.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(target)


def assert_complete(hexagrams: list[dict]) -> None:
    """Harte Vollständigkeits-/Sauberkeits-Garantie vor dem Schreiben."""
    problems = []
    for h in hexagrams:
        n = h["number"]
        for fld in ("meaning", "judgment", "image"):
            if not h[fld]:
                problems.append(f"hex {n}: leeres Feld '{fld}'")
        regular = [l for l in h["lines"] if "bedeutet das:" not in l["position"]]
        if len(regular) != 6:
            problems.append(f"hex {n}: {len(regular)} reguläre Linien (erwartet 6)")
        for i, l in enumerate(h["lines"]):
            for sub in ("position", "text"):
                if not l[sub]:
                    problems.append(f"hex {n} Linie {i}: leeres '{sub}'")
        if re.search(r"-\d+$", h.get("image_association", "")):
            problems.append(f"hex {n}: abgeschnittene image_association")
    if problems:
        raise SystemExit("assert_complete fehlgeschlagen:\n  " + "\n  ".join(problems))


def write_diff_report(new: list[dict]) -> None:
    """Nicht-blockierender Report: was ändert sich ggü. dem alten hexagrams.json."""
    if not OUT_HEX.exists():
        return
    old = {x["number"]: x for x in json.loads(OUT_HEX.read_text(encoding="utf-8"))}
    lines = ["# Gutenberg diff report", ""]
    changes = 0
    for h in new:
        o = old.get(h["number"], {})
        for fld in ("meaning", "judgment", "image"):
            a, b = (o.get(fld) or ""), h[fld]
            if a == b:
                continue
            tag = "FILLED" if not a else ("EMPTIED" if not b else "CHANGED")
            lines.append(f"- hex {h['number']} `{fld}` **{tag}** "
                         f"(alt {len(a)}c → neu {len(b)}c)")
            changes += 1
        if len(o.get("lines", [])) != len(h["lines"]):
            lines.append(f"- hex {h['number']} `lines` "
                         f"{len(o.get('lines', []))} → {len(h['lines'])}")
            changes += 1
    DIFF_REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"   Diff-Report → {DIFF_REPORT.relative_to(ROOT)} ({changes} Feldänderungen)")


if __name__ == "__main__":
    build()
