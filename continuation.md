# Continuation Notes — Switch to Opus 4.8

## What we just built

A full v2 of lorelaiblume.com at `/v2/` with a Google Sites-style site editor. Three new files:

- `v2/index.html` — HTML shell; nav is fully dynamic (rendered from Firestore config)
- `v2/styles.css` — All styles use CSS custom properties (`--color-bg`, `--color-text`, `--color-accent`, `--color-subheading`, `--font-heading`, `--font-nav`) so changes apply live
- `v2/app.js` — Full app: Firebase config management + all v1 gallery/film/apps logic + editor panel

## How the editor works

1. Log in with Google (pencil button, bottom-right) using lorelaiblume@gmail.com
2. A ⚙ button appears in the toolbar — click it to open the Site Settings panel
3. The panel lets you edit in real time:
   - **Site title & subheading** — updates on the page as you type
   - **Tabs** — rename, reorder (▲▼), add, delete
   - **Heading font** — Sigmar One, Playfair, Bebas, DM Serif, Cormorant
   - **Navigation font** — Cormorant, Inter, Josefin, Libre Baskerville, Karla
   - **Colors** — background, text, accent (nav active), subheading
4. All changes auto-save to Firestore (`siteConfig/v2`) with an 800ms debounce. A small dot in the panel header shows saving (orange) → saved (green).

## Data

- Gallery pieces: same `pieces` Firestore collection as v1 (shared data, safe to test)
- Films: same `films` collection
- Site config: `siteConfig/v2` document (separate from v1, so no interference)

## Deploy

No changes to `firebase.json` needed — Firebase Hosting serves `v2/index.html` automatically at `/v2/`.

To deploy:
```
cd ~/Desktop/dev/lorelaiblume && git add v2/ && git commit -m "Add v2 with site editor" && git push origin main
```

Then visit **lorelaiblume.com/v2** (~30–60s after push).

## What's left / next steps

- [ ] Test the editor live in the browser at lorelaiblume.com/v2
- [ ] Consider adding Firestore security rules so only the owner can write to `siteConfig/v2`
- [ ] When happy with v2, replace root `index.html`, `app.js`, `styles.css` with the v2 versions and update config key from `siteConfig/v2` → `siteConfig/main`
- [ ] The `write/` subdirectory (writing section) is not yet in v2 — can be added as a tab if desired
