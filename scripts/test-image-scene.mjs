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

console.log("OK image-scene: all assertions passed");
