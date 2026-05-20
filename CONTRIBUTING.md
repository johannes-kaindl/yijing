# Beitragen

Schön, dass du mitmachen möchtest. Yijing-Orakel ist ein Hobbyprojekt mit
klaren Architekturentscheidungen — die wichtigsten stehen in
[`AGENTS.md`](AGENTS.md) und [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
Bitte vor größeren Änderungen lesen.

## Was gut ankommt

- **Bugfixes** mit kleinem, klar abgegrenztem Diff
- **Daten-Verbesserungen** (saubere Wilhelm-Quellen, bessere Pīnyīn-
  Transliterationen, Trigramm-Stammdaten)
- **Übersetzungen der UI** (aktuell nur Deutsch)
- **Sauberere Print-Styles** für PDF-Export
- **Mehr LLM-Backend-Adapter** (vLLM, llama.cpp HTTP-Server, etc.)
- **A11y-Verbesserungen** (ARIA-Labels, Keyboard-Navigation, Screenreader)

## Was nicht gut passt

- **Frameworks** (React/Vue/Svelte/…) — wir bleiben bewusst Vanilla
- **Build-Steps** (Webpack/Vite/…) — kein npm im Repo
- **TypeScript** — JSDoc reicht
- **Backend-Services** — die App ist Static-Site
- **Cloud-LLM-Anbindungen ohne klaren Opt-in** — Default sind lokale Modelle

## Issue oder PR?

- **Issue zuerst** bei größeren Änderungen, neuen Features, Architektur-
  fragen
- **Direkt PR** bei Tippfehlern, kleinen Daten-Korrekturen, offensichtlichen
  Bugfixes

## PR-Checkliste

- [ ] `node --check web/*.js` ist sauber
- [ ] Im Browser getestet (hard-reload, Wurf, ggf. KI-Interpretation)
- [ ] CSS-Änderungen in Desktop + Mobile + Print-Vorschau geprüft
- [ ] Bei Daten-Änderungen: `python3 scripts/build_data.py` läuft ohne
      Fehler
- [ ] `CHANGELOG.md` ergänzt
- [ ] Commit-Messages aussagekräftig (warum, nicht was)

## Commit-Stil

- Erste Zeile: Imperativ, ~70 Zeichen
- Leerzeile
- Body: warum, Kontext, ggf. Caveats
- Co-Autoren-Trailer erlaubt (z.B. für KI-Assistenz)

Beispiel:

```
Fix CORS-Setup-Hinweis für Ollama auf macOS

OLLAMA_ORIGINS muss vor `ollama serve` exportiert sein — die README hatte
das in der falschen Reihenfolge dokumentiert.
```

## Code of Conduct

Sei nett, sei präzise, sei verbindlich. Bei Konflikten: erst das Problem
verstehen, dann reagieren. Wir sind hier in einem Hobby-Kontext — ein
guter Ton ist wichtiger als jedes Feature.
