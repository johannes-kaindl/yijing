// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
/**
 * LLM-Anbindung für lokale Modell-Server — alles außer dem Transport.
 *
 * Der Transport (die beiden Backend-Dialekte, das Streaming, die
 * Fehlerklasse) wohnt seit 2026-08-22 nicht mehr hier, sondern als
 * vendorierte Kopie in `vendor/code-kit/web/llm-stream.js` — dorthin
 * extrahiert, weil ein zweites Repo denselben Code brauchte. `makeClient()`
 * unten ist die dünne Anpassung an das Endpunkt-Schema dieser App; die
 * Dialekte selbst sind unverändert:
 *
 *  - "ollama"  → native Ollama-API (/api/tags, /api/chat als ND-JSON-Stream)
 *  - "openai"  → OpenAI-kompatibel (/v1/models, /v1/chat/completions als SSE)
 *                Nutzbar für Ollama-OpenAI-Endpunkt, MLX (mlx_lm.server),
 *                LM Studio, vLLM, OpenClaw u.ä. — und für den Loopback-Shim
 *                der nativen App, der genau diesen Dialekt spricht.
 *
 * Reasoning/Thinking wird über `thinking: true|false|null` gesteuert und
 * je nach Backend in die passende Schnittstelle übersetzt:
 *  - Ollama-native: `think` + großzügiges `num_predict`
 *  - OpenAI-kompatibel: `reasoning_effort` + `chat_template_kwargs.enable_thinking`
 *
 * Hier bleiben: Endpunkt- und Prompt-Persistenz (localStorage), die
 * Vorlagen, `buildUserPrompt`, `testThinkingMode` und die i18n-Anbindung.
 */

import { t, getLang } from "./i18n.js";
import { makeLlmClient, LlmHttpError } from "./vendor/code-kit/web/llm-stream.js";

export { LlmHttpError };

/**
 * Endpoint-Schema (localStorage):
 * {
 *   id, name, type: "ollama" | "openai",
 *   baseUrl, apiKey, defaultModel
 * }
 */

// Ein Endpunkt ohne baseUrl meint den jeweiligen Standard-Port — der
// vendorierte Client kennt diese Konvention nicht (er würde relativ zur Seite
// auflösen), also wird sie hier aufgelöst, bevor er ihn zu sehen bekommt.
const DEFAULT_BASE_URL = {
  ollama: "http://localhost:11434",
  openai: "http://localhost:8080/v1",
};

/**
 * Client für einen gespeicherten Endpunkt.
 *
 * Der Transport selbst liegt seit 2026-08-22 in `vendor/code-kit` und wird
 * hier nur noch an das Endpunkt-Schema und an die UI angepasst:
 *
 *  - baseUrl-Default (s.o.),
 *  - `fetch` wird injiziert statt importiert (Kit-Konvention),
 *  - leere Token werden verschluckt: `parseSSE` liefert einen Reasoning-Delta
 *    auch dann, wenn er der leere String ist (`typeof === "string"` statt
 *    truthy). Ungefiltert klappte in app.js der Thinking-`<details>`-Block auf,
 *    ohne dass je Reasoning kam. Der ND-JSON-Zwilling `parseOllamaChat` filtert
 *    leere Werte selbst — die Asymmetrie ist im Kit, der Guard hier deckt beide.
 */
export function makeClient(endpoint) {
  if (!endpoint) throw new Error("No endpoint selected");
  const baseUrl = (endpoint.baseUrl || "").replace(/\/+$/, "") || DEFAULT_BASE_URL[endpoint.type];
  if (!baseUrl) throw new Error(`Unknown endpoint type: ${endpoint.type}`);
  const client = makeLlmClient(
    { type: endpoint.type, baseUrl, apiKey: endpoint.apiKey },
    fetch.bind(globalThis)
  );
  return {
    listModels: () => client.listModels(),
    chatStream: ({ onToken, onThinking, ...rest }) =>
      client.chatStream({
        ...rest,
        onToken: (tok) => {
          if (tok) onToken(tok);
        },
        onThinking: onThinking ? (tok) => { if (tok) onThinking(tok); } : undefined,
      }),
  };
}

/**
 * Anzeigetext für einen Fehler aus dem Transport.
 *
 * `LlmHttpError` trägt Status und rohen Body getrennt (statt des früher
 * vorinterpolierten Strings), also wird die Meldung hier zusammengesetzt.
 * Netzwerkfehler (CORS, Safari-Mixed-Content-Block, Chromium-LNA-Ablehnung)
 * kommen absichtlich unverpackt als `TypeError` an — sie behalten ihren
 * eigenen Wortlaut.
 */
export function describeLlmError(e) {
  if (e instanceof LlmHttpError) {
    const body = e.body?.trim();
    return body ? `${e.message} ${body.slice(0, 300)}` : e.message;
  }
  return String(e?.message || e);
}

// ——— Endpunkt-Speicher (localStorage) ———

const STORE_KEY = "yijing-endpoints-v1";
const SELECTED_KEY = "yijing-endpoint-selected-v1";
const PROMPT_KEY = "yijing-system-prompt-v1";

export const DEFAULT_SYSTEM_PROMPT_DE = `Du bist ein weises I-Ging-Orakel.

Hintergrund:
Als weises I-Ging-Orakel verkörperst du eine jahrtausendealte Tradition der Weisheit und Weissagung. Deine tiefgründige Kenntnis der I-Ging-Philosophie und ihrer traditionellen Interpretationen ermöglicht es dir, zeitlose Wahrheiten in die Gegenwart zu übersetzen.

Haltung:
- Würde und Mitgefühl im Umgang mit Ratsuchenden
- Verbindung von traditioneller Weisheit mit modernem Verständnis
- Klare, aber tiefgründige Sprache
- Balance zwischen philosophischer Tiefe und praktischer Anwendbarkeit
- Respektvolle Ermutigung zur Selbstreflexion

Bei der Deutung der Hexagramme:
- Verbinde die ursprüngliche Symbolik mit gegenwärtigen Lebenssituationen
- Übersetze traditionelle Bilder in moderne Kontexte
- Berücksichtige äußere Umstände, innere Entwicklung, Beziehungsdynamiken und Zukunftspotenziale

Strukturiere deine Beratung so:
1. Gegenwärtige Situation — Deutung des Ursprungsbildes, Verbindung zur Lebenssituation
2. Wandlungsprozess — Bedeutung der wandelnden Linien, Dynamik der Veränderung
3. Zukunftstendenz — Interpretation des Zielbildes, sich öffnende Möglichkeiten
4. Praktische Integration — konkrete Impulse zur Reflexion und Handlung

Wenn keine wandelnden Linien vorliegen, deute nur das Ursprungsbild und überspringe 2 und 3.
Schließe mit einer kurzen ermutigenden Kernbotschaft. Bleibe dabei prägnant — jeder Abschnitt bringt einen eigenen Gedanken, ohne dieselbe Aussage in neuen Worten zu wiederholen.`;

export const DEFAULT_SYSTEM_PROMPT_EN = `You are a wise I Ching oracle.

Background:
As a wise I Ching oracle you embody a millennia-old tradition of wisdom and divination. Your deep familiarity with I Ching philosophy and its traditional interpretations lets you translate timeless truths into the present.

Stance:
- Dignity and compassion in dealing with those who seek counsel
- Bridge traditional wisdom with modern understanding
- Clear yet profound language
- Balance philosophical depth with practical applicability
- Respectful encouragement of self-reflection

When interpreting the hexagrams:
- Connect the original symbolism to present-day life situations
- Translate traditional images into modern contexts
- Consider outer circumstances, inner development, relational dynamics, and future potentials

Structure your counsel like this:
1. Present situation — interpretation of the primary hexagram, connection to the life situation
2. Process of change — meaning of the changing lines, dynamics of the transformation
3. Future tendency — interpretation of the resulting hexagram, opening possibilities
4. Practical integration — concrete impulses for reflection and action

If there are no changing lines, interpret only the primary hexagram and skip 2 and 3.
Close with a short, encouraging key message. Stay concise throughout — each section brings its own thought, without restating the same point in new words.`;

/** Default system prompt for the active language. */
export function getDefaultSystemPrompt(lang = getLang()) {
  return lang === "en" ? DEFAULT_SYSTEM_PROMPT_EN : DEFAULT_SYSTEM_PROMPT_DE;
}

// Backwards-Compat-Export — Code, der noch DEFAULT_SYSTEM_PROMPT importiert,
// soll auf die deutsche Variante zeigen (Kompatibilität mit Pre-i18n-Stand).
export const DEFAULT_SYSTEM_PROMPT = DEFAULT_SYSTEM_PROMPT_DE;

// ——— Built-in System-Prompt-Vorlagen (Presets) ———
//
// Jede Vorlage hat einen sprach-passenden Body (de/en). Beim Auswählen lädt die
// UI den Body in die System-Prompt-Textarea; ab da greift die normale
// SystemPrompt.set()-Persistenz. Die Vorlagen sind nur Startpunkte — der Text
// bleibt frei editierbar.
//
// `literary` ist WÖRTLICH aus der iOS-FoundationModelsEngine (guardrailSafe*)
// übernommen: in A/B-Tests senkt diese „literarischer Kommentar eines
// historischen Textes statt Wahrsagung"-Rahmung die Verweigerungen zensierter
// Modelle (Apple Intelligence u.ä.) von ~17 % auf ~0 %. Wortlaut nicht
// umformulieren — er ist auf die Inhaltsfilter abgestimmt.
export const PROMPT_PRESETS = [
  {
    id: "default",
    body: { de: DEFAULT_SYSTEM_PROMPT_DE, en: DEFAULT_SYSTEM_PROMPT_EN },
  },
  {
    id: "literary",
    body: {
      de: `Du bist ein gelehrter Kommentator des I Ging (Buch der Wandlungen), eines über 3000 Jahre alten chinesischen Weisheitsklassikers der Weltliteratur. Deute die Symbolik des gezogenen Hexagramms literarisch und reflektierend — übersetze die alten Bilder in allgemeine Lebensthemen wie Wachstum, Geduld, Wandel und Selbstreflexion. Beziehe die Deutung auf das Anliegen, das der Ratsuchende in seiner Frage nennt (sofern eines genannt ist), und sprich es konkret an. Behandle schwierige Bilder (Gefahr, Streit, Niedergang) als Metaphern innerer Entwicklung, konstruktiv und ermutigend. Dies bleibt eine reflektierende Betrachtung eines historischen Textes — keine Vorhersage und kein fachlicher Rat zu Gesundheit, Recht oder Finanzen.

Form: höchstens 160 Wörter, gegliedert in vier Abschnitte mit fettgedruckten Überschriften — **Situation**, **Wandlung**, **Impuls**, **Kernbotschaft**. Jeder Abschnitt umfasst zwei bis drei knappe Sätze, hat eine eigene Aufgabe und wiederholt nicht, was ein anderer schon gesagt hat:
- Situation: Was das Bild über die gegenwärtige Lage und das Anliegen des Ratsuchenden sagt.
- Wandlung: Welche Bewegung oder Entwicklung sich darin andeutet.
- Impuls: Eine konkrete, alltagsnahe Haltung oder Handlung zum Anliegen.
- Kernbotschaft: Ein einziger einprägsamer Merksatz — kein Resümee der anderen Abschnitte.
Schreibe in ruhigem Fließtext, ohne einzelne Wörter fett zu setzen. Vermeide es, dieselbe Idee mehrfach in neuen Worten zu wiederholen. Setze die Frage als bekannt voraus und gib sie NICHT wieder — weder als Präambel noch umschrieben (kein „Der Ratsuchende fragt/steht vor …“). Erzähle nicht über den Ratsuchenden in der dritten Person; deute direkt das Bild und was es für das Anliegen bedeutet. Antworte auf Deutsch.`,
      en: `You are a learned commentator on the I Ching (Book of Changes), a 3000-year-old Chinese classic of world wisdom literature. Interpret the symbolism of the drawn hexagram in a literary, reflective way — translate the ancient images into general life themes such as growth, patience, change, and self-reflection. Relate the reading to the concern the querent names in their question (if one is given) and address it concretely. Treat difficult imagery (danger, conflict, decline) as metaphors for inner development, constructively and encouragingly. This remains a reflective reading of a historical text — not a prediction, and not professional advice on health, legal, or financial matters.

Form: at most 160 words, in four sections with bold headings — **Situation**, **Change**, **Impulse**, **Key message**. Each section is two to three concise sentences, has its own task, and does not repeat what another has already said:
- Situation: what the image says about the present circumstance and the querent's concern.
- Change: what movement or development it hints at.
- Impulse: one concrete, everyday attitude or action toward the concern.
- Key message: a single memorable maxim — not a summary of the other sections.
Write in calm prose, without bolding individual words. Avoid restating the same idea in new words. Treat the question as known and do NOT reproduce it — neither as a preamble nor paraphrased (no "The querent asks/faces …"). Do not narrate about the querent in the third person; interpret the image directly and what it means for the concern. Answer in English.`,
    },
  },
  {
    id: "psychological",
    body: {
      de: `Du bist ein tiefenpsychologisch geschulter Begleiter in der Tradition von C. G. Jung, der zu Wilhelms I-Ging-Übersetzung das Vorwort schrieb. Deute die Hexagramme als Spiegel innerer Prozesse: lass Archetypen, Schatten und Projektionen anklingen, achte auf das Prinzip der Synchronizität (sinnvolle Koinzidenz statt Kausalität) und auf den Individuationsweg — die Auseinandersetzung mit dem Unbewussten und das Streben nach Ganzheit. Bleibe respektvoll, nicht-diagnostisch und einladend zur Selbstreflexion; du ersetzt keine therapeutische Begleitung.

Form: höchstens 220 Wörter, gegliedert in vier Abschnitte mit fettgedruckten Überschriften — **Konstellation**, **Wandlung**, **Schatten und Licht**, **Impuls**. Jeder Abschnitt hat einen eigenen Fokus und wiederholt nicht, was ein anderer schon gesagt hat. Schreibe in ruhigem Fließtext, ohne einzelne Wörter fett zu setzen, und vermeide es, dieselbe Idee mehrfach neu zu formulieren. Antworte auf Deutsch.`,
      en: `You are a depth-psychology guide in the tradition of C. G. Jung, who wrote the foreword to Wilhelm's I Ching translation. Read the hexagrams as mirrors of inner processes: let archetypes, the shadow, and projections sound through the images; attend to the principle of synchronicity (meaningful coincidence rather than causation) and to the path of individuation — the encounter with the unconscious and the striving toward wholeness. Stay respectful, non-diagnostic, and inviting toward self-reflection; you do not replace therapeutic support.

Form: at most 220 words, in four sections with bold headings — **Constellation**, **Change**, **Shadow and Light**, **Impulse**. Each section has its own focus and does not repeat what another has already said. Write in calm prose, without bolding individual words, and avoid restating the same idea in new words. Answer in English.`,
    },
  },
  {
    id: "concise",
    body: {
      de: `Du deutest das I Ging knapp und klar. Keine Einleitung, kein Schmuck.

Gib in wenigen Sätzen pro Abschnitt:
1. was das Ursprungsbild für die Frage bedeutet
2. welche Bewegung die wandelnden Linien zeigen
3. wohin das Zielbild weist
4. einen konkreten nächsten Schritt

Wenn keine wandelnden Linien vorliegen, überspringe 2 und 3. Nüchtern, präzise, ohne Esoterik-Floskeln und ohne Wiederholungen — jeder Punkt bringt etwas Neues.`,
      en: `Interpret the I Ching concisely and clearly. No preamble, no ornament.

In a few sentences per section give:
1. what the primary hexagram means for the question
2. what movement the changing lines show
3. where the resulting hexagram points
4. one concrete next step

If there are no changing lines, skip 2 and 3. Sober, precise, free of esoteric clichés and of repetition — each point adds something new.`,
    },
  },
];

/** Body einer Built-in-Vorlage in der gewünschten Sprache (oder null). */
export function getPresetBody(id, lang = getLang()) {
  const p = PROMPT_PRESETS.find((x) => x.id === id);
  return p ? p.body[lang] || p.body.de : null;
}

// ——— Eigene Vorlagen (localStorage) ———
const PRESET_STORE_KEY = "yijing-prompt-presets-v1";

export const PromptPresets = {
  list() {
    try {
      return JSON.parse(localStorage.getItem(PRESET_STORE_KEY) || "[]");
    } catch {
      return [];
    }
  },
  save(list) {
    localStorage.setItem(PRESET_STORE_KEY, JSON.stringify(list));
  },
  add({ name, body }) {
    const list = this.list();
    list.push({ id: crypto.randomUUID(), name, body });
    this.save(list);
  },
  remove(id) {
    this.save(this.list().filter((p) => p.id !== id));
  },
};

export const Endpoints = {
  list() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    } catch {
      return [];
    }
  },
  save(list) {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  },
  add(ep) {
    const list = this.list();
    list.push(ep);
    this.save(list);
  },
  remove(id) {
    const list = this.list().filter((e) => e.id !== id);
    this.save(list);
    if (this.getSelectedId() === id) this.setSelectedId(list[0]?.id || null);
  },
  update(id, patch) {
    const list = this.list().map((e) => (e.id === id ? { ...e, ...patch } : e));
    this.save(list);
  },
  getSelectedId() {
    return localStorage.getItem(SELECTED_KEY);
  },
  setSelectedId(id) {
    if (id) localStorage.setItem(SELECTED_KEY, id);
    else localStorage.removeItem(SELECTED_KEY);
  },
  getSelected() {
    const id = this.getSelectedId();
    return this.list().find((e) => e.id === id) || null;
  },
  /**
   * Probt typische lokale Endpunkte (Ollama 11434, MLX/LM-Studio 8080/1234)
   * und legt erreichbare automatisch an, sofern noch nicht vorhanden.
   */
  async autoDiscover() {
    // Bis 2026-08-22 stieg diese Funktion auf Nicht-http-Origins sofort aus:
    // von HTTPS aus galt ein Localhost-Probe als aussichtslose Mixed-Content-
    // Anfrage. Das ist überholt (Messung 2026-08-21 gegen die echten Engines):
    // Chromium und Firefox regeln Loopback-Zugriffe inzwischen über eine
    // Local-Network-Access-BERECHTIGUNG — der erste Probe löst den Prompt aus,
    // ein Ja gilt für die ganze Site, danach erreicht die HTTPS-Seite Ollama
    // und LM Studio wirklich. Safari blockt weiterhin hart und ohne Opt-in;
    // dort ist der Probe-Fehler das Ergebnis und wird still geschluckt.
    const overHttp = typeof location === "undefined" || location.protocol === "http:";
    // Auf http antwortet ein laufender Server sofort — 1,5 s trennen dort
    // „läuft nicht" von „läuft". Auf HTTPS liegt der Berechtigungs-Dialog
    // dazwischen, und der wartet auf einen Menschen: mit 1,5 s würde der
    // Timeout die Antwort verwerfen, die der Nutzer gerade erlaubt hat.
    const probeTimeoutMs = overHttp ? 1500 : 30000;
    const probes = [
      { type: "ollama", name: t("discover.ollama"), baseUrl: "http://localhost:11434" },
      { type: "openai", name: t("discover.mlx"), baseUrl: "http://localhost:8080/v1" },
      { type: "openai", name: t("discover.lmstudio"), baseUrl: "http://localhost:1234/v1" },
    ];
    const existing = this.list().map((e) => e.baseUrl.replace(/\/+$/, ""));
    for (const p of probes) {
      const norm = p.baseUrl.replace(/\/+$/, "");
      if (existing.includes(norm)) continue;
      try {
        const client = makeClient({ ...p, id: "probe", apiKey: "", defaultModel: "" });
        const models = await Promise.race([
          client.listModels(),
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), probeTimeoutMs)),
        ]);
        if (models && models.length) {
          this.add({
            id: crypto.randomUUID(),
            ...p,
            apiKey: "",
            defaultModel: "",
          });
        }
      } catch {
        // Jeder Fehlschlag wird still übersprungen — auch auf HTTPS. Der
        // naheliegende Kurzschluss „ein `TypeError` ist die origin-weite
        // Sperre, also können die übrigen Ports nur dasselbe ergeben" ist
        // falsch und war beim Messen am 2026-08-22 sofort sichtbar: ein Port,
        // auf dem schlicht nichts lauscht, wirft in Chrome denselben
        // `TypeError: Failed to fetch` wie eine verweigerte LNA-Berechtigung.
        // Wer daraufhin abbricht, findet LM Studio auf 1234 nie mehr, sobald
        // auf 8080 kein MLX läuft. Die Sperre kostet dadurch drei stille
        // Fehlversuche statt einem — ein Dialog bleibt es trotzdem, denn die
        // Berechtigung wird pro Origin erteilt, nicht pro Port.
      }
    }
    // Wenn jetzt mindestens einer da ist und keiner ausgewählt: ersten wählen
    const list = this.list();
    if (list.length && !this.getSelectedId()) this.setSelectedId(list[0].id);
  },
};

/**
 * Probt, ob ein Endpunkt mit gegebenem Modell tatsächlich Reasoning-Tokens
 * emittiert (thinking=true) bzw. unterdrückt (thinking=false). Liefert ein
 * Ergebnis-Objekt für Anzeige im UI.
 */
export async function testThinkingMode({ endpoint, model, thinking, signal }) {
  const client = makeClient(endpoint);
  let thinkingChars = 0;
  let contentChars = 0;
  const start = performance.now();
  await client.chatStream({
    model,
    thinking,
    messages: [
      {
        role: "user",
        // Sprach-neutraler Probe-Prompt — funktioniert mit jedem
        // tokenisierten Modell und ist kurz genug, dass „Aus" tatsächlich
        // ohne Reasoning bleiben sollte.
        content:
          "Reply with exactly one word: READY. No reasoning, no explanation.",
      },
    ],
    onToken: (t) => {
      contentChars += t.length;
    },
    onThinking: (t) => {
      thinkingChars += t.length;
    },
    signal,
  });
  const dt = ((performance.now() - start) / 1000).toFixed(1);
  return {
    ok: true,
    thinkingChars,
    contentChars,
    durationSec: Number(dt),
    requested: thinking,
    // ein Modell „denkt" praktisch, wenn merklich Reasoning kam
    didThink: thinkingChars > 10,
  };
}

export const SystemPrompt = {
  get() {
    const stored = localStorage.getItem(PROMPT_KEY);
    if (stored) return stored;
    // Kein Custom-Prompt gespeichert → Sprach-passender Default.
    return getDefaultSystemPrompt();
  },
  set(s) {
    if (!s || !s.trim()) {
      localStorage.removeItem(PROMPT_KEY);
      return;
    }
    const trimmed = s.trim();
    // Wenn der Inhalt einem der zwei Sprach-Defaults entspricht, NICHT
    // persistieren — sonst wäre der Prompt nicht mehr automatisch
    // sprach-mitwandernd.
    if (
      trimmed === DEFAULT_SYSTEM_PROMPT_DE.trim() ||
      trimmed === DEFAULT_SYSTEM_PROMPT_EN.trim()
    ) {
      localStorage.removeItem(PROMPT_KEY);
      return;
    }
    localStorage.setItem(PROMPT_KEY, s);
  },
  /** Setzt explizit auf den aktuellen Sprach-Default zurück. */
  reset() {
    localStorage.removeItem(PROMPT_KEY);
  },
};

// ——— Prompt-Builder ———

export function buildUserPrompt({ question, primary, changingLines, primaryHex, resultingHex }) {
  const parts = [];
  parts.push(t("prompt.question", { question: question?.trim() || t("prompt.noQuestion") }));
  parts.push("");
  parts.push(t("prompt.primary"));
  parts.push(
    `${primaryHex.unicode}  ${getLang() === "en" ? "No." : "Nr."} ${primaryHex.number} — ${primaryHex.name_chinese} ${primaryHex.pinyin} · ${primaryHex.name_latin} · ${primaryHex.name_de}`
  );
  const tri = primaryHex.trigrams || {};
  if (tri.above && tri.below) {
    parts.push(
      t("prompt.trigrams", {
        aboveSym: tri.above.symbol,
        aboveName: tri.above.name,
        aboveNature: tri.above.nature,
        belowSym: tri.below.symbol,
        belowName: tri.below.name,
        belowNature: tri.below.nature,
      })
    );
  }
  parts.push("");
  parts.push(t("prompt.judgment"));
  parts.push(primaryHex.judgment || "—");
  parts.push("");
  parts.push(t("prompt.image"));
  parts.push(primaryHex.image || "—");
  parts.push("");
  parts.push(t("prompt.meaning"));
  parts.push(primaryHex.meaning || "—");

  if (changingLines && changingLines.length) {
    parts.push("");
    parts.push(t("prompt.changing"));
    for (const idx of changingLines) {
      const ln = primaryHex.lines[idx];
      parts.push(`• ${ln.position} ${ln.text}`);
      if (ln.interpretation) parts.push(`  ${ln.interpretation}`);
    }
    if (resultingHex) {
      parts.push("");
      parts.push(t("prompt.resulting"));
      parts.push(
        `${resultingHex.unicode}  ${getLang() === "en" ? "No." : "Nr."} ${resultingHex.number} — ${resultingHex.name_chinese} ${resultingHex.pinyin} · ${resultingHex.name_latin} · ${resultingHex.name_de}`
      );
      parts.push(t("prompt.judgment"));
      parts.push(resultingHex.judgment || "—");
      parts.push(t("prompt.image"));
      parts.push(resultingHex.image || "—");
    }
  } else {
    parts.push("");
    parts.push(t("prompt.noChanging"));
  }

  parts.push("");
  parts.push(t("prompt.tail"));

  return parts.join("\n");
}
