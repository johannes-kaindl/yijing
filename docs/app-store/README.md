# App Store assets

Marketing assets for the native Apple family **v1.0 (build 5)**, **published to
the App Store on 2026-06-20** (iPhone / iPad / Apple Watch; macOS Catalyst
deferred) — <https://apps.apple.com/app/yijing-i-ching/id6780668644>. Build 4
was rejected under Guideline 4 (watch-icon circular mask); build 5 fixed it and
was approved.

These are kept for re-submissions and future updates. App Store Connect has strict,
non-obvious requirements — note the specs below before re-uploading.

## Contents

| Folder | Slot | Size (px) | Source |
|---|---|---|---|
| `iphone-6.9/` | iPhone 6,9″ (8 shots) | 1290×2796 | real device (iPhone 16 Plus) |
| `ipad-13/{de,en}/` | iPad 13″ — **required** (4 each) | 2064×2752 | Playwright render of the web app |
| `ipad-11/{de,en}/` | iPad 11″ — *optional* slot (5 each) | 1668×2388 / 2388×1668 | real device (iPad Pro 11″) |
| `apple-watch/` | Apple Watch (1) | 416×496 | simulator |
| `preview/` | iPhone app preview video | 886×1920, H.264, 30 fps | real device, transcoded |

## ASC gotchas (hit during the 2026-06-19 upload)

- **Screenshots must be RGB, no alpha channel.** iOS device shots can pick up an
  alpha channel through editing → ASC rejects them ("no alpha channels or
  transparencies"). Strip losslessly: `ffmpeg -i in.png -pix_fmt rgb24 out.png`.
- **App preview videos differ from screenshots:** the 6,9″ preview slot wants
  **886×1920** (not 1290×2796), and the file **must carry an audio track** —
  a silent one is fine, but *no* track → "unsupported or corrupt audio". Build it
  with `-f lavfi -i anullsrc=...:44100 -c:a aac -shortest` (never `-an`).
- iPad 13″ is the **required** iPad slot; an 11″ device cannot fill it. The
  `ipad-13/` set was rendered from the web app via Playwright at exactly
  1032×1376 CSS px @ deviceScaleFactor 2 → 2064×2752.

See also the daemon memory `appstore-screenshot-specs` and `playwright-app-verification`.
