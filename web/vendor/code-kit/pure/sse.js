// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// GENERATED — do not edit. Produced by `node scripts/build-vendor.mjs` from
// web/vendor/code-kit/pure/sse.ts, which is a byte-identical copy of a code-kit module
// (pin in web/vendor/code-kit/VENDOR.json). Comments and formatting are the
// transpiler's; read the .ts next to this file for the documented original.
export function parseSSE(buffer) {
    const content = [];
    const reasoning = [];
    let model;
    let finishReason;
    let done = false;
    const lines = buffer.split(/\r\n|\n|\r/);
    const rest = lines.pop() ?? "";
    for (const line of lines){
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const data = t.slice(5).trim();
        if (data === "[DONE]") {
            done = true;
            continue;
        }
        try {
            const j = JSON.parse(data);
            if (model === undefined && typeof j.model === "string") model = j.model;
            const c0 = j.choices?.[0];
            if (finishReason === undefined && typeof c0?.finish_reason === "string" && c0.finish_reason) finishReason = c0.finish_reason;
            const d = c0?.delta ?? c0?.message;
            if (typeof d?.content === "string") content.push(d.content);
            const reason = [
                d?.reasoning_content,
                d?.reasoning,
                d?.thinking
            ].find((v)=>typeof v === "string");
            if (reason !== undefined) reasoning.push(reason);
        } catch  {}
    }
    return {
        content,
        reasoning,
        model,
        finishReason,
        rest,
        done
    };
}
