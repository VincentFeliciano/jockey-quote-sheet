# Jockey Quote Sheet — phone

A quote sheet for jockey silks that lives on your phone. Quotes, work in progress,
photos straight off the camera, and a finished list you can tick off.

Same look as the desktop sheet: black, shades of grey, one yellow.

**Live:** https://vincentfeliciano.github.io/jockey-quote-sheet/

## What it does

- **Working list** — every quote still in play, pinned ones at the top, then the
  ones furthest along, then the soonest due date.
- **Previous** — finished quotes, folded away until you want them.
- **Work & progress** — Quoted → Approved → In production → Finishing → Complete,
  plus your own steps (cut fabric, embroidery, post out) with a progress bar.
- **Photos** — "Take photo" opens the camera, "Choose photos" picks from the
  camera roll, or from anything you saved out of a text or an email. Photos are
  downscaled to 1600px and stored on the device.
- **Print / PDF** — the whole sheet as a clean document.
- **Backup / Restore** — one JSON file with every quote and photo.

## Where the data lives

On the device, in IndexedDB. Nothing is sent anywhere — there is no server and no
account. That also means: **clear the browser data and it is gone**, and a quote
typed on the phone is not on the laptop. Use Backup to move between them.

## Using it on the phone

1. Open the link in Safari or Chrome.
2. Share → **Add to Home Screen**. It then opens full screen like an app, and the
   offline cache means it still opens with no signal.
3. Camera access needs `https://` — which the GitHub Pages link is. Opened as a
   local file, the camera button will just offer the file picker.

## Layout

- **Phone** — two screens: the list, and the quote. Back arrow returns to the list.
  Everything scrolls vertically, nothing scrolls sideways.
- **Wide screen (≥900px)** — list sits on the left, sheet on the right.

## Tests

```
python -m http.server 8789 --bind 127.0.0.1
node test/mobile.mjs      # 33 checks at 390x844, writes test/mobile.png + mobile-list.png
node test/probe.mjs       # dumps element rects for layout inspection
```

## Files

```
index.html      two screens: list + quote
css/style.css   phone-first stylesheet, print styles at the bottom
js/schema.js    fields, stages, sorting, task helpers
js/store.js     IndexedDB persistence with an in-memory fallback
js/photos.js    camera/photo intake, downscaling
js/ui.js        DOM rendering
js/print.js     the printable document
js/app.js       wiring, autosave, navigation
sw.js           offline shell
manifest.json   installable app metadata
```

`index.html` also opens straight off `file://` for a quick look, but IndexedDB and
the camera behave better over `http://` or `https://`.
