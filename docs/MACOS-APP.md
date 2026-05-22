# macOS-App

Das Yijing-Orakel lässt sich als eigenständige `Yijing.app` für macOS
bündeln — eine doppelklickbare App für Nutzer ohne Terminal-Erfahrung.
Die App startet den lokalen Static-Server und öffnet das Orakel in
Safari; sie enthält keinen eigenen Browser und keine Frameworks.

## Bauen

```bash
./scripts/build-macos-app.sh
```

Voraussetzung: **Xcode Command Line Tools** (`xcode-select --install`)
— liefert `clang`, `sips`, `iconutil`, `ditto`. Das Skript erzeugt:

- `dist/Yijing.app` — das App-Bundle
- `dist/Yijing.dmg` — verteilbares Disk-Image (App + Programme-Alias +
  INSTALL.txt)
- `dist/INSTALL.txt` — Installationsanleitung für Endnutzer

`dist/` ist nicht versioniert — Build-Artefakte gehören nicht ins Git.

Der Build bettet den **committeten** Repo-Stand ein (`git archive HEAD`),
nicht das Arbeitsverzeichnis. Lokale, uncommittete Änderungen landen
also bewusst nicht in der App.

## Bundle-Aufbau

```
Yijing.app/Contents/
├── Info.plist                 Bundle-Metadaten
├── MacOS/
│   └── Yijing                 native App (kompilierte Swift-Binary)
└── Resources/
    ├── AppIcon.icns           App-Icon
    ├── LICENSE                AGPL-3.0-or-later
    └── yijing/                eingebetteter Repo-Inhalt (web/, data/, …)
```

Die Build-Bausteine liegen versioniert unter `scripts/macos-app/`:
`Yijing.swift`, `Info.plist`, `INSTALL.txt`, `icon-1024.png`.

## Aufbau der App

`Contents/MacOS/Yijing` ist eine native, mit `swiftc` kompilierte
Swift-App (universal arm64 + x86_64) — kein Shell-Skript. Das ist aus
zwei Gründen nötig:

1. **Eigenes Fenster.** Die App zeigt das Orakel in einem `WKWebView`
   (Apples System-WebKit) in einem eigenen Fenster — kein Browser-Tab.
2. **Architektur-Erkennung.** macOS bestimmt die Architektur einer App
   aus der Mach-O-Binary ihres `CFBundleExecutable`. Ein Shell-Skript
   hat keine — auf Apple Silicon führte das zu einer Rosetta-
   Aufforderung. Eine kompilierte Binary löst das.

## Startverhalten

Beim Start (`Yijing.swift`):

1. Sucht `python3` (Homebrew zuerst, dann System-Python). Fehlt es,
   erscheint ein Hinweisdialog und die Command Line Tools werden
   installiert.
2. Sucht einen freien Port (8765–8775).
3. Startet `scripts/serve.py` als Subprozess (Static-Server mit
   `no-store`-Headern), wartet bis er antwortet.
4. Öffnet ein Fenster mit `WKWebView` auf
   `http://localhost:<port>/web/index.html`.
5. Beim Beenden der App wird der Server-Subprozess gestoppt. Für den
   Härtefall (Force Quit) beendet sich `serve.py` über einen
   Parent-Watchdog selbst, sobald die App-PID verschwindet.

Externe Links (Footer: Codeberg, Lizenzen) öffnen im Standard-Browser,
nicht im App-Fenster.

## Weitergabe und Installation

`Yijing.dmg` verschicken — es enthält die App, einen Programme-Alias
zum Hineinziehen und die `INSTALL.txt`. Die App ist **nicht
Apple-notarisiert** (kein Developer-Account) — beim ersten Start ist
daher einmalig der Gatekeeper-Weg nötig: Systemeinstellungen →
Datenschutz & Sicherheit → „Trotzdem öffnen". `INSTALL.txt` führt
Schritt für Schritt durch den Vorgang.

## Aktualisieren

Neue App-Version: Änderungen committen, dann `./scripts/build-macos-app.sh`
erneut ausführen. Der `no-store`-Header des Servers verhindert, dass
Nutzer nach einem Update veraltete Stände sehen.
