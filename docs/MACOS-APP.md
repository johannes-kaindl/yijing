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
- `dist/Yijing.app.zip` — verteilbares Archiv
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
│   └── Yijing                 nativer Launcher (kompilierte Binary)
└── Resources/
    ├── launch.sh              Server-Start-Skript (Bash)
    ├── AppIcon.icns           App-Icon
    ├── LICENSE                AGPL-3.0-or-later
    └── yijing/                eingebetteter Repo-Inhalt (web/, data/, …)
```

Die Build-Bausteine liegen versioniert unter `scripts/macos-app/`:
`launcher.c`, `launch.sh`, `Info.plist`, `INSTALL.txt`, `icon-1024.png`.

## Warum ein nativer Launcher

`Contents/MacOS/Yijing` ist eine kleine, in C geschriebene und als
universal Binary (arm64 + x86_64) kompilierte Datei — **kein**
Shell-Skript.

Das ist notwendig: macOS bestimmt die Architektur einer App aus der
Mach-O-Binary ihres `CFBundleExecutable`. Ist das ein Shell-Skript
(keine Binary), kann macOS auf Apple Silicon die Architektur nicht
feststellen, stuft die App als Intel-Programm ein und verlangt beim
Start die Installation von Rosetta. Der native Launcher (`launcher.c`)
löst das; er tut nichts weiter, als `Contents/Resources/launch.sh`
über `/bin/bash` zu starten.

## Startverhalten (`launch.sh`)

1. Sucht `python3` (Homebrew zuerst, dann System-Python). Fehlt es,
   stößt die App die Installation der Command Line Tools an.
2. Sucht einen freien Port im Bereich 8765–8775.
3. Startet `scripts/serve.py` (Static-Server mit `no-store`-Headern).
4. Pollt bis zu 5 s, bis der Server antwortet, und öffnet dann Safari
   auf `http://localhost:<port>/web/index.html`.
5. Der Server läuft via `exec` als Hauptprozess der App — beendet der
   Nutzer die App, endet der Server zwangsläufig mit (kein Zombie).

## Weitergabe und Installation

`Yijing.app.zip` und `INSTALL.txt` zusammen verschicken. Die App ist
**nicht Apple-notarisiert** (kein Developer-Account) — beim ersten
Start ist daher einmalig der Gatekeeper-Weg nötig: Systemeinstellungen
→ Datenschutz & Sicherheit → „Trotzdem öffnen". `INSTALL.txt` führt
Schritt für Schritt durch den Vorgang.

## Aktualisieren

Neue App-Version: Änderungen committen, dann `./scripts/build-macos-app.sh`
erneut ausführen. Der `no-store`-Header des Servers verhindert, dass
Nutzer nach einem Update veraltete Stände sehen.
