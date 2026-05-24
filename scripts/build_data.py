#!/usr/bin/env python3
"""Konsolidiert die 64 Hexagramme aus den _archiv-Quellen nach data/hexagrams.json.

Quellen:
  - _archiv/Yijing_6 → Wilhelm-Texte (Urteil, Bild, Bedeutung, Linientexte)
  - _archiv/yijing_5 → chinesisches Schriftzeichen, Pinyin, lateinischer Name
  - _archiv/yijing_3 → Bild-Assoziationen (Prompt-Strings aus Dateinamen)

Trigramme werden aus der Binärdarstellung abgeleitet und mit reichen Stammdaten
(Familie, Natur, Jahreszeit, Himmelsrichtung) verknüpft.
"""

from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from pathlib import Path

HEXAGRAM_COUNT = 64

ROOT = Path(__file__).resolve().parent.parent
ARCHIV = ROOT / "_archiv"
SRC_HEX_JSON = ARCHIV / "Yijing_6" / "yijing" / "resources" / "hexagram_json"
SRC_HEX_CSV = ARCHIV / "yijing_5" / "data" / "processed" / "hexagram_df.csv"
SRC_TRIGRAM_CSV = ARCHIV / "yijing_5" / "data" / "processed" / "trigram_df.csv"
SRC_IMAGES = ARCHIV / "yijing_3"
OUT_HEX = ROOT / "data" / "hexagrams.json"
OUT_TRIGRAMS = ROOT / "data" / "trigrams.json"

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


# ---------- Bild-Assoziationen aus yijing_3 ------------------------------

def load_image_prompts() -> dict[int, str]:
    out: dict[int, set[str]] = defaultdict(set)
    if not SRC_IMAGES.exists():
        return {}
    for d in SRC_IMAGES.iterdir():
        if not d.is_dir():
            continue
        m = re.match(r"hexagram_(\d+)$", d.name)
        if not m:
            continue
        n = int(m.group(1))
        for f in d.iterdir():
            if f.suffix.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
                continue
            name = f.stem
            if re.match(r"^IMG_\d+$", name, re.IGNORECASE):
                continue
            cleaned = re.sub(r"\s*p(-\d+)?\s*$", "", name, flags=re.IGNORECASE).strip()
            if cleaned and not re.match(r"^IMG_", cleaned, re.IGNORECASE):
                # Normalisiere die Großschreibung
                cleaned = cleaned[0].upper() + cleaned[1:]
                out[n].add(cleaned)
    # Pro Hexagramm den längsten / vollständigsten Prompt wählen (mehr Substanz).
    # sorted() macht die Auswahl deterministisch — ohne diesen Sort entscheidet
    # bei gleich langen Kandidaten die Set-Iteration, was zwischen Runs wechseln
    # kann.
    return {n: max(sorted(prompts), key=len) for n, prompts in out.items()}


# ---------- Zusammenführen -----------------------------------------------

def build() -> None:
    if not SRC_HEX_JSON.exists():
        raise SystemExit(f"Quellordner fehlt: {SRC_HEX_JSON}")

    chinese = load_chinese_names()
    trigrams_db = load_trigrams()
    image_prompts = load_image_prompts()

    hexagrams = []
    for n in range(1, HEXAGRAM_COUNT + 1):
        text = load_wilhelm_text(n)
        binary = KING_WEN_BINARY[n]

        # Name aufbereiten — meistens "1. KIEN / DAS SCHÖPFERISCHE", manchmal
        # ohne Punkt ("26 DA TSCHU / ...") oder mit Hilfspunkt ("42 I. / ...").
        name_full = text["name_full"]
        m = re.match(r"^\d+\.?\s+(.+?)\s*/\s*(.+)$", name_full)
        latin_name = m.group(1).strip().rstrip(".").title() if m else ""
        german_name = m.group(2).strip() if m else name_full

        ch = chinese.get(n) or FALLBACK_NAMES.get(n) or {}

        hexagrams.append({
            "number": n,
            "binary": binary,
            "unicode": chr(0x4DC0 + n - 1),
            "name_de": german_name,
            "name_latin": ch.get("latin") or latin_name,
            "name_chinese": ch.get("chinese", ""),
            "pinyin": ch.get("pinyin", ""),
            "trigrams": trigrams_for(binary, trigrams_db),
            "meaning": text["meaning"],
            "judgment": text["judgment"],
            "image": text["image"],
            "image_association": image_prompts.get(n, ""),
            "lines": text["lines"],
        })

    OUT_HEX.parent.mkdir(exist_ok=True)
    _write_json_atomic(OUT_HEX, hexagrams)
    print(f"OK: {len(hexagrams)} Hexagramme → {OUT_HEX.relative_to(ROOT)}")

    # Trigramm-Stammdaten separat (für UI-Tooltips)
    _write_json_atomic(OUT_TRIGRAMS, list(trigrams_db.values()))
    print(f"OK: {len(trigrams_db)} Trigramme → {OUT_TRIGRAMS.relative_to(ROOT)}")

    # Statistik
    with_img = sum(1 for h in hexagrams if h["image_association"])
    with_chinese = sum(1 for h in hexagrams if h["name_chinese"])
    print(f"   Schriftzeichen: {with_chinese}/{HEXAGRAM_COUNT}, "
          f"Bild-Assoziationen: {with_img}/{HEXAGRAM_COUNT}")


def _write_json_atomic(target: Path, data) -> None:
    """Schreibt JSON über ein temporäres File und benennt am Ende um —
    so kann ein Abbruch mitten im Dump kein halbfertiges Ziel hinterlassen."""
    tmp = target.with_suffix(target.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(target)


if __name__ == "__main__":
    build()
