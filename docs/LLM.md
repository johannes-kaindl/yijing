# LLM-Integration

Wie das Yijing-Orakel mit lokalen LLM-Servern spricht.

## Backends

| Backend | Empfohlen für | Endpoint-Typ in der App |
|---|---|---|
| **Ollama** | Hauptarbeitspferd; einfach zu installieren | `ollama` |
| **MLX** (`mlx_lm.server`) | Apple Silicon — schnellere lokale Modelle | `openai` |
| **LM Studio** | GUI-orientiert, einfacher Einstieg | `openai` |
| **OpenClaw**, **vLLM**, … | Eigene OpenAI-kompatible Server | `openai` |
| Hosted (Together, Anthropic, OpenAI direkt) | nicht unterstützt | — |

Die App ruft alle Server **direkt aus dem Browser** auf — kein Proxy, kein
Backend. Daher ist CORS entscheidend (siehe unten).

## Setup

### Ollama

```bash
brew install ollama
ollama pull llama3.2:latest     # oder ein anderes Modell
OLLAMA_ORIGINS="*" ollama serve
```

`OLLAMA_ORIGINS` muss gesetzt sein, sonst blockt der Browser die Requests
mit CORS-Fehler. Permanent auf macOS:

```bash
launchctl setenv OLLAMA_ORIGINS "*"
```

### MLX (Apple Silicon)

```bash
pip install mlx-lm
mlx_lm.server \
  --model mlx-community/Qwen3.6-35B-A3B-4bit \
  --port 8080 \
  --host 0.0.0.0
```

MLX hat CORS standardmäßig auf `*` — kein zusätzliches Setup nötig.

### LM Studio

In den Settings → Developer → Local Server starten. Default-Port `1234`.

## Endpunkte in der App konfigurieren

1. ⚙ oben links öffnen
2. „+ Endpunkt hinzufügen"
3. Felder ausfüllen:
   - **Name:** frei wählbar
   - **Typ:** `Ollama` oder `OpenAI-kompatibel`
   - **URL:** `http://localhost:11434` (Ollama) oder `http://localhost:8080/v1` (MLX)
   - **API-Key:** leer für lokale Server
4. „Hinzufügen"
5. Optional: „Verbindung" und „Reasoning" zum Testen
6. Standard-Modell auswählen

Beim ersten Aufruf der App probiert die Auto-Discovery die typischen
lokalen Endpunkte (11434, 8080/v1, 1234/v1) selbstständig — wenn was
antwortet, wird der Endpoint automatisch angelegt.

## Reasoning-/Thinking-Modus

Viele moderne Modelle (Qwen3, Qwen3.5, Qwen3.6, Gemma4, DeepSeek, …)
können in einem Reasoning-Modus laufen — sie emittieren interne
Gedanken-Tokens vor der eigentlichen Antwort. Das Orakel zeigt diese in
einem eigenen, gedimmten Aufklapper an, separat vom Antwort-Text.

### Steuerung pro Wurf

Direkt neben dem Modell-Dropdown: **Reasoning: Default / An / Aus**.

| Modus | Verhalten |
|---|---|
| Default | Modell entscheidet (oder Endpoint-Default greift) |
| An | Reasoning erzwingen (langsamer, oft präziser) |
| Aus | Reasoning unterdrücken (schneller, knapper) |

### Endpoint-Default

Im Settings-Modal pro Endpunkt einstellbar — wird genutzt wenn das
Cast-UI-Dropdown auf „Default" steht.

### Globaler Default

Im Settings-Modal unter „Reasoning-Default" — Fallback, wenn weder pro
Wurf noch pro Endpunkt etwas Konkretes ausgewählt ist.

### Technische Umsetzung

| Backend | Wenn `thinking=true` | Wenn `thinking=false` |
|---|---|---|
| Ollama `/api/chat` | `think: true`, `options.num_predict: 32768` | `think: false`, `options.num_predict: 4096` |
| OpenAI `/v1/chat/completions` | `reasoning_effort: "low"`, `chat_template_kwargs.enable_thinking: true`, `max_tokens: 32768` | `reasoning_effort: "none"`, `chat_template_kwargs.enable_thinking: false`, `max_tokens: 4096` |
| `thinking=null` | keine Parameter — Server-Default | dito |

### Reasoning-Output-Felder

Verschiedene Server emittieren Reasoning in unterschiedlichen Feldern.
Der Adapter erkennt alle gängigen:

| Backend | Streaming-Feld |
|---|---|
| Ollama `/api/chat` | `message.thinking` |
| Ollama `/v1/chat/completions` | `choices[0].delta.reasoning_content` |
| MLX `mlx_lm.server` | `choices[0].delta.reasoning` |
| DeepSeek-Stil | `choices[0].delta.reasoning_content` |

## Reasoning-Test

Im Settings-Modal pro Endpoint der Knopf **„Reasoning"** prüft praktisch:

1. Erstes nicht-embedding Modell des Endpoints holen
2. Mini-Anfrage `thinking=true` senden — Token-Counts zählen
3. Mini-Anfrage `thinking=false` senden — dasselbe
4. Verdikt:
   - **OK** (grün): Reasoning lässt sich an- und ausschalten
   - **WARN** (gelb): einer der Modi greift nicht — Server-Args
     dominieren oder Modell ignoriert
   - **ERR** (rot): keine Reasoning-Tokens beobachtet

Praktisch: ein MLX-Server, der mit
`--chat-template-args '{"enable_thinking": false}'` gestartet wurde,
respektiert dennoch Request-Level-Override via `chat_template_kwargs`.
Verifiziert mit `mlx_lm.server 0.31.x`.

## System-Prompt

Default-Prompt im Settings-Modal editierbar. Der Default folgt der
Wilhelm-Tradition (Würde, Mitgefühl, fünfteilige Beratungsstruktur:
Gegenwart → Wandlungsprozess → Zukunftstendenz → Integration → Kernbotschaft).

Wenn du den Default wiederherstellen willst: „Default wiederherstellen"-
Knopf.

## Prompt-Komposition (User-Message)

`buildUserPrompt()` in `web/llm.js` baut die User-Message aus:

- Frage
- Ursprungsbild (Unicode, Schriftzeichen, Pīnyīn, lateinischer/deutscher
  Name, Trigramme, Urteil, Bild, Bedeutung)
- Wandelnde Linien (Position + Spruch + Wilhelm-Interpretation)
- Zielbild (analog Ursprungsbild, falls wandelnde Linien)
- Aufforderung zur Deutung

Wenn du den Output-Stil ändern willst (z.B. kürzer, andere Sprache, etc.),
ist das der richtige Hebel.

## CORS-Fehlersuche

Symptom: „Failed to fetch" oder „CORS policy" in der Browser-Konsole.

Check:

```bash
# Ollama
curl -i -H "Origin: http://localhost:8765" http://localhost:11434/api/tags
# → muss "Access-Control-Allow-Origin: *" enthalten

# MLX
curl -i -H "Origin: http://localhost:8765" http://localhost:8080/v1/models
# → ebenso
```

Fix Ollama:

```bash
launchctl setenv OLLAMA_ORIGINS "*"
# Ollama neu starten
```

Fix MLX: meist nicht nötig — bei eigenen Startparametern keine
restriktiven `--allowed-origins`-Flags setzen.
