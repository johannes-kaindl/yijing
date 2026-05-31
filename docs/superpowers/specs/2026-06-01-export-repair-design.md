# Design: Export Repair — native macOS bridge + two PDF modes (Sub-project B)

- **Date:** 2026-06-01
- **Status:** Approved (decisions confirmed); proceeding to implementation

## 1. Problem

In the **macOS DMG app** both export buttons are dead. Root cause (recon):
`Yijing.swift:38` creates `WKWebView(... configuration: WKWebViewConfiguration())`
— a bare config with **no `userContentController` message handler**, and
WKWebView on macOS implements **neither `window.print()`** (no-op) **nor
`<a download>` blob downloads**. In a normal browser both work, which is why the
on-disk JS looked fine. So the fix needs **native Swift support**.

Secondary bug (browser & app): the print stylesheet renders the question via
`content: var(--print-question, "")` (`style.css:1111`) but `--print-question`
is never set → the question is dropped from the PDF. Dead `#resetBtn` selector
(`style.css:1086`; the id is `reset`).

## 2. Decisions (confirmed)

- **Glossy ("App-Design") PDF mirrors the active app theme** (dark or light,
  WYSIWYG) — full-bleed, no white margins.
- **One PDF button + a small mode menu**: "Druck (S/W)" vs "App-Design".
- MD save via **`NSSavePanel`** (location chooser). Browser glossy full-bleed is
  best-effort (print-dialog limitation). Fix `--print-question` + the dead
  `#resetBtn` selector along the way.

## 3. Architecture

### 3.1 Native bridge (`scripts/macos-app/Yijing.swift`)

- Build the `WKWebView` with a configured `WKWebViewConfiguration` whose
  `userContentController` registers a `WKScriptMessageHandler` named `"yijing"`.
  The handler (the AppDelegate, or a small delegate object holding a `weak`
  webView + window ref) dispatches on `body.action`:
  - **`saveMarkdown`** `{ filename, content }` → `NSSavePanel`
    (`nameFieldStringValue = filename`, default dir Downloads) → write UTF-8.
  - **`savePdf`** `{ mode: "bw"|"glossy", filename }` →
    1. `evaluateJavaScript` to add the print-mode class to `documentElement`
       (`pdf-bw` / `pdf-glossy`) and open the reading's `<details>` + set
       `--print-question`.
    2. `NSSavePanel` for the destination URL.
    3. `let op = webView.printOperation(with: info)` with `NSPrintInfo`:
       A4 paper, margins **0 for glossy** / small for bw, `jobDisposition = .save`,
       `dictionary[.jobSavingURL] = url`, `op.showsPrintPanel = false`,
       `op.showsProgressPanel = false`; `op.runModal(for: window, …)`.
    4. `evaluateJavaScript` to remove the print-mode class afterward.
  - Full-bleed glossy = margins 0 + a print stylesheet that fills the page with
    the active theme background and sets `print-color-adjust: exact`. WKWebView's
    `printOperation` honors `@media print`. (macOS 11.3+ API; target is macOS 26.)
- The handler runs Swift-side so the class is set → printed → cleared in order
  (no JS/print race).

### 3.2 JS (`web/app.js`)

- `const nativeBridge = window.webkit?.messageHandlers?.yijing || null;`
- **Markdown:** if `nativeBridge` → `postMessage({action:"saveMarkdown",
  filename, content})`; else current `downloadFile(...)`.
- **PDF:** replace the single `#exportPdf` button with a `<details class="pdf-menu">`
  (summary "PDF", two buttons: S/W, App-Design). Each calls `exportPdf(mode)`:
  - Set `--print-question` from the reading's question; add the mode class
    (`pdf-bw`/`pdf-glossy`) to `documentElement`; open all `#reading details`.
  - If `nativeBridge` → `postMessage({action:"savePdf", mode, filename})` (Swift
    handles the print; JS may leave class-setting to Swift to avoid races — Swift
    re-asserts the class before printing).
  - Else (browser) → `window.print()`, then restore (`setTimeout`) class +
    `<details>` state.
- Filename helper shared by both (`yijing-<date>-<slug>`).

### 3.3 CSS (`web/style.css`)

- Restructure the `@media print` block so the **color-forcing to white/black is
  scoped to `html.pdf-bw`** (and to the no-class default, for a stray Cmd+P).
  `html.pdf-glossy` keeps the active theme's `:root` variables (dark or light)
  and adds `@page { margin: 0 }`, a full-bleed background on `html, body,
  .reading`, and `print-color-adjust: exact`.
- Set `--print-question` is now done from JS; keep the `.reading::before`
  generated-content rule. Fix the dead `#resetBtn` → `#reset` (cosmetic).

## 4. Verification

- Swift compiles (the `build-macos-app.sh` build is the check). Commit, then
  `./scripts/build-macos-app.sh`, launch `dist/Yijing.app`, cast a reading:
  MD save opens a panel and writes a correct file; both PDF modes save a file;
  **glossy has no white margins and reflects the active theme**; the question
  appears in the PDF.
- Browser (`./serve.sh`, hard reload): MD downloads; both PDF modes via the
  print dialog; B/W clean; glossy best-effort full-bleed; question present.
- `node --check web/app.js`. `pages` sync + app rebuild on release.

## 5. Non-goals

- No JS PDF library (native print + browser print only; Zero-Dependency stays).
- No change to the Markdown serializer's content (the `.textContent`
  interpretation flattening is a known minor quality issue, out of scope).
- No data/text changes (those were sub-projects A/A2).

## 6. File-by-file

- **edit** `scripts/macos-app/Yijing.swift` — configured WKWebView + message
  handler (saveMarkdown / savePdf) + NSSavePanel + printOperation
- **edit** `web/app.js` — bridge detection, MD/PDF routing, PDF mode menu,
  `--print-question`, shared filename helper
- **edit** `web/index.html` — PDF button → mode menu (`<details>`/buttons)
- **edit** `web/i18n.js` — labels for the PDF modes
- **edit** `web/style.css` — `html.pdf-bw` / `html.pdf-glossy` print modes,
  `#resetBtn`→`#reset`
- **edit** `docs/MACOS-APP.md` — note the native export bridge
- **release** — `sync-pages.sh` (web/data) + `build-macos-app.sh`
