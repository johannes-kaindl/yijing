/**
 * Yijing-Orakel — Frontend-Hauptmodul.
 *
 * Verantwortlich für:
 *  - Cast-Mechanik (Drei-Münzen-Methode → Hypergram → Ursprungs-/Zielbild)
 *  - Rendering von Hexagramm-Figuren, Wilhelm-Texten und wandelnden Linien
 *  - Settings-Modal (Endpoint-Verwaltung, Reasoning-Defaults, System-Prompt)
 *  - LLM-Interpretation mit Streaming + Thinking-Anzeige
 *  - Verlauf in localStorage + Tiefe Links via URL-Hash (#r=<uuid>)
 *  - Export als Markdown und PDF-Druck
 *
 * Stack: Vanilla ES-Module, keine Build-Tools, keine externen Abhängigkeiten.
 * Daten werden zur Laufzeit aus ../data/hexagrams.json geladen.
 */

import {
  Endpoints,
  SystemPrompt,
  DEFAULT_SYSTEM_PROMPT,
  makeClient,
  buildUserPrompt,
  testThinkingMode,
  LLMError,
} from "./llm.js";
import { renderMarkdown } from "./markdown.js";

const HISTORY_KEY = "yijing-history-v1";

/**
 * Lookup: bottom-to-top Binärstring (6 Zeichen, 1 = Yang, 0 = Yin) → King-Wen-Nummer.
 * Beispiele: "111111" → 1 (Kien/Schöpferisches), "000000" → 2 (Kun/Empfangendes).
 * Die King-Wen-Reihenfolge ist nicht-binär; diese Tabelle ist die kanonische Quelle
 * und entspricht der Unicode-Reihenfolge des Bereichs U+4DC0…U+4DFF.
 */
const BINARY_TO_KING_WEN = {
  "111111":  1, "000000":  2, "100010":  3, "010001":  4,
  "111010":  5, "010111":  6, "010000":  7, "000010":  8,
  "111011":  9, "110111": 10, "111000": 11, "000111": 12,
  "101111": 13, "111101": 14, "001000": 15, "000100": 16,
  "100110": 17, "011001": 18, "110000": 19, "000011": 20,
  "100101": 21, "101001": 22, "000001": 23, "100000": 24,
  "100111": 25, "111001": 26, "100001": 27, "011110": 28,
  "010010": 29, "101101": 30, "001110": 31, "011100": 32,
  "001111": 33, "111100": 34, "000101": 35, "101000": 36,
  "101011": 37, "110101": 38, "010100": 39, "001010": 40,
  "110001": 41, "100011": 42, "111110": 43, "011111": 44,
  "000110": 45, "011000": 46, "010110": 47, "011010": 48,
  "101110": 49, "011101": 50, "100100": 51, "001001": 52,
  "001011": 53, "110100": 54, "101100": 55, "001101": 56,
  "011011": 57, "110110": 58, "010011": 59, "110010": 60,
  "110011": 61, "001100": 62, "101010": 63, "010101": 64,
};

/**
 * Drei-Münzen-Wurf für eine einzelne Linie.
 *
 * Pro Münze 0 (Yin/Zahl) oder 1 (Yang/Kopf), jeweils p=0.5.
 * Linienwert = Summe + 6, also 6–9:
 *
 *   6  3× Yin   wandelndes Yin   (○) p = 1/8
 *   7  2× Yin   festes Yang          p = 3/8
 *   8  1× Yin   festes Yin           p = 3/8
 *   9  0× Yin   wandelndes Yang  (○) p = 1/8
 *
 * Die Drei-Münzen-Methode hat eine andere Verteilung als die historisch
 * ältere Schafgarben-Stab-Methode (5/16 : 7/16 : 3/16 : 1/16) — wir nutzen
 * die heute gängigere Münzmethode.
 */
function tossLine() {
  const coins = [0, 1, 2].map(() => (Math.random() < 0.5 ? 0 : 1));
  const value = 6 + coins.reduce((a, b) => a + b, 0);
  return { value, coins };
}

/** Sechs Linien werfen — Index 0 ist die unterste Linie (traditionell zuerst gebaut). */
function castHypergram() {
  return Array.from({ length: 6 }, () => tossLine());
}

/**
 * Eigenschaften einer Linie ableiten.
 * - yang:     Linienwert 7 oder 9
 * - changing: Linienwert 6 oder 9 (verwandelt sich in das Zielbild)
 * - target:   Bit (0/1) im Zielbild — wandelnde Linien drehen sich, feste bleiben
 */
function lineState(value) {
  const yang = value === 7 || value === 9;
  const changing = value === 6 || value === 9;
  return {
    yang,
    changing,
    target: changing ? (yang ? 0 : 1) : yang ? 1 : 0,
  };
}

function hexagramFromLines(lines, useTarget = false) {
  return lines
    .map((l) => {
      const st = lineState(l.value);
      const bit = useTarget ? st.target : st.yang ? 1 : 0;
      return String(bit);
    })
    .join("");
}

function kingWenFromBinary(binary) {
  const n = BINARY_TO_KING_WEN[binary];
  if (!n) throw new Error("Unbekannte Binärrepräsentation: " + binary);
  return n;
}

// ——— UI-Refs ———

const els = {
  ask: document.getElementById("ask"),
  question: document.getElementById("question"),
  castBtn: document.getElementById("cast"),
  resetBtn: document.getElementById("reset"),
  exportMdBtn: document.getElementById("exportMd"),
  exportPdfBtn: document.getElementById("exportPdf"),
  reading: document.getElementById("reading"),
  questionEcho: document.getElementById("questionEcho"),
  primary: document.getElementById("primary"),
  resulting: document.getElementById("resulting"),
  judgmentText: document.getElementById("judgmentText"),
  imageText: document.getElementById("imageText"),
  meaningText: document.getElementById("meaningText"),
  associationDetails: document.getElementById("associationDetails"),
  associationText: document.getElementById("associationText"),
  trigramDetails: document.getElementById("trigramDetails"),
  trigramText: document.getElementById("trigramText"),
  changingSection: document.getElementById("changingSection"),
  changingLines: document.getElementById("changingLines"),
  resultingSection: document.getElementById("resultingSection"),
  resultingSummary: document.getElementById("resultingSummary"),
  resultingJudgment: document.getElementById("resultingJudgment"),
  history: document.getElementById("history"),
  historyList: document.getElementById("historyList"),
  clearHistoryBtn: document.getElementById("clearHistory"),
  // LLM
  interpretation: document.getElementById("interpretation"),
  endpointSelect: document.getElementById("endpointSelect"),
  modelSelect: document.getElementById("modelSelect"),
  interpretBtn: document.getElementById("interpretBtn"),
  stopInterpretBtn: document.getElementById("stopInterpretBtn"),
  interpBody: document.getElementById("interpBody"),
  interpStatus: document.getElementById("interpStatus"),
  interpThinkingDetails: document.getElementById("interpThinkingDetails"),
  interpThinking: document.getElementById("interpThinking"),
  thinkingSelect: document.getElementById("thinkingSelect"),
  defaultThinking: document.getElementById("defaultThinking"),
  // Settings
  openSettingsBtn: document.getElementById("openSettings"),
  settingsModal: document.getElementById("settingsModal"),
  closeSettingsBtn: document.getElementById("closeSettings"),
  endpointList: document.getElementById("endpointList"),
  newEpName: document.getElementById("newEpName"),
  newEpType: document.getElementById("newEpType"),
  newEpUrl: document.getElementById("newEpUrl"),
  newEpKey: document.getElementById("newEpKey"),
  addEndpointBtn: document.getElementById("addEndpointBtn"),
  systemPromptInput: document.getElementById("systemPromptInput"),
  resetSystemPromptBtn: document.getElementById("resetSystemPrompt"),
};

let HEXAGRAMS = null;
let CURRENT_READING = null; // { primary, resulting, question, changingIndices }
let interpretAbortCtrl = null;

async function loadData() {
  const res = await fetch("../data/hexagrams.json");
  if (!res.ok) throw new Error("Daten konnten nicht geladen werden");
  const data = await res.json();
  HEXAGRAMS = {};
  for (const h of data) HEXAGRAMS[h.number] = h;
}

// ——— Hexagramm-Rendering ———

function renderHexFigure(container, lines, changingMask) {
  container.innerHTML = "";
  lines.forEach((l, idx) => {
    const st = lineState(l.value !== undefined ? l.value : l ? 9 : 6);
    const row = document.createElement("div");
    const isChanging = changingMask ? changingMask[idx] : false;
    row.className = `hex-line ${st.yang ? "yang" : "yin"}${isChanging ? " changing" : ""}`;
    if (st.yang) {
      const seg = document.createElement("div");
      seg.className = "seg";
      row.appendChild(seg);
    } else {
      const a = document.createElement("div");
      a.className = "seg";
      const b = document.createElement("div");
      b.className = "seg";
      row.appendChild(a);
      row.appendChild(b);
    }
    container.appendChild(row);
  });
}

function renderHexCard(card, hexData, lines, changingMask) {
  card.querySelector(".hex-name").textContent = hexData.name_de;
  const chinese = card.querySelector(".hex-chinese");
  chinese.innerHTML = `
    <span class="ch-symbol">${escapeHTML(hexData.unicode)}</span>
    <span class="ch-name">${escapeHTML(hexData.name_chinese)}</span>
    <span class="ch-pinyin">${escapeHTML(hexData.pinyin)}</span>
    <span class="ch-latin">· ${escapeHTML(hexData.name_latin)}</span>
  `;
  const tri = card.querySelector(".hex-trigrams");
  const t = hexData.trigrams || {};
  if (t.above && t.below) {
    tri.innerHTML = `
      <span title="${escapeHTML(t.above.family)} — ${escapeHTML(t.above.nature)}">${escapeHTML(t.above.symbol)} ${escapeHTML(t.above.name)}</span>
      über
      <span title="${escapeHTML(t.below.family)} — ${escapeHTML(t.below.nature)}">${escapeHTML(t.below.symbol)} ${escapeHTML(t.below.name)}</span>
    `;
  } else {
    tri.textContent = "";
  }
  renderHexFigure(card.querySelector(".hex-figure"), lines, changingMask);
}

function renderChangingLines(hexData, changingIndices) {
  els.changingLines.innerHTML = "";
  for (const idx of changingIndices) {
    const ln = hexData.lines[idx];
    const block = document.createElement("div");
    block.className = "changing-line";
    block.innerHTML = `
      <div class="pos">${escapeHTML(ln.position)}</div>
      <div class="text">${escapeHTML(ln.text)}</div>
      ${ln.interpretation ? `<div class="interp">${escapeHTML(ln.interpretation)}</div>` : ""}
    `;
    els.changingLines.appendChild(block);
  }
}

function renderTrigramDetails(hex) {
  const t = hex.trigrams || {};
  if (!t.above || !t.below) {
    els.trigramText.innerHTML = "—";
    return;
  }
  const block = (label, tri) => `
    <div class="trigram-block">
      <div class="trigram-head">
        <span class="trigram-sym">${escapeHTML(tri.symbol)}</span>
        <strong>${escapeHTML(label)}: ${escapeHTML(tri.name)} ${escapeHTML(tri.pinyin)}</strong>
        <span class="trigram-meta">${escapeHTML(tri.family)} · ${escapeHTML(tri.nature)} · ${escapeHTML(tri.season)} · ${escapeHTML(tri.direction)}</span>
      </div>
      ${tri.associations ? `<div class="trigram-assoc">${escapeHTML(tri.associations)}</div>` : ""}
    </div>
  `;
  els.trigramText.innerHTML = block("oben", t.above) + block("unten", t.below);
}

function escapeHTML(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ——— Reading anzeigen ———

function showReading(question, lines, options = {}) {
  const { save = true, entryId = null } = options;
  const primaryBinary = hexagramFromLines(lines, false);
  const targetBinary = hexagramFromLines(lines, true);
  const primaryNum = kingWenFromBinary(primaryBinary);
  const primaryHex = HEXAGRAMS[primaryNum];

  const changingIndices = lines
    .map((l, i) => (lineState(l.value).changing ? i : -1))
    .filter((i) => i >= 0);
  const changingMask = lines.map((l) => lineState(l.value).changing);

  renderHexCard(els.primary, primaryHex, lines, changingMask);

  els.judgmentText.textContent = primaryHex.judgment || "—";
  els.imageText.textContent = primaryHex.image || "—";
  els.meaningText.textContent = primaryHex.meaning || "—";

  if (primaryHex.image_association) {
    els.associationDetails.hidden = false;
    els.associationText.textContent = primaryHex.image_association;
  } else {
    els.associationDetails.hidden = true;
  }

  renderTrigramDetails(primaryHex);

  let resultingHex = null;
  if (changingIndices.length > 0) {
    els.changingSection.hidden = false;
    renderChangingLines(primaryHex, changingIndices);

    const targetNum = kingWenFromBinary(targetBinary);
    resultingHex = HEXAGRAMS[targetNum];
    const targetLines = lines.map((l) => {
      const st = lineState(l.value);
      return { value: st.target === 1 ? 7 : 8 };
    });
    renderHexCard(els.resulting, resultingHex, targetLines, targetLines.map(() => false));
    els.resulting.hidden = false;
    els.resultingSection.hidden = false;
    els.resultingSummary.textContent = `Urteil — ${resultingHex.name_de}`;
    els.resultingJudgment.textContent = resultingHex.judgment || "—";
  } else {
    els.changingSection.hidden = true;
    els.resulting.hidden = true;
    els.resultingSection.hidden = true;
  }

  if (question.trim()) {
    els.questionEcho.hidden = false;
    els.questionEcho.textContent = `„${question.trim()}"`;
  } else {
    els.questionEcho.hidden = true;
  }

  els.reading.hidden = false;
  els.resetBtn.hidden = false;
  els.exportMdBtn.hidden = false;
  els.exportPdfBtn.hidden = false;
  els.castBtn.disabled = true;

  // LLM-Sektion einblenden, falls Endpunkte konfiguriert
  els.interpretation.hidden = Endpoints.list().length === 0;
  els.interpBody.innerHTML = "";
  els.interpStatus.textContent = "";

  CURRENT_READING = {
    question: question.trim(),
    primaryHex,
    resultingHex,
    changingIndices,
  };

  let activeEntryId = entryId;
  if (save) {
    activeEntryId = crypto.randomUUID();
    saveHistory({
      id: activeEntryId,
      ts: Date.now(),
      question: question.trim(),
      primary: { n: primaryNum, name: primaryHex.name_de, unicode: primaryHex.unicode },
      changingLines: changingIndices.map((i) => i + 1),
      resulting: resultingHex
        ? { n: resultingHex.number, name: resultingHex.name_de, unicode: resultingHex.unicode }
        : null,
      lines: lines.map((l) => l.value),
    });
  }
  renderHistory(activeEntryId);

  if (activeEntryId) {
    // URL-Hash setzen, ohne Scroll-Sprung
    const newHash = `#r=${activeEntryId}`;
    if (window.location.hash !== newHash) {
      history.replaceState(null, "", newHash);
    }
  }

  setTimeout(() => {
    els.reading.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 50);
}

function showReadingFromEntry(entry) {
  if (!entry || !Array.isArray(entry.lines)) return;
  const lines = entry.lines.map((v) => ({ value: v }));
  showReading(entry.question || "", lines, { save: false, entryId: entry.id });
}

function tossAnimated(question) {
  els.castBtn.disabled = true;
  els.reading.hidden = false;
  els.questionEcho.hidden = !question.trim();
  els.questionEcho.textContent = question.trim() ? `„${question.trim()}"` : "";

  const primaryFig = els.primary.querySelector(".hex-figure");
  primaryFig.innerHTML = "";
  els.primary.querySelector(".hex-name").textContent = "…";
  els.primary.querySelector(".hex-chinese").innerHTML = "";
  els.primary.querySelector(".hex-trigrams").innerHTML = "";
  els.judgmentText.textContent = "";
  els.imageText.textContent = "";
  els.meaningText.textContent = "";
  els.changingLines.innerHTML = "";
  els.changingSection.hidden = true;
  els.resulting.hidden = true;
  els.resultingSection.hidden = true;
  els.associationDetails.hidden = true;
  els.interpretation.hidden = true;
  els.interpBody.innerHTML = "";
  els.trigramText.innerHTML = "";

  const lines = castHypergram();

  let i = 0;
  const step = () => {
    if (i >= 6) {
      showReading(question, lines);
      return;
    }
    const l = lines[i];
    const st = lineState(l.value);
    const row = document.createElement("div");
    row.className = `hex-line ${st.yang ? "yang" : "yin"}${st.changing ? " changing" : ""} appearing`;
    if (st.yang) {
      const seg = document.createElement("div");
      seg.className = "seg";
      row.appendChild(seg);
    } else {
      const a = document.createElement("div");
      a.className = "seg";
      const b = document.createElement("div");
      b.className = "seg";
      row.appendChild(a);
      row.appendChild(b);
    }
    primaryFig.appendChild(row);
    i += 1;
    setTimeout(step, 280);
  };
  step();
}

// ——— Verlauf ———

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(entry) {
  const h = loadHistory();
  h.unshift(entry);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 20)));
}

function renderHistory(activeId = null) {
  const h = loadHistory();
  if (!h.length) {
    els.history.hidden = true;
    return;
  }
  els.history.hidden = false;
  els.historyList.innerHTML = "";
  for (const entry of h) {
    const li = document.createElement("li");
    if (activeId && entry.id === activeId) li.classList.add("active");
    const date = new Date(entry.ts);
    const dateStr = date.toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const hexStr = entry.resulting
      ? `${entry.primary.unicode || ""} ${entry.primary.name} → ${entry.resulting.unicode || ""} ${entry.resulting.name}`
      : `${entry.primary.unicode || ""} ${entry.primary.name}`;
    const href = entry.id ? `#r=${entry.id}` : "#";
    li.innerHTML = `
      <a class="history-item" href="${href}">
        <span class="date">${dateStr}</span>
        <span class="q">${escapeHTML(entry.question || "—")}</span>
        <span class="h">${escapeHTML(hexStr)}</span>
      </a>
    `;
    li.querySelector("a").addEventListener("click", (e) => {
      e.preventDefault();
      if (!entry.id) return;
      // Hash setzen → hashchange-Handler übernimmt das Anzeigen
      window.location.hash = `r=${entry.id}`;
    });
    els.historyList.appendChild(li);
  }
}

function buildMarkdownExport(reading, interpretation) {
  const p = reading.primaryHex;
  const r = reading.resultingHex;
  const lines = [];
  lines.push(`# Yijing Orakel`);
  lines.push("");
  if (reading.question) lines.push(`**Frage:** ${reading.question}`);
  lines.push(`**Datum:** ${new Date().toLocaleString("de-DE")}`);
  lines.push("");
  lines.push(`## Ursprungsbild`);
  lines.push("");
  lines.push(
    `**${p.unicode}  Nr. ${p.number} — ${p.name_chinese} ${p.pinyin} · ${p.name_latin} — ${p.name_de}**`
  );
  const t = p.trigrams || {};
  if (t.above && t.below) {
    lines.push("");
    lines.push(
      `- Oberes Trigramm: ${t.above.symbol} ${t.above.name} (${t.above.pinyin}) — ${t.above.family}, ${t.above.nature}`
    );
    lines.push(
      `- Unteres Trigramm: ${t.below.symbol} ${t.below.name} (${t.below.pinyin}) — ${t.below.family}, ${t.below.nature}`
    );
  }
  if (p.image_association) {
    lines.push("");
    lines.push(`*Bildmeditation:* ${p.image_association}`);
  }
  lines.push("");
  lines.push(`### Das Urteil`);
  lines.push("");
  lines.push(p.judgment || "—");
  lines.push("");
  lines.push(`### Das Bild`);
  lines.push("");
  lines.push(p.image || "—");
  lines.push("");
  lines.push(`### Bedeutung`);
  lines.push("");
  lines.push(p.meaning || "—");

  if (reading.changingIndices && reading.changingIndices.length) {
    lines.push("");
    lines.push(`## Wandelnde Linien`);
    for (const idx of reading.changingIndices) {
      const ln = p.lines[idx];
      lines.push("");
      lines.push(`### ${ln.position}`);
      lines.push("");
      lines.push(`> ${ln.text}`);
      if (ln.interpretation) {
        lines.push("");
        lines.push(ln.interpretation);
      }
    }
  }

  if (r) {
    lines.push("");
    lines.push(`## Zielbild`);
    lines.push("");
    lines.push(
      `**${r.unicode}  Nr. ${r.number} — ${r.name_chinese} ${r.pinyin} · ${r.name_latin} — ${r.name_de}**`
    );
    lines.push("");
    lines.push(`### Das Urteil`);
    lines.push("");
    lines.push(r.judgment || "—");
    lines.push("");
    lines.push(`### Das Bild`);
    lines.push("");
    lines.push(r.image || "—");
  }

  if (interpretation && interpretation.trim()) {
    lines.push("");
    lines.push(`## KI-Interpretation`);
    lines.push("");
    lines.push(interpretation.trim());
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("*Text: Richard Wilhelm — I Ging, Das Buch der Wandlungen.*");
  return lines.join("\n");
}

function downloadFile(filename, content, mimeType = "text/plain") {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 50);
}

function findHistoryEntry(id) {
  return loadHistory().find((e) => e.id === id) || null;
}

function applyHashIfAny() {
  const m = window.location.hash.match(/^#r=([^&]+)$/);
  if (!m) return false;
  const entry = findHistoryEntry(m[1]);
  if (!entry) return false;
  showReadingFromEntry(entry);
  return true;
}

// ——— LLM-Interpretation ———

function refreshEndpointSelect() {
  const list = Endpoints.list();
  els.endpointSelect.innerHTML = "";
  if (!list.length) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "(kein Endpunkt — ⚙ öffnen)";
    els.endpointSelect.appendChild(o);
    els.interpretBtn.disabled = true;
    return;
  }
  els.interpretBtn.disabled = false;
  for (const ep of list) {
    const o = document.createElement("option");
    o.value = ep.id;
    o.textContent = `${ep.name} (${ep.type})`;
    els.endpointSelect.appendChild(o);
  }
  const selId = Endpoints.getSelectedId();
  if (selId && list.some((e) => e.id === selId)) els.endpointSelect.value = selId;
  void refreshModelSelect();
}

async function refreshModelSelect() {
  const ep = Endpoints.list().find((e) => e.id === els.endpointSelect.value);
  els.modelSelect.innerHTML = "";
  if (!ep) return;
  // Aktuelle User-Auswahl merken — die soll, wenn weiterhin verfügbar,
  // erhalten bleiben, statt von ep.defaultModel überschrieben zu werden.
  const previouslySelected = els.modelSelect.value;
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "… lade Modelle";
  els.modelSelect.appendChild(placeholder);
  try {
    const client = makeClient(ep);
    const models = await client.listModels();
    els.modelSelect.innerHTML = "";
    if (!models.length) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = "(keine Modelle)";
      els.modelSelect.appendChild(o);
      return;
    }
    for (const m of models) {
      const o = document.createElement("option");
      o.value = m;
      o.textContent = m;
      els.modelSelect.appendChild(o);
    }
    // Priorität: vorherige User-Auswahl > Endpoint-Default > erstes Modell
    if (previouslySelected && models.includes(previouslySelected)) {
      els.modelSelect.value = previouslySelected;
    } else if (ep.defaultModel && models.includes(ep.defaultModel)) {
      els.modelSelect.value = ep.defaultModel;
    }
  } catch (e) {
    els.modelSelect.innerHTML = "";
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "(nicht erreichbar)";
    els.modelSelect.appendChild(o);
    console.warn("Modell-Liste:", e);
  }
}

async function runInterpretation() {
  if (!CURRENT_READING) return;
  const ep = Endpoints.list().find((e) => e.id === els.endpointSelect.value);
  if (!ep) {
    els.interpStatus.textContent = "Bitte erst Endpunkt einrichten (⚙).";
    return;
  }
  const model = els.modelSelect.value;
  if (!model) {
    els.interpStatus.textContent = "Bitte ein Modell wählen.";
    return;
  }
  Endpoints.setSelectedId(ep.id);
  Endpoints.update(ep.id, { defaultModel: model });

  const userPrompt = buildUserPrompt({
    question: CURRENT_READING.question,
    primary: CURRENT_READING.primaryHex,
    changingLines: CURRENT_READING.changingIndices,
    primaryHex: CURRENT_READING.primaryHex,
    resultingHex: CURRENT_READING.resultingHex,
  });

  els.interpBody.innerHTML = "";
  els.interpThinking.textContent = "";
  els.interpThinkingDetails.hidden = true;
  els.interpStatus.textContent = "… denke nach";
  els.interpretBtn.hidden = true;
  els.stopInterpretBtn.hidden = false;

  // Thinking-Modus: UI-Override > Endpoint-Default > globaler Default
  const uiChoice = els.thinkingSelect.value;
  const epDefault = ep.thinking && ep.thinking !== "default" ? ep.thinking : null;
  const globalDefault = localStorage.getItem("yijing-default-thinking") || "default";
  const choice = uiChoice !== "default" ? uiChoice : epDefault || globalDefault;
  const thinkingParam = choice === "on" ? true : choice === "off" ? false : null;

  interpretAbortCtrl = new AbortController();
  let buffer = "";
  let thinking = "";
  const t0 = performance.now();
  try {
    const client = makeClient(ep);
    await client.chatStream({
      model,
      thinking: thinkingParam,
      messages: [
        { role: "system", content: SystemPrompt.get() },
        { role: "user", content: userPrompt },
      ],
      signal: interpretAbortCtrl.signal,
      onToken: (t) => {
        buffer += t;
        els.interpBody.innerHTML = renderMarkdown(buffer);
        if (els.interpStatus.textContent.startsWith("… denke")) {
          els.interpStatus.textContent = "";
        }
      },
      onThinking: (t) => {
        thinking += t;
        els.interpThinkingDetails.hidden = false;
        els.interpThinking.textContent = thinking;
      },
    });
    const dt = ((performance.now() - t0) / 1000).toFixed(1);
    const thMark = choice === "on" ? " · think:on" : choice === "off" ? " · think:off" : "";
    els.interpStatus.textContent = `${buffer.length} Zeichen · ${dt}s · ${model}${thMark}`;
  } catch (e) {
    if (e?.name === "AbortError") {
      els.interpStatus.textContent = "Abgebrochen.";
    } else {
      const msg = e instanceof LLMError ? e.message : String(e?.message || e);
      els.interpStatus.textContent = `Fehler: ${msg}`;
      console.error(e);
    }
  } finally {
    interpretAbortCtrl = null;
    els.interpretBtn.hidden = false;
    els.stopInterpretBtn.hidden = true;
  }
}

// ——— Settings-Modal ———

function renderEndpointList() {
  const list = Endpoints.list();
  els.endpointList.innerHTML = "";
  if (!list.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Noch keine Endpunkte. Füge unten einen hinzu.";
    els.endpointList.appendChild(li);
    return;
  }
  for (const ep of list) {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="ep-head">
        <strong>${escapeHTML(ep.name)}</strong>
        <span class="ep-type">${escapeHTML(ep.type)}</span>
      </div>
      <div class="ep-url"><code>${escapeHTML(ep.baseUrl)}</code></div>
      <div class="ep-config">
        <label>
          <span>Standard-Modell</span>
          <select data-ep-model>
            <option value="">${ep.defaultModel ? escapeHTML(ep.defaultModel) : "— keins gewählt —"}</option>
          </select>
        </label>
        <label>
          <span>Reasoning-Default</span>
          <select data-ep-thinking>
            <option value="default" ${!ep.thinking || ep.thinking === "default" ? "selected" : ""}>Auto</option>
            <option value="on" ${ep.thinking === "on" ? "selected" : ""}>An</option>
            <option value="off" ${ep.thinking === "off" ? "selected" : ""}>Aus</option>
          </select>
        </label>
      </div>
      <div class="ep-actions">
        <button type="button" data-act="test">Verbindung testen</button>
        <button type="button" data-act="thinkTest">Reasoning testen</button>
        <button type="button" data-act="remove" class="ghost danger">Entfernen</button>
      </div>
      <div class="ep-status" data-status></div>
    `;

    const modelEl = li.querySelector("[data-ep-model]");
    const thinkingEl = li.querySelector("[data-ep-thinking]");

    // Modelle des Endpunkts asynchron nachladen
    (async () => {
      try {
        const client = makeClient(ep);
        const models = await client.listModels();
        modelEl.innerHTML = "";
        const empty = document.createElement("option");
        empty.value = "";
        empty.textContent = "— keins gewählt —";
        modelEl.appendChild(empty);
        for (const m of models) {
          const o = document.createElement("option");
          o.value = m;
          o.textContent = m;
          if (m === ep.defaultModel) o.selected = true;
          modelEl.appendChild(o);
        }
      } catch {
        modelEl.innerHTML = `<option value="">(nicht erreichbar)</option>`;
      }
    })();

    modelEl.addEventListener("change", () => {
      Endpoints.update(ep.id, { defaultModel: modelEl.value });
    });
    thinkingEl.addEventListener("change", () => {
      Endpoints.update(ep.id, { thinking: thinkingEl.value });
    });

    li.querySelector('[data-act="remove"]').addEventListener("click", () => {
      if (confirm(`Endpunkt "${ep.name}" entfernen?`)) {
        Endpoints.remove(ep.id);
        renderEndpointList();
        refreshEndpointSelect();
      }
    });
    li.querySelector('[data-act="test"]').addEventListener("click", async () => {
      const status = li.querySelector("[data-status]");
      status.textContent = "… teste Verbindung";
      try {
        const client = makeClient(ep);
        const models = await client.listModels();
        status.innerHTML = `<span class="ok">OK</span> — ${models.length} Modell(e): ${escapeHTML(models.slice(0, 3).join(", "))}${models.length > 3 ? " …" : ""}`;
      } catch (e) {
        status.innerHTML = `<span class="err">Fehler</span> — ${escapeHTML(e.message)}`;
      }
    });
    li.querySelector('[data-act="thinkTest"]').addEventListener("click", async () => {
      const status = li.querySelector("[data-status]");
      status.textContent = "… ermittle Modelle";
      try {
        const client = makeClient(ep);
        const models = await client.listModels();
        if (!models.length) {
          status.innerHTML = `<span class="err">Keine Modelle verfügbar</span>`;
          return;
        }
        // Bevorzugt das vom User gewählte Standard-Modell; sonst erstes
        // Nicht-Embedding-Modell, sonst irgendeines.
        const model =
          (ep.defaultModel && models.includes(ep.defaultModel) && ep.defaultModel) ||
          models.find((m) => !/embed/i.test(m)) ||
          models[0];
        status.innerHTML = `<span class="muted">teste mit <code>${escapeHTML(model)}</code> …</span>`;

        const onRes = await testThinkingMode({ endpoint: ep, model, thinking: true });
        const offRes = await testThinkingMode({ endpoint: ep, model, thinking: false });

        const onIcon = onRes.didThink ? "✓" : "✗";
        const offIcon = !offRes.didThink ? "✓" : "✗";
        const verdict = onRes.didThink && !offRes.didThink ? "ok" : onRes.didThink || offRes.didThink ? "warn" : "err";
        status.innerHTML = `
          <div class="think-test ${verdict}">
            <div><strong>Modell:</strong> <code>${escapeHTML(model)}</code></div>
            <div>think=on  → reasoning: ${onRes.thinkingChars} · content: ${onRes.contentChars} · ${onRes.durationSec}s  ${onIcon}</div>
            <div>think=off → reasoning: ${offRes.thinkingChars} · content: ${offRes.contentChars} · ${offRes.durationSec}s  ${offIcon}</div>
            <div class="think-test-verdict">${verdictText(verdict, onRes, offRes)}</div>
          </div>
        `;
      } catch (e) {
        status.innerHTML = `<span class="err">Fehler</span> — ${escapeHTML(e.message || String(e))}`;
      }
    });
    els.endpointList.appendChild(li);
  }
}

function verdictText(v, on, off) {
  if (v === "ok") return "Steuerung funktioniert — Reasoning lässt sich an- und ausschalten.";
  if (v === "warn" && on.didThink) return "Reasoning kommt, aber „Aus“ wurde nicht respektiert. (Server-Args dominieren?)";
  if (v === "warn") return "„Aus“ funktioniert, aber Reasoning konnte nicht erzwungen werden.";
  return "Keine Reasoning-Tokens beobachtet — dieses Modell unterstützt es vermutlich nicht.";
}

function openSettings() {
  renderEndpointList();
  els.systemPromptInput.value = SystemPrompt.get();
  els.defaultThinking.value = localStorage.getItem("yijing-default-thinking") || "default";
  els.newEpName.value = "";
  els.newEpUrl.value = "";
  els.newEpKey.value = "";
  if (typeof els.settingsModal.showModal === "function") {
    els.settingsModal.showModal();
  } else {
    els.settingsModal.setAttribute("open", "");
  }
}

function closeSettings() {
  if (typeof els.settingsModal.close === "function") els.settingsModal.close();
  else els.settingsModal.removeAttribute("open");
  SystemPrompt.set(els.systemPromptInput.value);
  localStorage.setItem("yijing-default-thinking", els.defaultThinking.value);
  refreshEndpointSelect();
}

// Vorbelegung der URL passend zum Typ
function suggestUrlForType() {
  if (els.newEpUrl.value && els.newEpUrl.value.trim()) return;
  els.newEpUrl.value =
    els.newEpType.value === "ollama" ? "http://localhost:11434" : "http://localhost:8080/v1";
}

// ——— Events ———

els.castBtn.addEventListener("click", () => {
  if (!HEXAGRAMS) return;
  tossAnimated(els.question.value || "");
});

els.resetBtn.addEventListener("click", () => {
  els.reading.hidden = true;
  els.resetBtn.hidden = true;
  els.exportMdBtn.hidden = true;
  els.exportPdfBtn.hidden = true;
  els.castBtn.disabled = false;
  els.question.value = "";
  els.question.focus();
  if (window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);
  window.scrollTo({ top: 0, behavior: "smooth" });
});

els.exportMdBtn.addEventListener("click", () => {
  if (!CURRENT_READING) return;
  const md = buildMarkdownExport(CURRENT_READING, els.interpBody.textContent || "");
  const dateStr = new Date().toISOString().slice(0, 10);
  const slug = (CURRENT_READING.primaryHex.name_latin || "yijing")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  downloadFile(`yijing-${dateStr}-${slug}.md`, md, "text/markdown");
});

els.exportPdfBtn.addEventListener("click", () => {
  // Alle <details> für den Druck aufklappen, dann drucken, dann zurücksetzen
  const detailsList = Array.from(els.reading.querySelectorAll("details"));
  const previouslyOpen = detailsList.map((d) => d.open);
  detailsList.forEach((d) => (d.open = true));
  // Browser-Druck-Dialog
  window.print();
  // Nach dem Druck wieder zurück (kleine Verzögerung damit print-Layout fertig ist)
  setTimeout(() => {
    detailsList.forEach((d, i) => (d.open = previouslyOpen[i]));
  }, 200);
});

els.clearHistoryBtn.addEventListener("click", () => {
  if (confirm("Verlauf wirklich löschen?")) {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
  }
});

els.openSettingsBtn.addEventListener("click", openSettings);
els.closeSettingsBtn.addEventListener("click", closeSettings);
els.settingsModal.addEventListener("close", () => {
  SystemPrompt.set(els.systemPromptInput.value);
  refreshEndpointSelect();
});
els.newEpType.addEventListener("change", suggestUrlForType);
els.newEpUrl.addEventListener("focus", suggestUrlForType);
els.addEndpointBtn.addEventListener("click", () => {
  const name = els.newEpName.value.trim();
  const url = els.newEpUrl.value.trim();
  if (!name || !url) {
    alert("Name und URL angeben.");
    return;
  }
  Endpoints.add({
    id: crypto.randomUUID(),
    name,
    type: els.newEpType.value,
    baseUrl: url,
    apiKey: els.newEpKey.value.trim(),
    defaultModel: "",
  });
  renderEndpointList();
  els.newEpName.value = "";
  els.newEpUrl.value = "";
  els.newEpKey.value = "";
});

els.resetSystemPromptBtn.addEventListener("click", () => {
  els.systemPromptInput.value = DEFAULT_SYSTEM_PROMPT;
});

els.endpointSelect.addEventListener("change", () => {
  Endpoints.setSelectedId(els.endpointSelect.value);
  void refreshModelSelect();
});

els.modelSelect.addEventListener("change", () => {
  const epId = els.endpointSelect.value;
  const model = els.modelSelect.value;
  if (epId && model) Endpoints.update(epId, { defaultModel: model });
});

els.interpretBtn.addEventListener("click", () => void runInterpretation());
els.stopInterpretBtn.addEventListener("click", () => interpretAbortCtrl?.abort());

// ——— Theme (Dark / Light / System) ———

const THEME_KEY = "yijing-theme";
const THEME_ICONS = { dark: "☾", light: "☀", system: "◐" };
const THEME_LABELS = { dark: "Dunkel", light: "Hell", system: "System" };
const themeQuery = window.matchMedia("(prefers-color-scheme: dark)");

/** Wendet den Modus an: setzt data-theme und aktualisiert den Knopf. */
function applyTheme(mode) {
  const effective =
    mode === "dark" || (mode === "system" && themeQuery.matches)
      ? "dark"
      : "light";
  document.documentElement.dataset.theme = effective;
  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.textContent = THEME_ICONS[mode];
    btn.title = `Erscheinungsbild: ${THEME_LABELS[mode]}`;
    btn.setAttribute("aria-label", btn.title);
  }
}

(function initTheme() {
  let mode = localStorage.getItem(THEME_KEY) || "system";
  applyTheme(mode);
  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.addEventListener("click", () => {
      mode = mode === "dark" ? "light" : mode === "light" ? "system" : "dark";
      localStorage.setItem(THEME_KEY, mode);
      applyTheme(mode);
    });
  }
  // Bei Modus „System": auf OS-Wechsel reagieren.
  themeQuery.addEventListener("change", () => {
    if ((localStorage.getItem(THEME_KEY) || "system") === "system") {
      applyTheme("system");
    }
  });
})();

// ——— Init ———

(async () => {
  try {
    await loadData();
    renderHistory();
    refreshEndpointSelect();
    // Hintergrund: lokale LLM-Server suchen und Auswahl aktualisieren
    Endpoints.autoDiscover().then(() => refreshEndpointSelect());
    // Tiefer Link? — falls #r=<id> in der URL steht, Eintrag wiederherstellen
    applyHashIfAny();
    window.addEventListener("hashchange", () => {
      if (!applyHashIfAny()) {
        // leerer/unbekannter Hash → optional zurück auf Frische
      }
    });
  } catch (e) {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div style="background:#d97742;color:#1a1814;padding:1rem;text-align:center;">
        Fehler beim Laden: ${escapeHTML(e.message)}.
        Starte mit <code>./serve.sh</code> oder <code>python3 -m http.server</code>.
      </div>`
    );
  }
})();

// ——— macOS-Download-Hinweis (nur auf der öffentlichen Demo, nur Mac) ———

(function initMacDownload() {
  const block = document.getElementById("macDownloadBlock");
  if (!block) return;
  const isMac = /Mac/i.test(navigator.platform || navigator.userAgent);
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  if (isMac && !isLocal) block.hidden = false;
})();

// ——— Service Worker (Offline-Betrieb) ———

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("../sw.js").catch(() => {});
  });
}
