// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
/**
 * Yijing-Orakel — Frontend-Hauptmodul.
 *
 * Verantwortlich für:
 *  - Cast-Mechanik (Drei-Münzen-Methode → Hypergram → Ursprungs-/Zielbild)
 *  - Rendering von Hexagramm-Figuren, Wilhelm-Texten und wandelnden Linien
 *  - Settings-Modal (Endpoint-Verwaltung, Reasoning-Defaults, System-Prompt, Sprache)
 *  - LLM-Interpretation mit Streaming + Thinking-Anzeige
 *  - Verlauf in localStorage + Tiefe Links via URL-Hash (#r=<uuid>)
 *  - Export als Markdown und PDF-Druck
 *
 * Stack: Vanilla ES-Module, keine Build-Tools, keine externen Abhängigkeiten.
 * Daten werden zur Laufzeit aus data/hexagrams[.en].json geladen.
 */

// Build-Kennung — der iOS-Build-Schritt ersetzt den Platzhalter durch Commit+Zeit.
// In der normalen Web-Fassung bleibt der Platzhalter → DEV_MODE = false.
const BUILD_ID = "__BUILD__";
const DEV_MODE = BUILD_ID !== "__" + "BUILD__";

import {
  Endpoints,
  SystemPrompt,
  getDefaultSystemPrompt,
  PROMPT_PRESETS,
  getPresetBody,
  PromptPresets,
  makeClient,
  buildUserPrompt,
  testThinkingMode,
  LLMError,
} from "./llm.js";
import { renderMarkdown } from "./markdown.js";
import { initI18n, applyI18n, setLang, getLang, t, localeTag } from "./i18n.js";

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
  if (!n) throw new Error(t("boot.unknownBinary", { binary }));
  return n;
}

// ——— UI-Refs ———

const els = {
  ask: document.getElementById("ask"),
  question: document.getElementById("question"),
  castBtn: document.getElementById("cast"),
  resetBtn: document.getElementById("reset"),
  exportMdBtn: document.getElementById("exportMd"),
  exportMenu: document.getElementById("exportMenu"),
  pdfBwBtn: document.getElementById("pdfBw"),
  pdfGlossyBtn: document.getElementById("pdfGlossy"),
  reading: document.getElementById("reading"),
  questionEcho: document.getElementById("questionEcho"),
  primary: document.getElementById("primary"),
  resulting: document.getElementById("resulting"),
  judgmentText: document.getElementById("judgmentText"),
  imageText: document.getElementById("imageText"),
  meaningText: document.getElementById("meaningText"),
  notesDetails: document.getElementById("notesDetails"),
  notesText: document.getElementById("notesText"),
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
  interpActive: document.getElementById("interpActive"),
  interpSetup: document.getElementById("interpSetup"),
  interpSetupConfigure: document.getElementById("interpSetupConfigure"),
  endpointSelect: document.getElementById("endpointSelect"),
  modelSelect: document.getElementById("modelSelect"),
  interpretBtn: document.getElementById("interpretBtn"),
  stopInterpretBtn: document.getElementById("stopInterpretBtn"),
  interpBody: document.getElementById("interpBody"),
  interpStatus: document.getElementById("interpStatus"),
  interpThinkingDetails: document.getElementById("interpThinkingDetails"),
  interpThinking: document.getElementById("interpThinking"),
  meditation: document.getElementById("meditation"),
  genImageBtn: document.getElementById("genImageBtn"),
  genImageStatus: document.getElementById("genImageStatus"),
  genImageFigure: document.getElementById("genImageFigure"),
  genImageImg: document.getElementById("genImageImg"),
  genImageSig: document.getElementById("genImageSig"),
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
  newEpWarn: document.getElementById("newEpWarn"),
  addEndpointBtn: document.getElementById("addEndpointBtn"),
  systemPromptInput: document.getElementById("systemPromptInput"),
  resetSystemPromptBtn: document.getElementById("resetSystemPrompt"),
  promptPresetSelect: document.getElementById("promptPresetSelect"),
  savePromptPresetBtn: document.getElementById("savePromptPreset"),
  deletePromptPresetBtn: document.getElementById("deletePromptPreset"),
  fontSizeSelect: document.getElementById("fontSizeSelect"),
  languageSelect: document.getElementById("languageSelect"),
  registerSelect: document.getElementById("registerSelect"),
  // Nachschlagewerk / Reader
  navOracle: document.getElementById("navOracle"),
  navReader: document.getElementById("navReader"),
  reader: document.getElementById("reader"),
  readerCard: document.getElementById("readerCard"),
  readerTexts: document.getElementById("readerTexts"),
  readerIndex: document.getElementById("readerIndex"),
  readerIndexToggle: document.getElementById("readerIndexToggle"),
  readerPos: document.getElementById("readerPos"),
  readerPrev: document.getElementById("readerPrev"),
  readerNext: document.getElementById("readerNext"),
};

let HEXAGRAMS = null;
let CURRENT_READING = null; // { primary, resulting, question, changingIndices }
let interpretAbortCtrl = null;

/** Lädt Hexagramme passend zur aktuellen Sprache. EN-Fallback → DE. */
async function loadData() {
  const lang = getLang();
  const sources = lang === "en"
    ? ["data/hexagrams.en.json", "data/hexagrams.json"]
    : ["data/hexagrams.json"];
  let data = null;
  let usedSrc = null;
  for (const src of sources) {
    try {
      const res = await fetch(src);
      if (!res.ok) continue;
      data = await res.json();
      usedSrc = src;
      break;
    } catch {
      /* nächste Quelle probieren */
    }
  }
  if (!data) throw new Error(t("boot.dataLoadFailed"));
  if (lang === "en" && usedSrc && !usedSrc.includes(".en.json")) {
    // EN angefordert, aber nur DE verfügbar — UI bleibt EN, Texte zeigen DE-Wilhelm-Original.
    console.info("EN translation not available yet, falling back to German Wilhelm texts.");
  }
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

function hexNameForLang(hexData) {
  // hexagrams.en.json hat ein paralleles `name_en`-Feld; Fallback: deutscher Name.
  return getLang() === "en" ? (hexData.name_en || hexData.name_de) : hexData.name_de;
}

function renderHexCard(card, hexData, lines, changingMask, linkable = false) {
  card.querySelector(".hex-name").textContent = hexNameForLang(hexData);
  const chinese = card.querySelector(".hex-chinese");
  chinese.innerHTML = `
    <span class="ch-symbol" lang="zh">${escapeHTML(hexData.unicode)}</span>
    <span class="ch-name" lang="zh">${escapeHTML(hexData.name_chinese)}</span>
    <span class="ch-pinyin" lang="zh-Latn-pinyin">${escapeHTML(hexData.pinyin)}</span>
    <span class="ch-latin">· ${escapeHTML(hexData.name_latin)}</span>
  `;
  const tri = card.querySelector(".hex-trigrams");
  const tr = hexData.trigrams || {};
  if (tr.above && tr.below) {
    tri.innerHTML = `
      <span title="${escapeHTML(tr.above.family)} — ${escapeHTML(tr.above.nature)}">${escapeHTML(tr.above.symbol)} ${escapeHTML(tr.above.name)}</span>
      ${escapeHTML(t("reading.trigramOver"))}
      <span title="${escapeHTML(tr.below.family)} — ${escapeHTML(tr.below.nature)}">${escapeHTML(tr.below.symbol)} ${escapeHTML(tr.below.name)}</span>
    `;
  } else {
    tri.textContent = "";
  }
  renderHexFigure(card.querySelector(".hex-figure"), lines, changingMask);

  // Klickbar → öffnet dieses Hexagramm im Nachschlagewerk. Nur für die
  // Lesungskarten (Ursprungs-/Zielbild); die Reader-Karte selbst bleibt inert.
  // Navigation läuft über den Hash (#h=<n>), damit ein History-Eintrag entsteht
  // und man per Wisch/Tab jederzeit zur Lesung zurückkommt. (Punkt 7)
  if (linkable && hexData?.number) {
    card.classList.add("hex-card-link");
    card.setAttribute("role", "link");
    card.setAttribute("tabindex", "0");
    // Ohne aria-label verkettet role="link" alle Kind-Texte (Titel, Symbol,
    // Pinyin, Trigramme) zu einem langen Namen — knapp den Hexagrammnamen geben.
    card.setAttribute("aria-label", hexNameForLang(hexData));
    card.onclick = () => { window.location.hash = "#h=" + hexData.number; };
    card.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        window.location.hash = "#h=" + hexData.number;
      }
    };
  } else {
    card.classList.remove("hex-card-link");
    card.onclick = null;
    card.onkeydown = null;
    card.removeAttribute("role");
    card.removeAttribute("tabindex");
    card.removeAttribute("aria-label");
  }
}

// ——— Register (geschlechtsneutral / historisch) ———
const REGISTER_KEY = "yijing-register";

/** "neutral" (default, inclusive) oder "historical" (Wilhelm 1924 wörtlich). */
function getRegister() {
  return localStorage.getItem(REGISTER_KEY) === "historical" ? "historical" : "neutral";
}
function setRegister(reg) {
  localStorage.setItem(REGISTER_KEY, reg === "historical" ? "historical" : "neutral");
}

/**
 * Wählt den Feldwert nach Sprache (DE/EN) UND Register (neutral/historisch).
 * Neutral bevorzugt *_neutral / *_en_neutral, fällt sauber auf die historische
 * Fassung zurück, wenn kein neutrales Override existiert.
 */
function fieldFor(obj, base) {
  const en = getLang() === "en";
  const neutral = getRegister() === "neutral";
  if (en) {
    if (neutral && obj[base + "_en_neutral"]) return obj[base + "_en_neutral"];
    return obj[base + "_en"] || obj[base];
  }
  if (neutral && obj[base + "_neutral"]) return obj[base + "_neutral"];
  return obj[base];
}

function lineFieldsForLang(ln) {
  return {
    // Position markers ("Anfangs eine Neun bedeutet:") are not gendered.
    position: getLang() === "en" ? (ln.position_en || ln.position) : ln.position,
    text: fieldFor(ln, "text"),
    interpretation: fieldFor(ln, "interpretation"),
  };
}

function hexTextFieldsForLang(hex) {
  return {
    judgment: fieldFor(hex, "judgment"),
    image: fieldFor(hex, "image"),
    meaning: fieldFor(hex, "meaning"),
  };
}

function renderChangingLines(hexData, changingIndices) {
  els.changingLines.innerHTML = "";
  for (const idx of changingIndices) {
    const ln = lineFieldsForLang(hexData.lines[idx]);
    const block = document.createElement("div");
    block.className = "changing-line";
    block.innerHTML = `
      <div class="pos">${escapeHTML(ln.position)}</div>
      <div class="text">${escapeHTML(ln.text).replace(/\n/g, "<br>")}</div>
      ${ln.interpretation ? `<div class="interp">${renderParagraphs(ln.interpretation)}</div>` : ""}
    `;
    els.changingLines.appendChild(block);
  }
}

/** Baut das Trigramm-Detail-HTML (oben/unten) — geteilt von Reading und Reader. */
function trigramDetailsHTML(hex) {
  const tr = hex.trigrams || {};
  if (!tr.above || !tr.below) return "—";
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
  return block(t("reading.trigramAbove"), tr.above) + block(t("reading.trigramBelow"), tr.below);
}

function renderTrigramDetails(hex) {
  els.trigramText.innerHTML = trigramDetailsHTML(hex);
}

function escapeHTML(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Render a plain-text field (\n\n = paragraph, \n = line break) as escaped <p> HTML. */
function renderParagraphs(s) {
  const text = String(s || "").trim();
  if (!text) return "—";
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHTML(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Language- and register-selected footnote text. */
function noteTextForLang(note) {
  return fieldFor(note, "text");
}

/** Render Wilhelm footnotes into the "Anmerkungen" block (hidden when none). */
function renderNotes(hex) {
  const notes = hex.notes || [];
  if (!notes.length) {
    els.notesDetails.hidden = true;
    els.notesText.innerHTML = "";
    return;
  }
  els.notesDetails.hidden = false;
  els.notesText.innerHTML = notes
    .map((n) => `<p class="note">${escapeHTML(noteTextForLang(n))}</p>`)
    .join("");
}

/** Hexagram 1 & 2, all six lines moving: the "use the nine / use the six" oracle. */
function renderSeventhLine(hexData) {
  const ln = lineFieldsForLang(hexData.lines[6]);
  els.changingLines.innerHTML = "";
  const block = document.createElement("div");
  block.className = "changing-line";
  block.innerHTML =
    `<div class="pos">${escapeHTML(ln.position)}</div>` +
    `<div class="text">${escapeHTML(ln.text).replace(/\n/g, "<br>")}</div>` +
    (ln.interpretation ? `<div class="interp">${renderParagraphs(ln.interpretation)}</div>` : "");
  els.changingLines.appendChild(block);
}

/** Sprachabhängige typografische Anführungszeichen für die Frage-Echo. */
function quoteForLang(s) {
  if (getLang() === "en") return `“${s}”`; // “…”
  return `„${s}“`; // „…“
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

  renderHexCard(els.primary, primaryHex, lines, changingMask, true);

  const primaryTexts = hexTextFieldsForLang(primaryHex);
  els.judgmentText.innerHTML = renderParagraphs(primaryTexts.judgment);
  els.imageText.innerHTML = renderParagraphs(primaryTexts.image);
  els.meaningText.innerHTML = renderParagraphs(primaryTexts.meaning);

  renderTrigramDetails(primaryHex);
  renderNotes(primaryHex);

  let resultingHex = null;
  if (changingIndices.length > 0) {
    els.changingSection.hidden = false;
    const allMoving = changingIndices.length === 6;
    if (allMoving && (primaryHex.number === 1 || primaryHex.number === 2)
        && primaryHex.lines.length >= 7) {
      renderSeventhLine(primaryHex);  // "use the nine" / "use the six" oracle
    } else {
      renderChangingLines(primaryHex, changingIndices);
    }

    const targetNum = kingWenFromBinary(targetBinary);
    resultingHex = HEXAGRAMS[targetNum];
    const targetLines = lines.map((l) => {
      const st = lineState(l.value);
      return { value: st.target === 1 ? 7 : 8 };
    });
    renderHexCard(els.resulting, resultingHex, targetLines, targetLines.map(() => false), true);
    els.resulting.hidden = false;
    els.resultingSection.hidden = false;
    els.resultingSummary.textContent = t("reading.resultingJudgmentOf", {
      name: hexNameForLang(resultingHex),
    });
    const resultingTexts = hexTextFieldsForLang(resultingHex);
    els.resultingJudgment.innerHTML = renderParagraphs(resultingTexts.judgment);
  } else {
    els.changingSection.hidden = true;
    els.resulting.hidden = true;
    els.resultingSection.hidden = true;
  }

  if (question.trim()) {
    els.questionEcho.hidden = false;
    els.questionEcho.textContent = quoteForLang(question.trim());
  } else {
    els.questionEcho.hidden = true;
  }

  els.reading.hidden = false;
  els.resetBtn.hidden = false;
  els.exportMenu.hidden = false;
  els.castBtn.disabled = true;

  els.interpBody.innerHTML = "";
  els.interpStatus.textContent = "";

  CURRENT_READING = {
    question: question.trim(),
    primaryHex,
    resultingHex,
    changingIndices,
  };
  // LLM-Sektion: volle UI bei ≥1 Endpoint, sonst dezenter Einrichtungs-Hinweis
  refreshInterpretationVisibility();
  // Meditationsbild zurücksetzen + Sichtbarkeit (nur native App mit Image Playground)
  resetMeditation();
  refreshMeditationVisibility();

  let activeEntryId = entryId;
  if (save) {
    activeEntryId = crypto.randomUUID();
    saveHistory({
      id: activeEntryId,
      ts: Date.now(),
      question: question.trim(),
      primary: { n: primaryNum, name: hexNameForLang(primaryHex), unicode: primaryHex.unicode },
      changingLines: changingIndices.map((i) => i + 1),
      resulting: resultingHex
        ? { n: resultingHex.number, name: hexNameForLang(resultingHex), unicode: resultingHex.unicode }
        : null,
      lines: lines.map((l) => l.value),
    });
  }
  renderHistory(activeEntryId);
  CURRENT_READING.id = activeEntryId; // Zuordnung für die später gespeicherte KI-Deutung

  if (activeEntryId) {
    // URL-Hash setzen, ohne Scroll-Sprung
    const newHash = `#r=${activeEntryId}`;
    if (window.location.hash !== newHash) {
      history.replaceState(null, "", newHash);
    }
  }

  setTimeout(() => {
    els.reading.scrollIntoView({ behavior: "smooth", block: "start" });
    // Fokus folgt dem neuen Inhalt (Tastatur/Screen-Reader) — sonst bliebe er auf
    // dem jetzt deaktivierten „Münzen werfen"-Button hängen (WCAG 2.4.3).
    els.reading.focus({ preventScroll: true });
  }, 50);
}

function showReadingFromEntry(entry) {
  if (!entry || !Array.isArray(entry.lines)) return;
  const lines = entry.lines.map((v) => ({ value: v }));
  showReading(entry.question || "", lines, { save: false, entryId: entry.id });
  // Gespeicherte KI-Deutung wiederherstellen — showReading hat interpBody geleert.
  // Auch ohne aktiven Endpoint anzeigen, damit eine alte Deutung sichtbar bleibt.
  if (entry.interpretation) {
    els.interpretation.hidden = false;
    if (els.interpSetup) els.interpSetup.hidden = true;
    if (els.interpActive) els.interpActive.hidden = false;
    els.interpBody.innerHTML = renderMarkdown(entry.interpretation);
    els.interpStatus.textContent = "";
  }
  // Gespeichertes Meditationsbild wiederherstellen (zeigt sich nur, wo die
  // Bild-Sektion sichtbar ist, d. h. native App mit Image Playground).
  if (entry.image && els.genImageImg && els.genImageFigure) {
    els.genImageImg.src = entry.image;
    els.genImageImg.alt = t("image.alt");
    els.genImageFigure.hidden = false;
    if (els.genImageBtn) els.genImageBtn.textContent = t("image.regenerate");
    if (els.genImageSig && entry.imageSig) {
      els.genImageSig.textContent = entry.imageSig;
      els.genImageSig.hidden = false;
    }
  }
}

// Generationszähler gegen Race: Wird die Frage während der Wurf-Animation
// geändert und erneut geworfen, überholt der neue Lauf den alten — der alte
// bricht ab, statt eine veraltete Lesung + einen Geister-Verlaufseintrag zu rendern.
let castSeq = 0;
function tossAnimated(question) {
  const myCast = ++castSeq;
  els.castBtn.disabled = true;
  els.reading.hidden = false;
  els.questionEcho.hidden = !question.trim();
  els.questionEcho.textContent = question.trim() ? quoteForLang(question.trim()) : "";

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
  els.notesDetails.hidden = true;
  els.interpretation.hidden = true;
  els.interpBody.innerHTML = "";
  els.trigramText.innerHTML = "";

  const lines = castHypergram();

  let i = 0;
  const step = () => {
    if (myCast !== castSeq) return; // ein neuer Wurf hat diesen überholt → abbrechen
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

/** Schreibt den Verlauf nach localStorage. Meditationsbilder (data-URLs) sind groß
 *  (~0,5–1 MB) und sprengen sonst das ~5-MB-Quota. Bei QuotaExceededError fallen die
 *  ÄLTESTEN gespeicherten Bilder nacheinander raus (der Lesungstext bleibt; das Bild
 *  ist aus Hexagramm + Frage deterministisch reproduzierbar), bis es passt. */
function persistHistory(h) {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
      return;
    } catch {
      let dropped = false;
      for (let i = h.length - 1; i >= 0; i--) {
        if (h[i].image) { delete h[i].image; dropped = true; break; }
      }
      if (!dropped) return; // nichts mehr zu verkleinern — aufgeben (still)
    }
  }
}

function saveHistory(entry) {
  const h = loadHistory();
  h.unshift(entry);
  persistHistory(h.slice(0, 20));
}

/** Patcht einen vorhandenen Verlaufseintrag (z. B. die fertige KI-Deutung oder das
 *  erzeugte Meditationsbild nachtragen), ohne seine Position zu verändern. */
function updateHistoryEntry(id, patch) {
  if (!id) return;
  const h = loadHistory();
  const i = h.findIndex((e) => e.id === id);
  if (i === -1) return;
  h[i] = { ...h[i], ...patch };
  persistHistory(h);
}

// ——— Dev-Verlauf: kuratierte, schwierige Wandel-Kombinationen zum Durchklicken ———
// (überschreibt den Verlauf; nur im Dev-Build per Tipp aufs Build-Badge)
const DEV_COMBOS = [
  { p: 42, r: 3,  q: "Wie beginne ich mein neues Projekt richtig?" },   // Baum + Setzling (Problemfall)
  { p: 57, r: 59, q: "Wie finde ich Klarheit in dieser Lage?" },        // Wiese + Auflösung
  { p: 40, r: 3,  q: "Wann löst sich mein langer Streit?" },            // Eis + Setzling (guter Fall)
  { p: 1,  r: 2,  q: "Soll ich die Führung übernehmen?" },              // Adler + Feld
  { p: 29, r: 30, q: "Wie komme ich aus dieser Krise heraus?" },        // dunkler Fluss + Laterne
  { p: 51, r: 52, q: "Was bedeutet dieser plötzliche Schock?" },        // aufgeschreckte Vögel + Berg
  { p: 18, r: 46, q: "Wie bringe ich die Sache wieder in Ordnung?" },   // Moos + Bambus (zwei subtile)
  { p: 11, r: 12, q: "Hält der gute Zustand an?" },                     // Kirschbaum + kahler Baum
  { p: 63, r: 64, q: "Bin ich schon am Ziel angekommen?" },            // Brücke + Fuchs auf Eis
  { p: 24, r: 2,  q: "Ist die Wende endlich gekommen?" },              // Spross + Feld
  { p: 55, r: 59, q: "Wie nutze ich diese Fülle am besten?" },         // Erntemond + wirbelnde Blätter
  { p: 22, r: 36, q: "Was verbirgt sich hinter dem schönen Schein?" }, // Pfau + gedämpfte Laterne
];

// Linien konstruieren, die primär p in resultierend r wandeln: bits, die sich
// unterscheiden, werden wandelnde Linien. 6=altes Yin, 7=junges Yang, 8=junges Yin,
// 9=altes Yang (siehe lineState).
function devLinesForTransition(p, r) {
  const binP = HEXAGRAMS[p].binary, binR = HEXAGRAMS[r].binary;
  const lines = [];
  for (let i = 0; i < 6; i++) {
    const a = binP[i], b = binR[i];
    lines.push(a === b ? (a === "1" ? 7 : 8) : (a === "1" ? 9 : 6));
  }
  return lines;
}

function populateDevHistory() {
  if (!DEV_MODE || !HEXAGRAMS) return;
  const now = Date.now();
  const entries = DEV_COMBOS.map((c, idx) => {
    const lines = devLinesForTransition(c.p, c.r);
    const prim = HEXAGRAMS[c.p], res = HEXAGRAMS[c.r];
    const changing = lines
      .map((v, i) => (lineState(v).changing ? i + 1 : 0))
      .filter((n) => n > 0);
    return {
      id: crypto.randomUUID(),
      ts: now - idx * 1000,
      question: c.q,
      primary: { n: c.p, name: hexNameForLang(prim), unicode: prim.unicode },
      changingLines: changing,
      resulting: { n: c.r, name: hexNameForLang(res), unicode: res.unicode },
      lines,
    };
  });
  persistHistory(entries);
  renderHistory();
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
    const dateStr = date.toLocaleString(localeTag(), {
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
  const pText = hexTextFieldsForLang(p);
  const rText = r ? hexTextFieldsForLang(r) : null;
  const numLabel = getLang() === "en" ? "No." : "Nr.";
  const lines = [];
  lines.push(t("export.title"));
  lines.push("");
  if (reading.question) lines.push(t("export.question", { question: reading.question }));
  lines.push(t("export.date", { date: new Date().toLocaleString(localeTag()) }));
  lines.push("");
  lines.push(t("export.h2.primary"));
  lines.push("");
  lines.push(
    `**${p.unicode}  ${numLabel} ${p.number} — ${p.name_chinese} ${p.pinyin} · ${p.name_latin} — ${hexNameForLang(p)}**`
  );
  const tr = p.trigrams || {};
  if (tr.above && tr.below) {
    lines.push("");
    lines.push(
      t("export.trigramAbove", {
        symbol: tr.above.symbol,
        name: tr.above.name,
        pinyin: tr.above.pinyin,
        family: tr.above.family,
        nature: tr.above.nature,
      })
    );
    lines.push(
      t("export.trigramBelow", {
        symbol: tr.below.symbol,
        name: tr.below.name,
        pinyin: tr.below.pinyin,
        family: tr.below.family,
        nature: tr.below.nature,
      })
    );
  }
  lines.push("");
  lines.push(t("export.h3.judgment"));
  lines.push("");
  lines.push(pText.judgment || "—");
  lines.push("");
  lines.push(t("export.h3.image"));
  lines.push("");
  lines.push(pText.image || "—");
  lines.push("");
  lines.push(t("export.h3.meaning"));
  lines.push("");
  lines.push(pText.meaning || "—");

  if (reading.changingIndices && reading.changingIndices.length) {
    lines.push("");
    lines.push(t("export.h2.changing"));
    for (const idx of reading.changingIndices) {
      const ln = lineFieldsForLang(p.lines[idx]);
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
    lines.push(t("export.h2.resulting"));
    lines.push("");
    lines.push(
      `**${r.unicode}  ${numLabel} ${r.number} — ${r.name_chinese} ${r.pinyin} · ${r.name_latin} — ${hexNameForLang(r)}**`
    );
    lines.push("");
    lines.push(t("export.h3.judgment"));
    lines.push("");
    lines.push(rText.judgment || "—");
    lines.push("");
    lines.push(t("export.h3.image"));
    lines.push("");
    lines.push(rText.image || "—");
  }

  if (interpretation && interpretation.trim()) {
    lines.push("");
    lines.push(t("export.h2.interpretation"));
    lines.push("");
    lines.push(interpretation.trim());
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(t("export.attribution"));
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
  // Nachschlagewerk-Deeplink: #h=<1..64>
  const rh = window.location.hash.match(/^#h=(\d{1,2})$/);
  if (rh) {
    const n = Number(rh[1]);
    if (n >= 1 && n <= 64) {
      openReader(n);
      return true;
    }
  }
  const m = window.location.hash.match(/^#r=([^&]+)$/);
  if (!m) return false;
  const entry = findHistoryEntry(m[1]);
  if (!entry) return false;
  if (!els.reader.hidden) closeReader(); // ggf. aus dem Reader zurück in den Orakel-Modus
  showReadingFromEntry(entry);
  return true;
}

// ——— Nachschlagewerk / Reader (alle 64 Hexagramme durchblättern) ———

const READER = { current: 1, prevView: null };

/** Linien aus dem Binärstring (Index 0 = unterste Linie); feste Linien, nichts wandelt. */
function linesFromBinary(binary) {
  return String(binary)
    .split("")
    .map((c) => ({ value: c === "1" ? 7 : 8 }));
}

/** Ein Linien-Block (Position / Text / Deutung) — gleiche Optik wie wandelnde Linien. */
function readerLineHTML(ln) {
  const f = lineFieldsForLang(ln);
  return (
    `<div class="changing-line reader-line">` +
    `<div class="pos">${escapeHTML(f.position)}</div>` +
    `<div class="text">${escapeHTML(f.text).replace(/\n/g, "<br>")}</div>` +
    (f.interpretation ? `<div class="interp">${renderParagraphs(f.interpretation)}</div>` : "") +
    `</div>`
  );
}

/** Vollständige Text-Sektion eines Hexagramms fürs Nachschlagewerk (zeigt ALLE Linien). */
function renderReaderTexts(hex) {
  const tx = hexTextFieldsForLang(hex);
  const details = (summaryKey, bodyHTML, open, bodyClass = "") =>
    `<details${open ? " open" : ""}><summary>${escapeHTML(t(summaryKey))}</summary>` +
    `<div class="text-body${bodyClass ? " " + bodyClass : ""}">${bodyHTML}</div></details>`;

  let html = "";
  html += details("reading.judgment", renderParagraphs(tx.judgment), true);
  html += details("reading.image", renderParagraphs(tx.image), false);
  html += details("reading.meaning", renderParagraphs(tx.meaning), false);
  // Trigramm-HTML enthält strukturelle Zeilenumbrüche — Container auf normal
  // stellen (wie #trigramText im Orakel), sonst rendert pre-wrap große Lücken.
  html += details("reading.trigrams", trigramDetailsHTML(hex), false, "reader-trigrams");
  html += `<h2 class="section-title">${escapeHTML(t("reading.allLines"))}</h2>`;
  html += (hex.lines || []).map(readerLineHTML).join("");
  const notes = hex.notes || [];
  if (notes.length) {
    const body = notes.map((n) => `<p class="note">${escapeHTML(noteTextForLang(n))}</p>`).join("");
    html += details("reading.notes", body, false);
  }
  els.readerTexts.innerHTML = html;
}

function renderReader(num) {
  const n = Math.min(64, Math.max(1, Number(num) | 0));
  const hex = HEXAGRAMS[n];
  if (!hex) return;
  READER.current = n;
  renderHexCard(els.readerCard, hex, linesFromBinary(hex.binary), null);
  renderReaderTexts(hex);
  els.readerPos.textContent = `${n} / 64`;
  els.readerIndex.querySelectorAll(".reader-cell").forEach((c) => {
    c.classList.toggle("active", Number(c.dataset.n) === n);
  });
  const newHash = `#h=${n}`;
  if (window.location.hash !== newHash) history.replaceState(null, "", newHash);
}

/** Baut das 8×8-Übersichtsgitter (einmalig bzw. nach Sprachwechsel neu). */
function renderReaderIndex() {
  if (els.readerIndex.childElementCount) return;
  const frag = document.createDocumentFragment();
  for (let n = 1; n <= 64; n++) {
    const hex = HEXAGRAMS[n];
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "reader-cell";
    cell.dataset.n = String(n);
    cell.innerHTML =
      `<span class="rc-sym">${escapeHTML(hex?.unicode || "")}</span>` +
      `<span class="rc-num">${n}</span>`;
    if (hex) cell.title = `${n} · ${hexNameForLang(hex)}`;
    cell.addEventListener("click", () => {
      renderReader(n);
      toggleReaderIndex(false);
      els.readerCard.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    frag.appendChild(cell);
  }
  els.readerIndex.appendChild(frag);
}

function toggleReaderIndex(force) {
  const show = typeof force === "boolean" ? force : els.readerIndex.hidden;
  els.readerIndex.hidden = !show;
  els.readerIndexToggle.setAttribute("aria-expanded", String(show));
}

function setNavActive(reader) {
  els.navReader.classList.toggle("active", reader);
  els.navOracle.classList.toggle("active", !reader);
  els.navReader.setAttribute("aria-pressed", String(reader));
  els.navOracle.setAttribute("aria-pressed", String(!reader));
}

function openReader(num = READER.current) {
  READER.prevView = {
    ask: els.ask.hidden,
    reading: els.reading.hidden,
    history: els.history.hidden,
  };
  els.ask.hidden = true;
  els.reading.hidden = true;
  els.history.hidden = true;
  els.reader.hidden = false;
  setNavActive(true);
  renderReaderIndex();
  renderReader(num);
  // Fokus in die geöffnete Reader-Karte ziehen (Tastatur/Screen-Reader). Per rAF,
  // damit es auch beim Kalt-Deeplink (#h=) nach dem load-Event greift (sonst setzt
  // der Browser den Fokus nach „load" wieder auf body zurück). tabIndex neu setzen,
  // weil renderHexCard (linkable=false) das statische tabindex-Attribut entfernt.
  requestAnimationFrame(() => {
    els.readerCard.tabIndex = -1;
    els.readerCard.focus({ preventScroll: true });
  });
}

function closeReader() {
  els.reader.hidden = true;
  const pv = READER.prevView || { ask: false, reading: true, history: true };
  els.ask.hidden = pv.ask;
  els.reading.hidden = pv.reading;
  els.history.hidden = pv.history;
  setNavActive(false);
  if (/^#h=/.test(window.location.hash)) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

// ——— LLM-Interpretation ———

/**
 * Entscheidet, ob die Interpretations-Sektion die volle UI (≥1 Endpoint) oder
 * den dezenten Einrichtungs-Hinweis (0 Endpoints) zeigt. Die Sektion erscheint
 * nur im Kontext einer aktiven Lesung. Aufgerufen aus showReading(), nach
 * autoDiscover() und nach Endpoint-Änderungen in den Settings — so wandert die
 * Sichtbarkeit reaktiv mit, statt erst bei der nächsten Lesung.
 */
function refreshInterpretationVisibility() {
  const hasReading = CURRENT_READING !== null;
  const hasEndpoint = Endpoints.list().length > 0;
  els.interpretation.hidden = !hasReading;
  if (els.interpSetup) els.interpSetup.hidden = hasEndpoint;
  if (els.interpActive) els.interpActive.hidden = !hasEndpoint;
  setInterpPlaceholder(); // Hinweis-Text an Endpunkt-Anzahl anpassen (Punkt 4)
}

/**
 * Mixed-Content-Realität: eine über HTTPS ausgelieferte Seite (Codeberg Pages,
 * künftige Mobile-Shells) kann keinen http://-Endpoint erreichen — außer
 * localhost (Browser-Sonderfall). Warnt nicht-blockierend; der Endpoint wird
 * trotzdem gespeichert, falls der/die Nutzer:in weiß, was er/sie tut.
 */
function isMixedContentEndpoint(url) {
  if (typeof location === "undefined" || location.protocol !== "https:") return false;
  let host;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:") return false;
    host = u.hostname;
  } catch {
    return false;
  }
  // localhost-Sonderfälle, die Browser von Mixed-Content ausnehmen (inkl.
  // IPv6-Loopback; new URL(...).hostname liefert ihn als „[::1]").
  return host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]";
}

function updateMixedContentWarn() {
  if (!els.newEpWarn) return;
  const warn = isMixedContentEndpoint(els.newEpUrl.value.trim());
  els.newEpWarn.textContent = warn ? t("settings.endpoints.mixedContentWarn") : "";
  els.newEpWarn.hidden = !warn;
}

function refreshEndpointSelect() {
  const list = Endpoints.list();
  els.endpointSelect.innerHTML = "";
  if (!list.length) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = t("llm.option.noEndpoint");
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
  placeholder.textContent = t("llm.option.loadingModels");
  els.modelSelect.appendChild(placeholder);
  try {
    const client = makeClient(ep);
    const models = await client.listModels();
    els.modelSelect.innerHTML = "";
    if (!models.length) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = t("llm.option.noModels");
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
    o.textContent = t("llm.option.unreachable");
    els.modelSelect.appendChild(o);
    console.warn("Modell-Liste:", e);
  }
}

async function runInterpretation() {
  if (!CURRENT_READING) return;
  const ep = Endpoints.list().find((e) => e.id === els.endpointSelect.value);
  if (!ep) {
    els.interpStatus.textContent = t("llm.status.needEndpoint");
    return;
  }
  const model = els.modelSelect.value;
  if (!model) {
    els.interpStatus.textContent = t("llm.status.needModel");
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
  els.interpStatus.textContent = t("llm.status.thinking");
  els.interpretBtn.hidden = true;
  els.stopInterpretBtn.hidden = false;

  // Thinking-Modus: Endpoint-Default > globaler Reasoning-Default (Settings).
  // Der frühere per-Lesung-Override (thinkingSelect) ist entfallen.
  const epDefault = ep.thinking && ep.thinking !== "default" ? ep.thinking : null;
  const globalDefault = localStorage.getItem("yijing-default-thinking") || "default";
  const choice = epDefault || globalDefault;
  const thinkingParam = choice === "on" ? true : choice === "off" ? false : null;

  interpretAbortCtrl = new AbortController();
  let buffer = "";
  let thinking = "";
  // Render-Coalescing: das ganze Markdown-Buffer pro Token neu zu parsen ist
  // O(n²)-DOM-Thrash. Stattdessen höchstens ein Render pro Animation-Frame.
  let renderPending = false;
  const flushInterp = () => {
    renderPending = false;
    els.interpBody.innerHTML = renderMarkdown(buffer);
  };
  const scheduleInterpRender = () => {
    if (renderPending) return;
    renderPending = true;
    requestAnimationFrame(flushInterp);
  };
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
      onToken: (tok) => {
        buffer += tok;
        scheduleInterpRender();
        // Status "… thinking" entfernen, sobald sichtbarer Output kommt.
        const cur = els.interpStatus.textContent;
        if (cur === t("llm.status.thinking")) {
          els.interpStatus.textContent = "";
        }
      },
      onThinking: (tok) => {
        thinking += tok;
        els.interpThinkingDetails.hidden = false;
        els.interpThinking.textContent = thinking;
      },
    });
    const dt = ((performance.now() - t0) / 1000).toFixed(1);
    const thMark = choice === "on"
      ? t("llm.status.thinkOn")
      : choice === "off"
        ? t("llm.status.thinkOff")
        : "";
    els.interpStatus.textContent = t("llm.status.done", {
      chars: buffer.length,
      seconds: dt,
      model,
      think: thMark,
    });
    // Fertige Deutung am Verlaufseintrag sichern, damit sie beim Wiederaufrufen
    // aus dem Verlauf erhalten bleibt (sonst ging sie verloren).
    if (CURRENT_READING?.id && buffer.trim()) {
      updateHistoryEntry(CURRENT_READING.id, { interpretation: buffer });
    }
  } catch (e) {
    if (e?.name === "AbortError") {
      els.interpStatus.textContent = t("llm.status.aborted");
    } else {
      const msg = e instanceof LLMError ? e.message : String(e?.message || e);
      els.interpStatus.textContent = t("llm.status.error", { message: msg });
      console.error(e);
    }
  } finally {
    // Einen evtl. noch ausstehenden Frame neutralisieren und final einmal rendern,
    // damit die letzten Tokens (oder der Abbruch-Stand) garantiert sichtbar sind.
    renderPending = false;
    els.interpBody.innerHTML = renderMarkdown(buffer);
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
    li.textContent = t("settings.endpoints.empty");
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
          <span>${escapeHTML(t("settings.endpoints.defaultModel"))}</span>
          <select data-ep-model>
            <option value="">${ep.defaultModel ? escapeHTML(ep.defaultModel) : escapeHTML(t("settings.endpoints.noneSelected"))}</option>
          </select>
        </label>
        <label>
          <span>${escapeHTML(t("settings.thinkingDefault"))}</span>
          <select data-ep-thinking>
            <option value="default" ${!ep.thinking || ep.thinking === "default" ? "selected" : ""}>${escapeHTML(t("settings.thinkingDefault.short.auto"))}</option>
            <option value="on" ${ep.thinking === "on" ? "selected" : ""}>${escapeHTML(t("settings.thinkingDefault.short.on"))}</option>
            <option value="off" ${ep.thinking === "off" ? "selected" : ""}>${escapeHTML(t("settings.thinkingDefault.short.off"))}</option>
          </select>
        </label>
      </div>
      <div class="ep-actions">
        <button type="button" data-act="test">${escapeHTML(t("settings.endpoints.test"))}</button>
        <button type="button" data-act="thinkTest">${escapeHTML(t("settings.endpoints.testThinking"))}</button>
        <button type="button" data-act="remove" class="ghost danger">${escapeHTML(t("settings.endpoints.remove"))}</button>
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
        empty.textContent = t("settings.endpoints.noneSelected");
        modelEl.appendChild(empty);
        for (const m of models) {
          const o = document.createElement("option");
          o.value = m;
          o.textContent = m;
          if (m === ep.defaultModel) o.selected = true;
          modelEl.appendChild(o);
        }
      } catch {
        modelEl.innerHTML = `<option value="">${escapeHTML(t("llm.option.unreachable"))}</option>`;
      }
    })();

    modelEl.addEventListener("change", () => {
      Endpoints.update(ep.id, { defaultModel: modelEl.value });
    });
    thinkingEl.addEventListener("change", () => {
      Endpoints.update(ep.id, { thinking: thinkingEl.value });
    });

    li.querySelector('[data-act="remove"]').addEventListener("click", () => {
      if (confirm(t("settings.endpoints.removeConfirm", { name: ep.name }))) {
        Endpoints.remove(ep.id);
        renderEndpointList();
        refreshEndpointSelect();
        refreshInterpretationVisibility();
      }
    });
    li.querySelector('[data-act="test"]').addEventListener("click", async () => {
      const status = li.querySelector("[data-status]");
      status.textContent = t("settings.endpoints.testing");
      try {
        const client = makeClient(ep);
        const models = await client.listModels();
        status.innerHTML = escapeHTML(
          t("settings.endpoints.testOk", {
            count: models.length,
            models: models.slice(0, 3).join(", "),
            more: models.length > 3 ? " …" : "",
          })
        );
      } catch (e) {
        status.innerHTML = escapeHTML(t("settings.endpoints.testError", { message: e.message || String(e) }));
      }
    });
    li.querySelector('[data-act="thinkTest"]').addEventListener("click", async () => {
      const status = li.querySelector("[data-status]");
      status.textContent = t("settings.endpoints.thinkingProbe.findingModels");
      try {
        const client = makeClient(ep);
        const models = await client.listModels();
        if (!models.length) {
          status.innerHTML = `<span class="err">${escapeHTML(t("settings.endpoints.thinkingProbe.noModels"))}</span>`;
          return;
        }
        // Bevorzugt das vom User gewählte Standard-Modell; sonst erstes
        // Nicht-Embedding-Modell, sonst irgendeines.
        const model =
          (ep.defaultModel && models.includes(ep.defaultModel) && ep.defaultModel) ||
          models.find((m) => !/embed/i.test(m)) ||
          models[0];
        status.innerHTML = `<span class="muted">${t("settings.endpoints.thinkingProbe.testing", { model: escapeHTML(model) })}</span>`;

        const onRes = await testThinkingMode({ endpoint: ep, model, thinking: true });
        const offRes = await testThinkingMode({ endpoint: ep, model, thinking: false });

        const onIcon = onRes.didThink ? "✓" : "✗";
        const offIcon = !offRes.didThink ? "✓" : "✗";
        const verdict = onRes.didThink && !offRes.didThink ? "ok" : onRes.didThink || offRes.didThink ? "warn" : "err";
        status.innerHTML = `
          <div class="think-test ${verdict}">
            <div><strong>${escapeHTML(t("settings.endpoints.thinkingProbe.modelLabel"))}</strong> <code>${escapeHTML(model)}</code></div>
            <div>think=on  → reasoning: ${onRes.thinkingChars} · content: ${onRes.contentChars} · ${onRes.durationSec}s  ${onIcon}</div>
            <div>think=off → reasoning: ${offRes.thinkingChars} · content: ${offRes.contentChars} · ${offRes.durationSec}s  ${offIcon}</div>
            <div class="think-test-verdict">${escapeHTML(verdictText(verdict, onRes, offRes))}</div>
          </div>
        `;
      } catch (e) {
        status.innerHTML = escapeHTML(t("settings.endpoints.testError", { message: e.message || String(e) }));
      }
    });
    els.endpointList.appendChild(li);
  }
}

function verdictText(v, on, _off) {
  if (v === "ok") return t("settings.endpoints.thinkingProbe.verdictOk");
  if (v === "warn" && on.didThink) return t("settings.endpoints.thinkingProbe.verdictWarnOnSucceededOffFailed");
  if (v === "warn") return t("settings.endpoints.thinkingProbe.verdictWarnOffOnly");
  return t("settings.endpoints.thinkingProbe.verdictErr");
}

function openSettings() {
  renderEndpointList();
  els.systemPromptInput.value = SystemPrompt.get();
  renderPromptPresets();
  if (els.fontSizeSelect) els.fontSizeSelect.value = currentFontSize();
  els.defaultThinking.value = localStorage.getItem("yijing-default-thinking") || "default";
  if (els.languageSelect) els.languageSelect.value = getLang();
  if (els.registerSelect) els.registerSelect.value = getRegister();
  els.newEpName.value = "";
  els.newEpUrl.value = "";
  els.newEpKey.value = "";
  updateMixedContentWarn();
  if (typeof els.settingsModal.showModal === "function") {
    els.settingsModal.showModal();
  } else {
    // Fallback ohne native <dialog>-Unterstützung: showModal() würde sonst
    // den ersten fokussierbaren Knoten automatisch fokussieren — hier
    // manuell, damit Tastatur- und Screen-Reader-Nutzer:innen ankommen.
    els.settingsModal.setAttribute("open", "");
    const first = els.settingsModal.querySelector(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
    );
    if (first) first.focus();
  }
}

// Persistenz + Refresh beim Schließen der Einstellungen. Trägt das 'close'-Event
// des <dialog>, damit JEDER Schließweg (Button, Esc, Backdrop) speichert — sonst
// ging z.B. der Reasoning-Default bei Esc/Backdrop verloren (Punkt 14).
function persistSettings() {
  SystemPrompt.set(els.systemPromptInput.value);
  localStorage.setItem("yijing-default-thinking", els.defaultThinking.value);
  refreshEndpointSelect();
  refreshInterpretationVisibility();
}

function closeSettings() {
  if (typeof els.settingsModal.close === "function") {
    els.settingsModal.close(); // löst 'close' aus → persistSettings() läuft dort
  } else {
    // Kein natives <dialog>: removeAttribute feuert kein 'close' → hier speichern.
    els.settingsModal.removeAttribute("open");
    persistSettings();
  }
}

// Vorbelegung der URL passend zum Typ
function suggestUrlForType() {
  if (els.newEpUrl.value && els.newEpUrl.value.trim()) return;
  els.newEpUrl.value =
    els.newEpType.value === "ollama" ? "http://localhost:11434" : "http://localhost:8080/v1";
  updateMixedContentWarn();
}

// ——— Prompt-Vorlagen (Presets) ———
//
// Vorlagen befüllen nur die System-Prompt-Textarea; ab da greift die normale
// SystemPrompt.set()-Persistenz beim Schließen. Der <select> zeigt die aktive
// Vorlage an (oder „eigener Text", wenn der Inhalt keiner Vorlage entspricht).

/** Findet zur Textarea eine passende Vorlage; liefert den <select>-Wert
 *  ("builtin:<id>" / "user:<id>") oder "" (= eigener Text). */
function matchPresetForText(text) {
  const cur = (text || "").trim();
  if (!cur) return "";
  const lang = getLang();
  for (const p of PROMPT_PRESETS) {
    if ((getPresetBody(p.id, lang) || "").trim() === cur) return "builtin:" + p.id;
  }
  for (const p of PromptPresets.list()) {
    if ((p.body || "").trim() === cur) return "user:" + p.id;
  }
  return "";
}

/** Synct die <select>-Auswahl + Sichtbarkeit des Löschen-Buttons zum Textarea-Inhalt. */
function syncPresetSelection() {
  if (!els.promptPresetSelect) return;
  const val = matchPresetForText(els.systemPromptInput.value);
  els.promptPresetSelect.value = val;
  if (els.deletePromptPresetBtn) els.deletePromptPresetBtn.hidden = !val.startsWith("user:");
}

/** Baut den Vorlagen-<select> neu (Built-in + eigene) und synct die Auswahl. */
function renderPromptPresets() {
  const sel = els.promptPresetSelect;
  if (!sel) return;
  sel.innerHTML = "";

  const custom = document.createElement("option");
  custom.value = "";
  custom.textContent = t("settings.presets.custom");
  sel.appendChild(custom);

  const gBuiltin = document.createElement("optgroup");
  gBuiltin.label = t("settings.presets.builtinGroup");
  for (const p of PROMPT_PRESETS) {
    const o = document.createElement("option");
    o.value = "builtin:" + p.id;
    o.textContent = t("settings.presets." + p.id);
    gBuiltin.appendChild(o);
  }
  sel.appendChild(gBuiltin);

  const users = PromptPresets.list();
  if (users.length) {
    const gUser = document.createElement("optgroup");
    gUser.label = t("settings.presets.userGroup");
    for (const p of users) {
      const o = document.createElement("option");
      o.value = "user:" + p.id;
      o.textContent = p.name;
      gUser.appendChild(o);
    }
    sel.appendChild(gUser);
  }

  syncPresetSelection();
}

// ——— Schriftgröße der Lese-Ansicht ———
// Das Inline-Script im <head> setzt data-font-size bereits vor dem ersten Paint;
// hier nur Persistenz + Live-Umschaltung. Werte: sm | md | lg | xl.

const FONT_SIZE_KEY = "yijing-font-size-v1";

function currentFontSize() {
  const v = localStorage.getItem(FONT_SIZE_KEY);
  return v === "sm" || v === "lg" || v === "xl" ? v : "md";
}

function applyFontSize(size) {
  document.documentElement.dataset.fontSize = size;
}

// ——— Sprach-Wechsel-Handler ———

async function changeLanguage(lang) {
  if (lang !== "de" && lang !== "en") return;
  if (lang === getLang()) return;
  setLang(lang); // dispatcht i18n:changed + macht applyI18n + html lang
  // Hexagramm-Daten in der neuen Sprache nachladen.
  try {
    await loadData();
  } catch (e) {
    console.warn("loadData on language change failed", e);
  }
  // System-Prompt-Default sprach-passend aktualisieren, wenn kein Custom gespeichert.
  els.systemPromptInput.value = SystemPrompt.get();
  // Vorlagen-Namen + -Bodies sind sprachabhängig — neu aufbauen und Auswahl matchen.
  renderPromptPresets();
  // Nachschlagewerk in neuer Sprache neu rendern (Index-Titel sind sprachabhängig).
  els.readerIndex.innerHTML = "";
  if (!els.reader.hidden) {
    renderReaderIndex();
    renderReader(READER.current);
  }
  // Aktuelle Reading neu rendern — nimmt das History-Entry, damit die Linien-
  // werte erhalten bleiben und nicht aus binary+changing rekonstruiert werden.
  const hashMatch = window.location.hash.match(/^#r=([^&]+)$/);
  if (hashMatch) {
    const entry = findHistoryEntry(hashMatch[1]);
    if (entry) showReadingFromEntry(entry);
  }
  // Endpoint-Liste neu rendern, damit Labels passen.
  renderEndpointList();
  refreshEndpointSelect();
  // Verlauf-Datumsformat ist sprach-abhängig — neu rendern.
  renderHistory(hashMatch ? hashMatch[1] : null);
}

// ——— Events ———

els.castBtn.addEventListener("click", () => {
  if (!HEXAGRAMS) return;
  tossAnimated(els.question.value || "");
});

els.resetBtn.addEventListener("click", () => {
  els.reading.hidden = true;
  els.resetBtn.hidden = true;
  els.exportMenu.hidden = true;
  els.castBtn.disabled = false;
  els.question.value = "";
  els.question.focus();
  if (window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// Wird die Frage geändert, während eine Lesung angezeigt wird, gilt der nächste
// „Orakel befragen"-Klick als neue Frage: den Button wieder freigeben, statt erst
// „Neue Frage" zu verlangen (tossAnimated baut die Lesung ohnehin frisch). (Punkt 8)
els.question.addEventListener("input", () => {
  if (els.reading.hidden || !CURRENT_READING) return;
  els.castBtn.disabled = els.question.value.trim() === (CURRENT_READING.question || "");
});

// ——— Export — native Bridge in der macOS-App (WKWebView kann kein
// window.print() / <a download>), Browser-Fallback sonst ———
const nativeBridge = window.webkit?.messageHandlers?.yijing || null;

// Spiegelt Sprache + Fassung in die native App (→ App Group → Widgets/Watch).
// No-op im reinen Web (kein window.webkit). Sprachwechsel feuert i18n:changed.
function publishSettings() {
  nativeBridge?.postMessage({ action: "settings", language: getLang(), register: getRegister() });
}
document.addEventListener("i18n:changed", publishSettings);

function exportFilename(ext) {
  // Lokaler Zeitstempel YYYY-MM-DD-HHMMSS → eindeutige, chronologisch sortierbare
  // Namen (UTC-toISOString würde die Uhrzeit gegenüber der Lesung verschieben).
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const slugify = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // Beide Hexagramme aufnehmen, wenn die Lesung wandelt (Ursprungs- → Zielbild).
  const slug =
    [CURRENT_READING.primaryHex, CURRENT_READING.resultingHex]
      .filter(Boolean)
      .map((h) => slugify(h.name_latin))
      .filter(Boolean)
      .join("-") || slugify(t("export.filenameSlug"));
  return `yijing-${stamp}-${slug}.${ext}`;
}

els.exportMdBtn.addEventListener("click", () => {
  if (!CURRENT_READING) return;
  if (els.exportMenu) els.exportMenu.open = false;
  const md = buildMarkdownExport(CURRENT_READING, els.interpBody.textContent || "");
  const filename = exportFilename("md");
  if (nativeBridge) {
    nativeBridge.postMessage({ action: "saveMarkdown", filename, content: md });
  } else {
    downloadFile(filename, md, "text/markdown");
  }
});

// PDF: zwei Modi — "bw" (Druck S/W) und "glossy" (App-Design, randlos, spiegelt
// das aktive Theme). Die Web-Seite setzt die Druck-Modus-Klasse + --print-question;
// in der App druckt Swift nativ (NSPrintOperation), im Browser window.print().
let __pdfRestore = null;
function preparePrint(mode, exporting) {
  const root = document.documentElement;
  root.classList.remove("pdf-bw", "pdf-glossy", "exporting");
  root.classList.add(mode === "glossy" ? "pdf-glossy" : "pdf-bw");
  // "exporting" = native createPDF-Erfassung (Screen-Media), sonst Browser-@media-print.
  if (exporting) root.classList.add("exporting");
  const q = (CURRENT_READING && CURRENT_READING.question) || "";
  root.style.setProperty("--print-question", q ? JSON.stringify(q) : '""');
  const detailsList = Array.from(els.reading.querySelectorAll("details"));
  const previouslyOpen = detailsList.map((d) => d.open);
  detailsList.forEach((d) => (d.open = true));
  __pdfRestore = () => {
    root.classList.remove("pdf-bw", "pdf-glossy", "exporting");
    root.style.removeProperty("--print-question");
    detailsList.forEach((d, i) => (d.open = previouslyOpen[i]));
  };
}
// Wird von Swift nach der nativen PDF-Erfassung (und im Browser per Timeout) aufgerufen.
window.__yijingAfterPrint = () => {
  if (__pdfRestore) { __pdfRestore(); __pdfRestore = null; }
};

function exportPdf(mode) {
  if (!CURRENT_READING) return;
  if (els.exportMenu) els.exportMenu.open = false;
  if (nativeBridge) {
    preparePrint(mode, true);   // Screen-Export-Stil → Swift erfasst per createPDF
    nativeBridge.postMessage({ action: "savePdf", mode, filename: exportFilename("pdf") });
  } else {
    preparePrint(mode, false);  // Browser: @media print
    window.print();
    setTimeout(() => window.__yijingAfterPrint(), 300);
  }
}
if (els.pdfBwBtn) els.pdfBwBtn.addEventListener("click", () => exportPdf("bw"));
if (els.pdfGlossyBtn) els.pdfGlossyBtn.addEventListener("click", () => exportPdf("glossy"));

els.clearHistoryBtn.addEventListener("click", () => {
  if (confirm(t("history.clearConfirm"))) {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
  }
});

els.openSettingsBtn.addEventListener("click", openSettings);
els.closeSettingsBtn.addEventListener("click", closeSettings);
els.interpSetupConfigure?.addEventListener("click", openSettings);
els.settingsModal.addEventListener("close", persistSettings);
els.newEpType.addEventListener("change", suggestUrlForType);
els.newEpUrl.addEventListener("focus", suggestUrlForType);
els.newEpUrl.addEventListener("input", updateMixedContentWarn);
els.addEndpointBtn.addEventListener("click", () => {
  const name = els.newEpName.value.trim();
  const url = els.newEpUrl.value.trim();
  if (!name || !url) {
    alert(t("settings.endpoints.addMissingFields"));
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
  refreshInterpretationVisibility();
  els.newEpName.value = "";
  els.newEpUrl.value = "";
  els.newEpKey.value = "";
  updateMixedContentWarn();
});

els.resetSystemPromptBtn.addEventListener("click", () => {
  els.systemPromptInput.value = getDefaultSystemPrompt(getLang());
  syncPresetSelection();
});

// Vorlage gewählt → Body in die Textarea laden.
els.promptPresetSelect?.addEventListener("change", () => {
  const v = els.promptPresetSelect.value;
  if (v.startsWith("builtin:")) {
    els.systemPromptInput.value = getPresetBody(v.slice(8), getLang()) || "";
  } else if (v.startsWith("user:")) {
    const p = PromptPresets.list().find((x) => x.id === v.slice(5));
    if (p) els.systemPromptInput.value = p.body;
  }
  if (els.deletePromptPresetBtn) els.deletePromptPresetBtn.hidden = !v.startsWith("user:");
});

// Aktuellen Textarea-Inhalt als eigene Vorlage speichern.
els.savePromptPresetBtn?.addEventListener("click", () => {
  const body = els.systemPromptInput.value.trim();
  if (!body) return;
  const raw = prompt(t("settings.presets.namePrompt"));
  if (raw === null) return; // abgebrochen → still, kein Hinweis nötig
  const name = raw.trim();
  if (!name) {
    alert(t("settings.presets.nameRequired")); // leer bestätigt → wie beim Endpoint-Add melden
    return;
  }
  PromptPresets.add({ name, body });
  renderPromptPresets(); // matcht die frisch gespeicherte Vorlage automatisch
});

// Gewählte eigene Vorlage löschen.
els.deletePromptPresetBtn?.addEventListener("click", () => {
  const v = els.promptPresetSelect.value;
  if (!v.startsWith("user:")) return;
  const p = PromptPresets.list().find((x) => x.id === v.slice(5));
  if (p && confirm(t("settings.presets.removeConfirm", { name: p.name }))) {
    PromptPresets.remove(p.id);
    renderPromptPresets();
  }
});

// Tippen im Textfeld → Auswahl auf „eigener Text" springen lassen, sobald der
// Inhalt keiner Vorlage mehr entspricht.
els.systemPromptInput?.addEventListener("input", syncPresetSelection);

// Schriftgröße der Lese-Ansicht — sofort wirksam + persistiert.
els.fontSizeSelect?.addEventListener("change", () => {
  const v = els.fontSizeSelect.value;
  localStorage.setItem(FONT_SIZE_KEY, v);
  applyFontSize(v);
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

if (els.languageSelect) {
  els.languageSelect.addEventListener("change", () => {
    void changeLanguage(els.languageSelect.value);
  });
}

// Register-Wechsel (geschlechtsneutral / historisch). Kein Daten-Reload nötig —
// beide Fassungen liegen im selben JSON; nur die aktuelle Reading neu rendern.
function changeRegister(reg) {
  if (reg !== "neutral" && reg !== "historical") return;
  if (reg === getRegister()) return;
  setRegister(reg);
  publishSettings(); // Fassung in die native App spiegeln (Widgets/Watch)
  const m = window.location.hash.match(/^#r=([^&]+)$/);
  if (m) {
    const entry = findHistoryEntry(m[1]);
    if (entry) showReadingFromEntry(entry);
  }
  // Nachschlagewerk spiegelt die Fassung sofort — nur neu rendern, kein Reload.
  if (!els.reader.hidden) renderReader(READER.current);
}
if (els.registerSelect) {
  els.registerSelect.addEventListener("change", () => {
    changeRegister(els.registerSelect.value);
  });
}

// ——— Nachschlagewerk-Steuerung ———
els.navOracle.addEventListener("click", () => {
  if (!els.reader.hidden) closeReader();
});
els.navReader.addEventListener("click", () => {
  if (els.reader.hidden) openReader();
});
els.readerPrev.addEventListener("click", () => renderReader(READER.current - 1));
els.readerNext.addEventListener("click", () => renderReader(READER.current + 1));
els.readerIndexToggle.addEventListener("click", () => toggleReaderIndex());

// Footer-Link wechselt in die jeweils andere Sprache. Der Link-TEXT wird von
// applyI18n verwaltet (DE-Dict „English version", EN-Dict „Deutsche Version").
const langSwitchLink = document.getElementById("langSwitch");
if (langSwitchLink) {
  langSwitchLink.addEventListener("click", (e) => {
    e.preventDefault();
    void changeLanguage(getLang() === "de" ? "en" : "de");
  });
}

// ——— Theme (Dark / Light / System) ———

const THEME_KEY = "yijing-theme";
const themeQuery = window.matchMedia("(prefers-color-scheme: dark)");

// Inline-SVG (Lucide, ISC). Das Icon zeigt den AKTUELL sichtbaren Modus —
// Sonne bei hell, Mond bei dunkel. stroke=currentColor erbt die Button-Farbe.
const THEME_SVG = {
  light:
    '<svg class="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
  dark:
    '<svg class="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/></svg>',
};

function effectiveTheme(mode) {
  return mode === "dark" || (mode === "system" && themeQuery.matches) ? "dark" : "light";
}

/** Setzt data-theme + Icon (zeigt aktuellen Zustand) + Tooltip (beschreibt die Klick-Aktion). */
function applyTheme(mode) {
  const effective = effectiveTheme(mode);
  document.documentElement.dataset.theme = effective;
  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.innerHTML = THEME_SVG[effective];
    btn.title = effective === "dark" ? t("theme.toLight") : t("theme.toDark");
    btn.setAttribute("aria-label", btn.title);
  }
}

(function initTheme() {
  applyTheme(localStorage.getItem(THEME_KEY) || "system");
  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.addEventListener("click", () => {
      // „System" bleibt nur der Initial-Default; ein Klick legt explizit hell/dunkel
      // fest — immer das Gegenteil des aktuell sichtbaren Zustands.
      const current = localStorage.getItem(THEME_KEY) || "system";
      const next = effectiveTheme(current) === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    });
  }
  // Bei Modus „System": auf OS-Wechsel reagieren.
  themeQuery.addEventListener("change", () => {
    if ((localStorage.getItem(THEME_KEY) || "system") === "system") {
      applyTheme("system");
    }
  });
  // Bei Sprachwechsel den Tooltip mit-aktualisieren.
  document.addEventListener("i18n:changed", () => {
    applyTheme(localStorage.getItem(THEME_KEY) || "system");
  });
})();

// ——— KI-Platzhalter (leerer Interpretations-Body) ———
// CSS rendert `.interp-body:empty::before { content: attr(data-placeholder) }`;
// der Text kommt sprachabhängig aus i18n und folgt jedem Sprachwechsel.
function setInterpPlaceholder() {
  if (!els.interpBody) return;
  // Bei nur einem Endpoint (z. B. ausschließlich Apple On-Device im iOS-Build)
  // gibt es keine echte Endpunkt-/Modell-Wahl → schlichterer Hinweis statt
  // „Wähle Endpunkt + Modell …", der dort fehl am Platz wäre.
  const hasChoice = Endpoints.list().length > 1;
  els.interpBody.dataset.placeholder =
    t(hasChoice ? "llm.bodyPlaceholder" : "llm.bodyPlaceholderSimple");
}
document.addEventListener("i18n:changed", setInterpPlaceholder);
setInterpPlaceholder();

// ——— iOS-Bridge: Server-Resume nach App-Reaktivierung ———
// Die native iOS-Shell bindet ihren loopback-Server bei jeder Rückkehr aus dem
// Hintergrund neu (iOS beendet die Sockets bei Suspension). Sie ruft danach
// diese Funktion mit der aktuellen baseUrl auf, damit der On-Device-Endpoint den
// (evtl. neuen) Port übernimmt und die Modell-Liste neu geladen wird — sonst
// bliebe ein „nicht erreichbar" stehen, obwohl der Server längst wieder lebt.
window.__yijingOnServerResume = (baseUrl) => {
  try {
    if (baseUrl) {
      const ep = Endpoints.list().find((e) => e.id === "on-device");
      if (ep && ep.baseUrl !== baseUrl) Endpoints.update("on-device", { baseUrl });
    }
  } catch (e) { /* defensiv — ein Resume darf die App nie kippen */ }
  refreshEndpointSelect(); // lädt Endpoint- + Modell-Liste neu (re-probt /v1/models)
};

// ——— Meditationsbild (Apple Image Playground, nur native iOS-App) ———
// Die native Shell setzt window.__yijingImageGen = true, wenn ImageCreator auf dem
// Gerät verfügbar ist, und feuert „yijing:imagegen". Im Web/auf nicht-fähigen
// Geräten bleibt die Sektion verborgen (kein Web-API für on-device-Bilder).

// Bild-Anfrage an die native Schicht: das Kern-Motiv des Hexagramms (image_association,
// ein kurzes englisches Bildsubjekt) + ein Frage-abhängiger Modifikator. Apple FM ist
// bewusst RAUS (zu unzuverlässig + ignorierte die Frage); ImageCreator nutzt die Frage
// selbst nicht — darum erzwingen wir die Variation hier: derselbe Wurf sieht je Frage
// anders aus (Tageszeit/Jahreszeit/Wetter), die Frage wirkt als „Random Seed".
const IMAGE_MODIFIERS = [
  "at dawn",
  "at dusk",
  "under a starry night sky",
  "in morning mist",
  "in autumn colors",
  "under falling snow",
  "in spring bloom",
  "in lush summer green",
  "in gentle rain",
  "under a clear blue sky",
  "in warm golden light",
  "under drifting clouds",
];

// Kleiner stabiler String-Hash (djb2) → deterministischer Modifikator je Frage:
// gleiche Frage → gleiches Bild-Setting, andere Frage → meist anderes.
function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

function buildImageRequest(reading) {
  const prim = reading.primaryHex;
  const res = reading.resultingHex; // null, wenn keine Linie wandelt → kein Wandel
  const motif = (prim && prim.image_association) || "a still mountain lake";
  // Wandel: das resultierende Motiv NUR bei echter Wandlung (abweichendes Hexagramm).
  // So zeigt das Bild die Spannung beider Zustände (primär ↔ resultierend); ohne
  // wandelnde Linie bleibt es beim einen Motiv.
  const motif2 =
    res && res.number !== prim.number && res.image_association
      ? res.image_association
      : "";
  const q = (reading.question || "").trim();
  // Mit Frage: Hash → Modifikator. Ohne Frage: ein neutraler, immer schöner Default.
  const modifier = q
    ? IMAGE_MODIFIERS[hashString(q) % IMAGE_MODIFIERS.length]
    : "in soft daylight";
  return { motif, motif2, modifier };
}

function refreshMeditationVisibility() {
  if (!els.meditation) return;
  els.meditation.hidden = !(window.__yijingImageGen && CURRENT_READING !== null);
}

/** Setzt die Bild-Sektion auf den Ausgangszustand (bei neuer Lesung). */
function resetMeditation() {
  pendingImageRequest = null;
  if (els.genImageFigure) els.genImageFigure.hidden = true;
  if (els.genImageImg) els.genImageImg.removeAttribute("src");
  if (els.genImageStatus) els.genImageStatus.textContent = "";
  if (els.genImageSig) { els.genImageSig.textContent = ""; els.genImageSig.hidden = true; }
  if (els.genImageBtn) {
    els.genImageBtn.disabled = false;
    els.genImageBtn.textContent = t("image.generate");
  }
}

// Dev-Signatur: zeigt unter dem Bild genau, was erzeugt wurde (Hex-Kombi + Prompt),
// damit Feedback eindeutig zuordenbar ist. Nur im Dev-Build (Build-Badge sichtbar).
function buildImageSignature(reading, req) {
  const prim = reading.primaryHex;
  const res = reading.resultingHex;
  const nm = (h) => (h ? `${h.number} ${h.name_latin || h.name_de || ""}`.trim() : "?");
  const hexPart = req.motif2 ? `${nm(prim)} → ${nm(res)}` : nm(prim);
  const motifs = req.motif2 ? `${req.motif}  +  ${req.motif2}` : req.motif;
  return `${hexPart} · ${req.modifier}\n${motifs}`;
}

let pendingImageRequest = null;
let LAST_IMAGE_SIG = "";
function requestMeditationImage() {
  if (!CURRENT_READING || !nativeBridge) return;
  const requestId = crypto.randomUUID();
  pendingImageRequest = requestId;
  els.genImageBtn.disabled = true;
  els.genImageStatus.textContent = t("image.generating");
  const req = buildImageRequest(CURRENT_READING);
  LAST_IMAGE_SIG = DEV_MODE ? buildImageSignature(CURRENT_READING, req) : "";
  if (LAST_IMAGE_SIG) console.log("[yijing img] " + LAST_IMAGE_SIG.replace("\n", " | "));
  nativeBridge.postMessage({
    action: "generateImage",
    motif: req.motif,
    motif2: req.motif2,
    modifier: req.modifier,
    requestId,
  });
}

window.__yijingImageResult = (requestId, dataURL) => {
  if (requestId !== pendingImageRequest) return;
  pendingImageRequest = null;
  els.genImageImg.src = dataURL;
  els.genImageImg.alt = t("image.alt");
  els.genImageFigure.hidden = false;
  els.genImageStatus.textContent = "";
  els.genImageBtn.disabled = false;
  els.genImageBtn.textContent = t("image.regenerate");
  // Dev-Signatur unter dem Bild (Hex-Kombi + Prompt) für eindeutiges Feedback.
  if (els.genImageSig) {
    els.genImageSig.textContent = LAST_IMAGE_SIG;
    els.genImageSig.hidden = !LAST_IMAGE_SIG;
  }
  // Im Verlaufseintrag mitsichern, damit das Bild beim erneuten Öffnen der Lesung
  // sofort da ist (persistHistory verwirft es bei Speicherknappheit zuerst).
  if (CURRENT_READING?.id) updateHistoryEntry(CURRENT_READING.id, { image: dataURL, imageSig: LAST_IMAGE_SIG });
};
window.__yijingImageError = (requestId, message) => {
  if (requestId !== pendingImageRequest) return;
  pendingImageRequest = null;
  els.genImageStatus.textContent = message || t("image.error");
  els.genImageBtn.disabled = false;
};

if (els.genImageBtn) els.genImageBtn.addEventListener("click", requestMeditationImage);
window.addEventListener("yijing:imagegen", refreshMeditationVisibility);

// ——— Init ———

(async () => {
  try {
    initI18n();
    applyFontSize(currentFontSize()); // robust, falls das <head>-Inline-Script nicht lief
    await loadData();
    renderHistory();
    refreshEndpointSelect();
    if (els.languageSelect) els.languageSelect.value = getLang();
  if (els.registerSelect) els.registerSelect.value = getRegister();
    // Hintergrund: lokale LLM-Server suchen und Auswahl aktualisieren
    Endpoints.autoDiscover().then(() => {
      refreshEndpointSelect();
      refreshInterpretationVisibility();
    });
    // Tiefer Link? — falls #r=<id> in der URL steht, Eintrag wiederherstellen
    applyHashIfAny();
    publishSettings(); // initiale Spiegelung Sprache/Fassung in die native App
    window.addEventListener("hashchange", () => {
      if (!applyHashIfAny()) {
        // Leerer/unbekannter Hash bei offenem Reader (z. B. Wisch/Back nach einem
        // Hexagramm-Link aus der Lesung) → zurück zur vorigen Ansicht. (Punkt 7)
        if (!els.reader.hidden) closeReader();
      }
    });
  } catch (e) {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div style="background:#d97742;color:#1a1814;padding:1rem;text-align:center;">
        ${t("boot.loadError", { message: escapeHTML(e.message) })}
      </div>`
    );
  }
})();

// ——— macOS-Download-Hinweis (nur auf der öffentlichen Demo, nur Mac) ———

(function initMacDownload() {
  const link = document.getElementById("macFooterLink");
  if (!link) return;
  const isMac = /Mac/i.test(navigator.platform || navigator.userAgent);
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  if (isMac && !isLocal) link.hidden = false;
})();

// ——— Service Worker (Offline-Betrieb) ———

if ("serviceWorker" in navigator) {
  // Wenn ein neuer Worker die Kontrolle übernimmt (neuer Build), einmal frisch laden,
  // damit nicht veraltete app.js/Daten hängen bleiben (WKWebView-Cache-Falle).
  let swReloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (swReloaded) return;
    swReloaded = true;
    window.location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js")
      .then((reg) => reg.update())
      .catch(() => {});
  });
}

// ——— Build-Kennung (dezent oben) + Dev-Verlauf laden per Tipp aufs Badge ———
(() => {
  const b = document.getElementById("buildBadge");
  if (b && DEV_MODE) {
    b.textContent = BUILD_ID;
    b.hidden = false;
    b.addEventListener("click", populateDevHistory); // Tipp → Test-Verlauf laden
  }
})();
