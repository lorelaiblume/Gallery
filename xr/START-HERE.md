# xr-kit: start here

You're Claude, and someone has handed you this kit to use on a static
website. It lets a person wearing a Meta Quest develop WebXR apps without
ever leaving immersive mode: you edit code, and their headset's page
reloads by itself and drops them straight back into mixed reality.

It was built and tested on a Quest with a Firebase-hosted site, where it's
in daily use. Everything here comes from that site. Nothing in it is
specific to the site except the few settings at the top of `xr/xr.py`.

## What's in the kit

```
START-HERE.md          this file
xr/xr.py               the tool: dev server over USB, deploy, open pages on the Quest
xr/README.md           the full guide: how it works, setup, standard practice, gotchas
example-site/          the files the original site actually serves, as a working example
  version.txt            the site's version; the app polls it, deploys bump it
  apps/xrcube/           a small mixed-reality app built this way (three.js)
```

## What to do

1. **Read `xr/README.md` in full** before changing anything. It explains
   the three pieces that make this work, and why each one matters.
2. **Learn the site's layout:** in particular, which folder is served
   publicly (its "public root") and how it deploys.
3. **Install:**
   - Put `xr/` in the project **outside** the public root, e.g. beside
     it. It holds a Python script and docs that should never be served.
   - Put `version.txt` in the public root.
   - Put the app (or your own, built from its snippets) wherever the
     site keeps apps.
   - Edit the settings block at the top of `xr/xr.py` to match: the
     public root, the app's URL path, the live origin and the deploy
     command. `xr/README.md` → "Moving this to another site" has the
     checklist.
4. **Point the project's CLAUDE.md at `xr/README.md`,** with a line or
   two, so future sessions read it first. Don't copy this file in as
   another CLAUDE.md.
5. **Coach the person through the one-time Quest setup** in
   `xr/README.md` → "One-time setup". That covers Developer Mode, USB
   debugging and the browser flag. Then try dev mode together before
   relying on it.
