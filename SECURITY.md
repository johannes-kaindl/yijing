<!--
SPDX-FileCopyrightText: 2026 Johannes Kaindl
SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Sicherheits-Meldungen

Yijing-Orakel ist ein **Hobbyprojekt** ohne Security-Team, ohne SLA und
ohne Bug-Bounty. Trotzdem freue ich mich über Hinweise auf
sicherheitsrelevante Probleme und versuche, sie zeitnah zu beheben.

## Was hier rein gehört

- **Cross-Site Scripting** in der gerenderten Reading oder im
  Markdown-Output (sowohl Wilhelm-Texten als auch LLM-Antworten).
- **Pfad-Traversal** im Static-Server (`scripts/serve.py` für Dev oder
  `scripts/macos-app/StaticServer.swift` für die App).
- **Daten-Exfiltration** über fehlkonfigurierte CORS-Pfade oder
  Service-Worker-Verhalten.
- **Code-Injection** über manipuliertes localStorage, URL-Hash
  (`#r=<uuid>`) oder Endpunkt-Konfiguration.
- **macOS-App-Bundle-Themen**: Plist-Quirks, WKWebView-Allowlist,
  unkontrollierte URL-Schemes, Listener-Bindings nicht auf Loopback.

Wenn du dir nicht sicher bist, ob etwas reinfällt: lieber melden.

## Was nicht hier rein gehört

- Allgemeine Bug-Reports (kein Sicherheitsbezug) — bitte als
  öffentliches Issue: <https://codeberg.org/jkaindl/Yijing/issues>.
- Sicherheitsthemen in **externen LLM-Servern** (Ollama, MLX,
  LM Studio, vLLM, OpenClaw) — gehören in deren Projekte.
- Allgemeine Härtungs-Vorschläge ohne konkretes Angriffsszenario —
  gerne als normales Issue mit `enhancement`-Label.

## Wie melden

**Bevorzugt:** privates Codeberg-Issue im Repo, oder PM via Codeberg an
[@jkaindl](https://codeberg.org/jkaindl). Codeberg unterstützt private
Issues — beim Anlegen das Privacy-Häkchen setzen.

**Alternativ:** E-Mail an die Adresse, die im
[Codeberg-Profil](https://codeberg.org/jkaindl) hinterlegt ist. Wenn
keine sichtbar ist, schreib eine kurze PM mit Bitte um Mail-Adresse —
dann ohne Details, die schon im ersten Schritt vertraulich bleiben
sollen.

PGP ist nicht aufgesetzt; für sensible Reports kann ich auf Anfrage
einen Schlüssel veröffentlichen.

## Was du erwarten kannst

- **Eingangsbestätigung** innerhalb von 7 Tagen.
- **Erste Einschätzung** (Reproduktion, Schweregrad, geplantes Vorgehen)
  innerhalb von 14 Tagen.
- **Fix oder dokumentierter Workaround** so schnell wie für ein
  Hobbyprojekt realistisch ist — kritisch: Tage, normal: Wochen.
- **Credit** im `CHANGELOG.md` und Release-Notes, wenn du das möchtest.
  Standardmäßig anonym, auf Wunsch mit Namen und Link.

## Scope und Threat-Model

Yijing ist **single-tenant, single-user, lokal**:

- Kein Auth, keine Sessions, keine Multi-User-Daten.
- LLM-Server werden über Loopback (`127.0.0.1`) angesprochen — nicht
  über öffentliche Netze.
- Der Dev-Server (`scripts/serve.py`) bindet explizit auf `127.0.0.1`.
- API-Keys (für nicht-lokale OpenAI-kompatible Endpunkte, sofern
  jemand sowas einträgt) liegen im localStorage des Geräts.
- Der Service Worker cached same-origin-Requests network-first.

Reports, die diese Annahmen verletzen (Multi-User, exponierter Port,
synchronisierte Keys), sind im Scope und besonders willkommen.

## Bekannte Designentscheidungen, die kein Bug sind

- **Markdown wird first escaped, dann sanitized.** Links nur mit
  `http(s):` / `mailto:`. Trotzdem: Reports zu Renderer-Bypass sind
  willkommen.
- **`localStorage` ist nicht verschlüsselt.** Das ist Browser-Standard;
  Geräte-Sicherheit liegt beim Nutzer.
- **Die macOS-App ist nicht Apple-notarisiert.** Gatekeeper warnt beim
  ersten Start — das ist erwartet und in der README dokumentiert.
- **`_archiv/yijing_1/.env`** enthält historisch einen Klartext-Google-
  API-Key. Der Ordner ist per `.gitignore` ausgeschlossen und niemals
  committet. Wer das _archiv lokal hat: bitte rotieren.
