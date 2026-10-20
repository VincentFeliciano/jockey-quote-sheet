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
- **Save** — one button that writes to the phone *and* pushes the master copy to
  GitHub. **Pull from repo** brings down anything changed elsewhere.
- **Download a copy** — the old backup file, for a belt-and-braces export.
- **Restore file** — read a backup file back in.

## Where the data lives

Two copies, one master:

| Where | What | Notes |
| --- | --- | --- |
| The repo | `data/quotes.json`, `data/photos.json`, `data/photos/*.jpg` | The master copy. Pull reads it; Save writes it. |
| The phone | IndexedDB | Works with no signal. Autosaves as you type. |

Photos are committed as separate files, written once and never rewritten, so the
repo does not grow every time you hit Save — only the small `quotes.json` changes.

**Repo sync setup (once per device).** Open **Repo sync** at the bottom of the list
screen and paste a GitHub **fine-grained token** with *Contents: Read and write* on
`VincentFeliciano/jockey-quote-sheet` only. It is kept in `localStorage` on that
device and nowhere else. Anyone holding the phone can read it, so give it an expiry
date and revoke it at github.com/settings/personal-access-tokens if the phone goes
missing.

There is also a one-tap form of the same thing:
`…/jockey-quote-sheet/#sync=owner/repo/branch/<token>` stores the token and then
scrubs it from the address bar.

Without a token the app still works — Save just keeps everything on the phone.

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
node test/sync.mjs        # 21 checks: real Save push + pull against a throwaway branch
node test/seed.mjs        # writes the empty data/ files into the repo if missing
node test/probe.mjs       # dumps element rects for layout inspection
```

`test/sync.mjs` reads a token from the git credential helper, creates a `sync-test`
branch, drives the real Save button in headless Chrome, verifies the commit landed,
pulls it back into an empty store, then deletes the branch. It never prints the token.

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
