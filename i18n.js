// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
/**
 * i18n-Layer — kein Framework, nur ein Dict + `t()`.
 *
 * Init: `initI18n()` einmal beim Boot. Liest persistierte Sprache aus
 * localStorage["yijing-language-v1"] oder fällt auf `navigator.language`
 * zurück (Default: DE, EN bei navigator.language=en*).
 *
 * Sprachwechsel: `setLang("en")` setzt `<html lang>`, persistiert die Wahl
 * und ruft `applyI18n(root)` auf — durchläuft alle `[data-i18n*]`-Knoten und
 * ersetzt `textContent` bzw. das angegebene Attribut. Listener auf
 * `i18n:changed` (CustomEvent auf document) erlauben Re-Render dynamischer
 * Bereiche (z.B. Verlauf, dynamisch gerenderte Endpoint-Liste).
 *
 * Template-Slots: `t("key", { name: "Foo" })` ersetzt `{name}` im Wert.
 */

const STORAGE_KEY = "yijing-language-v1";

const STRINGS = {
  de: {
    // ——— Document / SEO ———
    "doc.title": "Yijing Orakel",
    "doc.description":
      "I-Ging-Orakel als Static-Site mit Wilhelm-Übersetzung und optionaler KI-Deutung über lokale LLM-Server (Ollama / MLX / LM Studio). Vanilla JS, offline-fähig, mit nativer macOS-App.",
    "og.description":
      "I-Ging-Orakel als Static-Site — Drei-Münzen-Methode, Wilhelm-Übersetzung, optionale KI-Deutung über lokale LLM-Server. Offline-fähig als PWA.",
    "og.locale": "de_DE",

    // ——— Header ———
    "header.openSettings": "Einstellungen",
    "header.themeToggle": "Erscheinungsbild umschalten",
    "header.tagline": "Drei-Münzen-Methode · Wilhelm-Übersetzung · lokale Modelle",

    // ——— Ask / Reading ———
    "ask.label": "Deine Frage",
    "ask.placeholder": "Worum geht es? (optional – aber Konzentration hilft)",
    "ask.cast": "Orakel befragen",
    "ask.reset": "Neue Frage",
    "ask.exportMd": "Markdown",
    "ask.exportMd.title": "Als Markdown exportieren",
    "ask.exportPdf": "PDF",
    "ask.exportPdf.title": "Als PDF drucken / speichern",
    "ask.share": "Teilen",
    "ask.pdfBw": "PDF (S/W)",
    "ask.pdfGlossy": "PDF (App-Design)",

    "reading.primary": "Ursprungsbild",
    "reading.resulting": "Zielbild",
    "reading.changingLines": "Wandelnde Linien",
    "reading.resultingJudgment": "Urteil des Zielbilds",
    "reading.resultingJudgmentOf": "Urteil — {name}",
    "reading.judgment": "Das Urteil",
    "reading.image": "Das Bild",
    "reading.meaning": "Bedeutung",
    "reading.trigrams": "Trigramme",
    "reading.notes": "Anmerkungen",
    "reading.trigramAbove": "oben",
    "reading.trigramBelow": "unten",
    "reading.trigramOver": "über", // "Trigramm X über Trigramm Y"

    // ——— Reader / Nachschlagewerk ———
    "nav.oracle": "Orakel",
    "nav.reader": "Nachschlagewerk",
    "reader.prev": "Vorheriges Hexagramm",
    "reader.next": "Nächstes Hexagramm",
    "reader.index": "Übersicht aller 64 Hexagramme",
    "reader.allLines": "Die einzelnen Linien",

    // ——— LLM-Interpretation ———
    "llm.heading": "KI-Interpretation",
    "llm.endpointSelect": "LLM-Endpunkt",
    "llm.modelSelect": "Modell",
    "llm.thinkingSelect": "Reasoning-Modus",
    "llm.thinkingSelect.title": "Reasoning / Thinking",
    "llm.thinking.default": "Reasoning: Default",
    "llm.thinking.on": "Reasoning: An",
    "llm.thinking.off": "Reasoning: Aus",
    "llm.interpret": "Interpretieren",
    "llm.disclaimer": "Reflexion, keine Vorhersage.",
    "llm.stop": "Abbrechen",
    "llm.thinkingDetails": "Denkprozess",
    "llm.bodyPlaceholder": "Wähle Endpunkt + Modell und klick „Interpretieren“.",
    "llm.bodyPlaceholderSimple": "Klick auf „Interpretieren“ für eine KI-Deutung.",

    "llm.setup.title": "KI-Interpretation",
    "llm.setup.explain":
      "Die KI-Interpretation braucht einen eigenen LLM-Endpoint — lokal am Desktop (Ollama/MLX) oder erreichbar als Remote-Endpoint. Würfeln und Nachschlagewerk funktionieren auch ohne.",
    "llm.setup.configure": "In Einstellungen einrichten",
    "llm.setup.guide": "Anleitung",
    "llm.setup.dismiss": "Hinweis ausblenden",

    "image.generate": "Meditationsbild",
    "image.regenerate": "Neues Bild",
    "image.generating": "Bild wird erzeugt … (das kann einen Moment dauern)",
    "image.error": "Das Bild konnte nicht erzeugt werden. Versuch es noch einmal.",
    "image.alt": "Meditationsbild zur Weissagung",

    // Dev-Sweep (Prompt-Test-Harness, nur Dev-Build)
    "sweep.heading": "Prompt-Sweep (Dev)",
    "sweep.text": "Text",
    "sweep.image": "Bild",
    "sweep.pacing": "Pause (ms)",
    "sweep.start": "Sweep starten",
    "sweep.abort": "Abbrechen",
    "sweep.status.running": "Fall {current}/{total} — {id} ({stage})",
    "sweep.status.done": "Fertig: {n} Fälle, {errors} Fehler — Export {dir}",
    "sweep.status.aborted": "Abgebrochen nach Fall {current}/{total}.",
    "sweep.status.error": "Sweep fehlgeschlagen: {message}",

    "llm.status.thinking": "… denke nach",
    "llm.status.aborted": "Abgebrochen.",
    "llm.status.error": "Fehler: {message}",
    "llm.status.done": "{chars} Zeichen · {seconds}s · {model}{think}",
    "llm.status.thinkOn": " · think:on",
    "llm.status.thinkOff": " · think:off",
    "llm.status.needEndpoint": "Bitte erst Endpunkt einrichten (⚙).",
    "llm.status.needModel": "Bitte ein Modell wählen.",

    "llm.option.noEndpoint": "(kein Endpunkt — ⚙ öffnen)",
    "llm.option.loadingModels": "… lade Modelle",
    "llm.option.noModels": "(keine Modelle)",
    "llm.option.unreachable": "(nicht erreichbar)",

    // ——— History ———
    "history.heading": "Verlauf",
    "history.clear": "Verlauf löschen",
    "history.clearConfirm": "Verlauf wirklich löschen?",
    "history.delete": "Eintrag löschen",
    "history.pin": "Anheften",
    "history.unpin": "Lösen",

    // ——— Settings-Modal ———
    "settings.heading": "Einstellungen",
    "settings.close": "Schließen",
    "settings.endpoints": "LLM-Endpunkte",
    "settings.activeEndpoint": "Für Deutung:",
    "settings.activeModel": "Modell:",
    "settings.endpoints.hint":
      'Lokale Modelle via <strong>Ollama</strong> (Standardport <code>11434</code>) oder <strong>OpenAI-kompatibel</strong> (MLX, LM Studio …). CORS auf dem Server muss erlaubt sein — für Ollama z.&nbsp;B. <code>OLLAMA_ORIGINS=*</code>.',
    "settings.endpoints.add": "+ Endpunkt hinzufügen",
    "settings.endpoints.empty": "Noch keine Endpunkte. Füge unten einen hinzu.",
    "settings.endpoints.name": "Name",
    "settings.endpoints.namePlaceholder": "z.B. Ollama lokal",
    "settings.endpoints.type": "Typ",
    "settings.endpoints.typeOllama": "Ollama",
    "settings.endpoints.typeOpenAI": "OpenAI-kompatibel",
    "settings.endpoints.url": "URL",
    "settings.endpoints.apiKey": "API-Key (optional)",
    "settings.endpoints.addBtn": "Hinzufügen",
    "settings.endpoints.defaultModel": "Standard-Modell",
    "settings.endpoints.noneSelected": "— keins gewählt —",
    "settings.endpoints.test": "Verbindung testen",
    "settings.endpoints.testThinking": "Reasoning testen",
    "settings.endpoints.remove": "Entfernen",
    "settings.endpoints.removeConfirm": 'Endpunkt "{name}" entfernen?',
    "settings.endpoints.testing": "… teste Verbindung",
    "settings.endpoints.testOk": "OK — {count} Modell(e): {models}{more}",
    "settings.endpoints.testError": "Fehler — {message}",
    "settings.endpoints.thinkingProbe.findingModels": "… ermittle Modelle",
    "settings.endpoints.thinkingProbe.noModels": "Keine Modelle verfügbar",
    "settings.endpoints.thinkingProbe.testing": "teste mit <code>{model}</code> …",
    "settings.endpoints.thinkingProbe.modelLabel": "Modell:",
    "settings.endpoints.thinkingProbe.verdictOk":
      "Steuerung funktioniert — Reasoning lässt sich an- und ausschalten.",
    "settings.endpoints.thinkingProbe.verdictWarnOnSucceededOffFailed":
      'Reasoning kommt, aber „Aus" wurde nicht respektiert. (Server-Args dominieren?)',
    "settings.endpoints.thinkingProbe.verdictWarnOffOnly":
      '„Aus" funktioniert, aber Reasoning konnte nicht erzwungen werden.',
    "settings.endpoints.thinkingProbe.verdictErr":
      "Keine Reasoning-Tokens beobachtet — dieses Modell unterstützt es vermutlich nicht.",
    "settings.endpoints.addMissingFields": "Name und URL angeben.",
    "settings.endpoints.mixedContentWarn":
      "Diese Seite läuft über HTTPS und kann keinen HTTP-Endpoint erreichen (außer localhost). Nutze einen HTTPS-Endpoint — z. B. „tailscale serve“.",

    "settings.thinkingDefault": "Reasoning-Default",
    "settings.thinkingDefault.hint":
      'Wird pro Wurf in der UI überschrieben. „Auto" = keine Steuerung, Modell entscheidet selbst. „An" / „Aus" setzt für jede Anfrage den passenden Parameter (Ollama: <code>think</code>, OpenAI-kompatibel: <code>reasoning_effort</code> + <code>chat_template_kwargs</code>).',
    "settings.thinkingDefault.label": "Default-Modus:",
    "settings.thinkingDefault.auto": "Auto (Modell entscheidet)",
    "settings.thinkingDefault.on": "An (Reasoning erzwingen)",
    "settings.thinkingDefault.off": "Aus (Reasoning unterdrücken)",
    "settings.thinkingDefault.short.auto": "Auto",
    "settings.thinkingDefault.short.on": "An",
    "settings.thinkingDefault.short.off": "Aus",

    "settings.systemPrompt": "Beratungs-Prompt",
    "settings.systemPrompt.hint":
      "System-Prompt für die KI-Interpretation. Default folgt der Wilhelm-Tradition (Würde, Mitgefühl, fünfteilige Beratungsstruktur).",
    "settings.systemPrompt.reset": "Default wiederherstellen",
    "settings.presets.label": "Vorlage:",
    "settings.presets.hint":
      "Fertige Stile als Startpunkt — frei editierbar. „Literarischer Kommentar“ senkt Verweigerungen zensierter Modelle (z. B. Apple Intelligence).",
    "settings.presets.custom": "— eigener Text —",
    "settings.presets.builtinGroup": "Vorlagen",
    "settings.presets.userGroup": "Eigene",
    "settings.presets.default": "Orakel (Wilhelm-Tradition)",
    "settings.presets.literary": "Literarischer Kommentar",
    "settings.presets.psychological": "Tiefenpsychologisch (Jung)",
    "settings.presets.concise": "Knapp & sachlich",
    "settings.presets.save": "Als Vorlage speichern",
    "settings.presets.delete": "Vorlage löschen",
    "settings.presets.namePrompt": "Name der Vorlage:",
    "settings.presets.nameRequired": "Bitte einen Namen für die Vorlage angeben.",
    "settings.presets.removeConfirm": "Vorlage „{name}“ löschen?",
    "settings.about": "Über",
    "settings.about.copyright":
      '© 2026 Johannes Kaindl · <a href="https://codeberg.org/jkaindl/Yijing/src/branch/main/LICENSE">AGPL-3.0-or-later</a> (Code) · <a href="https://codeberg.org/jkaindl/Yijing/src/branch/main/LICENSE-DOCS">CC BY-SA 4.0</a> (Doku) · <a href="https://codeberg.org/jkaindl/Yijing">Quellcode</a>',
    "settings.about.privacy":
      '<a href="privacy.html">Datenschutzerklärung</a>',
    "settings.about.disclaimer":
      "Yijing ist ein Werkzeug zur Reflexion und Kontemplation — keine Vorhersage der Zukunft.",

    "settings.language": "Sprache / Language",
    "settings.language.label": "Sprache:",
    "settings.language.hint":
      "Wirkt sofort auf die UI und auf den Beratungs-Prompt-Default. Lädt beim Wechsel die passenden Hexagramm-Texte nach.",
    "settings.language.de": "Deutsch (Wilhelm)",
    "settings.language.en": "English (Wilhelm — translated)",
    "settings.register": "Fassung / Wording",
    "settings.register.label": "Fassung:",
    "settings.register.hint":
      "Standardmäßig geschlechtsneutral. Schalte auf die historische Fassung, um Wilhelms Wortlaut von 1924 wörtlich zu lesen.",
    "settings.register.neutral": "Geschlechtsneutral",
    "settings.register.historical": "Historisch (Wilhelm 1924)",

    "settings.fontSize": "Schriftgröße",
    "settings.fontSize.hint":
      "Skaliert die Lese-Texte — Hexagramm-Texte und KI-Deutung.",
    "settings.fontSize.label": "Größe:",
    "settings.fontSize.sm": "Klein",
    "settings.fontSize.md": "Normal",
    "settings.fontSize.lg": "Groß",
    "settings.fontSize.xl": "Sehr groß",

    // ——— Theme-Knopf (Tooltip beschreibt die Klick-Aktion) ———
    "theme.toLight": "Zu hellem Design wechseln",
    "theme.toDark": "Zu dunklem Design wechseln",

    // ——— Footer ———
    "footer.langSwitch": "English version",
    "footer.source":
      "Text: Richard Wilhelm, <em>I Ging — Das Buch der Wandlungen</em>.<br>Drei-Münzen-Methode (Verteilung 1:3:3:1).",
    "footer.mac.also": "Auch als",
    "footer.mac.app": "macOS-App",
    "footer.mac.available": "verfügbar",
    "footer.mac.install": "Installations-Hinweis",
    "footer.copyright.code": "(code)",
    "footer.copyright.docs": "(docs)",
    "footer.copyright.source": "Source",

    // ——— Boot-Fehler ———
    "boot.loadError":
      "Fehler beim Laden: {message}. Starte mit <code>./serve.sh</code> oder <code>python3 -m http.server</code>.",
    "boot.unknownBinary": "Unbekannte Binärrepräsentation: {binary}",
    "boot.dataLoadFailed": "Daten konnten nicht geladen werden",

    // ——— Markdown-Export ———
    "export.title": "# Yijing Orakel",
    "export.question": "**Frage:** {question}",
    "export.date": "**Datum:** {date}",
    "export.h2.primary": "## Ursprungsbild",
    "export.h2.changing": "## Wandelnde Linien",
    "export.h2.resulting": "## Zielbild",
    "export.h2.interpretation": "## KI-Interpretation",
    "export.h3.judgment": "### Das Urteil",
    "export.h3.image": "### Das Bild",
    "export.h3.meaning": "### Bedeutung",
    "export.trigramAbove": "- Oberes Trigramm: {symbol} {name} ({pinyin}) — {family}, {nature}",
    "export.trigramBelow": "- Unteres Trigramm: {symbol} {name} ({pinyin}) — {family}, {nature}",
    "export.attribution": "*Text: Richard Wilhelm — I Ging, Das Buch der Wandlungen.*",
    "export.filenameSlug": "yijing", // fallback when latin name missing

    // ——— Zhu-Xi-Linienregel (Reader-Methoden-Transparenz) ———
    "ruling.label": "Maßgeblich nach Tradition",
    "ruling.judgment-primary": "Keine wandelnde Linie — das Urteil des Hexagramms ist maßgeblich.",
    "ruling.line-primary": "Eine wandelnde Linie — ihr Text ist maßgeblich.",
    "ruling.lines-primary": "Zwei wandelnde Linien — beide gelten, die obere entscheidet.",
    "ruling.judgments-both": "Drei wandelnde Linien — die Urteile von Ursprungs- und Zielbild gelten, das Ursprungsurteil führt.",
    "ruling.lines-resulting": "Vier wandelnde Linien — die beiden ruhenden Linien des Zielbilds gelten, die untere entscheidet.",
    "ruling.line-resulting": "Fünf wandelnde Linien — die eine ruhende Linie des Zielbilds ist maßgeblich.",
    "ruling.judgment-resulting": "Sechs wandelnde Linien — das Urteil des Zielbilds ist maßgeblich.",
    "ruling.special-qian-kun": "Sechs wandelnde Linien — es gilt der Sonderspruch zur Anwendung der Neun bzw. der Sechs.",

    // ——— LLM-Prompt-Builder (User-Prompt) ———
    "prompt.question": "Frage: {question}",
    "prompt.noQuestion": "(keine konkrete Frage gestellt)",
    "prompt.primary": "=== URSPRUNGSBILD ===",
    "prompt.changing": "=== WANDELNDE LINIEN ===",
    "prompt.resulting": "=== ZIELBILD ===",
    "prompt.judgment": "Das Urteil:",
    "prompt.image": "Das Bild:",
    "prompt.meaning": "Bedeutung:",
    "prompt.trigrams": "Trigramme: oben {aboveSym} {aboveName} ({aboveNature}) · unten {belowSym} {belowName} ({belowNature})",
    "prompt.noChanging": "(Keine wandelnden Linien — nur das Ursprungsbild ist zu deuten.)",
    "prompt.tail": "Bitte interpretiere diese Konstellation in Bezug auf die Frage.",

    // ——— Auto-Discovery (Endpoint-Defaults) ———
    "discover.ollama": "Ollama lokal",
    "discover.mlx": "MLX lokal",
    "discover.lmstudio": "LM Studio lokal",
  },

  en: {
    // ——— Document / SEO ———
    "doc.title": "Yijing Oracle",
    "doc.description":
      "Static-site I Ching oracle with Wilhelm translation and optional AI interpretation via local LLM servers (Ollama / MLX / LM Studio). Vanilla JS, offline-capable, with a native macOS app.",
    "og.description":
      "Static-site I Ching oracle — three-coin method, Wilhelm translation, optional AI interpretation via local LLM servers. Offline-capable PWA.",
    "og.locale": "en_US",

    // ——— Header ———
    "header.openSettings": "Settings",
    "header.themeToggle": "Toggle appearance",
    "header.tagline": "Three-coin method · Wilhelm translation · local models",

    // ——— Ask / Reading ———
    "ask.label": "Your question",
    "ask.placeholder": "What's on your mind? (optional — but focus helps)",
    "ask.cast": "Consult the oracle",
    "ask.reset": "New question",
    "ask.exportMd": "Markdown",
    "ask.exportMd.title": "Export as Markdown",
    "ask.exportPdf": "PDF",
    "ask.exportPdf.title": "Print / save as PDF",
    "ask.share": "Share",
    "ask.pdfBw": "PDF (B/W)",
    "ask.pdfGlossy": "PDF (app style)",

    "reading.primary": "Primary hexagram",
    "reading.resulting": "Resulting hexagram",
    "reading.changingLines": "Changing lines",
    "reading.resultingJudgment": "Judgment of the resulting hexagram",
    "reading.resultingJudgmentOf": "Judgment — {name}",
    "reading.judgment": "The Judgment",
    "reading.image": "The Image",
    "reading.meaning": "Meaning",
    "reading.trigrams": "Trigrams",
    "reading.notes": "Notes",
    "reading.trigramAbove": "above",
    "reading.trigramBelow": "below",
    "reading.trigramOver": "over",

    // ——— Reader / reference ———
    "nav.oracle": "Oracle",
    "nav.reader": "Reference",
    "reader.prev": "Previous hexagram",
    "reader.next": "Next hexagram",
    "reader.index": "Index of all 64 hexagrams",
    "reader.allLines": "The individual lines",

    // ——— LLM-Interpretation ———
    "llm.heading": "AI interpretation",
    "llm.endpointSelect": "LLM endpoint",
    "llm.modelSelect": "Model",
    "llm.thinkingSelect": "Reasoning mode",
    "llm.thinkingSelect.title": "Reasoning / Thinking",
    "llm.thinking.default": "Reasoning: default",
    "llm.thinking.on": "Reasoning: on",
    "llm.thinking.off": "Reasoning: off",
    "llm.interpret": "Interpret",
    "llm.disclaimer": "Reflection, not prediction.",
    "llm.stop": "Stop",
    "llm.thinkingDetails": "Thinking trace",
    "llm.bodyPlaceholder": "Pick an endpoint and model, then click “Interpret”.",
    "llm.bodyPlaceholderSimple": "Click “Interpret” for an AI reading.",

    "llm.setup.title": "AI interpretation",
    "llm.setup.explain":
      "AI interpretation needs its own LLM endpoint — local on the desktop (Ollama/MLX) or reachable as a remote endpoint. Casting and the reference reader work without it.",
    "llm.setup.configure": "Set up in settings",
    "llm.setup.guide": "Guide",
    "llm.setup.dismiss": "Dismiss hint",

    "image.generate": "Meditation image",
    "image.regenerate": "New image",
    "image.generating": "Creating image … (this can take a moment)",
    "image.error": "The image could not be created. Please try again.",
    "image.alt": "Meditation image for the reading",

    // Dev sweep (prompt test-harness, dev builds only)
    "sweep.heading": "Prompt sweep (dev)",
    "sweep.text": "Text",
    "sweep.image": "Image",
    "sweep.pacing": "Pause (ms)",
    "sweep.start": "Start sweep",
    "sweep.abort": "Abort",
    "sweep.status.running": "Case {current}/{total} — {id} ({stage})",
    "sweep.status.done": "Done: {n} cases, {errors} errors — export {dir}",
    "sweep.status.aborted": "Aborted after case {current}/{total}.",
    "sweep.status.error": "Sweep failed: {message}",

    "llm.status.thinking": "… thinking",
    "llm.status.aborted": "Aborted.",
    "llm.status.error": "Error: {message}",
    "llm.status.done": "{chars} chars · {seconds}s · {model}{think}",
    "llm.status.thinkOn": " · think:on",
    "llm.status.thinkOff": " · think:off",
    "llm.status.needEndpoint": "Please configure an endpoint first (⚙).",
    "llm.status.needModel": "Please pick a model.",

    "llm.option.noEndpoint": "(no endpoint — open ⚙)",
    "llm.option.loadingModels": "… loading models",
    "llm.option.noModels": "(no models)",
    "llm.option.unreachable": "(unreachable)",

    // ——— History ———
    "history.heading": "History",
    "history.clear": "Clear history",
    "history.clearConfirm": "Really clear the history?",
    "history.delete": "Delete entry",
    "history.pin": "Pin",
    "history.unpin": "Unpin",

    // ——— Settings-Modal ———
    "settings.heading": "Settings",
    "settings.close": "Close",
    "settings.endpoints": "LLM endpoints",
    "settings.activeEndpoint": "For interpretation:",
    "settings.activeModel": "Model:",
    "settings.endpoints.hint":
      'Local models via <strong>Ollama</strong> (default port <code>11434</code>) or <strong>OpenAI-compatible</strong> (MLX, LM Studio …). CORS must be allowed on the server — for Ollama e.&nbsp;g. <code>OLLAMA_ORIGINS=*</code>.',
    "settings.endpoints.add": "+ Add endpoint",
    "settings.endpoints.empty": "No endpoints yet. Add one below.",
    "settings.endpoints.name": "Name",
    "settings.endpoints.namePlaceholder": "e.g. Ollama local",
    "settings.endpoints.type": "Type",
    "settings.endpoints.typeOllama": "Ollama",
    "settings.endpoints.typeOpenAI": "OpenAI-compatible",
    "settings.endpoints.url": "URL",
    "settings.endpoints.apiKey": "API key (optional)",
    "settings.endpoints.addBtn": "Add",
    "settings.endpoints.defaultModel": "Default model",
    "settings.endpoints.noneSelected": "— none selected —",
    "settings.endpoints.test": "Test connection",
    "settings.endpoints.testThinking": "Test reasoning",
    "settings.endpoints.remove": "Remove",
    "settings.endpoints.removeConfirm": 'Remove endpoint "{name}"?',
    "settings.endpoints.testing": "… testing connection",
    "settings.endpoints.testOk": "OK — {count} model(s): {models}{more}",
    "settings.endpoints.testError": "Error — {message}",
    "settings.endpoints.thinkingProbe.findingModels": "… finding models",
    "settings.endpoints.thinkingProbe.noModels": "No models available",
    "settings.endpoints.thinkingProbe.testing": "testing with <code>{model}</code> …",
    "settings.endpoints.thinkingProbe.modelLabel": "Model:",
    "settings.endpoints.thinkingProbe.verdictOk":
      "Control works — reasoning can be toggled on and off.",
    "settings.endpoints.thinkingProbe.verdictWarnOnSucceededOffFailed":
      '"Off" was not respected — reasoning still appeared. (Server-side args overriding?)',
    "settings.endpoints.thinkingProbe.verdictWarnOffOnly":
      '"Off" works, but reasoning could not be forced.',
    "settings.endpoints.thinkingProbe.verdictErr":
      "No reasoning tokens observed — this model likely doesn't support it.",
    "settings.endpoints.addMissingFields": "Please provide name and URL.",
    "settings.endpoints.mixedContentWarn":
      "This page runs over HTTPS and cannot reach an HTTP endpoint (except localhost). Use an HTTPS endpoint — e.g. “tailscale serve”.",

    "settings.thinkingDefault": "Reasoning default",
    "settings.thinkingDefault.hint":
      'Overridden per cast in the UI. "Auto" = no control, model decides. "On" / "Off" sets the matching parameter for each request (Ollama: <code>think</code>, OpenAI-compatible: <code>reasoning_effort</code> + <code>chat_template_kwargs</code>).',
    "settings.thinkingDefault.label": "Default mode:",
    "settings.thinkingDefault.auto": "Auto (model decides)",
    "settings.thinkingDefault.on": "On (force reasoning)",
    "settings.thinkingDefault.off": "Off (suppress reasoning)",
    "settings.thinkingDefault.short.auto": "Auto",
    "settings.thinkingDefault.short.on": "On",
    "settings.thinkingDefault.short.off": "Off",

    "settings.systemPrompt": "Counsel prompt",
    "settings.systemPrompt.hint":
      "System prompt for the AI interpretation. Default follows the Wilhelm tradition (dignity, compassion, five-part counsel structure).",
    "settings.systemPrompt.reset": "Restore default",
    "settings.presets.label": "Template:",
    "settings.presets.hint":
      "Ready-made styles as a starting point — freely editable. “Literary commentary” lowers refusals from censored models (e.g. Apple Intelligence).",
    "settings.presets.custom": "— custom text —",
    "settings.presets.builtinGroup": "Templates",
    "settings.presets.userGroup": "Your own",
    "settings.presets.default": "Oracle (Wilhelm tradition)",
    "settings.presets.literary": "Literary commentary",
    "settings.presets.psychological": "Depth-psychological (Jung)",
    "settings.presets.concise": "Concise & plain",
    "settings.presets.save": "Save as template",
    "settings.presets.delete": "Delete template",
    "settings.presets.namePrompt": "Template name:",
    "settings.presets.nameRequired": "Please enter a name for the template.",
    "settings.presets.removeConfirm": "Delete template “{name}”?",
    "settings.about": "About",
    "settings.about.copyright":
      '© 2026 Johannes Kaindl · <a href="https://codeberg.org/jkaindl/Yijing/src/branch/main/LICENSE">AGPL-3.0-or-later</a> (code) · <a href="https://codeberg.org/jkaindl/Yijing/src/branch/main/LICENSE-DOCS">CC BY-SA 4.0</a> (docs) · <a href="https://codeberg.org/jkaindl/Yijing">Source</a>',
    "settings.about.privacy":
      '<a href="privacy.html">Privacy Policy</a>',
    "settings.about.disclaimer":
      "Yijing is a tool for reflection and contemplation — not a prediction of the future.",

    "settings.language": "Sprache / Language",
    "settings.language.label": "Language:",
    "settings.language.hint":
      "Takes effect immediately on the UI and the counsel-prompt default. Loads the matching hexagram texts on switch.",
    "settings.language.de": "Deutsch (Wilhelm)",
    "settings.language.en": "English (Wilhelm — translated)",
    "settings.register": "Fassung / Wording",
    "settings.register.label": "Wording:",
    "settings.register.hint":
      "Gender-neutral by default. Switch to the historical wording to read Wilhelm's 1924 text verbatim.",
    "settings.register.neutral": "Gender-neutral",
    "settings.register.historical": "Historical (Wilhelm 1924)",

    "settings.fontSize": "Font size",
    "settings.fontSize.hint":
      "Scales the reading text — hexagram texts and AI interpretation.",
    "settings.fontSize.label": "Size:",
    "settings.fontSize.sm": "Small",
    "settings.fontSize.md": "Normal",
    "settings.fontSize.lg": "Large",
    "settings.fontSize.xl": "Extra large",

    // ——— Theme button (tooltip describes the click action) ———
    "theme.toLight": "Switch to light mode",
    "theme.toDark": "Switch to dark mode",

    // ——— Footer ———
    "footer.langSwitch": "Deutsche Version",
    "footer.source":
      "Text: Richard Wilhelm, <em>I Ching — The Book of Changes</em>.<br>Three-coin method (distribution 1:3:3:1).",
    "footer.mac.also": "Also available as a",
    "footer.mac.app": "macOS app",
    "footer.mac.available": "",
    "footer.mac.install": "Install notes",
    "footer.copyright.code": "(code)",
    "footer.copyright.docs": "(docs)",
    "footer.copyright.source": "Source",

    // ——— Boot errors ———
    "boot.loadError":
      "Failed to load: {message}. Start with <code>./serve.sh</code> or <code>python3 -m http.server</code>.",
    "boot.unknownBinary": "Unknown binary representation: {binary}",
    "boot.dataLoadFailed": "Could not load data",

    // ——— Markdown export ———
    "export.title": "# Yijing Oracle",
    "export.question": "**Question:** {question}",
    "export.date": "**Date:** {date}",
    "export.h2.primary": "## Primary hexagram",
    "export.h2.changing": "## Changing lines",
    "export.h2.resulting": "## Resulting hexagram",
    "export.h2.interpretation": "## AI interpretation",
    "export.h3.judgment": "### The Judgment",
    "export.h3.image": "### The Image",
    "export.h3.meaning": "### Meaning",
    "export.trigramAbove": "- Upper trigram: {symbol} {name} ({pinyin}) — {family}, {nature}",
    "export.trigramBelow": "- Lower trigram: {symbol} {name} ({pinyin}) — {family}, {nature}",
    "export.attribution":
      "*Text: Richard Wilhelm — I Ching, The Book of Changes (translated from the German edition).*",
    "export.filenameSlug": "yijing",

    // ——— Zhu-Xi line rule (reader method transparency) ———
    "ruling.label": "Decisive by tradition",
    "ruling.judgment-primary": "No moving line — the hexagram's judgment is decisive.",
    "ruling.line-primary": "One moving line — its text is decisive.",
    "ruling.lines-primary": "Two moving lines — both apply; the upper one decides.",
    "ruling.judgments-both": "Three moving lines — the judgments of the primary and resulting hexagrams apply; the primary leads.",
    "ruling.lines-resulting": "Four moving lines — the two resting lines of the resulting hexagram apply; the lower decides.",
    "ruling.line-resulting": "Five moving lines — the single resting line of the resulting hexagram is decisive.",
    "ruling.judgment-resulting": "Six moving lines — the judgment of the resulting hexagram is decisive.",
    "ruling.special-qian-kun": "Six moving lines — the special text “use of the nine/six” applies.",

    // ——— LLM prompt builder (user prompt) ———
    "prompt.question": "Question: {question}",
    "prompt.noQuestion": "(no specific question asked)",
    "prompt.primary": "=== PRIMARY HEXAGRAM ===",
    "prompt.changing": "=== CHANGING LINES ===",
    "prompt.resulting": "=== RESULTING HEXAGRAM ===",
    "prompt.judgment": "The Judgment:",
    "prompt.image": "The Image:",
    "prompt.meaning": "Meaning:",
    "prompt.trigrams":
      "Trigrams: above {aboveSym} {aboveName} ({aboveNature}) · below {belowSym} {belowName} ({belowNature})",
    "prompt.noChanging":
      "(No changing lines — interpret only the primary hexagram.)",
    "prompt.tail":
      "Please interpret this constellation in relation to the question.",

    // ——— Auto-discovery (endpoint defaults) ———
    "discover.ollama": "Ollama local",
    "discover.mlx": "MLX local",
    "discover.lmstudio": "LM Studio local",
  },
};

let currentLang = null;

function detectInitialLanguage() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "de" || saved === "en") return saved;
  const browser = (navigator.language || "de").toLowerCase();
  return browser.startsWith("en") ? "en" : "de";
}

export function getLang() {
  if (currentLang === null) currentLang = detectInitialLanguage();
  return currentLang;
}

export function setLang(lang) {
  if (lang !== "de" && lang !== "en") return;
  if (currentLang === lang) return;
  currentLang = lang;
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;
  applyI18n(document);
  document.dispatchEvent(new CustomEvent("i18n:changed", { detail: { lang } }));
}

export function t(key, params = null) {
  const dict = STRINGS[getLang()] || STRINGS.de;
  let s = dict[key];
  if (s === undefined) {
    // eslint-disable-next-line no-console
    console.warn("i18n missing:", key, "in", getLang());
    s = STRINGS.de[key] !== undefined ? STRINGS.de[key] : key;
  }
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replaceAll("{" + k + "}", String(v));
    }
  }
  return s;
}

/**
 * Wendet i18n auf alle annotierten Knoten unter `root` an. Sucht nach:
 *  - data-i18n            → textContent = t(key)
 *  - data-i18n-html       → innerHTML   = t(key)   (für Markup-tragende Strings)
 *  - data-i18n-title      → title-Attribut
 *  - data-i18n-aria       → aria-label-Attribut
 *  - data-i18n-placeholder → placeholder-Attribut
 *  - data-i18n-content    → content-Attribut (für <meta>-Tags)
 */
export function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  root.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  root.querySelectorAll("[data-i18n-content]").forEach((el) => {
    el.setAttribute("content", t(el.dataset.i18nContent));
  });
}

/** Localizer für Datum/Zeit, die nicht in STRINGS abgelegt sind. */
export function localeTag() {
  return getLang() === "en" ? "en-US" : "de-DE";
}

/** Beim Boot einmal aufrufen — setzt html-lang + initialen Inhalt. */
export function initI18n() {
  document.documentElement.lang = getLang();
  applyI18n(document);
}
