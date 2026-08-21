/** Browser streaming transport for local LLM servers — fetch + ReadableStream.
 *
 *  Two backend flavors behind one interface:
 *   - "ollama":  native Ollama API (`/api/chat` as ND-JSON stream, `/api/tags` for models)
 *   - "openai":  OpenAI-compatible (`/chat/completions` as SSE, `/models`) —
 *                covers LM Studio, MLX (mlx_lm.server), vLLM, OpenClaw, Ollama's OpenAI shim.
 *
 *  Extracted from `yijing/web/llm.js` (transport core only — the prompt presets, i18n
 *  bindings, and localStorage endpoint store stayed behind; consumers bring their own
 *  persistence). SSE parsing is delegated to `pure/sse.ts`; the ND-JSON sibling
 *  (`parseOllamaChat`) lives here because Ollama's native stream is not SSE.
 *
 *  Error contract (informed by the 2026-08-21 mixed-content measurement): HTTP error
 *  statuses throw `LlmHttpError` carrying `status` + raw `body` so callers can classify
 *  and extract messages (e.g. via `pure/error_body`); network-layer failures (CORS,
 *  Safari's mixed-content block, Chromium's Local-Network-Access denial) surface as the
 *  runtime's own `TypeError` and are deliberately NOT wrapped — the caller's error
 *  translation needs the original to tell these apart. No Private-Network-Access code:
 *  the `Access-Control-Allow-Private-Network` preflight is dead (never sent by browsers
 *  with the LNA permission model).
 *
 *  Abort: the stream reader is released with an explicit `reader.cancel()` in `finally` —
 *  without it the lock survives an AbortError and the next request on the same connection
 *  fails with "ReadableStream is locked".
 */
import { parseSSE } from "../pure/sse";

export interface LlmChatMessage { role: string; content: string }

/** Which backend dialect the server speaks — not which product it is: Ollama also
 *  serves "openai" on `/v1`, and LM Studio/MLX/vLLM/OpenClaw only speak "openai". */
export interface LlmEndpoint {
  type: "ollama" | "openai";
  baseUrl: string;
  apiKey?: string;
}

export interface LlmChatStreamRequest {
  model: string;
  messages: LlmChatMessage[];
  /** true/false = request/suppress reasoning; null or absent = model default (no fields sent). */
  thinking?: boolean | null;
  onToken: (text: string) => void;
  onThinking?: (text: string) => void;
  signal?: AbortSignal;
}

export interface LlmClient {
  listModels(): Promise<string[]>;
  chatStream(req: LlmChatStreamRequest): Promise<void>;
}

/** Injected, not imported — same rule as `cache-download`: the binding to a concrete
 *  window/runtime belongs to the call site (`fetch.bind(globalThis)` in a plain browser). */
export type LlmFetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Non-2xx response. Carries the raw body so callers can classify and extract a message
 *  (e.g. `pure/error_body.errorMessageFromText`) instead of re-fetching or guessing. */
export class LlmHttpError extends Error {
  readonly status: number;
  readonly body: string;
  readonly url: string;
  constructor(url: string, status: number, body: string) {
    super(`LLM endpoint ${url}: HTTP ${status}`);
    this.name = "LlmHttpError";
    this.url = url;
    this.status = status;
    this.body = body;
  }
}

function trimSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

async function throwOnHttpError(url: string, res: Response): Promise<void> {
  if (res.ok) return;
  const body = await res.text().catch(() => "");
  throw new LlmHttpError(url, res.status, body);
}

/** Reads `res.body` chunk-wise, feeding each buffer (plus the previous remainder) to
 *  `consume`. `consume` returns the new remainder and whether the stream is logically
 *  done (early exit before the connection closes). The reader is ALWAYS released via
 *  `reader.cancel()` — see module header. */
async function pumpBody(
  url: string,
  res: Response,
  consume: (buffer: string) => { rest: string; done: boolean }
): Promise<void> {
  await throwOnHttpError(url, res);
  if (!res.body) throw new Error(`LLM endpoint ${url}: empty stream body`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      const step = consume(buf + decoder.decode(value, { stream: true }));
      buf = step.rest;
      if (step.done) return;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

class OllamaClient implements LlmClient {
  private readonly base: string;
  constructor(ep: LlmEndpoint, private readonly fetchFn: LlmFetch) {
    this.base = trimSlash(ep.baseUrl);
  }

  async listModels(): Promise<string[]> {
    const url = `${this.base}/api/tags`;
    const res = await this.fetchFn(url);
    await throwOnHttpError(url, res);
    const data = (await res.json()) as { models?: { name?: string }[] };
    return (data.models ?? []).map((m) => m.name ?? "").filter(Boolean).sort();
  }

  async chatStream(req: LlmChatStreamRequest): Promise<void> {
    const body: Record<string, unknown> = { model: req.model, messages: req.messages, stream: true };
    if (req.thinking === true || req.thinking === false) {
      body.think = req.thinking;
      // Reasoning needs a generous token budget, otherwise the visible answer
      // gets truncated after the thinking phase.
      body.options = { num_predict: req.thinking ? 32768 : 4096 };
    }
    const url = `${this.base}/api/chat`;
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: req.signal,
    });
    await pumpBody(url, res, (buffer) => {
      const step = parseOllamaChat(buffer);
      for (const t of step.thinking) req.onThinking?.(t);
      for (const t of step.content) req.onToken(t);
      return { rest: step.rest, done: step.done };
    });
  }
}

class OpenAIClient implements LlmClient {
  private readonly base: string;
  constructor(private readonly ep: LlmEndpoint, private readonly fetchFn: LlmFetch) {
    this.base = trimSlash(ep.baseUrl);
  }

  private headers(json: boolean): Record<string, string> {
    const h: Record<string, string> = {};
    if (json) h["Content-Type"] = "application/json";
    if (this.ep.apiKey) h["Authorization"] = `Bearer ${this.ep.apiKey}`;
    return h;
  }

  async listModels(): Promise<string[]> {
    const url = `${this.base}/models`;
    const res = await this.fetchFn(url, { headers: this.headers(false) });
    await throwOnHttpError(url, res);
    const data = (await res.json()) as { data?: { id?: string }[] };
    return (data.data ?? []).map((m) => m.id ?? "").filter(Boolean).sort();
  }

  async chatStream(req: LlmChatStreamRequest): Promise<void> {
    const body: Record<string, unknown> = { model: req.model, messages: req.messages, stream: true };
    if (req.thinking === true || req.thinking === false) {
      // Double encoding so it takes effect on Ollama's OpenAI shim AND on MLX:
      //  - Ollama-OpenAI:     `reasoning_effort` (translated to `think` internally)
      //  - MLX mlx_lm.server: `chat_template_kwargs.enable_thinking`
      body.reasoning_effort = req.thinking ? "low" : "none";
      body.chat_template_kwargs = { enable_thinking: req.thinking };
      body.max_tokens = req.thinking ? 32768 : 4096;
    }
    const url = `${this.base}/chat/completions`;
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify(body),
      signal: req.signal,
    });
    await pumpBody(url, res, (buffer) => {
      const step = parseSSE(buffer);
      for (const t of step.reasoning) req.onThinking?.(t);
      for (const t of step.content) req.onToken(t);
      return { rest: step.rest, done: step.done };
    });
  }
}

export function makeLlmClient(endpoint: LlmEndpoint, fetchFn: LlmFetch): LlmClient {
  if (endpoint.type === "ollama") return new OllamaClient(endpoint, fetchFn);
  if (endpoint.type === "openai") return new OpenAIClient(endpoint, fetchFn);
  throw new Error(`Unknown LLM endpoint type: ${String((endpoint as { type?: unknown }).type)}`);
}

/** One line-buffered pass over Ollama's ND-JSON chat stream (`/api/chat`).
 *  Incomplete trailing line → `rest` (feed it back with the next chunk). Broken or empty
 *  full lines are skipped. `done` mirrors Ollama's terminal `"done": true` object.
 *  Pure function — no state. Sibling of `pure/sse.parseSSE`, same shape. */
export function parseOllamaChat(buffer: string): { content: string[]; thinking: string[]; rest: string; done: boolean } {
  const content: string[] = [];
  const thinking: string[] = [];
  let done = false;
  const lines = buffer.split(/\r\n|\n|\r/);
  const rest = lines.pop() ?? "";
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    try {
      const j = JSON.parse(t) as { message?: { content?: string; thinking?: string }; done?: boolean };
      if (typeof j.message?.thinking === "string" && j.message.thinking) thinking.push(j.message.thinking);
      if (typeof j.message?.content === "string" && j.message.content) content.push(j.message.content);
      if (j.done === true) done = true;
    } catch { /* broken line — skip */ }
  }
  return { content, thinking, rest, done };
}
