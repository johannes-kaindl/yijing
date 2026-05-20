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
  if (!endpoint) throw new LLMError("Kein Endpunkt ausgewählt");
  if (endpoint.type === "ollama") return new OllamaClient(endpoint);
  if (endpoint.type === "openai") return new OpenAIClient(endpoint);
  throw new LLMError(`Unbekannter Endpunkt-Typ: ${endpoint.type}`);
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
    if (!res.body) throw new LLMError("Ollama: kein Stream-Body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
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
    if (!res.body) throw new LLMError("OpenAI: kein Stream-Body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
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
  }
}

// ——— Endpunkt-Speicher (localStorage) ———

const STORE_KEY = "yijing-endpoints-v1";
const SELECTED_KEY = "yijing-endpoint-selected-v1";
const PROMPT_KEY = "yijing-system-prompt-v1";

export const DEFAULT_SYSTEM_PROMPT = `Du bist ein weises I-Ging-Orakel.

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
  ensureDefaults() {
    if (this.list().length === 0) {
      const id = crypto.randomUUID();
      this.add({
        id,
        name: "Ollama lokal",
        type: "ollama",
        baseUrl: "http://localhost:11434",
        apiKey: "",
        defaultModel: "",
      });
      this.setSelectedId(id);
    }
  },
  /**
   * Probt typische lokale Endpunkte (Ollama 11434, MLX/LM-Studio 8080/1234)
   * und legt erreichbare automatisch an, sofern noch nicht vorhanden.
   */
  async autoDiscover() {
    const probes = [
      { type: "ollama", name: "Ollama lokal", baseUrl: "http://localhost:11434" },
      { type: "openai", name: "MLX lokal", baseUrl: "http://localhost:8080/v1" },
      { type: "openai", name: "LM Studio lokal", baseUrl: "http://localhost:1234/v1" },
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
        content:
          "Antworte mit genau einem Wort: BEREIT. Kein Reasoning, keine Erklärung.",
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
    return localStorage.getItem(PROMPT_KEY) || DEFAULT_SYSTEM_PROMPT;
  },
  set(s) {
    if (s && s.trim() && s.trim() !== DEFAULT_SYSTEM_PROMPT.trim()) {
      localStorage.setItem(PROMPT_KEY, s);
    } else {
      localStorage.removeItem(PROMPT_KEY);
    }
  },
};

// ——— Prompt-Builder ———

export function buildUserPrompt({ question, primary, changingLines, primaryHex, resultingHex }) {
  const parts = [];
  parts.push(`Frage: ${question?.trim() || "(keine konkrete Frage gestellt)"}`);
  parts.push("");
  parts.push("=== URSPRUNGSBILD ===");
  parts.push(
    `${primaryHex.unicode}  Nr. ${primaryHex.number} — ${primaryHex.name_chinese} ${primaryHex.pinyin} · ${primaryHex.name_latin} · ${primaryHex.name_de}`
  );
  const t = primaryHex.trigrams || {};
  if (t.above && t.below) {
    parts.push(
      `Trigramme: oben ${t.above.symbol} ${t.above.name} (${t.above.nature}) · unten ${t.below.symbol} ${t.below.name} (${t.below.nature})`
    );
  }
  parts.push("");
  parts.push("Das Urteil:");
  parts.push(primaryHex.judgment || "—");
  parts.push("");
  parts.push("Das Bild:");
  parts.push(primaryHex.image || "—");
  parts.push("");
  parts.push("Bedeutung:");
  parts.push(primaryHex.meaning || "—");

  if (changingLines && changingLines.length) {
    parts.push("");
    parts.push("=== WANDELNDE LINIEN ===");
    for (const idx of changingLines) {
      const ln = primaryHex.lines[idx];
      parts.push(`• ${ln.position} ${ln.text}`);
      if (ln.interpretation) parts.push(`  ${ln.interpretation}`);
    }
    if (resultingHex) {
      parts.push("");
      parts.push("=== ZIELBILD ===");
      parts.push(
        `${resultingHex.unicode}  Nr. ${resultingHex.number} — ${resultingHex.name_chinese} ${resultingHex.pinyin} · ${resultingHex.name_latin} · ${resultingHex.name_de}`
      );
      parts.push("Das Urteil:");
      parts.push(resultingHex.judgment || "—");
      parts.push("Das Bild:");
      parts.push(resultingHex.image || "—");
    }
  } else {
    parts.push("");
    parts.push("(Keine wandelnden Linien — nur das Ursprungsbild ist zu deuten.)");
  }

  parts.push("");
  parts.push("Bitte interpretiere diese Konstellation in Bezug auf die Frage.");

  return parts.join("\n");
}
