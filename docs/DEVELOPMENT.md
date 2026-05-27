# Entwicklungs-Setup

## Voraussetzungen

- Python 3.9+ (für den Dev-Server)
- Optional: Node.js (nur für `node --check` als Syntax-Linter)
- Optional: Ollama oder MLX für die KI-Interpretation
- Optional: Xcode Command Line Tools — nur zum Bauen der macOS-App
  (`scripts/build-macos-app.sh`), siehe [`MACOS-APP.md`](MACOS-APP.md)

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
├── LICENSE                # AGPL-3.0-or-later (Code)
├── LICENSE-DOCS           # CC BY-SA 4.0 (Doku)
├── README.md              # Einstieg
├── sw.js                  # Service Worker (Offline-Caching)
├── docs/                  # Diese Dokumentation
│   ├── ARCHITECTURE.md
│   ├── DATA.md
│   ├── DEVELOPMENT.md
│   ├── LLM.md
│   └── MACOS-APP.md
├── data/
│   ├── hexagrams.json     # 64 Hexagramme normalisiert
│   └── trigrams.json      # 8 Trigramme als Stammdaten
├── scripts/
│   ├── build_data.py      # Daten aus _archiv/ konsolidieren
│   ├── build-macos-app.sh # baut die macOS-App nach dist/
│   ├── macos-app/         # Bausteine für den App-Build
│   └── serve.py           # Dev-Server mit no-cache
├── serve.sh               # Wrapper für serve.py + auto-open
├── web/
│   ├── app.js             # UI, Cast, Verlauf, Settings, Theme
│   ├── llm.js             # Ollama/OpenAI-Adapter
│   ├── markdown.js        # Streaming-MD→HTML
│   ├── index.html         # Single-Page-App
│   ├── style.css          # Theme (Dark/Light) + Print-Layout
│   ├── manifest.webmanifest  # PWA-Manifest
│   └── icons/             # PWA-Icons
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

Layout-Modi prüfen:

- **Desktop**: Browser-Fenster ≥ 760 px breit
- **Mobile**: Browser-Tools → Geräte-Emulation, Breite ≤ 540 px
- **Print**: Cmd+P → „Als PDF sichern" — Vorschau prüfen

Außerdem das Theme: Umschalter im Header (◐) durch Dark / Light /
System klicken. Farben kommen aus den `:root`-Variablen, Light aus
`:root[data-theme="light"]`.

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

Greift der Service Worker (`sw.js`), kann er zusätzlich alte Stände
ausliefern. Beim Entwickeln: DevTools → Application → Service Workers →
„Update on reload" aktivieren oder den Worker dort abmelden.

## Code-Stil

- **Indentation:** 2 Leerzeichen für JS, 4 für Python
- **Strings:** doppelte Anführungszeichen in JS, einfache in Python wo
  praktisch
- **Deutsche String-Literale** mit inneren Anführungszeichen: typografisch
  setzen (`„…"`), nicht gerade (`"…"`). Sonst Syntax-Fehler.
- **Kommentare:** nur wo das *warum* nicht aus dem Code lesbar ist
- **JSDoc** für öffentliche Funktionen — Parameter, Rückgabewert, Hinweise

## Release-Prozess

Versionierung folgt [SemVer](https://semver.org/lang/de/), Changelog
folgt [Keep a Changelog](https://keepachangelog.com/de/1.1.0/). Schritte
für einen Release (am Beispiel `v1.1.1`):

1. **CHANGELOG ziehen.** Sektion `[Unreleased]` umbenennen in
   `[1.1.1] — YYYY-MM-DD`. Eine frische `[Unreleased]`-Sektion
   darüber neu anlegen.
2. **Version-Strings anpassen.** Footer in `web/index.html`
   (z.B. „Yijing v1.1.1"). Sonst kommen Nutzer in die Verlegenheit,
   sich zu fragen welche Version sie haben.
3. **Commit + Tag.**
   ```bash
   git commit -am "Release v1.1.1: <Headline>"
   git tag -a v1.1.1 -m "v1.1.1 — <kurze Headline>"
   git push origin main
   git push origin v1.1.1
   ```
4. **DMG bauen.**
   ```bash
   ./scripts/build-macos-app.sh
   # → dist/Yijing.dmg
   ```
   Das Skript zieht den committeten Stand (`git archive HEAD`), nicht
   das Arbeitsverzeichnis — Tag also vorher pushen, sonst landet ein
   nicht-getaggter Stand in der App.
5. **Codeberg-Release anlegen** (UI oder API):
   ```bash
   TOKEN=…
   curl -X POST "https://codeberg.org/api/v1/repos/jkaindl/Yijing/releases" \
     -H "Authorization: token $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"tag_name":"v1.1.1","name":"v1.1.1 — <Headline>",
          "body":"<Markdown-Notes aus CHANGELOG>"}'
   ```
   Quirk: in seltenen Fällen meldet die API direkt nach Tag-Push
   „HTTP 409 Release has no Tag" — Sekunden später durchprobieren,
   dann mit `GET /releases` verifizieren statt blind auf den ersten
   POST zu vertrauen.
6. **DMG als Asset hochladen** (UI oder API mit
   `POST .../releases/<id>/assets`). Download-URL kurz mit `curl -I`
   verifizieren (HTTP 200).
7. **Download-Links auf den neuen Tag aktualisieren.** Der Button im
   `README.md` und der `href` des `#macDownload`-Buttons in
   `web/index.html` zeigen auf eine versionierte URL
   (`releases/download/<tag>/Yijing.dmg`) — Codeberg kennt keinen
   `latest`-Alias für direkte Asset-Links. Der README-Status-Badge
   für die Release-Version aktualisiert sich automatisch über
   `shields.io/gitea/v/release`.
8. **Pages-Sync.** Wenn `web/`, `sw.js` oder `data/` betroffen waren,
   den Stand nach `pages` ziehen — am einfachsten über einen temporären
   `git worktree`. Pfad-Anpassungen in `app.js` (`../data/` → `data/`,
   `../sw.js` → `sw.js`) nicht vergessen.
