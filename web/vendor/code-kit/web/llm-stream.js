// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// GENERATED — do not edit. Produced by `node scripts/build-vendor.mjs` from
// web/vendor/code-kit/web/llm-stream.ts, which is a byte-identical copy of a code-kit module
// (pin in web/vendor/code-kit/VENDOR.json). Comments and formatting are the
// transpiler's; read the .ts next to this file for the documented original.
import { parseSSE } from "../pure/sse.js";
export class LlmHttpError extends Error {
    status;
    body;
    url;
    constructor(url, status, body){
        super(`LLM endpoint ${url}: HTTP ${status}`);
        this.name = "LlmHttpError";
        this.url = url;
        this.status = status;
        this.body = body;
    }
}
function trimSlash(s) {
    return s.replace(/\/+$/, "");
}
async function throwOnHttpError(url, res) {
    if (res.ok) return;
    const body = await res.text().catch(()=>"");
    throw new LlmHttpError(url, res.status, body);
}
async function pumpBody(url, res, consume) {
    await throwOnHttpError(url, res);
    if (!res.body) throw new Error(`LLM endpoint ${url}: empty stream body`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
        for(;;){
            const { value, done } = await reader.read();
            if (done) return;
            const step = consume(buf + decoder.decode(value, {
                stream: true
            }));
            buf = step.rest;
            if (step.done) return;
        }
    } finally{
        reader.cancel().catch(()=>{});
    }
}
class OllamaClient {
    fetchFn;
    base;
    constructor(ep, fetchFn){
        this.fetchFn = fetchFn;
        this.base = trimSlash(ep.baseUrl);
    }
    async listModels() {
        const url = `${this.base}/api/tags`;
        const res = await this.fetchFn(url);
        await throwOnHttpError(url, res);
        const data = await res.json();
        return (data.models ?? []).map((m)=>m.name ?? "").filter(Boolean).sort();
    }
    async chatStream(req) {
        const body = {
            model: req.model,
            messages: req.messages,
            stream: true
        };
        if (req.thinking === true || req.thinking === false) {
            body.think = req.thinking;
            body.options = {
                num_predict: req.thinking ? 32768 : 4096
            };
        }
        const url = `${this.base}/api/chat`;
        const res = await this.fetchFn(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body),
            signal: req.signal
        });
        await pumpBody(url, res, (buffer)=>{
            const step = parseOllamaChat(buffer);
            for (const t of step.thinking)req.onThinking?.(t);
            for (const t of step.content)req.onToken(t);
            return {
                rest: step.rest,
                done: step.done
            };
        });
    }
}
class OpenAIClient {
    ep;
    fetchFn;
    base;
    constructor(ep, fetchFn){
        this.ep = ep;
        this.fetchFn = fetchFn;
        this.base = trimSlash(ep.baseUrl);
    }
    headers(json) {
        const h = {};
        if (json) h["Content-Type"] = "application/json";
        if (this.ep.apiKey) h["Authorization"] = `Bearer ${this.ep.apiKey}`;
        return h;
    }
    async listModels() {
        const url = `${this.base}/models`;
        const res = await this.fetchFn(url, {
            headers: this.headers(false)
        });
        await throwOnHttpError(url, res);
        const data = await res.json();
        return (data.data ?? []).map((m)=>m.id ?? "").filter(Boolean).sort();
    }
    async chatStream(req) {
        const body = {
            model: req.model,
            messages: req.messages,
            stream: true
        };
        if (req.thinking === true || req.thinking === false) {
            body.reasoning_effort = req.thinking ? "low" : "none";
            body.chat_template_kwargs = {
                enable_thinking: req.thinking
            };
            body.max_tokens = req.thinking ? 32768 : 4096;
        }
        const url = `${this.base}/chat/completions`;
        const res = await this.fetchFn(url, {
            method: "POST",
            headers: this.headers(true),
            body: JSON.stringify(body),
            signal: req.signal
        });
        await pumpBody(url, res, (buffer)=>{
            const step = parseSSE(buffer);
            for (const t of step.reasoning)req.onThinking?.(t);
            for (const t of step.content)req.onToken(t);
            return {
                rest: step.rest,
                done: step.done
            };
        });
    }
}
export function makeLlmClient(endpoint, fetchFn) {
    if (endpoint.type === "ollama") return new OllamaClient(endpoint, fetchFn);
    if (endpoint.type === "openai") return new OpenAIClient(endpoint, fetchFn);
    throw new Error(`Unknown LLM endpoint type: ${String(endpoint.type)}`);
}
export function parseOllamaChat(buffer) {
    const content = [];
    const thinking = [];
    let done = false;
    const lines = buffer.split(/\r\n|\n|\r/);
    const rest = lines.pop() ?? "";
    for (const line of lines){
        const t = line.trim();
        if (!t) continue;
        try {
            const j = JSON.parse(t);
            if (typeof j.message?.thinking === "string" && j.message.thinking) thinking.push(j.message.thinking);
            if (typeof j.message?.content === "string" && j.message.content) content.push(j.message.content);
            if (j.done === true) done = true;
        } catch  {}
    }
    return {
        content,
        thinking,
        rest,
        done
    };
}
