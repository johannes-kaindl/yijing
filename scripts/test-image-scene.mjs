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

console.log("OK image-scene: all assertions passed");
