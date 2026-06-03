// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
/**
 * LLM-Adapter für lokale Modell-Server.
 *
 * Unterstützt zwei Backend-Typen mit einheitlicher Schnittstelle:
 *
 *  - "ollama"  → native Ollama-API (/api/tags, /api/chat als ND-JSON-Stream)
 *  - "openai"  → OpenAI-kompatibel (/v1/models, /v1/chat/completions als SSE)
 *                Nutzbar für Ollama-OpenAI-Endpunkt, MLX (mlx_lm.server),
 *                LM Studio, vLLM, OpenClaw u.ä.
 *
 * Beide Clients implementieren:
 *  - listModels(): Promise<string[]>
 *  - chatStream({ model, messages, thinking, onToken, onThinking, signal }): Promise<void>
 *
 * Reasoning/Thinking wird über `thinking: true|false|null` gesteuert und
 * je nach Backend in die passende Schnittstelle übersetzt:
 *  - Ollama-native: `think` + großzügiges `num_predict`
 *  - OpenAI-kompatibel: `reasoning_effort` + `chat_template_kwargs.enable_thinking`
 *
 * Persistenz von Endpunkten und System-Prompt erfolgt in localStorage.
 */

import { t, getLang } from "./i18n.js";

export class LLMError extends Error {
  constructor(msg, cause) {
    super(msg);
    this.name = "LLMError";
    this.cause = cause;
  }
}

function trimSlash(s) {
  return (s || "").replace(/\/+$/, "");
}

/**
 * Endpoint-Schema:
 * {
 *   id, name, type: "ollama" | "openai",
 *   baseUrl, apiKey, defaultModel
 * }
 */

export function makeClient(endpoint) {
  if (!endpoint) throw new LLMError("No endpoint selected");
  if (endpoint.type === "ollama") return new OllamaClient(endpoint);
  if (endpoint.type === "openai") return new OpenAIClient(endpoint);
  throw new LLMError(`Unknown endpoint type: ${endpoint.type}`);
}

class OllamaClient {
  constructor(ep) {
    this.ep = ep;
    this.base = trimSlash(ep.baseUrl) || "http://localhost:11434";
  }

  async listModels() {
    const res = await fetch(`${this.base}/api/tags`);
    if (!res.ok) throw new LLMError(`Ollama /api/tags: HTTP ${res.status}`);
    const data = await res.json();
    return (data.models || []).map((m) => m.name).sort();
  }

  /**
   * Streamt Chat-Tokens via /api/chat (ND-JSON).
   * messages: [{role, content}]
   * thinking: true | false | null  (null = Modell-Default)
   * onToken:    (text) => void
   * onThinking: (text) => void
   * signal: AbortSignal
   */
  async chatStream({ model, messages, thinking = null, onToken, onThinking, signal }) {
    const body = { model, messages, stream: true };
    if (thinking !== null) {
      body.think = thinking === true;
      // Reasoning-Mode braucht großzügiges Token-Budget, sonst wird die
      // sichtbare Antwort nach dem Denken abgeschnitten.
      body.options = { num_predict: thinking ? 32768 : 4096 };
    }
    const res = await fetch(`${this.base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new LLMError(`Ollama /api/chat: HTTP ${res.status} ${txt}`);
    }
    if (!res.body) throw new LLMError("Ollama: empty stream body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          try {
            const obj = JSON.parse(line);
            const msg = obj?.message || {};
            if (msg.thinking && onThinking) onThinking(msg.thinking);
            if (msg.content) onToken(msg.content);
            if (obj.done) return;
          } catch {
            /* unvollständiger JSON-Chunk – ignorieren */
          }
        }
      }
    } finally {
      // Wichtig: Reader explizit freigeben, sonst bleibt der Stream-Lock
      // nach AbortError bestehen und der nächste Request scheitert mit
      // „ReadableStream is locked".
      reader.cancel().catch(() => {});
    }
  }
}

class OpenAIClient {
  constructor(ep) {
    this.ep = ep;
    this.base = trimSlash(ep.baseUrl) || "http://localhost:8080/v1";
  }

  async listModels() {
    const headers = {};
    if (this.ep.apiKey) headers["Authorization"] = `Bearer ${this.ep.apiKey}`;
    const res = await fetch(`${this.base}/models`, { headers });
    if (!res.ok) throw new LLMError(`OpenAI /models: HTTP ${res.status}`);
    const data = await res.json();
    return (data.data || []).map((m) => m.id).sort();
  }

  /** Server-Sent-Events Streaming via /chat/completions */
  async chatStream({ model, messages, thinking = null, onToken, onThinking, signal }) {
    const headers = { "Content-Type": "application/json" };
    if (this.ep.apiKey) headers["Authorization"] = `Bearer ${this.ep.apiKey}`;
    const body = { model, messages, stream: true };
    if (thinking !== null) {
      // Doppelt belegen, damit es bei Ollama-OpenAI-Endpunkt UND MLX greift:
      //  - Ollama-OpenAI:   `reasoning_effort` (übersetzt intern auf think)
      //  - MLX mlx_lm.server: `chat_template_kwargs.enable_thinking`
      body.reasoning_effort = thinking ? "low" : "none";
      body.chat_template_kwargs = { enable_thinking: thinking === true };
      body.max_tokens = thinking ? 32768 : 4096;
    }
    const res = await fetch(`${this.base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new LLMError(`OpenAI /chat/completions: HTTP ${res.status} ${txt}`);
    }
    if (!res.body) throw new LLMError("OpenAI: empty stream body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let sep;
        while ((sep = buf.indexOf("\n")) >= 0) {
          const raw = buf.slice(0, sep).replace(/\r$/, "");
          buf = buf.slice(sep + 1);
          if (!raw.startsWith("data:")) continue;
          const data = raw.slice(5).trim();
          if (data === "[DONE]") return;
          if (!data) continue;
          try {
            const obj = JSON.parse(data);
            const choice = obj?.choices?.[0] || {};
            const delta = choice.delta || choice.message || {};
            // reasoning_content (DeepSeek-Stil), thinking (manche Forks),
            // reasoning (MLX mlx_lm.server)
            const reason = delta.reasoning_content || delta.reasoning || delta.thinking;
            if (reason && onThinking) onThinking(reason);
            if (delta.content) onToken(delta.content);
          } catch {
            /* ignorieren */
          }
        }
      }
    } finally {
      // Reader-Lock freigeben (siehe OllamaClient.chatStream).
      reader.cancel().catch(() => {});
    }
  }
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
Schließe mit einer kurzen ermutigenden Kernbotschaft.`;

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
Close with a short, encouraging key message.`;

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
      de: `Du bist ein gelehrter Kommentator des I Ging (Buch der Wandlungen), eines über 3000 Jahre alten chinesischen Weisheitsklassikers der Weltliteratur. Deute die Symbolik des gezogenen Hexagramms literarisch und reflektierend — übersetze die alten Bilder in allgemeine Lebensthemen wie Wachstum, Geduld, Wandel und Selbstreflexion. Behandle schwierige Bilder (Gefahr, Streit, Niedergang) als Metaphern innerer Entwicklung, konstruktiv und ermutigend. Dies ist die Betrachtung eines historischen Textes — keine Vorhersage, kein Rat zu Gesundheit, Recht oder Finanzen.

Form: höchstens 200 Wörter, gegliedert in vier Abschnitte mit fettgedruckten Überschriften — **Situation**, **Wandlung**, **Impuls**, **Kernbotschaft**. Jeder Abschnitt hat eine eigene Aufgabe und wiederholt nicht, was ein anderer schon gesagt hat:
- Situation: Was das Bild über die gegenwärtige Lage sagt.
- Wandlung: Welche Bewegung oder Entwicklung sich darin andeutet.
- Impuls: Eine konkrete, alltagsnahe Haltung oder Handlung.
- Kernbotschaft: Ein einziger einprägsamer Satz.
Schreibe in ruhigem Fließtext, ohne einzelne Wörter fett zu setzen. Vermeide es, dieselbe Idee mehrfach in neuen Worten zu wiederholen. Antworte auf Deutsch.`,
      en: `You are a learned commentator on the I Ching (Book of Changes), a 3000-year-old Chinese classic of world wisdom literature. Interpret the symbolism of the drawn hexagram in a literary, reflective way — translate the ancient images into general life themes such as growth, patience, change, and self-reflection. Treat difficult imagery (danger, conflict, decline) as metaphors for inner development, constructively and encouragingly. This is a reading of a historical text — not a prediction, and not advice on health, legal, or financial matters.

Form: at most 200 words, in four sections with bold headings — **Situation**, **Change**, **Impulse**, **Key message**. Each section has its own task and does not repeat what another has already said:
- Situation: what the image says about the present circumstance.
- Change: what movement or development it hints at.
- Impulse: one concrete, everyday attitude or action.
- Key message: a single memorable sentence.
Write in calm prose, without bolding individual words. Avoid restating the same idea in new words. Answer in English.`,
    },
  },
  {
    id: "psychological",
    body: {
      de: `Du bist ein tiefenpsychologisch geschulter Begleiter in der Tradition von C. G. Jung, der zu Wilhelms I-Ging-Übersetzung das Vorwort schrieb.

Deute die Hexagramme als Spiegel innerer Prozesse:
- Archetypen, Schatten und Projektionen, die in den Bildern anklingen
- das Prinzip der Synchronizität — sinnvolle Koinzidenz statt Kausalität
- den Individuationsweg: die Auseinandersetzung mit dem Unbewussten und das Streben nach Ganzheit

Bleibe respektvoll, nicht-diagnostisch und einladend zur Selbstreflexion; du ersetzt keine therapeutische Begleitung. Strukturiere die Deutung: gegenwärtige Konstellation, Wandlungsdynamik der Linien, Integration. Schließe mit einem reflektierenden Impuls.`,
      en: `You are a depth-psychology guide in the tradition of C. G. Jung, who wrote the foreword to Wilhelm's I Ching translation.

Read the hexagrams as mirrors of inner processes:
- archetypes, the shadow, and projections sounding through the images
- the principle of synchronicity — meaningful coincidence rather than causation
- the path of individuation: the encounter with the unconscious and the striving toward wholeness

Stay respectful, non-diagnostic, and inviting toward self-reflection; you do not replace therapeutic support. Structure the interpretation: present constellation, the changing lines' dynamics, integration. Close with a reflective impulse.`,
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

Wenn keine wandelnden Linien vorliegen, überspringe 2 und 3. Nüchtern, präzise, ohne Esoterik-Floskeln.`,
      en: `Interpret the I Ching concisely and clearly. No preamble, no ornament.

In a few sentences per section give:
1. what the primary hexagram means for the question
2. what movement the changing lines show
3. where the resulting hexagram points
4. one concrete next step

If there are no changing lines, skip 2 and 3. Sober, precise, free of esoteric clichés.`,
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
    // Localhost-Probes nur auf http-Origins (macOS-App-Loopback, Dev-Server,
    // später iOS-On-Device-Shim als http://localhost:<port>/v1). Auf HTTPS
    // (Codeberg Pages) wären sie Mixed-Content/blockiert und sinnlos — und
    // würden nur Konsolen-Fehler erzeugen.
    if (typeof location !== "undefined" && location.protocol !== "http:") return;
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
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 1500)),
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
        /* nicht erreichbar — überspringen */
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
