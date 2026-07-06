# Handwriting Font App — Continuation Notes

## What we're building
`/write/index.html` — a page where you type and it renders in Lorelai's handwriting.
The app loads a single PDF (`/write/font.pdf`) containing all glyphs, extracts them at runtime using canvas, and renders typed text monospaced.

## Current state
- `/write/index.html` — proof of concept, working but needs verification
- `/write/font.pdf` — Lorelai's handwriting sheet (the source asset)
- Server runs at `http://localhost:8000` (not 8765)

## How the segmentation works
1. PDF.js renders `font.pdf` to a hidden canvas at 3x scale
2. Binarize the image (dark pixels = ink)
3. Row projection finds 7 horizontal text bands (minGap=30px at 3x)
4. **Slot-based extraction**: for each row, find leftmost/rightmost ink, divide into N equal slots (N = known char count), tight-bounding-box each slot
5. Map slots to the known character sequence (ROWS array)

## Character sequence in the PDF (row by row)
```
Row 0: A B C D E F G H I J K L M N O P Q R  (18)
Row 1: S T U V W X Y Z                        (8)
Row 2: a b c d e f g h i j k l m n o p q r  (18)
Row 3: s t u v w x y z                        (8)
Row 4: 1 2 3 4 5 6 7 8 9 0                   (10)
Row 5: . , ; : ! ? ( ) -                      (9)
Row 6: @ $ % & *                              (5)
Total: 76 glyphs
```

## What was fixed in the last iteration
The first attempt used column gap detection to split characters. This caused merging (G+H+I+J, X+Y, a+b, q+r) which shifted the entire mapping. Switched to slot-based approach.

## VERIFIED + FIXED (2026-07-06, headless)
Replicated the exact segmentation offline (pdftoppm @216dpi = SCALE 3, same binarize thresh=160,
same findBands/row-band logic in Python) and rendered a labeled glyph grid.

Findings:
- Source PDF renders right-side up; row order matches the ROWS array exactly. ✓
- Row projection: 7 bands found, 76/76 glyphs mapped. ✓
- BUT the **slot-based (equal-width) extraction was the weak point**: handwriting isn't evenly
  spaced, so equal slots clipped/bled many glyphs. Worst in the lowercase row — `g` came out
  nearly empty; `e`/`f`/`h` bled into neighbors; several uppercase + digits were clipped.

Fix applied to `write/index.html`:
- Replaced equal-slot extraction with **gap-based clustering reconciled to the known count**.
  Raw clusters = `findBands(colSums, minGap=2)` (contiguous ink runs). Then `reconcile()` forces
  the cluster count to the row's known glyph count: merge closest-adjacent pair if too many,
  split the widest cluster at its lowest-ink column if too few.
- On this sheet every row's raw cluster count already matched the target exactly
  (18,8,18,8,10,9,5) — no reconciliation needed — and every glyph is now tightly bounded with
  no bleed/clipping. The earlier "merging" problem was just too-large a gap threshold.
- `reconcile()` makes it self-correcting for future/messier sheets.
- Verification artifacts (not committed): outputs/glyph_grid.png (old, broken) vs
  outputs/glyph_grid_v2.png (new, correct); scripts segment.py / improved_segment.py.

## What to verify next
1. Open `http://localhost:8000/write/` in a real browser and confirm the on-page glyph grid
   now matches glyph_grid_v2.png (it should — same algorithm).
2. Type something and check spacing/baseline (see next-steps below — still monospaced).

## Next steps after POC works
- Baseline alignment (uppercase, lowercase, and punctuation need to sit on a common baseline)
- Proportional spacing (currently monospaced)
- Letter config editor (was in old `write/editor.html`)
- Commit `write/` and `font.pdf` to git so it deploys via GitHub Actions

## Git situation
- `write/` and `font.pdf` are NOT yet committed — they only exist locally
- Any push to `main` will NOT deploy them until they're committed
- `firebase.json` deploys from `.` (whole directory), so manual `firebase deploy` would include them
- To commit: `cd ~/Desktop/dev/lorelaiblume && git add write/ && git commit -m "Add handwriting font app" && git push origin main`

## Stack
- Static HTML/CSS/JS, no framework
- Firebase Hosting (auto-deploy on push to main via GitHub Actions)
- Firebase Firestore + Storage + Auth for the main gallery (`index.html`)
- Owner email: lorelaiblume@gmail.com
