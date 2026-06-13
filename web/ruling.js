// SPDX-License-Identifier: AGPL-3.0-or-later
// Zhu-Xi-Linienregeln (Wilhelm/Baynes „Über die Befragung des Orakels").
// Reine Logik, KEINE Imports/i18n → node-testbar. Der Aufrufer zieht die
// sprach-/registergerechten Texte anhand des Rückgabewerts.
// changingIndices: 0-basiert, Index 0 = unterste Linie. primaryNumber = King-Wen-Nr.

/**
 * Bestimmt, welcher kanonische Text nach klassischem Schema maßgeblich ist.
 * @param {{primaryNumber:number, changingIndices:number[]}} reading
 * @returns {{rule:string, lineIndices:number[], decisiveIndex:(number|null), source:('primary'|'resulting'|'both')}}
 */
export function rulingText({ primaryNumber, changingIndices }) {
  const idx = [...(changingIndices || [])].sort((a, b) => a - b);
  const n = idx.length;
  const nonChanging = [0, 1, 2, 3, 4, 5].filter((i) => !idx.includes(i));

  switch (n) {
    case 0:
      return { rule: "judgment-primary", lineIndices: [], decisiveIndex: null, source: "primary" };
    case 1:
      return { rule: "line-primary", lineIndices: [idx[0]], decisiveIndex: idx[0], source: "primary" };
    case 2: // beide Linien; die OBERE (höherer Index) entscheidet
      return { rule: "lines-primary", lineIndices: idx, decisiveIndex: idx[1], source: "primary" };
    case 3: // Urteile von Primär + Zielbild; Primär maßgeblich
      return { rule: "judgments-both", lineIndices: [], decisiveIndex: null, source: "both" };
    case 4: // die zwei NICHT-wandelnden Linien des ZIELBILDS; untere entscheidet
      return { rule: "lines-resulting", lineIndices: nonChanging, decisiveIndex: nonChanging[0], source: "resulting" };
    case 5: // die eine nicht-wandelnde Linie des ZIELBILDS
      return { rule: "line-resulting", lineIndices: nonChanging, decisiveIndex: nonChanging[0], source: "resulting" };
    case 6:
      if (primaryNumber === 1 || primaryNumber === 2) // Qian/Kun: „Anwendung der Neun/Sechs" (7. Eintrag)
        return { rule: "special-qian-kun", lineIndices: [6], decisiveIndex: 6, source: "primary" };
      return { rule: "judgment-resulting", lineIndices: [], decisiveIndex: null, source: "resulting" };
    default: // defensiv (>6 unmöglich): auf Primär-Urteil zurückfallen
      return { rule: "judgment-primary", lineIndices: [], decisiveIndex: null, source: "primary" };
  }
}
