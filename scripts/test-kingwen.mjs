#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// Sanity-Test für die King-Wen-Lookup-Tabellen.
//
// Yijing hat die King-Wen-Reihenfolge an zwei Stellen kanonisch hinterlegt:
//   - web/app.js          → BINARY_TO_KING_WEN  (binary → number)
//   - scripts/build_data.py → KING_WEN_BINARY    (number → binary)
//
// Wenn diese je auseinanderlaufen, würfeln wir lautlos falsche Hexagramme
// — der eigentliche Worst-Case eines Orakels. Dieser Test fängt das, ohne
// ein Test-Framework einzuführen: pure Node, regex-basiertes Parsen, keine
// Abhängigkeiten.
//
// Nutzung:  node scripts/test-kingwen.mjs
// Exit:     0 = OK, 1 = Inkonsistenz (Liste folgt auf stderr).

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseJsLookup(src) {
  const m = src.match(/const\s+BINARY_TO_KING_WEN\s*=\s*\{([\s\S]*?)\};/);
  if (!m) throw new Error("BINARY_TO_KING_WEN nicht in web/app.js gefunden.");
  const out = {};
  for (const pair of m[1].matchAll(/"([01]{6})"\s*:\s*(\d+)/g)) {
    out[pair[1]] = Number(pair[2]);
  }
  return out;
}

function parsePyLookup(src) {
  const m = src.match(/KING_WEN_BINARY\s*=\s*\{([\s\S]*?)\n\}/);
  if (!m) throw new Error("KING_WEN_BINARY nicht in scripts/build_data.py gefunden.");
  const out = {};
  for (const pair of m[1].matchAll(/(\d+)\s*:\s*"([01]{6})"/g)) {
    out[Number(pair[1])] = pair[2];
  }
  return out;
}

const jsSrc = readFileSync(resolve(ROOT, "web/app.js"), "utf8");
const pySrc = readFileSync(resolve(ROOT, "scripts/build_data.py"), "utf8");
const hexJson = JSON.parse(readFileSync(resolve(ROOT, "data/hexagrams.json"), "utf8"));
// hexagrams.en.json ist optional — fehlt vor Phase B des i18n-Roll-outs.
let hexEnJson = null;
try {
  hexEnJson = JSON.parse(readFileSync(resolve(ROOT, "data/hexagrams.en.json"), "utf8"));
} catch {
  /* not yet translated — skip EN checks */
}

const jsLookup = parseJsLookup(jsSrc);
const pyLookup = parsePyLookup(pySrc);

const fail = [];
const check = (cond, msg) => { if (!cond) fail.push(msg); };

// 1. JS-Lookup: 64 Einträge, alle Binärstrings einzigartig.
const jsEntries = Object.entries(jsLookup);
check(jsEntries.length === 64, `JS BINARY_TO_KING_WEN: ${jsEntries.length} Einträge, erwartet 64.`);
check(new Set(Object.keys(jsLookup)).size === jsEntries.length,
  "JS BINARY_TO_KING_WEN: doppelte Binär-Keys.");

// 2. JS-Lookup: alle King-Wen-Nummern 1..64 als Werte.
const jsValues = new Set(Object.values(jsLookup));
for (let n = 1; n <= 64; n++) {
  check(jsValues.has(n), `JS-Lookup: King-Wen-Nummer ${n} fehlt als Wert.`);
}

// 3. Python-Lookup: 64 Einträge, alle Binärstrings einzigartig.
const pyEntries = Object.entries(pyLookup);
check(pyEntries.length === 64, `Python KING_WEN_BINARY: ${pyEntries.length} Einträge, erwartet 64.`);
const pyVals = Object.values(pyLookup);
check(new Set(pyVals).size === pyVals.length,
  "Python KING_WEN_BINARY: doppelte Binär-Werte.");
for (let n = 1; n <= 64; n++) {
  check(pyLookup[n], `Python-Lookup: King-Wen-Nummer ${n} fehlt als Key.`);
}

// 4. JS- und Python-Lookup zueinander invers.
for (const [binary, n] of jsEntries) {
  check(
    pyLookup[n] === binary,
    `Lookup-Mismatch: JS sagt "${binary}" → ${n}, Python sagt ${n} → "${pyLookup[n]}".`
  );
}

// 5. data/hexagrams.json: jeder Eintrag passt zu beiden Lookups.
check(Array.isArray(hexJson) && hexJson.length === 64,
  `hexagrams.json: ${Array.isArray(hexJson) ? hexJson.length : "kein Array"}, erwartet 64.`);

for (const h of hexJson) {
  if (!h || typeof h.number !== "number" || typeof h.binary !== "string") {
    fail.push(`hexagrams.json: ungültiger Eintrag: ${JSON.stringify(h).slice(0, 80)}`);
    continue;
  }
  check(
    jsLookup[h.binary] === h.number,
    `hexagrams.json Hex ${h.number}: binary "${h.binary}" → laut JS-Lookup ${jsLookup[h.binary]}.`
  );
  check(
    pyLookup[h.number] === h.binary,
    `hexagrams.json Hex ${h.number}: laut Python-Lookup binary "${pyLookup[h.number]}", JSON hat "${h.binary}".`
  );
}

// 6. data/hexagrams.en.json (falls vorhanden): gleiche number/binary wie DE,
//    parallele _en-Felder dort wo das DE-Pendant einen Wert hat.
let enChecked = 0;
if (hexEnJson) {
  check(Array.isArray(hexEnJson) && hexEnJson.length === 64,
    `hexagrams.en.json: ${Array.isArray(hexEnJson) ? hexEnJson.length : "kein Array"}, erwartet 64.`);

  const deByN = Object.fromEntries(hexJson.map((h) => [h.number, h]));
  for (const eh of hexEnJson) {
    if (!eh || typeof eh.number !== "number") {
      fail.push(`hexagrams.en.json: ungültiger Eintrag: ${JSON.stringify(eh).slice(0, 80)}`);
      continue;
    }
    const dh = deByN[eh.number];
    if (!dh) {
      fail.push(`hexagrams.en.json Hex ${eh.number}: kein passender DE-Eintrag.`);
      continue;
    }
    // Lookup-konsistenz: number/binary müssen 1:1 zum DE-Pendant sein.
    check(eh.binary === dh.binary,
      `hexagrams.en.json Hex ${eh.number}: binary "${eh.binary}" weicht von DE "${dh.binary}" ab.`);
    // Field-Symmetrie: wenn DE einen Wert hat, muss EN den parallelen _en-Wert haben.
    const fldPairs = [
      ["name_de", "name_en"],
      ["meaning", "meaning_en"],
      ["judgment", "judgment_en"],
      ["image", "image_en"],
      ["image_association", "image_association_en"],
    ];
    for (const [de, en] of fldPairs) {
      const deHas = !!(dh[de] && String(dh[de]).trim());
      const enHas = !!(eh[en] && String(eh[en]).trim());
      check(deHas === enHas,
        `hexagrams.en.json Hex ${eh.number}: DE-${de}=${deHas} aber EN-${en}=${enHas}.`);
    }
    // Linien: jede DE-Linie soll _en-Pendants haben.
    const deLines = dh.lines || [];
    const enLines = eh.lines || [];
    check(deLines.length === enLines.length,
      `hexagrams.en.json Hex ${eh.number}: ${enLines.length} Linien, erwartet ${deLines.length}.`);
    for (let i = 0; i < deLines.length; i++) {
      for (const [de, en] of [["position", "position_en"], ["text", "text_en"], ["interpretation", "interpretation_en"]]) {
        const deHas = !!(deLines[i]?.[de] && String(deLines[i][de]).trim());
        const enHas = !!(enLines[i]?.[en] && String(enLines[i][en]).trim());
        check(deHas === enHas,
          `hexagrams.en.json Hex ${eh.number} line ${i+1}: DE-${de}=${deHas} aber EN-${en}=${enHas}.`);
      }
    }
    // Register-Parität: wo DE ein *_neutral hat, braucht EN das *_en_neutral.
    const has = (o, k) => !!(o && o[k] && String(o[k]).trim());
    for (const fld of ["meaning", "judgment", "image"]) {
      check(has(dh, fld + "_neutral") === has(eh, fld + "_en_neutral"),
        `Hex ${eh.number}: DE-${fld}_neutral=${has(dh, fld + "_neutral")} aber EN-${fld}_en_neutral=${has(eh, fld + "_en_neutral")}.`);
    }
    for (let i = 0; i < deLines.length; i++) {
      for (const sub of ["text", "interpretation"]) {
        check(has(deLines[i], sub + "_neutral") === has(enLines[i], sub + "_en_neutral"),
          `Hex ${eh.number} line ${i+1}: DE-${sub}_neutral=${has(deLines[i], sub + "_neutral")} aber EN-${sub}_en_neutral=${has(enLines[i], sub + "_en_neutral")}.`);
      }
    }
    const deNotes = dh.notes || [], enNotes = eh.notes || [];
    for (let k = 0; k < deNotes.length; k++) {
      check(has(deNotes[k], "text_neutral") === has(enNotes[k], "text_en_neutral"),
        `Hex ${eh.number} note ${k}: DE-text_neutral=${has(deNotes[k], "text_neutral")} aber EN-text_en_neutral=${has(enNotes[k], "text_en_neutral")}.`);
    }
    enChecked++;
  }
}

if (fail.length === 0) {
  console.log("OK  King-Wen-Lookups konsistent.");
  console.log(`    JS  BINARY_TO_KING_WEN: ${jsEntries.length} Einträge`);
  console.log(`    Py  KING_WEN_BINARY:    ${pyEntries.length} Einträge`);
  console.log(`    data/hexagrams.json:    ${hexJson.length} Hexagramme`);
  if (hexEnJson) console.log(`    data/hexagrams.en.json: ${hexEnJson.length} Hexagramme (${enChecked} parallel-validated)`);
  process.exit(0);
}

console.error(`FAIL  ${fail.length} Inkonsistenz(en):`);
for (const f of fail) console.error("  - " + f);
process.exit(1);
