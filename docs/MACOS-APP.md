# macOS app

The Yijing oracle can be bundled as a standalone `Yijing.app` for macOS
— a double-clickable app for users without terminal experience.
The app serves the oracle page via a **Swift-internal
static server** (Network.framework / `NWListener`) and displays it in
a dedicated window with embedded WebKit. No browser tab, no
Python, no command-line tools on the user's side — the app brings
everything along itself.

> The Mac Catalyst build of the universal iOS app
> (`scripts/ios-app/build-ios-app.sh catalyst`) is the long-term Mac path
> and is slated to supersede this legacy AppKit app — see
> [iOS app](IOS-APP.md).

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

For signed, Apple-notarized release builds (no Gatekeeper warning on the
user's side) see [Signing & notarization](#signing--notarization-developer-id).
Without the signing variables the script produces an unsigned build,
unchanged from before.

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

## Export bridge (Markdown / PDF)

WKWebView supports neither `window.print()` nor `<a download>` blob downloads,
so the web app's export must go through a native bridge. The `WKWebView` is
created with a `WKWebViewConfiguration` whose `userContentController` registers a
`WKScriptMessageHandler` named `yijing`. The page detects
`window.webkit.messageHandlers.yijing` (else it falls back to the browser path)
and posts:

- `{action: "saveMarkdown", filename, content}` → `NSSavePanel` → write UTF-8.
- `{action: "savePdf", mode, filename}` → `NSPrintOperation` to a chosen file
  (`jobDisposition = .save`, no print panel). `mode` is `"bw"` (print-optimized,
  small margins) or `"glossy"` (App-Design, **zero margins** → full-bleed,
  reflecting the active theme). The web side sets the `pdf-bw`/`pdf-glossy` class
  and `--print-question` first; Swift calls `window.__yijingAfterPrint()` to
  restore the screen afterwards.

## Distribution and installation

Send `Yijing.dmg` — it contains the app, an Applications alias
to drag into and the `INSTALL.txt`.

**Official releases are Developer ID-signed and Apple-notarized**
(see [Signing & notarization](#signing--notarization-developer-id)).
They launch by double-click with no Gatekeeper warning, online or
offline — `INSTALL.txt` then only covers the drag-to-Applications step.

**Un-notarized builds** (e.g. a local build by a contributor without an
Apple Developer account) are not accepted silently by Gatekeeper. Since
macOS 15 Sequoia the Control-click → "Open" bypass is gone; the app must
be cleared once via System Settings → Privacy & Security → "Open Anyway",
or — equivalently — from the terminal:

```bash
xattr -dr com.apple.quarantine /Applications/Yijing.app
```

This removes only the quarantine flag that macOS attaches on
download/mount. After that the app starts without further Gatekeeper
dialogs.

## Signing & notarization (Developer ID)

As of macOS 15 Sequoia / 26 Tahoe, Gatekeeper requires a **Developer ID
signature plus Apple notarization** for apps distributed outside the Mac
App Store. `build-macos-app.sh` runs the whole chain when two environment
variables are set; without them it produces an unsigned build (the
default for contributors without a certificate).

### One-time setup

1. **Apple Developer Program** membership — enroll as an *individual*
   (Apple ID + identity check via the Apple Developer app; 99 USD/year,
   must be active). No D-U-N-S / organization needed.
2. **Developer ID Application certificate** in your login keychain.
   Create a CSR in *Keychain Access → Certificate Assistant → Request a
   Certificate from a CA* (CA Email empty, *Saved to disk*), upload it at
   `developer.apple.com/account` under *Certificates → Developer ID
   Application* (not *Apple Development* / *Apple Distribution*), download
   the `.cer`, double-click to install. Verify:
   ```bash
   security find-identity -v -p codesigning
   # → Developer ID Application: <NAME> (<TEAM_ID>)
   ```
3. **notarytool credentials** stored once (app-specific password from
   `account.apple.com → Sign-In & Security → App-Specific Passwords`):
   ```bash
   xcrun notarytool store-credentials "yijing-notary" \
     --apple-id "<APPLE_ID_EMAIL>" --team-id "<TEAM_ID>" \
     --password "<APP_SPECIFIC_PASSWORD>"
   ```
   (For CI/teams the App Store Connect API key — `--key/--key-id/--issuer`
   — is the alternative.)

### Building a signed, notarized release

```bash
YIJING_SIGN_IDENTITY="Developer ID Application: <NAME> (<TEAM_ID>)" \
YIJING_NOTARY_PROFILE="yijing-notary" \
./scripts/build-macos-app.sh
```

`YIJING_SIGN_IDENTITY="auto"` picks the first *Developer ID Application*
identity from the keychain. With only `YIJING_SIGN_IDENTITY` set (no
profile) the script signs but does **not** notarize — useful to test the
signature locally. The Mac must be **online** (secure timestamp + notary
upload). The script runs the steps in the one correct order:

1. Sign the `.app` — a single `codesign --options runtime --timestamp`
   call (Hardened Runtime + secure timestamp; **no `--deep`**, **no
   `--entitlements`** — see below).
2. Notarize the `.app` (zipped for upload) and **staple** the ticket.
3. Build the `.dmg` *from the stapled app*.
4. Sign, notarize and staple the `.dmg`.
5. Verify with `stapler validate` + `spctl` (must report *accepted,
   source=Notarized Developer ID*).

### Why no entitlements

Yijing is **not** App-Sandboxed and contains exactly one Mach-O (no
frameworks/helpers/XPC). Notarization needs the **Hardened Runtime** (a
signing flag), not the sandbox. The 127.0.0.1 `NWListener` and the
WKWebView's outbound HTTP to localhost LLM servers need no entitlements —
`network.*` are sandbox-only keys, and the Hardened Runtime does not gate
sockets. WKWebView's JS JIT runs in a separate WebContent process, so no
`allow-jit` either. The app is therefore signed **without an
`--entitlements` file**. Do not add `allow-jit`/`allow-unsigned-executable-memory`
"just in case" — they only weaken the Hardened Runtime.

### Verifying & troubleshooting

The build runs the Gatekeeper checks itself, but test the real download
experience on a **clean/second Mac** — the signing machine does not
re-evaluate an app the same way, so a stapling defect can hide locally.
On a notarization failure, fetch the detailed log via the Submission ID
that `notarytool submit` printed:

```bash
xcrun notarytool log <SUBMISSION_ID> -p "yijing-notary" developer_log.json
```

The internal server binds **loopback-only**
(`requiredInterfaceType = .loopback` in `StaticServer.swift`), so it
triggers neither the macOS *Local Network* privacy prompt nor the
application firewall — signing and notarization do not change that.

## Updating

New app version:

1. Commit changes.
2. Bump `CFBundleShortVersionString` / `CFBundleVersion` in
   `scripts/macos-app/Info.plist` (keep them monotonic), then run
   `./scripts/build-macos-app.sh` again — for an official release with the
   `YIJING_SIGN_IDENTITY` / `YIJING_NOTARY_PROFILE` variables set (see
   [Signing & notarization](#signing--notarization-developer-id)).
3. Create a new release with a new tag on Codeberg and upload the fresh
   `dist/Yijing.dmg` as an attachment.
4. Update the **direct download links** to the new tag:
   the link in `README.md` and the `href` of the `#macDownload` button in
   `web/index.html` (then `pages` sync). They point to a
   versioned URL (`releases/download/<tag>/Yijing.dmg`) — Codeberg
   knows no `latest` alias for direct asset links.

The server's `no-store` header prevents users from seeing stale
states after an update.
