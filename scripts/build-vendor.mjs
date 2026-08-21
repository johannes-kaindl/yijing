#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// Transpiles the vendored code-kit TypeScript sources into the .js files the
// browser actually loads.
//
//   node scripts/build-vendor.mjs           # write
//   node scripts/build-vendor.mjs --check   # verify the committed .js is current
//
// WHY a build step exists in a repo that has none: code-kit's consumption
// contract is byte-identical vendoring (its `check-consumers` gate hashes the
// copy against the pinned sha), and code-kit is TypeScript. The browser cannot
// load TypeScript. The two demands only meet if the .ts stays untouched and the
// shipped .js is derived from it — a hand-maintained JS copy next to the .ts
// would be the same logic filed twice, and would drift.
//
// The transpiler is Node's own `module.stripTypeScriptTypes` — no npm, no
// network, nothing to install. `mode: "transform"` (not plain stripping) is
// required: llm-stream.ts uses TypeScript parameter properties
// (`constructor(ep, private readonly fetchFn)`), which are code generation, not
// annotations, and survive no amount of type erasure.
//
// The generated files are TRACKED. Nobody needs Node to serve or deploy the
// app; this script runs only when the vendored sources change.
import fs from 'fs';
import path from 'path';
import { stripTypeScriptTypes } from 'module';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

// `stripTypeScriptTypes` is flagged experimental and announces itself on every
// run. Swallow that ONE warning — anything else still reaches the console,
// because a blanket `--no-warnings` would hide the next real one too.
process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w.name === 'ExperimentalWarning' && /stripTypeScriptTypes/.test(w.message)) return;
  console.warn(w.stack ?? String(w));
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendorRoot = path.join(root, 'web/vendor/code-kit');

const checkOnly = process.argv.includes('--check');

/** Every .ts under the vendor root, repo-relative, sorted for stable output. */
function vendorSources(dir = vendorRoot) {
  const out = [];
  for (const entry of fs.readdirSync(dir).sort()) {
    const abs = path.join(dir, entry);
    if (fs.statSync(abs).isDirectory()) out.push(...vendorSources(abs));
    else if (entry.endsWith('.ts')) out.push(abs);
  }
  return out;
}

// The kit writes extensionless relative imports (`from "../pure/sse"`), which
// TypeScript resolves and a browser does not. Rewriting them is the one edit
// the vendoring makes — and it happens here, in the generated file, so the .ts
// stays byte-identical to its pin.
function addJsExtensions(code) {
  return code.replace(
    /(\bfrom\s*|\bimport\s*\(\s*)(["'])(\.[^"']*)\2/g,
    (match, head, quote, spec) => (path.extname(spec) ? match : `${head}${quote}${spec}.js${quote}`)
  );
}

function header(sourceRel) {
  return `// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// GENERATED — do not edit. Produced by \`node scripts/build-vendor.mjs\` from
// ${sourceRel}, which is a byte-identical copy of a code-kit module
// (pin in web/vendor/code-kit/VENDOR.json). Comments and formatting are the
// transpiler's; read the .ts next to this file for the documented original.
`;
}

let failed = false;
let written = 0;

for (const abs of vendorSources()) {
  const sourceRel = path.relative(root, abs);
  const targetAbs = abs.replace(/\.ts$/, '.js');
  const targetRel = path.relative(root, targetAbs);

  const stripped = stripTypeScriptTypes(fs.readFileSync(abs, 'utf8'), {
    mode: 'transform',
    sourceMap: false,
  });
  const code = `${header(sourceRel)}${addJsExtensions(stripped)}`;

  // Parse the result before it can be committed: a transpiler change that
  // emitted something unloadable must fail here, not in a browser tab.
  const parse = spawnSync(process.execPath, ['--check', '--input-type=module', '-'], {
    input: code,
    encoding: 'utf8',
  });
  if (parse.status !== 0) {
    console.error(`✗ ${targetRel}: transpiled output does not parse\n${parse.stderr}`);
    failed = true;
    continue;
  }

  const current = fs.existsSync(targetAbs) ? fs.readFileSync(targetAbs, 'utf8') : null;
  if (current === code) {
    console.log(`= ${targetRel} (current)`);
    continue;
  }
  if (checkOnly) {
    console.error(`✗ ${targetRel} is stale — run: node scripts/build-vendor.mjs`);
    failed = true;
    continue;
  }
  fs.writeFileSync(targetAbs, code);
  written++;
  console.log(`✓ ${targetRel}`);
}

if (failed) process.exit(1);
console.log(checkOnly ? 'vendor build is current' : `vendor build done (${written} written)`);
