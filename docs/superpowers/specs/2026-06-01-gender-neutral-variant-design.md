# Design: Gender-Neutral Text Variant (Sub-project A2)

- **Date:** 2026-06-01
- **Status:** Approved (decisions confirmed interactively); proceeding to implementation
- **Builds on:** Sub-project A (`2026-05-31-yijing-data-correctness-design.md`)

## 1. Context & decision

Wilhelm's 1924 text is pervasively gendered ("der Edle", "der große Mann",
masculine pronouns). Sub-project A deliberately made the data **verbatim
faithful**. A2 adds an **inclusive reading by default** without sacrificing that
fidelity, via a third orthogonal dimension.

Confirmed decisions:
- **Register dimension** (`neutral` | `historical`), orthogonal to language
  (DE/EN). **`neutral` is the default**; the verbatim Wilhelm is opt-in via a
  Settings toggle. The toggle is **symmetric** — it switches the active language
  (DE or EN) to its historical wording.
- **Dezent (light-touch):** neutralize only the *generic role nouns* and the
  pronouns that refer to them. **Content-specific gendered imagery is preserved**
  — the "marrying maiden" (hex 53/54), the Father/Mother/Son/Daughter trigrams,
  the dragons, etc. are Wilhelm's *imagery*, not generic "the man", and
  neutralizing them would distort the divination.
- **Generation = hybrid:** a deterministic **regex** pass for the systematic,
  inflected role nouns, then an **LLM polish** pass for pronoun agreement,
  fluency, and an imagery-preservation check. A full **before/after diff report**
  is produced for control.
- **Scope:** DE + EN.

## 2. Data model

The current (verbatim) fields stay as the **historical base**. Neutral text is
stored as **overrides only where it differs** (lean — most fields are unchanged):

- Source of truth: **`scripts/sources/neutral_overrides.json`** (committed),
  shape `{ "<hex>": { "<field>": { "de": "...", "en": "..." }, ... } }` where
  `<field>` ∈ `meaning | judgment | image | line<i>.text | line<i>.interpretation
  | note<k>.text`. Only entries that differ from the base are present.
- Applied into the data files as suffixed fields: `*_neutral` (DE) and
  `*_en_neutral` (EN), on `meaning/judgment/image`, per line
  (`text_neutral`/`text_en_neutral`/`interpretation_neutral`/…), and per note
  (`text_neutral`/`text_en_neutral`). Positions and names are not gendered →
  no neutral variant.
- **Fallback rule:** a missing `*_neutral` means "same as historical". The app
  resolves `neutral` as `field_neutral ?? field`.

## 3. Pipeline & reproducibility

1. `scripts/neutralize.py` — reads `data/hexagrams.json` + `.en.json`, applies
   the inflected regex rule table to the gendered role nouns, writes a draft +
   `scripts/sources/neutral_diff_report.md` (gitignored). Deterministic.
2. **LLM polish workflow** — per hexagram whose draft changed: an agent receives
   the original + regex draft (DE & EN), fixes pronoun agreement / awkwardness,
   confirms imagery is intact, and returns the polished neutral fields. Output is
   consolidated into **`scripts/sources/neutral_overrides.json`** (committed).
3. `scripts/apply_neutral.py` — idempotently merges `neutral_overrides.json`
   into `data/hexagrams.json` (`*_neutral`) and `data/hexagrams.en.json`
   (`*_en_neutral`). Committed, reproducible. Run after `build_data.py`.
   `build_data.py` documents that `apply_neutral.py` must follow it (a rebuild
   drops the neutral fields until re-applied).

The regex rule table covers the inflected role nouns, e.g. (DE):
`der Edle → die edle Person` and case forms `des/dem/den Edlen`, `die Edlen` (pl);
`der große Mann → der große Mensch`; `der Weise`, `der Berufene` analogously.
(EN): `the superior man → the superior person`, `the great man → the great
person`, `the sage`/`he who` patterns. The regex output is a *draft*; the LLM
pass is authoritative for final wording.

## 4. App / UI

- **Setting** `yijing-register` in `localStorage`, default `"neutral"`; a toggle
  in the Settings panel ("Historische Fassung (Wilhelm 1924 wörtlich)" /
  "Historical wording"). An inline pre-paint read is not needed (text renders
  after a cast, not before first paint).
- **Field selection:** extend `hexTextFieldsForLang` / `lineFieldsForLang`
  (and the notes + resulting-judgment paths) to take the register into account:
  for `neutral`, prefer `*_neutral`/`*_en_neutral` with fallback to the base
  field; for `historical`, use the base field. Re-render the current reading
  when the toggle changes.
- **i18n:** new keys for the setting label/toggle (DE + EN).
- **`scripts/build_review.py`:** render both registers (or a flag) so the diff
  can be eyeballed.

## 5. Verification

- `scripts/neutralize.py` diff report — every substitution, before→after with
  context (the "kontrollieren" artifact).
- LLM-polish agents assert: imagery terms (`Mädchen`, `Vater`/`Mutter`/`Sohn`/
  `Tochter`, `Drache`) are unchanged; meaning preserved; register kept.
- `node scripts/test-kingwen.mjs` extended (or a sibling check) to assert
  neutral/historical parity: wherever a `*_neutral` exists, the base exists too,
  and DE/EN neutral coverage is symmetric.
- `node --check web/app.js`; browser spot-check (toggle flips hex 1 between
  "die edle Person…" and "der Edle…"; hex 53/54 maiden imagery identical in both).
- `apply_neutral.py` idempotent (running twice = no change).

## 6. Non-goals

- No neutralization of content-specific imagery or proper roles.
- No change to the historical (verbatim) text — it remains the opt-in base.
- Not the export work (sub-project B).

## 7. File-by-file

- **new** `scripts/neutralize.py` (regex draft + diff report)
- **new** `scripts/sources/neutral_overrides.json` (committed source of truth)
- **new** `scripts/sources/neutral_diff_report.md` (gitignored)
- **new** `scripts/apply_neutral.py` (merge overrides → both data files)
- **edit** `data/hexagrams.json`, `data/hexagrams.en.json` (gain `*_neutral` / `*_en_neutral`)
- **edit** `scripts/build_data.py` (doc note: run apply_neutral after) and `scripts/test-kingwen.mjs` (neutral parity)
- **edit** `web/app.js` (register-aware field selection + re-render on toggle), `web/index.html` (settings toggle), `web/i18n.js` (labels), `web/style.css` (if needed)
- **edit** `scripts/build_review.py` (show both registers)
- **edit** `docs/DATA.md` (register dimension + neutral fields)
