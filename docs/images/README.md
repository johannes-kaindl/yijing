# Image contract

What each image in this folder shows, and how to get it back.

Everything here is produced by `node scripts/capture-web-shots.mjs` from the
running web app — nothing is hand-made, and nothing should be. The script
starts `scripts/serve.py`, drives the installed Google Chrome over CDP, and
pins language, theme and the app's randomness, so two runs produce
byte-identical files. Re-run it whenever a UI change makes an image lie.

| File | Shows | Frame |
|---|---|---|
| `hero-en.png` | A cast reading in English: the question, the primary hexagram with two changing lines marked, the resulting hexagram, and the interpretation panel with the "Reflection, not prediction" disclaimer. | 1200×645 CSS at DPR 2 → 2400×1290, embedded at 820 px |
| `hero-de.png` | The same reading in German. | as above |

The four in-page screenshots come from the same script and the same run:

| File | Shows | Frame |
|---|---|---|
| `reader-en.png` | The read-through reference in English: the 8×8 index grid of all 64 hexagrams, open on hexagram 3, above that hexagram's card. | 940×1180 CSS at DPR 2 → 1880×2360, embedded at 720 px |
| `reader-de.png` | The same view in German. | as above |
| `reading-en.png` | A full cast reading in English, from the question field down to both hexagram cards. | 940×968 CSS at DPR 2 → 1880×1936, embedded at 720 px |
| `reading-de.png` | The same reading in German. | as above |

One image in the READMEs is **not** a screenshot and deliberately does not live
here: the social-preview card in `web/assets/og-image.png` (stylised hexagram 1
with 易經, generated from `og-image.svg`). It is a brand asset that ships with
the site — the page references it as `og:image` — so moving it into `docs/`
would either break the site or duplicate the file.

> `readme_lint` has no conforming state for that image: listing it in the table
> above reports "die Datei fehlt" (it is not in this folder), leaving it out
> reports "der Vertrag kennt es nicht" (the README embeds it). The warning is
> the tool's, not the repo's. It would need a way to declare an embedded asset
> that lives outside the image folder.

## Rules the images follow

- **Dark theme**, because that is what the app opens with on a dark system and
  it is the register the design was drawn for.
- **A reading with changing lines.** The captions promise a resulting hexagram,
  so the capture seed is chosen to produce one (lines 7,7,9,8,8,9) and the run
  asserts it — a seed without changing lines fails the capture instead of
  quietly replacing the picture with one that contradicts its caption.
- **A crop, not a page top.** The app's content column is capped at 760 px, so
  a wide shot starting at y=0 would be mostly empty margin. The hero is cropped
  to the reading, starting below the question card and ending below the
  interpretation panel, so no card is cut in half.
- **Under 400 KB** per PNG (the workspace image budget). Currently ~110–180 KB;
  the dark palette compresses well, so no extra optimiser is needed.

## Changing an image

Adjust the shot definition in `scripts/capture-web-shots.mjs` (the `SHOTS`
array and the `HERO` factory), re-run, and **look at the result** — the run
checks language, theme and structure, but it cannot see whether a frame is
well composed. Then update the table above.
