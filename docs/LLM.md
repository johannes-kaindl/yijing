# LLM Integration

How the Yijing oracle talks to local LLM servers.

## Backends

| Backend | Recommended for | Endpoint type in the app |
|---|---|---|
| **Ollama** | Main workhorse; easy to install | `ollama` |
| **MLX** (`mlx_lm.server`) | Apple Silicon — faster local models | `openai` |
| **LM Studio** | GUI-oriented, easy entry point | `openai` |
| **OpenClaw**, **vLLM**, … | Your own OpenAI-compatible servers | `openai` |
| Hosted (Together, Anthropic, OpenAI directly) | not supported | — |

The app calls all servers **directly from the browser** — no proxy, no
backend. That's why CORS is crucial (see below).

## Setup

### Ollama

```bash
brew install ollama
ollama pull llama3.2:latest     # or another model
OLLAMA_ORIGINS="*" ollama serve
```

`OLLAMA_ORIGINS` must be set, otherwise the browser blocks the requests
with a CORS error. Permanently on macOS:

```bash
launchctl setenv OLLAMA_ORIGINS "*"
```

### MLX (Apple Silicon)

```bash
pip install mlx-lm
mlx_lm.server \
  --model mlx-community/Qwen3.6-35B-A3B-4bit \
  --port 8080 \
  --host 127.0.0.1
```

MLX has CORS set to `*` by default — no additional setup needed.

> **Loopback instead of `0.0.0.0`.** If you bind the MLX server to
> `0.0.0.0`, it is reachable by all devices on the LAN — with an
> open model without auth, not a good idea. Yijing only needs
> loopback. If you deliberately want to offer the server LAN-wide:
> put a firewall in front and/or a reverse proxy with auth.

### LM Studio

Start it in the settings under → Developer → Local Server. Default port `1234`.

## Configuring endpoints in the app

1. Open ⚙ at the top left
2. "+ Add endpoint"
3. Fill in the fields:
   - **Name:** freely choosable
   - **Type:** `Ollama` or `OpenAI-compatible`
   - **URL:** `http://localhost:11434` (Ollama) or `http://localhost:8080/v1` (MLX)
   - **API key:** empty for local servers
4. "Add"
5. Optional: "Connection" and "Reasoning" for testing
6. Select the default model

When the app is first opened, auto-discovery probes the typical
local endpoints (11434, 8080/v1, 1234/v1) on its own — if something
responds, the endpoint is created automatically. Auto-discovery only
runs when the page itself is served over **http** (the macOS app's
internal loopback server, the local dev server). On an **https** origin
(e.g. the hosted Codeberg Pages site) it is skipped, because a secure
page cannot reach a plain-`http://localhost` server anyway (see below).

## Remote endpoint for mobile / the hosted web app

The oracle calls the model server **directly from the browser**. That
works great on a desktop where Ollama/MLX runs on the same machine —
but two situations have no local server reachable that way:

- **Mobile** (the installed PWA, or the App Store app on devices without an
  on-device engine): a phone has no `localhost` Ollama.
- **The hosted https site:** a page served over **https** can only fetch
  **https** endpoints. A plain `http://…` endpoint (other than
  `localhost`/`127.0.0.1`, which browsers exempt) is blocked as
  *mixed content*. The app warns you when you enter such a URL.

In both cases, point the app at a **remote OpenAI-compatible endpoint
over https**. Casting a reading and the reference reader keep working
fully offline without any of this — only the AI interpretation needs an
endpoint.

### Expose a local model over https with Tailscale

If you already run Ollama/MLX at home, the leanest way to reach it from
your phone is [Tailscale](https://tailscale.com) — it gives the server a
stable https name on your private network:

```bash
# on the machine running Ollama (default port 11434)
tailscale serve --bg 11434
# → prints an https URL like https://your-host.your-tailnet.ts.net/
```

Then add an endpoint in the app:

- **Type:** `OpenAI-compatible` (use Ollama's OpenAI route) or `Ollama`
- **URL:** the `https://…ts.net/` name (append `/v1` for the
  OpenAI-compatible route)
- **API key:** only if your server requires one

### Any OpenAI-compatible https endpoint works

The `OpenAI-compatible` type speaks the standard `/v1/models` +
`/v1/chat/completions` (SSE) protocol, with an optional
`Authorization: Bearer <key>`. So any reachable https endpoint that
implements it — a self-hosted gateway, a privacy-friendly provider —
plugs in the same way. No app change required.

## On-device engine (native app)

The native app family (`scripts/ios-app/`) adds an *in-app* engine on top
of everything above — it does **not** replace the browser-side
Ollama/MLX/LM-Studio/remote endpoints, it complements them. The app hosts
the same web app in a WebView and exposes a loopback **OpenAI-compatible
shim** (`GET /v1/models`, `POST /v1/chat/completions` SSE) right next to
the page, so `web/llm.js` consumes it **unchanged** — to the web layer it
looks like any other OpenAI-compatible endpoint.

### Default: Apple Foundation Models (on-device)

The shim is backed by `FoundationModelsEngine.swift` as the **default**
engine: Apple Foundation Models / "Apple Intelligence", running fully
on-device (~3B model, no network, no key). Requires **iOS 26+** on
A17 Pro-class hardware or newer.

- An `EngineSelector` picks Foundation Models when the device is
  **eligible**.
- On **ineligible** devices it falls back to the existing **BYO/remote
  local-LLM endpoints** (Ollama / MLX / LM Studio, configured exactly as
  above) — so the app still works everywhere.

### Constraints

- **4096-token context window.** The on-device model has a fixed, small
  context — keep prompts compact.
- **Non-disableable content guardrails.** Apple's on-device safety layer
  cannot be turned off and may **refuse** darker I-Ching themes. This is
  surfaced gracefully instead of failing silently.

### Fallback skeleton: llama.cpp + GGUF

A `llama.cpp` + GGUF path exists as a documented fallback skeleton — a
bundled local model behind the same shim for cases where Foundation
Models is unavailable and no BYO endpoint is configured.

## Reasoning/thinking mode

Many modern models (Qwen3, Qwen3.5, Qwen3.6, Gemma4, DeepSeek, …)
can run in a reasoning mode — they emit internal thinking tokens
before the actual response. The oracle shows these in a separate,
dimmed expander, apart from the response text.

### Control per cast

Right next to the model dropdown: **Reasoning: Default / On / Off**.

| Mode | Behavior |
|---|---|
| Default | Model decides (or the endpoint default applies) |
| On | Force reasoning (slower, often more precise) |
| Off | Suppress reasoning (faster, more concise) |

### Endpoint default

Configurable per endpoint in the settings modal — used when the
cast UI dropdown is set to "Default".

### Global default

In the settings modal under "Reasoning default" — fallback when
nothing concrete is selected either per cast or per endpoint.

### Technical implementation

| Backend | When `thinking=true` | When `thinking=false` |
|---|---|---|
| Ollama `/api/chat` | `think: true`, `options.num_predict: 32768` | `think: false`, `options.num_predict: 4096` |
| OpenAI `/v1/chat/completions` | `reasoning_effort: "low"`, `chat_template_kwargs.enable_thinking: true`, `max_tokens: 32768` | `reasoning_effort: "none"`, `chat_template_kwargs.enable_thinking: false`, `max_tokens: 4096` |
| `thinking=null` | no parameters — server default | same |

### Reasoning output fields

Different servers emit reasoning in different fields.
The adapter recognizes all common ones:

| Backend | Streaming field |
|---|---|
| Ollama `/api/chat` | `message.thinking` |
| Ollama `/v1/chat/completions` | `choices[0].delta.reasoning_content` |
| MLX `mlx_lm.server` | `choices[0].delta.reasoning` |
| DeepSeek style | `choices[0].delta.reasoning_content` |

## Reasoning test

In the settings modal, the **"Reasoning"** button per endpoint checks in practice:

1. Fetch the first non-embedding model of the endpoint
2. Send a mini request with `thinking=true` — count token counts
3. Send a mini request with `thinking=false` — the same
4. Verdict:
   - **OK** (green): reasoning can be turned on and off
   - **WARN** (yellow): one of the modes does not take effect — server args
     dominate or the model ignores it
   - **ERR** (red): no reasoning tokens observed

In practice: an MLX server started with
`--chat-template-args '{"enable_thinking": false}'`
still respects a request-level override via `chat_template_kwargs`.
Verified with `mlx_lm.server 0.31.x`.

## System prompt

The default prompt is editable in the settings modal. The default follows the
Wilhelm tradition (dignity, compassion, five-part consultation structure:
present → process of change → future tendency → integration → core message).

If you want to restore the default: the "Restore default" button.

## Prompt composition (user message)

`buildUserPrompt()` in `web/llm.js` builds the user message from:

- Question
- Source hexagram (Unicode, characters, Pīnyīn, Latin/German
  name, trigrams, judgment, image, meaning)
- Changing lines (position + text + Wilhelm interpretation)
- Target hexagram (analogous to source hexagram, if there are changing lines)
- Request for interpretation

If you want to change the output style (e.g. shorter, a different language, etc.),
that's the right lever.

## CORS troubleshooting

Symptom: "Failed to fetch" or "CORS policy" in the browser console.

Check:

```bash
# Ollama
curl -i -H "Origin: http://localhost:8765" http://localhost:11434/api/tags
# → must contain "Access-Control-Allow-Origin: *"

# MLX
curl -i -H "Origin: http://localhost:8765" http://localhost:8080/v1/models
# → likewise
```

Fix Ollama:

```bash
launchctl setenv OLLAMA_ORIGINS "*"
# restart Ollama
```

Fix MLX: usually not necessary — with your own startup parameters, do not set
restrictive `--allowed-origins` flags.
