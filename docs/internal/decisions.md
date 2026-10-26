# Decisions — why it is the way it is

The design essence and the history behind rules that `AGENTS.md` states as bare facts. Nothing here loads on its own: a session reads this file when the `Context index` in `AGENTS.md` says so, or before it adopts a "decided on purpose" at face value.

## Hosting and remotes

- **`origin` (git.jkaindl.de) is the only remote.** The GitHub mirror was removed on 2026-09-05. GitHub stays only where it is functionally required — the Obsidian store chain — and this repo is not a plugin. The mirror had been a backup counterpart; that role has been carried by the maintainer's own forge since 2026-07, and since 2026-08-30 the GitHub account has additionally been flagged (anonymous 404, Actions off account-wide).
- **While the mirror existed** it was measured at the far end, not through `@{u}`: `git ls-remote` against each remote separately showed `main` and all 9 tags identical on `origin`, the mirror and locally (2026-08-21). The lesson that outlived the mirror: measure a mirror at its far end, per remote.
- **Deployment moved from a branch to a script on 2026-07-30.** Until then the live demo was a second branch, `pages`, synced by `scripts/sync-pages.sh` to Codeberg Pages. The script is gone; the `pages` branch still exists (locally and as `origin/pages`) but is not maintained. Older `CHANGELOG.md` entries still mention the old path; that is history, not convention. The live demo is deployed by `./scripts/deploy-page.sh` to pages.jkaindl.de.
- **The old Codeberg URLs still answer HTTP 200 and serve a stale state.** Reachability proves nothing there.
- **The bundle IDs stay `page.codeberg.jkaindl.*`.** They are the App Store identity.

## Convention points that were open and are now closed

- **CORE-META-03** — `scripts/capture-web-shots.mjs` re-shoots every README image from the running app, hero included, into the single folder `docs/images/`; `docs/images/README.md` is the capture contract. App Store screenshots and the preview video remain archived launch assets (commit `69a34b5`). One `readme_lint` warning stays and is the tool's, not ours — see the note in the contract about `og-image.png`.
- **PROF-WEB-03** — `scripts/check-syntax.mjs` parses the whole shipped surface (`sw.js`, every `web/*.js` and the inline `<script>` blocks of every `web/*.html` — 10 blocks at the time).
- **PROF-NAT-01** — the macOS AppKit DMG build is split into `scripts/build-macos-app.sh` (build and sign) and `scripts/package-macos-app.sh` (notarize, staple, wrap in the DMG). Named after the repo's own `build-macos-app.sh` / `build-ios-app.sh` pattern rather than the convention's `*-native-*`, because two native tracks live here. The iOS App Store path needs no notarization: `build-ios-app.sh archive` exports with `app-store-connect` and uploads through `altool` via `exportOptions.plist`, gated on `YIJING_ASC_ISSUER_ID` (2026-06-13).
- **PROF-NAT-02** — all four target `Info.plist`s derive their version from `project.yml` through build-setting expansion; a bump is two lines in lockstep by construction (2026-06-13).

## Splitting `app.js`

`app.js` is well past the comfortable upper end of what belongs in one file. Split only when a concrete feature can be isolated cleanly, not prophylactically. Sensible cuts would be `history.js` (loadHistory, saveHistory, renderHistory, applyHashIfAny), `settings.js` (renderEndpointList, openSettings, closeSettings), `export.js` (buildMarkdownExport, downloadFile, print handler) and `theme.js` (applyTheme, initTheme, service worker registration). A cut only works with a clear public API; otherwise leave it.

## Why the vendored transport is built the way it is

See `.claude/rules/vendor.md` for the rules and `web/vendor/code-kit/VENDOR.json` for the pin and the recorded deviation from code-kit's plain contract.
