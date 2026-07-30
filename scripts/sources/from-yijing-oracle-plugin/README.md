# Seed aus dem yijing-oracle-Obsidian-Plugin

**Herkunft:** `/Users/Shared/code/obsidian-plugins/yijing-oracle` (2026-07-12).
**Zweck:** geschlechtsneutrale (personen-neutrale) Varianten, die im Plugin erzeugt/verifiziert
wurden und in der App noch fehlen — v.a. das **`meaning`**-Feld (Bedeutung/Kommentar), das
`neutral_overrides.json` bisher nicht abdeckt.

## Datei

`meaning_neutral_seed.json` — im selben Schema wie `../neutral_overrides.json`:

```json
{ "<hexagramm-nr>": { "<feld>": { "de": "<neutraler Text>", "en": "…" } } }
```

Enthaltene Felder:
- `meaning` — neutrale Bedeutung. **DE** für Hex 1, 26, 36, 50, 60. **EN** für Hex 1, 2, 5,
  13, 14, 15, 25, 29, 36, 47, 50, 52, 60. (Nur dort, wo der klassische Text überhaupt eine
  zu neutralisierende Personen-Formulierung enthält; sonst == classic, kein Eintrag.)
- `judgment` (EN, Hex 37) + `line{2,6,7}.interpretation` (EN, Hex 1/13/42/47) — kleine
  Broad-Neutral-Nachzüge, die nach der `meaning`-Neutralisierung konsistent sein sollten.

## Konvention (personen-neutral)

Neutralisiert **alle generischen Personen-Bezüge**, **behält** konkrete Bild-Figuren:
- DE: `der Edle → die edle Person`, `der Weise → die weise Person`, `Männer → Menschen`;
  Pronomen der Person angeglichen (`sein → ihr`). Unpersönliches `man` bleibt.
- EN: `the superior man → the superior person`, generisch `man/men → person/people/human beings`,
  `he who → those who` (+ `his → their`), `superior/inferior` (Personengruppen) `→ noble/common ones`.
- **Behalten:** Trigramm-Familienrollen (Vater/Mutter/Sohn/Tochter), konkrete Figuren
  (König, Wanderer, Ehe-Rollen, Feldherr/ruler, `the sage`), Yin-Yang-Prinzipien.

## Verifikation

Jede Änderung wurde per `difflib` gegen den klassischen Text geprüft: **nur** Personen-Bezüge
geändert, sonst byte-identisch. Scope per Deep-Compare bestätigt.

## Status: übernommen am 2026-07-30

Der Seed ist in `../neutral_overrides.json` gemerged und per `apply_neutral.py` in
`data/hexagrams.en.json` angekommen. **Er muss nicht erneut übernommen werden.**

Beim Merge kamen zwei Dinge heraus, die oben *nicht* stehen — wer den Seed als Vorlage für
einen weiteren Plugin-Export nimmt, sollte sie kennen:

- **Linien-Indizes differieren.** Der Seed zählt Linien **1-basiert** (`line7` = die
  Zusatz-Interpretation „alle Linien"), `neutral_overrides.json` **0-basiert**. Beim Merge
  wurde um eins verschoben; die Zuordnung ist per `difflib`-Bestmatch gegen den klassischen
  Text verifiziert (r ≥ 0,96 bei klarem Abstand zum Zweitplatzierten), nicht geraten.
- **`meaning` war längst abgedeckt.** 17 der 24 Seed-Werte kollidierten mit bestehenden
  Overrides — 11 identisch, 6 abweichend. Übernommen wurden nur die **6 wirklich neuen**
  Einträge (hex 1/13/13/42/47 line-interpretations + hex 37 judgment, alle EN) sowie **eine
  Kombination** bei hex 1 `meaning` [en]: die bestehende Fassung neutralisierte die Pronomen,
  der Seed zusätzlich `men → human beings` und `mankind → humankind`.
- Bei den übrigen 6 Abweichungen blieb die bestehende Fassung stehen, weil sie gleich
  neutral oder neutraler war (z. B. hex 1 [de]: der Override neutralisiert auch
  „des Herrschers und Führers … seine Kraft", der Seed nicht).

Der Seed bleibt als **Provenienz-Beleg** liegen — er ändert keine App-Datei direkt.
