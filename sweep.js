// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// Dev-only Prompt-Test-Harness (Spec .claude/specs/2026-06-08-test-harness-design.md):
// kuratierter Härtefall-Korpus, der durch die ECHTE Text-/Bild-Pipeline läuft,
// getaktet gegen die Apple-FM-Drossel, Export via native Bridge nach
// Documents/yijing-test/<run>/. Pures Modul — KEINE Imports, kein top-level
// DOM-Zugriff, damit die Korpus-Helfer node-testbar sind
// (scripts/test-sweep-cases.mjs), wie image-scene.js. Alle app.js-/llm.js-
// Abhängigkeiten injiziert app.js beim Aufruf (app.js exportiert nichts und
// hat Import-Seiteneffekte — die Verdrahtung muss umgekehrt laufen).

// ——— Korpus ———
// changingIndices 0-basiert, Index 0 = unterste Linie (identisch zur binary-/
// lines[]-Konvention in app.js und data/hexagrams.json). resulting ist redundant
// hinterlegt und wird zur Laufzeit gegen den King-Wen-Flip assertiert
// (Doppel-Absicherung wie scripts/test-kingwen.mjs).
// ACHTUNG: Die Fragen-Strings sind load-bearing fürs Bild — composeImageRequest
// wählt Modifier (djb2 % 12) und Szenen-Template (djb2 % 3) aus dem exakten
// String. Jede Änderung re-rollt die Szene und zerstört die Vergleichbarkeit
// zwischen Sweep-Läufen.
export const SWEEP_CASES = [
  // (a) Dunkles Wasser-Motiv MIT Frage — Modifier-Konflikt (Spec-Kanonfall Hex 6)
  { id: "06-streit-wasser", label: "Streit — Wasser-Motiv mit Frage (Modifier-Konflikt)",
    primary: 6, changingIndices: [3], resulting: 59,
    question: "Wie gehe ich mit dem Konflikt in meinem Team um?" },
  // (a) Dunkelstes Motiv, warme Frage — maximaler Hell-dunkel-Konflikt (Hex 29)
  { id: "29-abgrund-golden", label: "Abgrund — dunkelstes Motiv, warme Frage (Modifier-Konflikt)",
    primary: 29, changingIndices: [2], resulting: 48,
    question: "Wie finde ich aus dieser Krise heraus?" },
  // (b) Ohne Frage — Anti-Echo-Stress (prompt.noQuestion-Platzhalter)
  { id: "12-stockung-ohne-frage", label: "Stockung — ohne Frage, zwei Linien (Anti-Echo)",
    primary: 12, changingIndices: [0, 3], resulting: 42, question: "" },
  // (c) Vier wandelnde Linien — Synthese-Stress im 4096-Token-Compact-Prompt
  { id: "03-anfang-4-linien", label: "Anfangsschwierigkeit — vier wandelnde Linien",
    primary: 3, changingIndices: [0, 1, 3, 4], resulting: 39,
    question: "Soll ich das neue Projekt beginnen?" },
  // (d) Voll-Wandlung 63→64 — bewusst NICHT Hex 1/2 (Siebte-Linie-Sonderpfad,
  // den buildCompactPrompt nicht abbildet)
  { id: "63-voll-wandlung", label: "Nach der Vollendung — Voll-Wandlung",
    primary: 63, changingIndices: [0, 1, 2, 3, 4, 5], resulting: 64,
    question: "Worauf kommt es jetzt an?" },
  // (e) Genau eine wandelnde Linie — der Normalfall als Baseline
  { id: "24-wiederkehr-1-linie", label: "Wiederkehr — eine wandelnde Linie (Normalfall)",
    primary: 24, changingIndices: [0], resulting: 2,
    question: "Wie gehe ich mit dem Neuanfang um?" },
  // (f) Keine Wandlung, ohne Frage — Daily-Stil, Minimal-Prompt + Minimal-Szene
  { id: "52-stille-ohne-wandlung", label: "Stillehalten — keine Wandlung, ohne Frage",
    primary: 52, changingIndices: [], resulting: null, question: "" },
  // (g) Helle Kontrast-Baseline 1 — gleicher Modifier wie Fall 2, helles Motiv
  { id: "14-sonne-adler", label: "Besitz von Großem — helle Kontrast-Baseline",
    primary: 14, changingIndices: [4], resulting: 1,
    question: "Was darf ich mir von der Zukunft erhoffen?" },
  // (g) Helle Baseline 2 — Frage ohne Wandlung: isoliert den Frage→Modifier-Effekt
  { id: "22-anmut-statisch", label: "Anmut — Frage ohne Wandlung",
    primary: 22, changingIndices: [], resulting: null,
    question: "Was stärkt meine Dankbarkeit?" },
  // (g) Helle Baseline 3 — Tier-Motive beiderseits (Ein-Satz-Fusionsprobe)
  { id: "58-heiterkeit-see", label: "Das Heitere — helle Wandlung mit Frage",
    primary: 58, changingIndices: [5], resulting: 10,
    question: "Wie bewahre ich mir die Heiterkeit?" },
];

/** Zielbild-Binary: wandelnde Bits geflippt (binary bottom-up, "1" = Yang). */
export function flipBinary(binary, changingIndices) {
  return Array.from(binary, (bit, i) =>
    changingIndices.includes(i) ? (bit === "1" ? "0" : "1") : bit
  ).join("");
}

/** Reading-Objekt im CURRENT_READING-Format aus einem Korpus-Fall bauen.
 *  Assertiert die hinterlegte resulting-Nummer gegen den King-Wen-Flip. */
export function deriveReading(c, { hexagrams, kingWenFromBinary }) {
  const primaryHex = hexagrams[c.primary];
  if (!primaryHex) throw new Error(`sweep: unbekanntes Hexagramm ${c.primary}`);
  let resultingHex = null;
  if (c.changingIndices.length) {
    const num = kingWenFromBinary(flipBinary(primaryHex.binary, c.changingIndices));
    if (num !== c.resulting) {
      throw new Error(`sweep: ${c.id} resulting ${c.resulting} ≠ berechnet ${num}`);
    }
    resultingHex = hexagrams[num];
  } else if (c.resulting !== null) {
    throw new Error(`sweep: ${c.id} ohne Wandlung, aber resulting gesetzt`);
  }
  return {
    question: c.question,
    primaryHex,
    resultingHex,
    changingIndices: c.changingIndices,
  };
}

// ——— Sweep-Treiber ———

// Eigene pending-Map statt des interaktiven pendingImageRequest-Skalars:
// Sweep-Bilder laufen über DIESELBEN nativen Callbacks __yijingImageResult/
// __yijingImageError (Namen sind in WebViewController.swift fixiert). Der Hook
// fängt Sweep-requestIds ab und lässt alles andere an den interaktiven Pfad
// durchfallen — kein Race mit einer Nutzer-Bildanfrage.
const pendingSweepImages = new Map(); // requestId -> { resolve, reject }
let hooksInstalled = false;

function ensureImageHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  const prevResult = window.__yijingImageResult;
  const prevError = window.__yijingImageError;
  window.__yijingImageResult = (requestId, dataURL) => {
    const p = pendingSweepImages.get(requestId);
    if (!p) return prevResult?.(requestId, dataURL);
    pendingSweepImages.delete(requestId);
    p.resolve(dataURL);
  };
  window.__yijingImageError = (requestId, message) => {
    const p = pendingSweepImages.get(requestId);
    if (!p) return prevError?.(requestId, message);
    pendingSweepImages.delete(requestId);
    p.reject(new Error(message || "image error"));
  };
}

/** Ein Bild über die Bridge anfordern; eigener Timeout (der Bild-Pfad hat keinen). */
function requestImageFor(bridge, req, timeoutMs) {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => {
      pendingSweepImages.delete(requestId);
      reject(new Error("timeout"));
    }, timeoutMs);
    pendingSweepImages.set(requestId, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    bridge.postMessage({
      action: "generateImage",
      scene: req.scene, motif: req.motif, motif2: req.motif2,
      modifier: req.modifier, requestId,
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Lokaler Zeitstempel als Run-Ordnername (Format wie exportFilename in app.js). */
function runStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * Den Korpus sequenziell durch die echte Pipeline fahren.
 *
 * deps (von app.js injiziert):
 *   hexagrams, kingWenFromBinary, buildCompactPrompt, buildUserPrompt,
 *   buildImageRequest, makeClient, getSystemPrompt, endpoint, model,
 *   bridge (nativeBridge|null), lang, register, buildId
 * opts:
 *   doText, doImage, pacingMs (Drossel-Pause zwischen Calls),
 *   textTimeoutMs, imageTimeoutMs, signal (AbortSignal), onProgress(i, n, id, stage)
 *
 * Fehler eines Falls werden im Manifest erfasst, der Sweep läuft weiter
 * (viele Bild-Fehler sind selbst ein Messergebnis).
 */
export async function runSweep(deps, opts = {}) {
  const ep = deps.endpoint;
  const model = deps.model;
  const doText = opts.doText !== false;
  const doImage = opts.doImage !== false && !!deps.bridge;
  const pacingMs = opts.pacingMs ?? 4000;
  const textTimeoutMs = opts.textTimeoutMs ?? 180000;
  const imageTimeoutMs = opts.imageTimeoutMs ?? 120000;
  if (doImage) ensureImageHooks();

  const stamp = runStamp();
  const run = {
    timestamp: stamp,
    endpointId: ep.id,
    endpointType: ep.type,
    model,
    // Exakt die Weiche aus runInterpretation (app.js) — sonst misst der
    // Sweep nicht die echte Pipeline.
    onDevice: ep.id === "on-device" || model === "apple-on-device",
    lang: deps.lang,
    register: deps.register,
    pacingMs, doText, doImage,
    appBuild: deps.buildId,
    systemPrompt: deps.getSystemPrompt(),
  };
  const cases = [];
  let aborted = false;

  for (let i = 0; i < SWEEP_CASES.length && !aborted; i++) {
    const c = SWEEP_CASES[i];
    if (opts.signal?.aborted) { aborted = true; break; }
    const reading = deriveReading(c, deps);
    const rec = {
      id: c.id, label: c.label, question: c.question,
      reading: { primary: c.primary, changingIndices: c.changingIndices, resulting: c.resulting },
      text: null, image: null,
    };

    if (doText) {
      opts.onProgress?.(i + 1, SWEEP_CASES.length, c.id, "text");
      const prompt = run.onDevice
        ? deps.buildCompactPrompt(reading)
        : deps.buildUserPrompt({
            question: reading.question,
            primary: reading.primaryHex,
            changingLines: reading.changingIndices,
            primaryHex: reading.primaryHex,
            resultingHex: reading.resultingHex,
          });
      let output = "";
      let error = null;
      const ctrl = new AbortController();
      const onAbort = () => ctrl.abort();
      opts.signal?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => ctrl.abort(), textTimeoutMs);
      const t0 = performance.now();
      try {
        await deps.makeClient(ep).chatStream({
          model,
          thinking: null,
          messages: [
            { role: "system", content: run.systemPrompt },
            { role: "user", content: prompt },
          ],
          signal: ctrl.signal,
          onToken: (tok) => { output += tok; },
        });
        // Der On-Device-Shim meldet Engine-Fehler als Content-Token
        // "\n\n⚠️ <msg>" — der Stream resolved trotzdem erfolgreich.
        if (/(^|\n)⚠️/.test(output)) error = "on-device-error";
        else if (!output.trim()) error = "empty";
      } catch (e) {
        error = e?.name === "AbortError"
          ? (opts.signal?.aborted ? "aborted" : "timeout")
          : String(e?.message || e);
      } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener("abort", onAbort);
      }
      rec.text = { prompt, output, ms: Math.round(performance.now() - t0), error };
      if (opts.signal?.aborted) aborted = true;
      else await sleep(pacingMs);
    }

    if (doImage && !aborted) {
      opts.onProgress?.(i + 1, SWEEP_CASES.length, c.id, "image");
      const req = deps.buildImageRequest(reading);
      const file = `${c.id}.jpg`;
      const t0 = performance.now();
      let error = null;
      try {
        const dataURL = await requestImageFor(deps.bridge, req, imageTimeoutMs);
        // Sofort nativ persistieren und das base64 fallenlassen — n Bilder in
        // EINEM Abschluss-postMessage wären 4–10 MB und gingen bei Abort verloren.
        deps.bridge.postMessage({ action: "sweepImage", dir: stamp, file, dataURL });
      } catch (e) {
        error = String(e?.message || e);
      }
      rec.image = {
        scene: req.scene, motif: req.motif, motif2: req.motif2, modifier: req.modifier,
        file: error ? null : file,
        ms: Math.round(performance.now() - t0),
        error,
      };
      if (opts.signal?.aborted) aborted = true;
      else await sleep(pacingMs);
    }

    cases.push(rec);
    opts.onProgress?.(i + 1, SWEEP_CASES.length, c.id, "done");
  }

  const manifest = { run: { ...run, aborted }, cases };
  // Manifest auch bei Abbruch posten — Teilergebnisse sind wertvoll.
  deps.bridge?.postMessage({
    action: "sweepFinish", dir: stamp,
    manifest: JSON.stringify(manifest, null, 2),
  });
  return { dir: stamp, manifest, aborted };
}
