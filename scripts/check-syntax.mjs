// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// Syntax gate for the deployable web app (PROF-WEB-03).
//
//   node scripts/check-syntax.mjs
//
// AGENTS.md asks for `node --check <file>` after every JS edit. That covers the
// external modules but never the inline <script> blocks in web/*.html — and it
// relies on someone remembering which files they touched. This checks the whole
// shipped surface in one go.
//
// The failure it exists for: German string literals written with straight
// quotation marks (`"…"` instead of `„…"`) close the JS string early — see
// commit a164aba ff. That is a syntax error, so a parse gate catches it before
// a deploy does.
//
// Scope = what `deploy-page.sh` publishes: sw.js, every web/*.js module, and
// the inline (no `src=`) <script> blocks of every web/*.html. Node-only tooling
// under scripts/ is exercised when it runs, not gated here.
//
// Each block is parsed by `node --check` in a child process reading stdin, with
// `--input-type=module` where the source is an ES module. Parsing that way
// validates syntax WITHOUT executing, so browser globals (document, window,
// caches) never run — and the module/script mode is stated explicitly rather
// than left to Node's file-extension heuristics.
//
// Adapted from synthwave-surfer/perlin-studio `scripts/check-syntax.mjs`; those
// projects ship classic browser scripts, this one ships ES modules, hence the
// stdin/--input-type route instead of `vm.Script`.
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Files that ship to the browser, relative to the repo root. Recursive, so the
// generated modules under web/vendor/ are gated too — they are shipped code
// like any other, and the fact that a script wrote them is no reason to trust
// them less. The .ts sources next to them are NOT parsed here: they are
// byte-identical vendor copies that never reach a browser, and `node --check`
// would reject their type annotations.
function shippedJs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(root, dir)).sort()) {
    const rel = `${dir}/${entry}`;
    if (fs.statSync(path.join(root, rel)).isDirectory()) out.push(...shippedJs(rel));
    else if (entry.endsWith('.js')) out.push(rel);
  }
  return out;
}

const jsFiles = ['sw.js', ...shippedJs('web')];

const htmlFiles = fs.readdirSync(path.join(root, 'web'))
  .filter((f) => f.endsWith('.html'))
  .sort()
  .map((f) => `web/${f}`);

let ok = true;
let checked = 0;

// `lineOffset` shifts the reported line number from the extracted snippet back
// onto the file the reader has open.
function check(label, code, { esm, lineOffset = 0 }) {
  checked++;
  const args = ['--check', ...(esm ? ['--input-type=module'] : []), '-'];
  const res = spawnSync(process.execPath, args, { input: code, encoding: 'utf8' });
  if (res.status === 0) return;
  ok = false;
  // Node may prefix warnings (e.g. "Failed to load the ES module" when classic
  // code uses module-only syntax); the real report starts at the [stdin]:N line.
  const lines = (res.stderr || '').split('\n');
  const start = lines.findIndex((l) => /^\[stdin\]:\d+/.test(l));
  const detail = (start >= 0 ? lines.slice(start) : lines)
    .filter((l) => l.trim())
    .slice(0, 4)
    .map((l) => l.replace(/^\[stdin\]:(\d+)/, (_, n) => `${label}:${Number(n) + lineOffset}`))
    .join('\n    ');
  console.error(`✗ syntax error in ${label}\n    ${detail}`);
}

const looksLikeModule = (code) => /^\s*(import|export)[\s{*]/m.test(code);

for (const rel of jsFiles) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) { ok = false; console.error(`✗ missing expected script: ${rel}`); continue; }
  const code = fs.readFileSync(abs, 'utf8');
  check(rel, code, { esm: looksLikeModule(code) });
}

for (const rel of htmlFiles) {
  const html = fs.readFileSync(path.join(root, rel), 'utf8');
  // Negative lookahead skips external <script src=…>; the (?<![\w-]) guard keeps
  // a data-src= attribute from being mistaken for a real src=.
  const re = /<script(?![^>]*(?<![\w-])src=)([^>]*)>([\s\S]*?)<\/script>/gi;
  let i = 0;
  for (const m of html.matchAll(re)) {
    const openTag = m[0].slice(0, m[0].indexOf('>') + 1);
    const lineOffset = html.slice(0, m.index + openTag.length).split('\n').length - 1;
    check(`${rel} inline #${i++}`, m[2], {
      esm: /type\s*=\s*["']?module/i.test(m[1]),
      lineOffset,
    });
  }
}

if (!checked) { console.error('✗ no scripts found to check — is the scope still right?'); process.exit(2); }

console.log(ok ? `SYNTAX OK — ${checked} script block(s) parse` : 'SYNTAX FAILED');
process.exit(ok ? 0 : 1);
