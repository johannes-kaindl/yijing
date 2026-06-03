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

# Bild-Seeds für das On-Device-Meditationsbild (Apple Image Playground). KEIN
# Nutzertext und nicht in der UI sichtbar — ein interner englischer Prompt-Seed je
# Hexagramm, aus dem die native Schicht per On-Device-LLM EIN konkretes Naturmotiv
# destilliert. Aus Trigramm-Natur (oben/unten) + Wilhelm-„Bild" kuratiert; jede
# Zeile trägt eine Yin/Yang-Spannung der Gegensätze (hoch/tief, hell/dunkel,
# Ruhe/Bewegung). Filter-sicher gehalten: nur gegenständliche Naturmotive, keine
# harten Trigger (Donner→„stir/motion", kein storm/war/blood/weapon), keine
# abstrakten Stimmungswörter (calm/serene), keine Menschen, kein Text.
# Single source of truth: scripts/sync_image_seeds_to_en.py spiegelt diese Werte
# nach data/hexagrams.en.json (der Seed ist sprach-unabhängig).
IMAGE_SEEDS = {
    1:  "Endless clear blue sky, sunrise, powerful rising energy, vast horizons, soaring birds, golden rays",
    2:  "Vast open plains under a wide sky, deep fertile soil, soft rolling fields, long quiet shadows, a receptive horizon",
    3:  "Dark rain clouds over young green reeds, a swollen stream pressing through stones, first sprouts in tangled grass, struggle before order",
    4:  "A clear spring welling at the foot of a still mountain, water finding its first path downhill, mist on a young slope, stillness above and motion below",
    5:  "High drifting clouds in a bright open sky, smooth water waiting below, soft light held back, patience before the rain",
    6:  "Open sky pulling upward while deep water sinks below, two currents drawing apart, a cold stream against bright heavens, distance and opposition",
    7:  "A deep hidden spring beneath broad fields, dark water gathered under the open earth, quiet strength held below the surface",
    8:  "Still water spreading over level ground, many streams flowing into one lake, reflections joining on the earth, gathering and union",
    9:  "A soft wind brushing across a wide bright sky, thin clouds gathering but no rain, tall grass bending lightly, small restraint over great force",
    10: "A bright open sky mirrored in a still lake below, high light and low water facing each other, careful steps along a quiet shore",
    11: "Warm earth rising to meet a clear sky, fields and heavens mingling, light flowing down and soil breathing up, fertile exchange",
    12: "A high sky drawing away from the heavy earth below, light and soil parting, a still pause between heaven and ground, standstill",
    13: "Warm firelight rising into an open sky, a glow climbing toward the heavens, shared light gathering, fellowship under one sun",
    14: "A bright sun high in a clear sky, light pouring over a wide land, golden radiance at the zenith, great abundance",
    15: "A quiet mountain resting low within broad fields, a high peak hidden beneath level earth, greatness held under the surface, modesty",
    16: "A bright stir rising from the open earth, the ground awakening with first movement, birds lifting over wide fields, gathering enthusiasm",
    17: "A gentle stir beneath a still lake, quiet water above moving depths, ripples following the first motion, evening rest after action",
    18: "A low wind winding beneath a still mountain, stale air stirring among old roots, a worn slope under slow weather, repair of decay",
    19: "Broad earth resting above a clear lake, high ground meeting still water, a fertile bank drawing near the shore, approach",
    20: "A wide wind sweeping over open fields, long grass rippling across the plain, a high view over the broad land, contemplation",
    21: "A sudden flash of light over restless dark ground, sharp glow above moving shadow, brightness meeting motion, biting through",
    22: "Warm firelight glowing at the foot of a still mountain, soft light gracing dark stone, a quiet peak above a gentle glow, grace",
    23: "A worn mountain resting on flat earth, loose stones slipping down a bare slope, a high peak crumbling toward the ground, splitting apart",
    24: "A first faint stir deep within the still earth, a single green shoot under cold soil, light returning at the turning point, renewal",
    25: "Open sky above a fresh stir in the fields, clouds moving over new growth, natural rain on innocent ground, spontaneity",
    26: "A vast sky held within a great mountain, bright heavens contained by still stone, immense force gathered and stored, taming power",
    27: "A quiet mountain above a stirring valley, still heights over moving roots, an open hollow between stone and motion, nourishment",
    28: "A swollen lake rising over slender trees, water pressing above bending wood, a heavy pool over thin reeds, a beam under strain",
    29: "Deep dark water flowing on without pause, a steady stream pressing through a narrow gorge, depth upon depth, the abyss repeated",
    30: "Bright light rising twice over the land, clinging radiance and clear glow, brightness doubled at dawn and dusk, clarity",
    31: "A still lake resting on a quiet mountaintop, water cupped in high stone, a soft pool above firm rock, mutual influence",
    32: "A long wind and rolling motion moving together over the hills, steady gusts across an open ridge, enduring movement, duration",
    33: "A high sky withdrawing above a still mountain, light retreating beyond the peak, cool air rising from firm stone, retreat",
    34: "A great stir high in a bright sky, powerful motion rolling through open heavens, strong wind over the summit, the power of the great",
    35: "The sun climbing over a broad horizon, growing light spreading across open fields, dawn rising on level earth, progress",
    36: "A dimmed light sinking beneath the earth, a faint glow buried under dark soil, a hidden ember below the surface, darkening of the light",
    37: "A warm wind rising from gentle firelight, glow and breeze moving outward from a hearth, light spreading within sheltered stone walls, the family",
    38: "Bright light above and still water below turning away from each other, warm light rising while a lake sinks, two opposites side by side, divergence",
    39: "Cold water gathered on a steep mountain, a stream blocked by high stone, deep pools before a hard slope, obstruction",
    40: "Fresh rain and clearing clouds rising over a mountain, water loosening from stone, a stream breaking free downhill, release and deliverance",
    41: "A still lake lying low beneath a great mountain, water drawn down below firm stone, a deep pool emptying upward, decrease",
    42: "A strong wind and a quick stir moving together over the fields, gusts and motion lifting new growth, swelling life, increase",
    43: "A full lake risen high against an open sky, water swelling toward the heavens, a brimming pool at the edge of breaking through, resolution",
    44: "A wide bright sky meeting a soft wind from below, light air rising into open heavens, an unexpected breeze beneath clear light, coming to meet",
    45: "A broad lake gathered above level earth, many waters collecting on the open plain, a full pool over fertile ground, gathering together",
    46: "Slender wood pushing up through soft earth, a young tree rising within the open ground, growth lifting toward light, pushing upward",
    47: "A dry lakebed above sunken water, a pool drained below cracked stone, water fallen away from the shore, exhaustion",
    48: "Clear water drawn up over deep wood, a cool spring rising through the roots, a steady well between stone and reed, the well",
    49: "Warm light glowing beneath a still lake, a warm glow within deep water, heat rising against a cool pool, change and renewal",
    50: "Steady firelight rising over slender wood, a warm glow above gathered reeds, a quiet light nourished from below, the vessel",
    51: "A doubled stir rolling through the dark hills, wave upon wave of sudden motion, the ground quickening twice, the arousing shock",
    52: "Two still mountains standing one behind the other, deep silence among high stone, motionless peaks at rest, keeping still",
    53: "A slender tree growing slowly on a still mountain, wood rising step by step over firm stone, patient height above quiet rock, gradual development",
    54: "A quick stir above a still lake, motion rippling over quiet water, a sudden movement at the water's edge, the marrying maiden",
    55: "Bright light and rolling motion meeting at their height, a flash above a glowing field, fullness of noon over moving shadow, abundance",
    56: "A small firelight on a great mountainside, a lone ember on cold high stone, brief light against an enduring peak, the wanderer",
    57: "Soft winds following one upon another over open ground, long grass bending in steady gusts, gentle air everywhere, the penetrating wind",
    58: "Two still lakes resting side by side, joined pools reflecting an open sky, water meeting water at a quiet rim, the joyous",
    59: "A steady wind moving over deep water, ripples scattering across a broad stream, mist dissolving above the current, dispersion",
    60: "Clear water held above a still lake, a measured stream filling a quiet pool, a banked shore between depth and surface, limitation",
    61: "A soft wind passing over a still lake, breath moving above quiet water, a gentle ripple from within, inner truth",
    62: "A small stir above a great still mountain, faint motion over firm stone, a low flight of birds past a high peak, small exceeding",
    63: "Cool water resting above warm light, a stream over a steady glow, wet and dry held in balance, after completion",
    64: "Warm light poised above cool dark water, a glow not yet meeting the stream below, bright above and deep below, the moment before completion",
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
