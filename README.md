# Yijing Orakel

Ein schlankes I-Ging-Orakel als Static-Site mit Wilhelm-Übersetzung und
optionaler KI-Deutung über lokale LLM-Server (Ollama oder OpenAI-
kompatibel wie MLX/LM Studio). Drei-Münzen-Methode, vollständige
Wilhelm-Texte inklusive aller wandelnden Linien, chinesisches Schrift­zeichen
mit Pīnyīn, Trigramme mit Stammdaten.

Keine npm-Dependencies, kein Build-Step, kein Backend.

**Live-Demo:** <https://jkaindl.codeberg.page/Yijing/> — funktioniert
ohne lokales Setup für Hexagramm-Wurf und Wilhelm-Text. Die KI-Deutung
erfordert einen lokal laufenden LLM-Server (Ollama oder MLX), siehe
[Schnellstart](#schnellstart).

## Schnellstart

```bash
git clone https://codeberg.org/jkaindl/Yijing.git yijing
cd yijing
./serve.sh
```

Öffnet `http://localhost:8765/web/index.html` automatisch.

> Voraussetzung: Python 3.9+.

## Als macOS-App

Für die Weitergabe an Nutzer ohne Terminal-Erfahrung lässt sich das
Orakel als doppelklickbare macOS-App bündeln:

```bash
./scripts/build-macos-app.sh
```

Das erzeugt `dist/Yijing.dmg` — ein Disk-Image, in dem die `Yijing.app`
per Drag & Drop in den Programme-Ordner gezogen wird. Die App zeigt das
Orakel in einem eigenen Fenster, ganz ohne Terminal und ohne Browser.

Die App ist nicht Apple-notarisiert; der erste Start erfordert daher
einmalig die im Disk-Image beiliegenden Gatekeeper-Schritte
(`INSTALL.txt`). Voraussetzung zum Bauen: Xcode Command Line Tools.
Details: [`docs/MACOS-APP.md`](docs/MACOS-APP.md).

## Features

- **Drei-Münzen-Methode** mit korrekter Verteilung (1/8 : 3/8 : 3/8 : 1/8)
- **Ursprungs- und Zielbild** bei wandelnden Linien, mit visueller
  Markierung
- **Wilhelm-Übersetzung** (1924, gemeinfrei): Urteil, Bild, Bedeutung,
  alle sechs Linientexte mit Konfuzius-Kommentar
- **Chinesisches Schriftzeichen + Pīnyīn** pro Hexagramm
- **Trigramme** mit Familie, Natur, Jahreszeit, Himmelsrichtung,
  Assoziationen
- **Bildmeditation** (atmosphärische Stichworte) für 19 Hexagramme
- **KI-Interpretation** via lokalem LLM-Server (Ollama, MLX, LM Studio,
  vLLM, OpenClaw) mit Streaming, Reasoning-Steuerung und Markdown-
  Rendering
- **Verlauf** der letzten 20 Würfe in localStorage, einzelne Würfe via
  URL-Hash teilbar/wiederherstellbar
- **Export** als Markdown oder druckfreundliches PDF
- **Offline-fähig** — Service Worker; nach dem ersten Besuch lädt und
  läuft die App ohne Internet. Als PWA installierbar.
- **Theme-Umschalter** — Dark, Light oder automatisch nach
  System­einstellung

## Lokale LLM-Anbindung

Klick auf das ⚙-Symbol oben links öffnet das Settings-Modal. Beim ersten
Start probiert die App automatisch die typischen lokalen Endpunkte:

| Server | URL-Beispiel |
|---|---|
| Ollama | `http://localhost:11434` |
| MLX (`mlx_lm.server`) | `http://localhost:8080/v1` |
| LM Studio | `http://localhost:1234/v1` |

Weitere Endpunkte lassen sich manuell hinzufügen.

### CORS

Die Web-App ruft die LLM-Server direkt aus dem Browser auf — beide Seiten
müssen CORS erlauben. Für Ollama:

```bash
launchctl setenv OLLAMA_ORIGINS "*"
# Ollama neu starten
```

MLX und LM Studio sind standardmäßig offen. Details:
[`docs/LLM.md`](docs/LLM.md#cors-fehlersuche).

## Verzeichnisstruktur

```
yijing/
├── web/                       # Frontend (HTML/CSS/JS, vanilla)
├── data/                      # 64 Hexagramme + 8 Trigramme als JSON
├── scripts/                   # Build- und Dev-Server-Skripte
├── docs/                      # Architektur, Daten, LLM, Entwicklung
├── _archiv/                   # alte Anläufe — per .gitignore ausgeschlossen
├── AGENTS.md                  # Konventionen für KI-Coding-Sessions
├── CONTRIBUTING.md
├── CHANGELOG.md
├── LICENSE                    # AGPL-3.0-or-later (Code)
├── LICENSE-DOCS               # CC BY-SA 4.0 (Doku)
└── README.md                  # diese Datei
```

## Dokumentation

| Datei | Inhalt |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Modulaufbau, Datenfluss, Persistenz |
| [`docs/DATA.md`](docs/DATA.md) | Schema von `hexagrams.json` und `trigrams.json` |
| [`docs/LLM.md`](docs/LLM.md) | LLM-Backends, Reasoning-Modi, CORS-Fehlersuche |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Entwicklungs-Setup, Tests, Debugging |
| [`docs/MACOS-APP.md`](docs/MACOS-APP.md) | macOS-App bauen, Bundle-Aufbau, Weitergabe |
| [`AGENTS.md`](AGENTS.md) | Konventionen für KI-getriebene Sessions |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Beitragshinweise |
| [`CHANGELOG.md`](CHANGELOG.md) | Versionshistorie |

## Drei-Münzen-Methode

Pro Linie drei Münzen (Yin = 0, Yang = 1), Summe + 6 ergibt den
Linienwert:

| Wert | Bedeutung | Wahrscheinlichkeit |
|---|---|---|
| 6 | wandelndes Yin (○) | 1/8 (12,5 %) |
| 7 | festes Yang | 3/8 (37,5 %) |
| 8 | festes Yin | 3/8 (37,5 %) |
| 9 | wandelndes Yang (○) | 1/8 (12,5 %) |

Die Auflösung wandelnder Linien zu einem Zielbild und die King-Wen-
Zuordnung erfolgt im Browser über eine vollständige Lookup-Tabelle.

## Lizenz

- **Code:** GNU Affero General Public License v3.0 oder später —
  [AGPL-3.0-or-later](LICENSE).
- **Dokumentation** (`README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`,
  `AGENTS.md`, `docs/`): Creative Commons Attribution-ShareAlike 4.0
  International — [CC BY-SA 4.0](LICENSE-DOCS).
- **Wilhelm-Übersetzung** in `data/hexagrams.json`: gemeinfrei
  (Wilhelm † 1930; Gemeinfreiheit in Deutschland seit 2001). Bei
  Weiterverwendung bitte Richard Wilhelm als Quelle nennen.

### Warum AGPL?

Diese Lizenzwahl ist nicht zufällig. AGPL ist der rechtliche
Mechanismus, der eine bestimmte Logik schützt: Beiträge zur Allmende
bleiben in der Allmende — auch wenn jemand versucht, sie über einen
Netzwerkdienst zu kommerzialisieren.

Anders als permissive Lizenzen (MIT, Apache) oder file-level Copyleft
(MPL) verhindert die Network-Klausel der AGPL (§13), dass dieser Code
zur Grundlage geschlossener, kommerziell kontrollierter Infrastruktur
wird. Wer eine modifizierte Variante als Netzwerkdienst betreibt, muss
den Quellcode für die Nutzer dieses Dienstes verfügbar machen.

Das ist eine bewusste Entscheidung gegen maximale Verbreitung und für
theoretische Kohärenz: Was als Beitrag zur Allmende veröffentlicht
wurde, sollte in der Allmende bleiben — auch wenn das die Adoption
durch Akteure einschränkt, deren Geschäftsmodell auf der
Re-Privatisierung dieser Beiträge basiert.

yijing hat keine externen Code-Abhängigkeiten — kein npm, kein
Build-Step, keine Drittanbieter-JS-Bibliotheken. Die AGPL-Verpflichtungen
gelten vollständig auf den ausgelieferten JavaScript-Code, der im
Browser ohnehin direkt einsehbar ist. Externe LLM-Server (Ollama, MLX)
werden via HTTP-API aufgerufen — kein Code-Linking; deren Lizenzen
wirken separat.

## Quellen

- Wilhelm, Richard: *I Ging — Das Buch der Wandlungen*, Diederichs, 1924
- Trigramm-Stammdaten und chinesische Bezeichnungen aus
  Standardliteratur und chinesischen Originalquellen

## Status

Hobbyprojekt nach sechs verworfenen Anläufen — siehe `_archiv/`. Dieser
Anlauf ist absichtlich anders: schlank, abhängigkeitsfrei, lokal.
Funktioniert vollständig im Browser; die KI-Anbindung ist optional und
ausschließlich für lokale Server gedacht.
