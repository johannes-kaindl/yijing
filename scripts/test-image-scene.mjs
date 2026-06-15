// Smoke test for web/image-scene.js — run: node scripts/test-image-scene.mjs
import assert from "node:assert";
import { composeImageRequest } from "../web/image-scene.js";

// no change → single motif + atmosphere, no relation word
let r = composeImageRequest({ primaryMotif: "a soaring eagle", resultingMotif: "", question: "" });
assert.equal(r.motif2, "");
assert.equal(r.scene, "a soaring eagle, in soft daylight");

// change → BOTH motifs fused into one scene string
r = composeImageRequest({
  primaryMotif: "a soaring eagle",
  resultingMotif: "a wide field of golden grain",
  question: "Where should I put my energy?",
});
assert.ok(r.scene.includes("a soaring eagle"), "primary present");
assert.ok(r.scene.includes("a wide field of golden grain"), "resulting present");
assert.notEqual(r.motif2, "", "motif2 carried as fallback");

// deterministic per question
const a = composeImageRequest({ primaryMotif: "x", resultingMotif: "y", question: "Q" });
const b = composeImageRequest({ primaryMotif: "x", resultingMotif: "y", question: "Q" });
assert.equal(a.scene, b.scene, "same question → same scene");

// empty primary → safe default motif
r = composeImageRequest({ primaryMotif: "", resultingMotif: "", question: "" });
assert.equal(r.motif, "a still mountain lake");

// change → motif2 phrased as background, not as a transition
const bg = composeImageRequest({
  primaryMotif: "a soaring eagle",
  resultingMotif: "a wide field of golden grain",
  question: "Where to?",
});
assert.ok(
  /in the background|small in the distance|on the horizon beyond/.test(bg.scene),
  `motif2 phrased as background, got: "${bg.scene}"`
);
assert.ok(
  !/giving way to|and beyond it|rising in the distance/.test(bg.scene),
  `no old transition phrasing, got: "${bg.scene}"`
);

// dark hexagram → mood-consistent modifier, never a warm one
const WARM = ["in warm golden light", "in spring bloom", "in lush summer green", "under a clear blue sky", "at dawn"];
for (let i = 0; i < 30; i++) {
  const rr = composeImageRequest({
    primaryMotif: "a dark river between steep cliffs", resultingMotif: "",
    question: "Q" + i, primaryNumber: 29,
  });
  assert.ok(!WARM.includes(rr.modifier), `dark hex modifier must not be warm, got "${rr.modifier}" (Q${i})`);
}

// bright hexagram → never a cold/wintry modifier
const COLD = ["under falling snow", "under a starry night sky"];
for (let i = 0; i < 30; i++) {
  const rr = composeImageRequest({
    primaryMotif: "a great sun over golden hills", resultingMotif: "",
    question: "Q" + i, primaryNumber: 14,
  });
  assert.ok(!COLD.includes(rr.modifier), `bright hex modifier must not be cold, got "${rr.modifier}" (Q${i})`);
}

// neutral hexagram (unknown number) → unchanged full-pool behavior, still deterministic
const n1 = composeImageRequest({ primaryMotif: "x", resultingMotif: "", question: "Q", primaryNumber: 1 });
const n2 = composeImageRequest({ primaryMotif: "x", resultingMotif: "", question: "Q", primaryNumber: 1 });
assert.equal(n1.scene, n2.scene, "same question+number → same scene");

console.log("OK image-scene: all assertions passed");
