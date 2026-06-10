// SPDX-License-Identifier: AGPL-3.0-or-later
// Sanity-Checks für den Sweep-Korpus (web/sweep.js) gegen data/hexagrams.json:
// IDs eindeutig + dateinamenssicher, Indizes valide, resulting stimmt mit dem
// King-Wen-Flip überein, Fälle ohne Wandlung haben resulting null.
// Aufruf: node scripts/test-sweep-cases.mjs   (keine Abhängigkeiten)
import { readFileSync } from "node:fs";
import { SWEEP_CASES, flipBinary, deriveReading } from "../web/sweep.js";

const hexList = JSON.parse(
  readFileSync(new URL("../data/hexagrams.json", import.meta.url), "utf8")
);
const hexagrams = Object.fromEntries(hexList.map((h) => [h.number, h]));
const byBinary = Object.fromEntries(hexList.map((h) => [h.binary, h.number]));
const kingWenFromBinary = (b) => {
  const n = byBinary[b];
  if (!n) throw new Error(`unknown binary ${b}`);
  return n;
};

let failures = 0;
const check = (ok, msg) => {
  if (!ok) {
    failures++;
    console.error("FAIL:", msg);
  }
};

const ids = new Set();
for (const c of SWEEP_CASES) {
  check(!ids.has(c.id), `${c.id}: doppelte id`);
  ids.add(c.id);
  check(/^[a-z0-9-]+$/.test(c.id), `${c.id}: id nicht dateinamenssicher`);
  check(!!hexagrams[c.primary], `${c.id}: unbekanntes Hexagramm ${c.primary}`);
  check(
    c.changingIndices.every((i) => Number.isInteger(i) && i >= 0 && i < 6),
    `${c.id}: ungültige changingIndices`
  );
  check(
    new Set(c.changingIndices).size === c.changingIndices.length,
    `${c.id}: doppelte Indizes`
  );
  if (c.changingIndices.length === 0) {
    check(c.resulting === null, `${c.id}: ohne Wandlung muss resulting null sein`);
  } else {
    const target = kingWenFromBinary(
      flipBinary(hexagrams[c.primary].binary, c.changingIndices)
    );
    check(target === c.resulting, `${c.id}: resulting ${c.resulting} ≠ berechnet ${target}`);
  }
  const reading = deriveReading(c, { hexagrams, kingWenFromBinary });
  check(reading.primaryHex.number === c.primary, `${c.id}: primaryHex falsch`);
  check(
    (reading.resultingHex === null) === (c.resulting === null),
    `${c.id}: resultingHex-Null-Konvention verletzt`
  );
  check(reading.question === c.question, `${c.id}: question nicht durchgereicht`);
}
check(SWEEP_CASES.length >= 10, `Korpus zu klein: ${SWEEP_CASES.length}`);

if (failures) {
  console.error(`${failures} Fehler`);
  process.exit(1);
}
console.log(`OK — ${SWEEP_CASES.length} Sweep-Fälle konsistent`);
