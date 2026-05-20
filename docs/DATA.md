# Daten-Modell

## Übersicht

Zwei JSON-Dateien in `data/`:

| Datei | Inhalt | Größe |
|---|---|---|
| `hexagrams.json` | 64 Hexagramme mit Wilhelm-Texten, Trigrammen, Bild-Assoziationen | ~580 KB |
| `trigrams.json` | 8 Trigramme als Stammdaten (Familie, Natur, Jahreszeit, …) | ~3 KB |

Beide werden vom Build-Skript `scripts/build_data.py` aus den
`_archiv/`-Quellen generiert und gehören zum Commit.

## `data/hexagrams.json`

Array von 64 Objekten, indexiert nach King-Wen-Reihenfolge (`number`
1–64). Strukturschema pro Objekt:

```json
{
  "number": 1,
  "binary": "111111",
  "unicode": "䷀",
  "name_de": "DAS SCHÖPFERISCHE",
  "name_latin": "Kien",
  "name_chinese": "乾",
  "pinyin": "qián",
  "trigrams": {
    "above": {
      "symbol": "☰",
      "binary": "111",
      "name": "乾",
      "pinyin": "qián",
      "family": "Vater",
      "nature": "Himmel",
      "season": "Sommer",
      "direction": "S",
      "associations": "Ausdehnungsenergie; das wärmende Prinzip…"
    },
    "below": { /* analog */ }
  },
  "meaning": "Das Zeichen besteht aus sechs ungeteilten Strichen…",
  "judgment": "Das Schöpferische wirkt erhabenes Gelingen…",
  "image": "Des Himmels Bewegung ist kraftvoll…",
  "image_association": "Endless clear blue sky, sunrise, powerful rising energy…",
  "lines": [
    {
      "position": "Anfangs eine Neun bedeutet:",
      "text": "Verdeckter Drache. Handle nicht.",
      "interpretation": "Der Drache hat in China eine ganz andere…"
    },
    /* 5 weitere */
  ]
}
```

### Feldreferenz

| Feld | Quelle | Beschreibung |
|---|---|---|
| `number` | berechnet | King-Wen-Nummer 1–64 |
| `binary` | hardcoded | 6 Zeichen, bottom-to-top, 1 = Yang, 0 = Yin |
| `unicode` | `chr(0x4DC0 + n - 1)` | Hexagramm-Symbol aus Unicode-Block |
| `name_de` | `Yijing_6` | Deutscher Name (z.B. „DAS SCHÖPFERISCHE") |
| `name_latin` | `yijing_5` mit Fallback | Lateinische Transliteration (z.B. „Kien") |
| `name_chinese` | `yijing_5` | Chinesisches Schriftzeichen (z.B. 乾) |
| `pinyin` | `yijing_5` | Pīnyīn (z.B. „qián") |
| `trigrams.above` / `.below` | abgeleitet aus `binary` + `trigrams.json` | siehe unten |
| `meaning` | `Yijing_6` | Wilhelm: Einleitung / Bedeutung |
| `judgment` | `Yijing_6` | Wilhelm: „Das Urteil" inkl. Kommentar |
| `image` | `Yijing_6` | Wilhelm: „Das Bild" inkl. Kommentar |
| `image_association` | `yijing_3` (Dateinamen) | Atmosphärische Bildstichworte (19/64) |
| `lines[i]` | `Yijing_6` | Wandelnde Linien — Position, Spruch, Kommentar |

## `data/trigrams.json`

Array von 8 Trigramm-Objekten. Format wie das `trigrams.above`/`below`-
Sub-Objekt in `hexagrams.json`. Wird primär für UI-Tooltips genutzt.

```json
[
  {
    "symbol": "☰",
    "binary": "111",
    "name": "乾",
    "pinyin": "qián",
    "family": "Vater",
    "nature": "Himmel",
    "season": "Sommer",
    "direction": "S",
    "associations": "Ausdehnungsenergie; das wärmende Prinzip…"
  }
]
```

## Konventionen

### Binär-Notation

Wir verwenden **bottom-to-top, 1 = Yang, 0 = Yin**, als 6-stelliger String:

- `"111111"` = sechs Yang-Linien = Hexagramm 1 (Kien/Schöpferisches)
- `"000000"` = sechs Yin-Linien = Hexagramm 2 (Kun/Empfangendes)
- `"100010"` = Yang unten, dann fünf Linien aufwärts = Hexagramm 3 (Tschun)

Diese Konvention ist im Code als `BINARY_TO_KING_WEN`-Tabelle in
`app.js` und im Build-Skript als `KING_WEN_BINARY` (umgekehrt) hinterlegt.
Beide sind die kanonische Wahrheit; Änderungen müssen synchronisiert werden.

### King-Wen vs. binär

Die King-Wen-Reihenfolge (1–64) ist **nicht** binär. Sie folgt einer
~3000 Jahre alten Anordnung. Die Unicode-Reihenfolge `U+4DC0…U+4DFF`
folgt der King-Wen-Reihenfolge — daher: `unicode = chr(0x4DC0 + number - 1)`.

Im Archivierten Code (`_archiv/Yijing_6/yijing/core/oracle.py`) war ein
Bug: `to_binary_number()+1` wurde als Hexagrammnummer behandelt. Das ist
**falsch** — eine Lookup-Tabelle ist nötig.

### Schema-Varianten in den Quellen

`_archiv/Yijing_6/yijing/resources/hexagram_json/hexagram_16.json` weicht
vom Schema der anderen 63 Hexagramme ab (kein `hexagram`-Wrapper, andere
Feldnamen, Texte als String-Arrays statt als ein String). Das Build-Skript
normalisiert beide Varianten in `normalize_v1()` / `normalize_v2()`.

Andere bekannte Unregelmäßigkeiten:

- Hexagramme 26 und 42 fehlen in `_archiv/yijing_5/data/processed/
  hexagram_df.csv`. Schriftzeichen und Pīnyīn sind im Build-Skript als
  `FALLBACK_NAMES`-Konstante manuell ergänzt.
- Nur 19 von 64 Hexagrammen haben Bild-Assoziationen in `_archiv/yijing_3/`.
  Die meisten Bilder dort haben `IMG_XXXX`-Dateinamen ohne semantischen
  Prompt.

## Quellen-Lizenz

- **Wilhelm-Texte** (`meaning`, `judgment`, `image`, `lines[].text`,
  `lines[].interpretation`): aus Richard Wilhelm, *I Ging — Das Buch der
  Wandlungen*, Erstausgabe 1924. Wilhelm starb 1930 — die Übersetzung ist
  in Deutschland seit 2001 gemeinfrei (70 Jahre p.m.a.).
- **Chinesische Bezeichnungen und Pīnyīn**: aus Wikipedia / Wikitionary
  bzw. aus dem ursprünglichen chinesischen Text — Public Domain als
  historische Quelle (>2000 Jahre alt).
- **Trigramm-Stammdaten**: aus Standardliteratur (Wilhelm,
  Vogelmann, etc.). Faktisch.
- **Bild-Assoziationen** (19 Stück): selbst erstellt, eigene Prompts.
