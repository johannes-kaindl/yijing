<!--
SPDX-FileCopyrightText: 2026 Johannes Kaindl
SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Contributing

Glad you want to join in. Yijing Oracle is a hobby project with
clear architectural decisions — the most important ones are in
[`AGENTS.md`](AGENTS.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
Please read them before making larger changes.

## What goes over well

- **Bugfixes** with a small, clearly scoped diff
- **Data improvements** (clean Wilhelm sources, better Pīnyīn
  transliterations, trigram master data)
- **UI translations** (currently German only)
- **Cleaner print styles** for PDF export
- **More LLM backend adapters** (vLLM, llama.cpp HTTP server, etc.)
- **A11y improvements** (ARIA labels, keyboard navigation, screen reader)
- **Doc patches** — typos, more precise explanations, new diagrams

## What does not fit well

- **Frameworks** (React/Vue/Svelte/…) — we deliberately stay Vanilla
- **Build steps** (Webpack/Vite/…) — no npm in the repo
- **TypeScript** — JSDoc is enough
- **Backend services** — the app is a static site
- **Cloud LLM connections without a clear opt-in** — the default is local models

## Branches

The repo has two branches:

- **`main`** — development. PRs always go in here.
- **`pages`** — the deployment for [Codeberg Pages](https://jkaindl.codeberg.page/Yijing/).
  Has a flat layout (contents of `web/` directly in the root) and is pulled
  in manually from `main` by the maintainer. **As a contributor you do not
  need to touch `pages` yourself** — focus on `main`.

Details on the sync convention are in [`AGENTS.md`](AGENTS.md).

## Issue or PR?

- **Issue first** for larger changes, new features, architecture
  questions — use the templates under
  [New issue → choose template](https://codeberg.org/jkaindl/Yijing/issues/new/choose).
- **PR directly** for typos, small data corrections, obvious
  bugfixes.
- **Security topics** → never a public issue, but see
  [`SECURITY.md`](SECURITY.md).

## Local setup

```bash
git clone https://codeberg.org/jkaindl/Yijing.git yijing
cd yijing
./serve.sh                   # opens http://localhost:8765/web/index.html
```

Requirement: Python 3.9+. For the AI interpretation you additionally need Ollama or
an OpenAI-compatible local server (see [`docs/LLM.md`](docs/LLM.md)).
To build the macOS app: Xcode Command Line Tools (see
[`docs/MACOS-APP.md`](docs/MACOS-APP.md)).

## PR checklist

- [ ] `node --check web/*.js` is clean
- [ ] For changes to King Wen lookups / data schema:
      `node scripts/test-kingwen.mjs` is green
- [ ] Tested in the browser (hard reload, cast, AI interpretation if applicable)
- [ ] CSS changes checked in desktop + mobile + print preview and in
      both themes (dark/light)
- [ ] For data changes: `python3 scripts/build_data.py` runs without
      errors, counters in the output consistent (64/64 hexagrams, 64/64
      characters)
- [ ] For macOS app changes: `./scripts/build-macos-app.sh` builds
      through, app starts, shows content, exits cleanly
- [ ] `CHANGELOG.md` updated (`[Unreleased]` section)
- [ ] For changes to `web/`, `sw.js` or `data/`: note briefly in the PR
      comment so that the `pages` sync is not forgotten after the merge
      (the maintainer does it)
- [ ] Commit messages meaningful (why, not what)

## Commit style

- First line: imperative, ~70 characters
- Blank line
- Body: why, context, caveats if applicable
- Co-author trailers allowed (e.g. for AI assistance)

Example:

```
Fix CORS setup note for Ollama on macOS

OLLAMA_ORIGINS must be exported before `ollama serve` — the README had
documented this in the wrong order.
```

## License of contributions

By opening a PR you agree that your
contribution will be published under the same licenses as the
overall project:

- **Code changes** under [AGPL-3.0-or-later](LICENSE)
- **Doc changes** under [CC BY-SA 4.0](LICENSE-DOCS)

Please create new code files with an SPDX header:

```js
// SPDX-FileCopyrightText: 2026 <Your Name>
// SPDX-License-Identifier: AGPL-3.0-or-later
```

## Code of Conduct

Be kind, be precise, be reliable. In case of conflict: first understand
the problem, then react. We are in a hobby context here — a
good tone matters more than any feature.
