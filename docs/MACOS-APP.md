# macOS app

The Yijing oracle can be bundled as a standalone `Yijing.app` for macOS
— a double-clickable app for users without terminal experience.
The app serves the oracle page via a **Swift-internal
static server** (Network.framework / `NWListener`) and displays it in
a dedicated window with embedded WebKit. No browser tab, no
Python, no command-line tools on the user's side — the app brings
everything along itself.

## Building

```bash
./scripts/build-macos-app.sh
```

Prerequisite: **Xcode Command Line Tools** (`xcode-select --install`)
— provides `swiftc`, `sips`, `iconutil`, `hdiutil`. The script produces:

- `dist/Yijing.app` — the app bundle
- `dist/Yijing.dmg` — distributable disk image (app + Applications alias +
  INSTALL.txt)
- `dist/INSTALL.txt` — installation instructions for end users

`dist/` is not versioned — build artifacts do not belong in Git.

The build embeds the **committed** repo state (`git archive HEAD`),
not the working directory. Local, uncommitted changes therefore
deliberately do not end up in the app.

## Bundle layout

```
Yijing.app/Contents/
├── Info.plist                 bundle metadata
├── MacOS/
│   └── Yijing                 native app (compiled Swift binary)
└── Resources/
    ├── AppIcon.icns           app icon
    ├── LICENSE                AGPL-3.0-or-later
    ├── sw.js                  Service Worker
    ├── web/                   static-site sources (HTML, JS, CSS, icons)
    └── data/                  hexagram/trigram JSONs
```

The build components live versioned under `scripts/macos-app/`:
`Yijing.swift`, `StaticServer.swift`, `Info.plist`, `INSTALL.txt`,
`icon-1024.png`.

## App structure

`Contents/MacOS/Yijing` is a native Swift app compiled with `swiftc`
(universal arm64 + x86_64) — not a shell script. This is necessary for
two reasons:

1. **Dedicated window.** The app shows the oracle in a `WKWebView`
   (Apple's system WebKit) in a dedicated window — no browser tab.
2. **Architecture detection.** macOS determines an app's architecture
   from the Mach-O binary of its `CFBundleExecutable`. A shell script
   has none — on Apple Silicon this led to a Rosetta
   prompt. A compiled binary solves this.

The binary is compiled from two Swift sources:
`scripts/macos-app/Yijing.swift` (AppDelegate, window, menu) and
`scripts/macos-app/StaticServer.swift` (internal HTTP server). No
external dependencies, no Swift Package Manager needed — built directly
with `swiftc`.

## Startup behavior

On startup (`Yijing.swift`):

1. Initializes the `StaticServer` with `Bundle.main.resourceURL!` as the
   document root (the `web/`, `data/` and `sw.js` files in the bundle).
2. Finds a free port in the range 8765–8775 and starts an
   `NWListener` on it (Network.framework, loopback-only).
3. Opens a window with `WKWebView` on
   `http://localhost:<port>/web/index.html`.
4. On every GET/HEAD request the server reads the file from the
   bundle resources, determines the MIME type and responds with
   `Cache-Control: no-store` (analogous to the former `serve.py`).
5. When the app quits, the listener is stopped — all open
   connections close, since they are loopback-only.

External links (footer: Codeberg, licenses) open in the default browser,
not in the app window.

## Distribution and installation

Send `Yijing.dmg` — it contains the app, an Applications alias
to drag into and the `INSTALL.txt`. The app is **not
Apple-notarized** (no Developer account) — so on first launch the
Gatekeeper path is needed once: System Settings →
Privacy & Security → "Open Anyway". `INSTALL.txt` guides you
step by step through the procedure.

**Fallback without the UI path** (in case on newer macOS versions the
"Open Anyway" button does not appear or you want to help directly in
the terminal):

```bash
xattr -dr com.apple.quarantine /Applications/Yijing.app
```

Removes only the quarantine flag that macOS attaches on download/mount.
After that the app starts without further Gatekeeper dialogs.

## Updating

New app version:

1. Commit changes.
2. Run `./scripts/build-macos-app.sh` again.
3. Create a new release with a new tag on Codeberg and upload the fresh
   `dist/Yijing.dmg` as an attachment.
4. Update the **direct download links** to the new tag:
   the link in `README.md` and the `href` of the `#macDownload` button in
   `web/index.html` (then `pages` sync). They point to a
   versioned URL (`releases/download/<tag>/Yijing.dmg`) — Codeberg
   knows no `latest` alias for direct asset links.

The server's `no-store` header prevents users from seeing stale
states after an update.
