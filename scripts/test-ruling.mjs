// SPDX-License-Identifier: AGPL-3.0-or-later
// Zhu-Xi-Linienregeln (Wilhelm/Baynes „Über die Befragung des Orakels") — reine
// Logik, keine Abhängigkeiten. Aufruf: node scripts/test-ruling.mjs
import { rulingText } from "../web/ruling.js";
import assert from "node:assert";

const eq = (a, e, m) => assert.deepStrictEqual(a, e, m);

eq(rulingText({ primaryNumber: 22, changingIndices: [] }),
   { rule: "judgment-primary", lineIndices: [], decisiveIndex: null, source: "primary" }, "0 Linien");
eq(rulingText({ primaryNumber: 6, changingIndices: [3] }),
   { rule: "line-primary", lineIndices: [3], decisiveIndex: 3, source: "primary" }, "1 Linie");
eq(rulingText({ primaryNumber: 12, changingIndices: [3, 0] }),
   { rule: "lines-primary", lineIndices: [0, 3], decisiveIndex: 3, source: "primary" }, "2 Linien: obere entscheidet");
eq(rulingText({ primaryNumber: 11, changingIndices: [0, 2, 4] }),
   { rule: "judgments-both", lineIndices: [], decisiveIndex: null, source: "both" }, "3 Linien: beide Urteile");
eq(rulingText({ primaryNumber: 3, changingIndices: [0, 1, 3, 4] }),
   { rule: "lines-resulting", lineIndices: [2, 5], decisiveIndex: 2, source: "resulting" }, "4 Linien: untere ruhende des Zielbilds");
eq(rulingText({ primaryNumber: 1, changingIndices: [0, 1, 2, 3, 4] }),
   { rule: "line-resulting", lineIndices: [5], decisiveIndex: 5, source: "resulting" }, "5 Linien: eine ruhende des Zielbilds");
eq(rulingText({ primaryNumber: 63, changingIndices: [0, 1, 2, 3, 4, 5] }),
   { rule: "judgment-resulting", lineIndices: [], decisiveIndex: null, source: "resulting" }, "6 Linien: Zielbild-Urteil");
eq(rulingText({ primaryNumber: 1, changingIndices: [0, 1, 2, 3, 4, 5] }),
   { rule: "special-qian-kun", lineIndices: [6], decisiveIndex: 6, source: "primary" }, "6 Linien Qian: Anwendung der Neun");
eq(rulingText({ primaryNumber: 2, changingIndices: [0, 1, 2, 3, 4, 5] }),
   { rule: "special-qian-kun", lineIndices: [6], decisiveIndex: 6, source: "primary" }, "6 Linien Kun: Anwendung der Sechs");

console.log("ruling: alle 9 Fälle bestanden");
