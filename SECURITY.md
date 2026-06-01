<!--
SPDX-FileCopyrightText: 2026 Johannes Kaindl
SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Reporting Security Issues

Yijing Oracle is a **hobby project** with no security team, no SLA and
no bug bounty. Even so, I welcome pointers to security-relevant problems
and try to fix them promptly.

## What belongs here

- **Cross-Site Scripting** in the rendered reading or in the
  Markdown output (both Wilhelm texts and LLM responses).
- **Path traversal** in the static server (`scripts/serve.py` for dev or
  `scripts/macos-app/StaticServer.swift` for the app).
- **Data exfiltration** via misconfigured CORS paths or
  service worker behavior.
- **Code injection** via manipulated localStorage, URL hash
  (`#r=<uuid>`) or endpoint configuration.
- **macOS app bundle topics**: plist quirks, WKWebView allowlist,
  uncontrolled URL schemes, listener bindings not on loopback.

If you are not sure whether something fits: better to report it.

## What does not belong here

- General bug reports (no security relevance) — please file as a
  public issue: <https://codeberg.org/jkaindl/Yijing/issues>.
- Security topics in **external LLM servers** (Ollama, MLX,
  LM Studio, vLLM, OpenClaw) — these belong in their own projects.
- General hardening suggestions without a concrete attack scenario —
  feel free to file as a normal issue with the `enhancement` label.

## How to report

**Preferred:** a private Codeberg issue in the repo, or a PM via Codeberg to
[@jkaindl](https://codeberg.org/jkaindl). Codeberg supports private
issues — tick the privacy checkbox when creating one.

**Alternatively:** email to the address listed in the
[Codeberg profile](https://codeberg.org/jkaindl). If
none is visible, send a short PM asking for the email address —
then without details that should stay confidential in the first
step.

PGP is not set up; for sensitive reports I can publish a key on request.

## What you can expect

- **Acknowledgment of receipt** within 7 days.
- **Initial assessment** (reproduction, severity, planned approach)
  within 14 days.
- **Fix or documented workaround** as quickly as is realistic for a
  hobby project — critical: days, normal: weeks.
- **Credit** in the `CHANGELOG.md` and release notes, if you want it.
  Anonymous by default, with name and link on request.

## Scope and Threat Model

Yijing is **single-tenant, single-user, local**:

- No auth, no sessions, no multi-user data.
- LLM servers are addressed over loopback (`127.0.0.1`) — not
  over public networks.
- The dev server (`scripts/serve.py`) binds explicitly to `127.0.0.1`.
- API keys (for non-local OpenAI-compatible endpoints, if
  someone enters such a thing) live in the device's localStorage.
- The service worker caches same-origin requests network-first.

Reports that violate these assumptions (multi-user, exposed port,
synced keys) are in scope and especially welcome.

## Known Design Decisions That Are Not Bugs

- **Markdown is first escaped, then sanitized.** Links only with
  `http(s):` / `mailto:`. Even so: reports on renderer bypasses are
  welcome.
- **`localStorage` is not encrypted.** This is browser-standard;
  device security is up to the user.
- **The macOS app is Developer ID-signed and Apple-notarized.** Official
  release DMGs launch with no Gatekeeper warning. A locally built,
  un-notarized app (a contributor without a certificate) still warns on
  first launch — expected; see `docs/MACOS-APP.md`.
- **`_archiv/yijing_1/.env`** historically contains a plaintext Google
  API key. The folder is excluded via `.gitignore` and never
  committed. If you have the _archiv locally: please rotate it.
