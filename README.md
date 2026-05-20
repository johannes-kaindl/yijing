# Yijing Orakel

Schlankes I-Ging-Orakel als Static-Site. Drei-Münzen-Wurf im Browser,
Wilhelm-Übersetzung aller 64 Hexagramme inkl. Urteil, Bild, Bedeutung,
wandelnde Linien. Mit optionaler KI-Deutung über **lokale LLM-Server**
(Ollama oder OpenAI-kompatibel, z.&nbsp;B. MLX / LM Studio).

## Starten

```bash
./serve.sh
```

Öffnet `http://localhost:8765/web/index.html` automatisch.

> `index.html` lädt `data/hexagrams.json` per `fetch()`, daher ist ein
> kleiner HTTP-Server nötig — `file://` würde an CORS scheitern.

## Funktionen

- **Drei-Münzen-Methode** mit korrekter Verteilung (1/8 : 3/8 : 3/8 : 1/8)
- **Ursprungs- und Zielbild** bei wandelnden Linien
- **Wilhelm-Übersetzung** (Urteil, Bild, Bedeutung, alle 6 Linientexte)
- **Chinesisches Schriftzeichen + Pīnyīn** pro Hexagramm
- **Trigramme** mit Familie, Natur, Jahreszeit, Himmelsrichtung und Assoziationen
- **Bildmeditation** (atmosphärische Stichworte) für 19 Hexagramme
- **KI-Interpretation** via lokalem LLM-Server (optional)
- **Verlauf** der letzten 20 Würfe (lokal im Browser)

## LLM-Anbindung

Klick auf das ⚙-Symbol oben links. Im Settings-Modal kannst du beliebig
viele Endpunkte konfigurieren:

| Typ | URL-Beispiel | Hinweis |
|---|---|---|
| **Ollama** | `http://localhost:11434` | Native API, nutzt `/api/tags` und `/api/chat` |
| **OpenAI-kompatibel** | `http://localhost:8080/v1` | Für MLX-Server, LM Studio, vLLM, OpenClaw, … |

Pro Endpunkt: Name, Typ, URL, optional API-Key. Modelle werden automatisch
gelistet. Die Auswahl wird pro Wurf in der UI getroffen.

### CORS

Die Web-App ruft die LLM-Server **direkt aus dem Browser** auf. Beide
Seiten müssen CORS erlauben, sonst blockt der Browser.

**Ollama:** Vor dem Start exportieren:

```bash
export OLLAMA_ORIGINS="http://localhost:8765"
ollama serve
```

oder permanent (macOS):

```bash
launchctl setenv OLLAMA_ORIGINS "http://localhost:8765"
```

**MLX/LM Studio:** CORS ist meistens standardmäßig offen. Bei eigenem
`mlx_lm.server`/vLLM den entsprechenden Flag aktivieren.

### System-Prompt

Im Settings-Modal kannst du den Beratungs-System-Prompt anpassen — der
Default folgt der Wilhelm-Tradition (Würde, Mitgefühl, fünfteilige
Beratungsstruktur).

## Struktur

```
yijing/
├── web/                        # Frontend (HTML/CSS/JS, abhängigkeitsfrei)
│   ├── index.html
│   ├── style.css
│   ├── app.js                  # UI, Cast-Logik, Verlauf
│   └── llm.js                  # Adapter Ollama + OpenAI-kompatibel
├── data/
│   ├── hexagrams.json          # 64 Hexagramme, einheitliches Schema
│   └── trigrams.json           # 8 Trigramme mit Stammdaten
├── scripts/build_data.py       # Konsolidiert aus _archiv/
├── serve.sh
└── _archiv/                    # ältere Anläufe (yijing_1 … Yijing_6)
```

## Daten neu bauen

```bash
python3 scripts/build_data.py
```

Quellen:
- `_archiv/Yijing_6` → Wilhelm-Texte
- `_archiv/yijing_5` → Schriftzeichen, Pinyin, Trigramm-Stammdaten
- `_archiv/yijing_3` → Bild-Assoziationen (aus Dateinamen extrahiert)

## Wurfmethode

Pro Linie drei Münzen (Yin = 0, Yang = 1), Summe + 6 ergibt den Linienwert:

| Wert | Bedeutung           | Wahrscheinlichkeit |
|------|---------------------|--------------------|
| 6    | wandelndes Yin (○)  | 1/8 (12,5 %)       |
| 7    | festes Yang         | 3/8 (37,5 %)       |
| 8    | festes Yin          | 3/8 (37,5 %)       |
| 9    | wandelndes Yang (○) | 1/8 (12,5 %)       |

Die Auflösung wandelnder Linien zu einem Zielbild sowie die King-Wen-
Nummerierung erfolgen im Browser über eine vollständige Lookup-Tabelle.

## Quelle

Wilhelm, Richard: *I Ging — Das Buch der Wandlungen*. Texte aus dem
letzten Anlauf (`_archiv/Yijing_6`) übernommen, Schriftzeichen und
Trigramm-Stammdaten aus `_archiv/yijing_5`.
