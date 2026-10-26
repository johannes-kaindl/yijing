---
paths:
  - "scripts/macos-app/**"
  - "scripts/build-macos-app.sh"
  - "scripts/package-macos-app.sh"
---

# macOS AppKit app and DMG — Gotchas

Gotchas zu `Yijing.app` (`scripts/macos-app/Yijing.swift` + `StaticServer.swift`: interner HTTP-Server über `NWListener`, Oberfläche in einem WKWebView) und zu den beiden Build-Skripten. Ablauf, Bundle-Layout und Einrichtung der Signatur stehen in `docs/MACOS-APP.md`.

- **The `CFBundleExecutable` must be a compiled binary.** A shell script triggers a Rosetta prompt on Apple Silicon.
- **`package-macos-app.sh` is the entry point and calls `build-macos-app.sh`.** The build script compiles and signs `dist/Yijing.app`; the packaging script notarizes and staples it, wraps it in `dist/Yijing.dmg` and signs, notarizes and staples that. Notarization sits in the packaging script by necessity: the app's ticket must be stapled **before** the DMG is built from it.
- **Signing is opt-in through `YIJING_SIGN_IDENTITY` / `YIJING_NOTARY_PROFILE`.** Without them an unsigned DMG is still a valid result.
- **`YIJING_SIGN_IDENTITY=auto` is resolved only inside the build script** (a subprocess), so the packaging script reads the identity back from the signed app instead. That keeps the DMG on the same signature as the app inside it.
- **Never write `codesign … | grep -q …` in these scripts** (CORE-OPS-03). `grep -q` exits at the first match, `codesign` dies of SIGPIPE (141), and `set -o pipefail` passes that on — so the condition is false exactly when it matches. Collect the output into a variable first, then test it with `[[ … == *…* ]]`. The pre-existing `Timestamp=none` guard had this bug and would have stayed silent in the very case it guards. Beleg: 2026-08-21.
- **Verify at the artifact, not from the log.** After `./scripts/package-macos-app.sh` (which must run through and produce a mountable `dist/Yijing.dmg` with app, `INSTALL.txt` and an Applications alias), `codesign -dvvv dist/Yijing.app` must show `Authority=Developer ID Application`, `flags=0x10000(runtime)` and a real `Timestamp=`. The signed path without a notary profile (`YIJING_SIGN_IDENTITY=auto`) is the cheap local check: it exercises signing end to end without uploading anything to Apple.
- **Keep the full notarization chain for actual releases.** It takes a few minutes and needs the Mac online. It was run once on 2026-08-21: both submissions `Accepted`, `spctl` reports `accepted` / `source=Notarized Developer ID` for app and DMG.
