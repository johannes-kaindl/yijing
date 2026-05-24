# macOS-App

Das Yijing-Orakel lässt sich als eigenständige `Yijing.app` für macOS
bündeln — eine doppelklickbare App für Nutzer ohne Terminal-Erfahrung.
Die App bedient die Orakel-Seite über einen **Swift-internen
Static-Server** (Network.framework / `NWListener`) und zeigt sie in
einem eigenen Fenster mit eingebettetem WebKit. Kein Browser-Tab, kein
Python, keine Command-Line-Tools auf der Nutzerseite — die App bringt
alles selbst mit.

## Bauen

```bash
./scripts/build-macos-app.sh
```

Voraussetzung: **Xcode Command Line Tools** (`xcode-select --install`)
— liefert `swiftc`, `sips`, `iconutil`, `hdiutil`. Das Skript erzeugt:

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
    ├── sw.js                  Service Worker
    ├── web/                   Static-Site-Quellen (HTML, JS, CSS, Icons)
    └── data/                  Hexagramm-/Trigramm-JSONs
```

Die Build-Bausteine liegen versioniert unter `scripts/macos-app/`:
`Yijing.swift`, `StaticServer.swift`, `Info.plist`, `INSTALL.txt`,
`icon-1024.png`.

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

Die Binary wird aus zwei Swift-Sources kompiliert:
`scripts/macos-app/Yijing.swift` (AppDelegate, Fenster, Menü) und
`scripts/macos-app/StaticServer.swift` (interner HTTP-Server). Keine
externen Dependencies, kein Swift-Package-Manager nötig — direkt mit
`swiftc` gebaut.

## Startverhalten

Beim Start (`Yijing.swift`):

1. Initialisiert den `StaticServer` mit `Bundle.main.resourceURL!` als
   Document-Root (die `web/`-, `data/`- und `sw.js`-Files im Bundle).
2. Sucht einen freien Port im Bereich 8765–8775 und startet einen
   `NWListener` darauf (Network.framework, loopback-only).
3. Öffnet ein Fenster mit `WKWebView` auf
   `http://localhost:<port>/web/index.html`.
4. Bei jedem GET/HEAD-Request liest der Server die Datei aus den
   Bundle-Resources, ermittelt den MIME-Type und antwortet mit
   `Cache-Control: no-store` (analog zum ehemaligen `serve.py`).
5. Beim Beenden der App wird der Listener gestoppt — alle offenen
   Connections schließen sich, da loopback-only.

Externe Links (Footer: Codeberg, Lizenzen) öffnen im Standard-Browser,
nicht im App-Fenster.

## Weitergabe und Installation

`Yijing.dmg` verschicken — es enthält die App, einen Programme-Alias
zum Hineinziehen und die `INSTALL.txt`. Die App ist **nicht
Apple-notarisiert** (kein Developer-Account) — beim ersten Start ist
daher einmalig der Gatekeeper-Weg nötig: Systemeinstellungen →
Datenschutz & Sicherheit → „Trotzdem öffnen". `INSTALL.txt` führt
Schritt für Schritt durch den Vorgang.

**Fallback ohne UI-Weg** (falls auf neueren macOS-Versionen der
„Trotzdem öffnen"-Knopf nicht erscheint oder direkt im Terminal
geholfen werden soll):

```bash
xattr -dr com.apple.quarantine /Applications/Yijing.app
```

Entfernt nur das Quarantine-Flag, das macOS beim Download/Mount
dranhängt. Danach startet die App ohne weitere Gatekeeper-Dialoge.

## Aktualisieren

Neue App-Version:

1. Änderungen committen.
2. `./scripts/build-macos-app.sh` erneut ausführen.
3. Auf Codeberg ein neues Release mit neuem Tag anlegen und die frische
   `dist/Yijing.dmg` als Anhang hochladen.
4. Die **direkten Download-Links** auf den neuen Tag aktualisieren:
   der Link im `README.md` und der `href` des `#macDownload`-Buttons in
   `web/index.html` (danach `pages`-Sync). Sie zeigen auf eine
   versionierte URL (`releases/download/<tag>/Yijing.dmg`) — Codeberg
   kennt keinen `latest`-Alias für direkte Asset-Links.

Der `no-store`-Header des Servers verhindert, dass Nutzer nach einem
Update veraltete Stände sehen.
