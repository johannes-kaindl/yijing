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
