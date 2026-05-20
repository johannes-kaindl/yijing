# Entwicklungs-Setup

## Voraussetzungen

- Python 3.9+ (für den Dev-Server)
- Optional: Node.js (nur für `node --check` als Syntax-Linter)
- Optional: Ollama oder MLX für die KI-Interpretation

Keine npm-Dependencies, keine Build-Tools.

## Starten

```bash
./serve.sh
```

öffnet `http://localhost:8765/web/index.html` automatisch. Der Server
sendet `Cache-Control: no-store` — Browser laden Module bei jedem Reload
neu.

Alternativ ohne Auto-Open:

```bash
python3 scripts/serve.py
# oder simpler:
python3 -m http.server 8765
```

`python3 -m http.server` setzt **keine no-cache-Header** — Browser cachen
JS-Module dann aggressiv. Beim Entwickeln lieber `scripts/serve.py` nutzen.

## Verzeichnisstruktur

```
yijing/
├── AGENTS.md              # Konventionen für KI-Sessions
├── CHANGELOG.md           # Versionshistorie
├── CONTRIBUTING.md        # Beitragshinweise
├── LICENSE                # MIT
├── README.md              # Einstieg
├── docs/                  # Diese Dokumentation
│   ├── ARCHITECTURE.md
│   ├── DATA.md
│   ├── DEVELOPMENT.md
│   └── LLM.md
├── data/
│   ├── hexagrams.json     # 64 Hexagramme normalisiert
│   └── trigrams.json      # 8 Trigramme als Stammdaten
├── scripts/
│   ├── build_data.py      # Daten aus _archiv/ konsolidieren
│   └── serve.py           # Dev-Server mit no-cache
├── serve.sh               # Wrapper für serve.py + auto-open
├── web/
│   ├── app.js             # UI, Cast, Verlauf, Settings
│   ├── llm.js             # Ollama/OpenAI-Adapter
│   ├── markdown.js        # Streaming-MD→HTML
│   ├── index.html         # Single-Page-App
│   └── style.css          # Dunkles Theme + Print-Layout
└── _archiv/               # alte Anläufe (per .gitignore ausgeschlossen)
```

## Arbeitsablauf

### Code ändern

1. Edit in `web/*.js`
2. `node --check web/<file>.js` für schnelle Syntaxprüfung
3. Browser-Tab hard-reload (Cmd+Shift+R)
4. Im Browser: Wurf machen, Reading durchklicken
5. Falls LLM-Code geändert: Interpretation mit Ollama und MLX testen

### Daten neu bauen

Wenn sich Wilhelm-Texte oder Trigramm-Stammdaten ändern:

```bash
python3 scripts/build_data.py
```

Output:

```
OK: 64 Hexagramme → data/hexagrams.json
OK: 8 Trigramme → data/trigrams.json
   Schriftzeichen: 64/64, Bild-Assoziationen: 19/64
```

`Schriftzeichen: 64/64` und `Hexagramme: 64` müssen exakt stimmen. Bei
Abweichungen das Build-Skript debuggen, nicht das JSON von Hand patchen.

### CSS

Drei Layout-Modi prüfen:

- **Desktop**: Browser-Fenster ≥ 760 px breit
- **Mobile**: Browser-Tools → Geräte-Emulation, Breite ≤ 540 px
- **Print**: Cmd+P → „Als PDF sichern" — Vorschau prüfen

### LLM-Anbindung testen

Im Settings-Modal:

- „Verbindung" — listet Modelle, schneller Sanity-Check
- „Reasoning" — sendet `thinking=on`/`thinking=off`-Mini-Anfragen,
  prüft ob Steuerung greift

## Debugging

### Browser-Konsole

Cmd+Opt+I → Console. Fehler beim Init blocken die Event-Listener — wenn
Buttons keine Aktion zeigen, ist meist hier eine Exception.

### Server-Logs

```bash
tail -f /tmp/yijing-server.log
```

(Wenn der Server mit `serve.sh` im Hintergrund läuft.)

### LLM-Stream im Klartext

```bash
# Ollama
curl -s http://localhost:11434/api/chat -d '{
  "model": "llama3.2:latest",
  "messages": [{"role":"user","content":"Test"}],
  "stream": true
}' | head -10

# MLX
curl -s http://localhost:8080/v1/chat/completions -d '{
  "model": "mlx-community/Qwen3.6-35B-A3B-4bit",
  "messages": [{"role":"user","content":"Test"}],
  "stream": true,
  "max_tokens": 30
}' | head -10
```

Bei MLX kommen `: keepalive`-Comment-Zeilen vor den eigentlichen
SSE-`data:`-Zeilen — das ist normal.

### Caching-Probleme

Symptom: Änderungen erscheinen erst nach mehreren Reloads. Browser cached
ES-Module trotz `Cache-Control: no-store`.

Fix: in DevTools → Network → „Disable cache" anhaken solange DevTools
offen sind. Oder `?t=$(date +%s)` an die URL hängen.

## Code-Stil

- **Indentation:** 2 Leerzeichen für JS, 4 für Python
- **Strings:** doppelte Anführungszeichen in JS, einfache in Python wo
  praktisch
- **Deutsche String-Literale** mit inneren Anführungszeichen: typografisch
  setzen (`„…"`), nicht gerade (`"…"`). Sonst Syntax-Fehler.
- **Kommentare:** nur wo das *warum* nicht aus dem Code lesbar ist
- **JSDoc** für öffentliche Funktionen — Parameter, Rückgabewert, Hinweise

## Release-Prozess

Es gibt noch keinen formalen Release-Prozess. Bei Bedarf:

1. `CHANGELOG.md` ergänzen
2. Commit mit Tag-Vorbereitung
3. `git tag -a v0.x.0 -m "…"`
4. `git push origin v0.x.0`
