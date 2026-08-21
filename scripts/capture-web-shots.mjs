// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// Reproducible capture of the README images (CORE-META-03).
//
//   node scripts/capture-web-shots.mjs                    # all shots
//   node scripts/capture-web-shots.mjs --only reader-en   # one, by name
//   node scripts/capture-web-shots.mjs --keep             # leave Chrome open
//
// Until now the README images were hand-made: nobody could reproduce them
// after a UI change, so they aged silently. This drives the real app instead.
//
// No dependencies. It starts `scripts/serve.py`, launches the installed Google
// Chrome headless with a remote debugging port and speaks CDP over Node's
// built-in WebSocket (Node >= 22). Playwright would be the obvious tool, but it
// needs an npm install this repo deliberately does not have — see AGENTS.md
// "Zero Dependencies". Chrome is the one thing assumed to exist.
//
// Determinism is the whole point, so three sources of variance are pinned in
// the page before any app code runs:
//   * Math.random  → seeded PRNG, so `castHexagram` throws the same coins every
//     run (that is the app's only randomness for a reading, web/app.js line ~83)
//   * crypto.randomUUID → a fixed sequence, so history ids and #r= links repeat
//   * localStorage → language, theme, register, font size and the dismissed
//     setup hint, so a stray browser profile cannot change the framing
//
// Frame sizes match the images already embedded in the READMEs (940x1180 and
// 940x968 CSS at deviceScaleFactor 2 → 1880x2360 / 1880x1936), so re-shooting
// does not reflow the <img width="720"> embeds.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// One image folder, the one the workspace image contract points at.
const IMAGES_DIR = join(ROOT, 'docs', 'images');
const PORT = Number(process.env.YIJING_SHOT_PORT || 8791);   // not 8765: that is the dev server
const CDP_PORT = Number(process.env.YIJING_CDP_PORT || 9333);
const CHROME = process.env.YIJING_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = `http://127.0.0.1:${PORT}/web/index.html`;
const SCALE = 2;

const argv = process.argv.slice(2);
const KEEP = argv.includes('--keep');
const ONLY = (() => {
  const i = argv.indexOf('--only');
  return i >= 0 && argv[i + 1] ? new Set(argv[i + 1].split(',')) : null;
})();

// The seed is chosen, not arbitrary: with it the six lines come out 7,7,9,8,8,9 —
// two changing lines, so the shot shows a resulting hexagram, which is what the
// README caption promises ("with the changing lines marked"). Should the casting
// code ever change, the `expect` below turns a wrong seed into a failed run
// instead of a quietly wrong picture; re-pick one by simulating mulberry32 over
// `tossLine()` (web/app.js).
const SEED = Number(process.env.YIJING_SHOT_SEED || 12);

// What each shot must actually show. Without these a run stays green while the
// picture says something else: the first working version shot four "English,
// dark" frames that were German and light, because a wrongly encoded
// localStorage value fails silently and nothing looked at the result.
const READER_EXPECT = [
  ['index grid open', `!document.querySelector('#readerIndex').hidden`],
  ['hexagram 3 selected', `document.querySelector('#readerPos').textContent.includes('3 / 64')`],
];
const READING_EXPECT = [
  ['reading visible', `!document.querySelector('#reading').hidden`],
  ['resulting hexagram shown', `!document.querySelector('#resulting').hidden`],
  ['changing lines listed', `!document.querySelector('#changingSection').hidden`],
];
// Framing every shot shares.
const COMMON_EXPECT = (lang) => [
  [`language is ${lang}`, `document.documentElement.lang === ${JSON.stringify(lang)}`],
  ['dark theme', `document.documentElement.dataset.theme === 'dark'`],
];

// The hero: the app's strongest single frame — the question and both hexagrams
// side by side. Wider viewport (the image spec's capture_width) with the content
// column centred in it, cropped to the reading itself.
const HERO = (lang, question) => ({
  name: `hero-${lang}`, lang, width: 1200, height: 645,
  // The crop starts just below the question card and ends below the
  // interpretation panel, so no card is cut in half at either edge.
  clipFrom: '#questionEcho', padTop: 34,
  question,
  expect: READING_EXPECT,
  async run(cdp, shot) { await castReading(cdp, shot); },
});

const SHOTS = [
  {
    name: 'reader-de', lang: 'de', width: 940, height: 1180,
    expect: READER_EXPECT,
    // The read-through reference with its 8x8 index open on hexagram 3.
    async run(cdp) {
      await cdp.goto(`${BASE}#h=3`);
      await cdp.click('#readerIndexToggle');
      await cdp.settle();
    },
  },
  {
    name: 'reader-en', lang: 'en', width: 940, height: 1180,
    expect: READER_EXPECT,
    async run(cdp) {
      await cdp.goto(`${BASE}#h=3`);
      await cdp.click('#readerIndexToggle');
      await cdp.settle();
    },
  },
  {
    name: 'reading-de', lang: 'de', width: 940, height: 968,
    expect: READING_EXPECT,
    question: 'Worauf sollte ich gerade meine Aufmerksamkeit richten?',
    async run(cdp, shot) { await castReading(cdp, shot); },
  },
  {
    name: 'reading-en', lang: 'en', width: 940, height: 968,
    expect: READING_EXPECT,
    question: 'What should I give my attention to right now?',
    async run(cdp, shot) { await castReading(cdp, shot); },
  },
  HERO('de', 'Worauf sollte ich gerade meine Aufmerksamkeit richten?'),
  HERO('en', 'What should I give my attention to right now?'),
];

async function castReading(cdp, shot) {
  await cdp.goto(BASE);
  await cdp.type('#question', shot.question);
  await cdp.click('#cast');
  // tossAnimated() reveals the six lines one by one and only then calls
  // showReading(), which fills the judgment. Waiting for #reading to appear is
  // not enough — that happens immediately, mid-animation, and the shot catches
  // half-drawn lines and a "…" placeholder.
  await cdp.waitUntil(`(document.querySelector('#judgmentText')?.textContent || '').trim().length > 0`);
  await cdp.settle();
}

// ── CDP over the built-in WebSocket ──────────────────────────────────────────
class Cdp {
  #ws; #id = 0; #pending = new Map(); #pinId = null; #current = 'about:blank'; #closed = false;

  static async attach(wsUrl) {
    const c = new Cdp();
    c.#ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      c.#ws.addEventListener('open', res, { once: true });
      c.#ws.addEventListener('error', () => rej(new Error('CDP socket failed')), { once: true });
    });
    c.#ws.addEventListener('message', (ev) => {
      if (c.#closed) return;
      const msg = JSON.parse(ev.data);
      const p = c.#pending.get(msg.id);
      if (!p) return;
      c.#pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    });
    return c;
  }

  send(method, params = {}) {
    const id = ++this.#id;
    this.#ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.#pending.set(id, { resolve, reject }));
  }

  close() {
    // Chrome can still push events while the socket winds down; once we are done
    // they are noise, and an unhandled 'error' would print a stack after a
    // successful run.
    this.#closed = true;
    this.#ws.addEventListener('error', () => {});
    this.#ws.close();
  }

  async metrics(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: SCALE, mobile: false,
    });
  }

  /** Runs before any page script — this is where determinism is installed. */
  async pin(script) {
    if (this.#pinId) {
      await this.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: this.#pinId });
    }
    const { identifier } = await this.send('Page.addScriptToEvaluateOnNewDocument', { source: script });
    this.#pinId = identifier;
  }

  async goto(url) {
    // Always clear the document first. Two shots may share a URL (both reader
    // shots open #h=3), and navigating to the URL already loaded is a
    // same-document navigation: Page.loadEventFired never fires and the wait
    // below would hang forever.
    if (this.#current !== 'about:blank') {
      const cleared = this.#once('Page.loadEventFired');
      await this.send('Page.navigate', { url: 'about:blank' });
      await cleared;
      this.#current = 'about:blank';
    }
    const done = this.#once('Page.loadEventFired');
    await this.send('Page.navigate', { url });
    await done;
    this.#current = url;
    // `load` fires before app.js has wired the DOM. Waiting for the cast button
    // to exist is the cheapest proof that the module actually ran — without it
    // the first interaction of a run silently lands on a half-built page.
    await this.waitFor('#cast');
  }

  #once(event, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const h = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.method !== event) return;
        clearTimeout(timer);
        this.#ws.removeEventListener('message', h);
        resolve(m.params);
      };
      const timer = setTimeout(() => {
        this.#ws.removeEventListener('message', h);
        reject(new Error(`timeout waiting for CDP event ${event}`));
      }, timeoutMs);
      this.#ws.addEventListener('message', h);
    });
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
    return r.result.value;
  }

  async click(selector) {
    const hit = await this.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false; el.click(); return true; })()`);
    if (!hit) throw new Error(`click target not found: ${selector}`);
  }

  /** Sets the value and fires input/change, the way a real edit would. */
  async type(selector, text) {
    const hit = await this.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.value = ${JSON.stringify(text)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true; })()`);
    if (!hit) throw new Error(`input not found: ${selector}`);
    const got = await this.eval(`document.querySelector(${JSON.stringify(selector)}).value`);
    if (got !== text) throw new Error(`input did not take: ${selector}`);
  }

  async waitUntil(expression, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (await this.eval(expression)) return;
      if (Date.now() > deadline) throw new Error(`timeout waiting for: ${expression}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  async waitFor(selector, timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (await this.eval(`!!document.querySelector(${JSON.stringify(selector)})`)) return;
      if (Date.now() > deadline) throw new Error(`timeout waiting for ${selector}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  /** Two animation frames plus a beat: enough for the app's fade-ins to finish. */
  async settle() {
    await this.eval('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
    await new Promise((r) => setTimeout(r, 400));
  }

  /** Document-space y of an element, minus a little breathing room. */
  async topOf(selector, pad) {
    const y = await this.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return Math.max(0, Math.round(r.top + window.scrollY - ${pad})); })()`);
    if (y === null) throw new Error(`clip anchor not found: ${selector}`);
    return y;
  }

  async shoot(width, height, y = 0) {
    const { data } = await this.send('Page.captureScreenshot', {
      format: 'png',
      // scale stays 1: setDeviceMetricsOverride already renders at SCALE.
      // Passing SCALE here too produced 3760x3872 instead of 1880x1936.
      clip: { x: 0, y, width, height, scale: 1 },
      captureBeyondViewport: true,
    });
    return Buffer.from(data, 'base64');
  }
}

function determinismScript(lang, seed) {
  return `
    (() => {
      // mulberry32 — small, seeded, good enough for coin flips.
      let s = ${seed} >>> 0;
      Math.random = () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      let uuid = 0;
      const fixed = () => \`000000\${(++uuid).toString().padStart(2, '0')}-0000-4000-8000-000000000000\`;
      try { Object.defineProperty(crypto, 'randomUUID', { value: fixed, configurable: true }); } catch {}
      // Freeze CSS transitions and animations. Without this no two runs produced
      // the same bytes: things fade in, and settle() catches them at a slightly
      // different opacity each time. JS-driven motion (the coin toss in
      // tossAnimated) is untouched — that one is waited out, not skipped.
      addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = '*, *::before, *::after { transition: none !important;' +
          ' animation: none !important; caret-color: transparent !important; }';
        document.head.appendChild(style);
      });
      try {
        localStorage.clear();
        // Both are stored plain, not JSON-encoded (i18n.js setLang, app.js THEME_KEY).
        // Writing '"en"' here left the app in German and in light mode — and the run
        // still reported four green shots, because nothing checks the framing.
        localStorage.setItem('yijing-language-v1', ${JSON.stringify(lang)});
        localStorage.setItem('yijing-theme', 'dark');
        localStorage.setItem('yijing-interp-setup-dismissed-v1', '1');
      } catch {}
    })();
  `;
}

// ── run ──────────────────────────────────────────────────────────────────────
async function waitForHttp(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not up yet */ }
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${url}`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

async function main() {
  if (!existsSync(CHROME)) {
    console.error(`✗ Chrome not found at ${CHROME}\n  Set YIJING_CHROME to its binary.`);
    process.exit(2);
  }
  mkdirSync(IMAGES_DIR, { recursive: true });

  const server = spawn('python3', [join(ROOT, 'scripts', 'serve.py')], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore',
  });
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`,
    '--hide-scrollbars', '--force-color-profile=srgb', '--disable-lcd-text',
    '--user-data-dir=' + join(ROOT, 'scripts', '.chrome-shot-profile'),
    'about:blank',
  ], { stdio: 'ignore' });

  const stop = () => { try { chrome.kill(); } catch {} try { server.kill(); } catch {} };
  process.on('exit', stop);

  let written = 0;
  try {
    await waitForHttp(`http://127.0.0.1:${PORT}/web/index.html`);
    await waitForHttp(`http://127.0.0.1:${CDP_PORT}/json/version`);

    // One target for every shot. Opening a fresh one per shot looked cleaner but
    // failed from the third shot on: the new page then raced app.js and the first
    // interaction landed on a half-built DOM.
    const target = await (await fetch(
      `http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' },
    )).json();
    const cdp = await Cdp.attach(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    for (const shot of SHOTS) {
      if (ONLY && !ONLY.has(shot.name)) continue;
      await cdp.metrics(shot.width, shot.height);
      await cdp.pin(determinismScript(shot.lang, SEED));
      await shot.run(cdp, shot);
      for (const [what, expr] of [...COMMON_EXPECT(shot.lang), ...(shot.expect || [])]) {
        if (!(await cdp.eval(expr))) throw new Error(`${shot.name}: expected ${what}`);
      }
      // A hero is a crop, not the top of the page: the app's content column is
      // capped at 760px, so a wide shot from y=0 would be mostly empty margin.
      const y = shot.clipFrom ? await cdp.topOf(shot.clipFrom, shot.padTop ?? 40) : 0;
      const png = await cdp.shoot(shot.width, shot.height, y);
      writeFileSync(join(IMAGES_DIR, `${shot.name}.png`), png);
      console.log(`✓ ${shot.name}.png — ${shot.width * SCALE}x${shot.height * SCALE}, ${(png.length / 1024).toFixed(0)} KB`);
      written++;
    }
    cdp.close();
  } finally {
    if (!KEEP) stop();
  }

  if (!written) { console.error('✗ nothing captured — check --only'); process.exit(1); }
  console.log(`\n${written} image(s) written to docs/images/`);
}

main().catch((e) => { console.error('✗', e); process.exit(1); });
