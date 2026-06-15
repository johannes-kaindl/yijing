// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// Pure scene composition for the on-device meditation image — no DOM, no imports,
// so it is node-testable (scripts/test-image-scene.mjs). Model A: the primary and
// resulting motif are fused into ONE natural-language scene sentence with a spatial
// relation, which the native ImageGenerator renders as a single Image Playground
// concept. motif/motif2/modifier are returned too, as fallback inputs.

// Atmosphere phrases (time of day / season / weather). The question selects one
// deterministically, so the same reading is stable but different questions vary.
export const IMAGE_MODIFIERS = [
  "at dawn", "at dusk", "under a starry night sky", "in morning mist",
  "in autumn colors", "under falling snow", "in spring bloom",
  "in lush summer green", "in gentle rain", "under a clear blue sky",
  "in warm golden light", "under drifting clouds",
];

// Mood classes — a hexagram's motif carries an inherent atmosphere that a
// mismatched modifier would invert (a dark gorge in "warm golden light" reads
// sunny). Curated from a review of all 64 motifs by image atmosphere, NOT by
// the hexagram's abstract meaning. See .claude/specs/2026-06-15-image-scene-mood-design.md.
export const DARK_HEXAGRAMS = new Set([12, 23, 29, 30, 36, 39, 41, 47, 55, 56, 59, 64]);
export const BRIGHT_HEXAGRAMS = new Set([2, 3, 9, 11, 14, 22, 24, 25, 31, 35, 42, 44, 46, 49, 54, 58]);

// Cool / neutral / somber — no warm light, bloom, summer green, or clear blue sky.
export const DARK_MODIFIERS = [
  "at dusk", "under a starry night sky", "in morning mist",
  "under falling snow", "in gentle rain", "in autumn colors",
  "under drifting clouds", "in deep shadow", "under a grey overcast sky",
];
// Warm / neutral — no snow or starry night.
export const BRIGHT_MODIFIERS = [
  "at dawn", "in spring bloom", "in lush summer green",
  "under a clear blue sky", "in warm golden light", "under drifting clouds",
];

// Templates that place the resulting (b) motif in the BACKGROUND behind the
// primary (a). Background phrasing keeps both in one frame — a fused transition
// ("a giving way to b") made ImageCreator drop the second motif.
export const SCENE_RELATIONS = [
  (a, b) => `${a}, with ${b} in the background`,
  (a, b) => `${a}, ${b} small in the distance`,
  (a, b) => `${a}, ${b} on the horizon beyond`,
];

// djb2 — stable across runs/devices; purely local (no cross-file contract).
export function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * @param {{primaryMotif:string, resultingMotif:string, question:string, primaryNumber?:number}} input
 * @returns {{scene:string, motif:string, motif2:string, modifier:string}}
 */
export function composeImageRequest({ primaryMotif, resultingMotif, question, primaryNumber }) {
  const motif = (primaryMotif || "").trim() || "a still mountain lake";
  const motif2 = (resultingMotif || "").trim();
  const q = (question || "").trim();
  const h = q ? hashString(q) : 0;
  // Mood-consistent atmosphere pool, keyed on the (foreground) primary hexagram.
  const pool = DARK_HEXAGRAMS.has(primaryNumber)
    ? DARK_MODIFIERS
    : BRIGHT_HEXAGRAMS.has(primaryNumber)
      ? BRIGHT_MODIFIERS
      : IMAGE_MODIFIERS;
  const modifier = q ? pool[h % pool.length] : "in soft daylight";
  const base = motif2 ? SCENE_RELATIONS[h % SCENE_RELATIONS.length](motif, motif2) : motif;
  const scene = modifier ? `${base}, ${modifier}` : base;
  return { scene, motif, motif2, modifier };
}
