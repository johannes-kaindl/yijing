---
paths:
  - "scripts/ios-app/**"
---

# iOS / iPadOS / Mac Catalyst / watchOS — Gotchas

Gotchas zur nativen Familie unter `scripts/ios-app/` (eigene **1.0.x**-Linie, getrennt von der **1.5.x**-Linie der macOS-AppKit-DMG). Aufbau, Targets und Build-Modi stehen in `docs/IOS-APP.md` und `scripts/ios-app/README.md`.

- **Never add an explicit `-sdk` to the `build-ios-app.sh` simulator/archive/device `xcodebuild` invocations.** The embedded watchOS app must build for watchOS via `-destination`; forcing `-sdk iphoneos` breaks it (`WatchKitAppInvalidUIDeviceFamily`).
- **Commit before building.** The build embeds the **committed** `web/` + `data/` via `git archive HEAD`. `archive` mode leaves the `__BUILD__` placeholder so the build badge and dev tooling stay disabled.
- **`archive` uploads to App Store Connect when `YIJING_ASC_ISSUER_ID` is set.** It then exports with `app-store-connect` and runs `altool` (API key `9NPJZ2DPG6`) through `exportOptions.plist`; without the variable it stops at the `.xcarchive`. `YIJING_TEAM_ID` is required for `archive`/`device`, `YIJING_DEVICE_ID` is optional (install and launch on a device).
- **Never commit `scripts/ios-app/OracleKit/.build` or `OracleKit/.swiftpm`.** They are build caches (gitignored).
- **Do not add a meditation/image widget.** Apple Image Playground (`ImageCreator`) is foreground-only (`backgroundCreationForbidden`), so it cannot run in a WidgetKit timeline.
- **Do not attempt a custom watch face.** watchOS forbids third-party faces; the daily hexagram ships as a complication, not a face.
- **Assign the App Group to each App ID individually in the Apple Developer Portal.** `group.page.codeberg.jkaindl.Yijing` is shared by all four entitlements files; auto-signing creates the App IDs but does **not** assign the group.
- **The daily hexagram is one hexagram with NO changing lines** (questionless contemplation). The watch's "Werfen" flow is the full three-coin mechanics.
- **No LLM/AI on widget or watch — offline only.** AI lives in the app foreground (on-device Apple Foundation Models by default, BYO/remote local LLMs as fallback).
- **The widget/complication bundles only `data/widget-hexagrams.json` (memory budget); the watch bundles the full `hexagrams.json` + `.en.json`.**
- **A version bump is two lines in `project.yml`** (`MARKETING_VERSION`, `CURRENT_PROJECT_VERSION`). All four target `Info.plist`s derive their version from them; no script needed.
- **Mac Catalyst is the deferred long-term Mac path, not part of the shipped build.** The legacy AppKit `Yijing.app` still exists and is slated to be superseded.
