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

// Templates that fuse primary (a) and resulting (b) motif into one scene.
export const SCENE_RELATIONS = [
  (a, b) => `${a}, and beyond it ${b}`,
  (a, b) => `${a} giving way to ${b}`,
  (a, b) => `${a}, with ${b} rising in the distance`,
];

// djb2 — stable across runs/devices; purely local (no cross-file contract).
export function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * @param {{primaryMotif:string, resultingMotif:string, question:string}} input
 * @returns {{scene:string, motif:string, motif2:string, modifier:string}}
 */
export function composeImageRequest({ primaryMotif, resultingMotif, question }) {
  const motif = (primaryMotif || "").trim() || "a still mountain lake";
  const motif2 = (resultingMotif || "").trim();
  const q = (question || "").trim();
  const h = q ? hashString(q) : 0;
  const modifier = q ? IMAGE_MODIFIERS[h % IMAGE_MODIFIERS.length] : "in soft daylight";
  const base = motif2 ? SCENE_RELATIONS[h % SCENE_RELATIONS.length](motif, motif2) : motif;
  const scene = modifier ? `${base}, ${modifier}` : base;
  return { scene, motif, motif2, modifier };
}
