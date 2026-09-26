# xr: build WebXR apps on a Quest without leaving immersive mode

This is for Claude, working with someone who's wearing a Meta Quest while
you edit a static WebXR app on their computer. Its goal: **they never have
to take the headset off or leave immersive mode.** You change code; their
page reloads by itself within about a second and drops them straight back
into mixed reality where they were.

It has two modes:

- **Dev mode:** `xr.py dev` serves the site from their computer, and the
  Quest reaches it over USB. Every file save reloads the headset's page in
  about a quarter second. Nothing is published.
- **Deploy mode:** `xr.py deploy` publishes the site as usual. Any headset
  showing the live app reloads by itself within about a second.

The reference app is `public/apps/xrcube/`: two glowing cubes in
passthrough that you drag by pinching inside them, plus glowing
fingertips. Treat it as the working example of everything below.

## On this site (lorelaiblume.com): read this first

This kit came from arthurblume.com. Everything below describes that site's
layout; these are the differences here, and they win where the two disagree:

- **There's no `public/` folder.** lorelaiblume.com serves the whole repo
  as `/` (`firebase.json` → `"public": "."`). So wherever this README says
  `public/...`, read it as the repo root: `version.txt` and `apps/xrcube/`
  live at the top of the repo, and `xr.py`'s `SITE_ROOT` is the repo itself.
- **`xr/` is kept off the site by `firebase.json`**, whose `ignore` list has
  `"xr/**"`. Don't remove that. The dev server hides `xr/`, `firebase.json`
  and dotfiles too, so the local site matches the live one.
- **Deploying is a push to `main`,** not `firebase deploy`: GitHub Actions
  deploys each push. `xr.py deploy` therefore refuses to run while anything
  is uncommitted, then commits a new `version.txt`, pushes, and waits (up
  to 5 minutes) for lorelaiblume.com to serve it. Commit the app's changes
  first.
- **Caching:** `firebase.json` sends `Cache-Control: no-cache` for
  `/version.txt` and everything under `/apps/`, so a reload always gets the
  new code. XR apps belong under `/apps/` for that reason; the rest of the
  site keeps Firebase's default caching.
- **Who runs what:** Claude edits files in this folder, but runs in the
  cloud and can't reach the Quest's USB connection or GitHub. Lorelai runs
  `python3 xr/xr.py dev` (and `deploy`, `open`) in Terminal on her Mac.
  With no Quest plugged in, `dev` still serves the site at
  `http://localhost:8766/` for trying pages in a desktop browser.
- **Port 8766, not 8765:** `server.py` (the gallery server) already uses
  8765, so `xr.py`'s `DEV_PORT` is 8766 and both can run at once. Where
  this README says 8765, read 8766.
- **adb** is Google's platform-tools, unzipped at `~/dev/platform-tools`
  and put on PATH in `~/.zshrc` (not Homebrew).
- **The Quest's Developer Mode isn't set up yet,** so `adb devices` lists
  nothing for now. The navigation flag is already on for the headset
  Lorelai's getting.

## Files

```
xr/xr.py                      the tool: dev server, deploy, open-on-Quest, package (stdlib Python 3.9+)
xr/README.md                  this file
xr/START-HERE.md              the entry point of the kit ZIP (see "Packaging the kit")
public/version.txt            the site's version; deploy bumps it, the app polls it
public/apps/xrcube/index.html
public/apps/xrcube/main.js    the app, including the two snippets any app needs (below)
```

`public/` is the folder the site serves; `xr/` sits outside it and is
never published. Keep it that way on any site. In the kit ZIP, `public/`
appears as `example-site/`.

## How it works

Three pieces, and each one is load-bearing.

**1. Reloading without leaving immersive mode (`sessiongranted`).**
Normally a reload ends the XR session and drops the user back to the 2D
page. With the Quest Browser flag `chrome://flags/#webxr-navigation-permission`
enabled, a page that navigates *while its session is still running* keeps
the headset in immersive mode, and the new page gets a `sessiongranted`
event that lets it start a session without a tap. It's a Quest-only,
experimental API ([immersive-web/navigation](https://github.com/immersive-web/navigation)).
The app must therefore:

- call `location.reload()` **without** calling `session.end()` first, and
- listen for `sessiongranted` and start its session in response.

three.js's `VRButton` handles `sessiongranted` for VR; `ARButton` does not,
so xrcube does it itself by clicking the `ARButton` in code:

```js
const arButton = ARButton.createButton(renderer, { optionalFeatures: ["hand-tracking"] });
document.body.appendChild(arButton);
navigator.xr?.addEventListener("sessiongranted", () => {
  navigator.xr.isSessionSupported("immersive-ar").then((supported) => {
    if (supported) arButton.click();
  });
});
```

Clicking the button (rather than calling `requestSession` directly) keeps
the button's own session bookkeeping correct. The `isSessionSupported`
wait matters: the button only gets its click handler once its own
`isSessionSupported` check resolves, and ours is queued after that one.

**2. Knowing when to reload (`/version.txt`).** The app polls
`/version.txt` at the site root, and reloads when the value differs from
the one it saw first:

```js
const VERSION_URL = "/version.txt";
const VERSION_POLL_MS = location.hostname === "localhost" ? 250 : 1000;

async function watchVersion() {
  let loadedVersion = null;
  for (;;) {
    try {
      const response = await fetch(VERSION_URL, { cache: "no-store" });
      if (!response.ok) throw new Error(`${VERSION_URL}: ${response.status}`);
      const version = (await response.text()).trim();
      if (loadedVersion === null) loadedVersion = version;
      else if (version !== loadedVersion) {
        location.reload(); // don't call again: a second reload() restarts the first
        return;
      }
    } catch (error) {
      console.warn("version check failed", error);
    }
    await new Promise((resolve) => setTimeout(resolve, VERSION_POLL_MS));
  }
}
watchVersion();
```

- **Deployed:** `version.txt` is a real file holding a Unix timestamp,
  and `xr.py deploy` writes a new one before every deploy. Firebase
  Hosting switches all of a deploy's files over at once, so the new
  version never shows up before the code it goes with. The site must serve
  it uncached (here `firebase.json` sets `Cache-Control: no-cache` on
  everything; the `no-store` fetch covers the browser side).
- **Dev server:** `version.txt` is computed from the newest modification
  time and file count under the site root, so any save, addition or
  deletion changes it. The file on disk is ignored there.

Only apps that include this snippet reload. Bumping `version.txt` does
nothing to ordinary pages.

**3. Reaching the dev server from the headset (`adb reverse`).** WebXR
only runs in a secure context: HTTPS, or `http://localhost`. `adb reverse
tcp:8765 tcp:8765` makes the Quest's `localhost:8765` reach port 8765 on the
computer over USB, so the headset loads `http://localhost:8765/...` as a
secure context with no certificates and no Wi-Fi setup. The server listens
only on 127.0.0.1. `xr.py dev` sets up the forward on start and removes it
on Ctrl-C.

## One-time setup

On the computer:
- **adb:** Android platform-tools on PATH (`brew install --cask android-platform-tools`
  on a Mac). `adb devices` should list the Quest as `device`.
- **Python 3.9+:** nothing to install beyond that.
- **The site's deploy tool,** logged in (here: `firebase login`).

On the Quest (coach the user through these; you can't do them for them):
1. **Developer Mode on.** This is done in the Meta Horizon phone app, under
   the headset's settings, and needs a Meta developer account (free). It
   has to be on before USB debugging is possible at all.
2. **USB debugging allowed.** Plug the Quest into the computer by USB.
   Inside the headset, a prompt asks to allow USB debugging; choose
   *Always allow from this computer*. Until then `adb devices` shows the
   Quest as `unauthorized`.
3. **The navigation flag.** Run `xr.py flags` and read its steps to the
   user. You **cannot** open this page for them: the Quest Browser ignores
   `chrome://` and `about://` URLs sent over adb (tested both ways). They
   type `chrome://flags/#webxr-navigation-permission` into the address bar,
   set *WebXR Navigation Permission* to Enabled, and relaunch the browser.
   Without it, everything else still works, except that each reload drops
   them out of immersive mode.

## Working with the user: standard practice

- **At the start of a session,** check `adb devices`. If the Quest is
  missing or `unauthorized`, coach them through setup steps 1 and 2. Ask
  once whether the navigation flag is on; if they're not sure, walk them
  through `xr.py flags`.
- **Offer to open pages on the headset.** They're wearing it, and typing
  URLs in VR is tedious. `xr.py open` opens the app from the dev server;
  `xr.py open --live` opens the deployed app; `xr.py open <path or URL>`
  opens anything else. (Under the hood: `adb shell am start -a
  android.intent.action.VIEW -d <url> com.oculus.browser`.) Offer this
  whenever a page needs opening, such as after the browser was closed or
  the headset slept, instead of dictating a URL.
- **They have to enter immersive mode themselves once** per page load that
  didn't come from a reload (tapping the app's Start AR button). After
  that, reloads keep them in.
- **Tell them what to look for** after each change, since they can't see
  your terminal: "the right cube should now be blue".
- **Dev mode:** run `xr.py dev` in the background and leave it running.
  Saving files is all it takes; don't deploy for each change. Server logs
  (the headset's requests) go to its output, which is a handy way to
  confirm that a reload happened.
- **Deploy mode:** `xr.py deploy` when they want the change live, or when
  they're working against the live site. Then commit, including
  `public/version.txt`. Follow the site's own README on whether deploying
  needs their go-ahead.

## Commands

```
xr/xr.py dev [--open]          adb reverse + dev server on :8765 (--open also opens the app)
xr/xr.py open [--live] [URL]   open the app (or a path/URL) in the Quest Browser
xr/xr.py flags                 print the steps for turning on the navigation flag
xr/xr.py deploy                bump version.txt, run the deploy command, confirm the live version
xr/xr.py package               build xr-kit.zip on the Desktop for handing to another Claude
```

## Moving this to another site

Copy `xr/` into the project **outside** the folder the site serves, and
the app's folder into it, then:

1. **Edit the block at the top of `xr.py`:** `SITE_ROOT` (the folder
   served as `/`), `APP_PATH` (the app's URL path), `LIVE_ORIGIN`, and
   `DEPLOY_COMMAND`. Nothing else in it is site-specific.
2. **Create `version.txt`** in the site root, holding anything (e.g. `0`).
3. **Check that the host serves `/version.txt` uncached,** or at least with
   a short cache lifetime. With a long cache lifetime, deployed reloads
   will lag or never happen; dev mode is unaffected.
4. **Check that the host switches a deploy's files over all at once.**
   Firebase Hosting, Netlify, Vercel, Cloudflare Pages and GitHub Pages
   all do. If yours uploads files one by one (plain FTP/rsync), upload
   `version.txt` last.
5. **Point the site's CLAUDE.md at this file,** so the next Claude reads it
   before touching an XR app.

For a new XR app, copy the `sessiongranted` and `watchVersion` snippets
from `xrcube/main.js`. For a VR (not AR) app, `VRButton` already clicks
itself on `sessiongranted`, so it needs only the polling snippet.

## Packaging the kit

`xr.py package` writes `~/Desktop/xr-kit.zip`, for handing this whole
setup to another Claude working on a different site. It's built from the
last commit (via `git archive`), so commit first; it refuses to run if
anything it packs has uncommitted changes. Layout:

```
xr-kit/START-HERE.md       from xr/START-HERE.md, moved to the top
xr-kit/xr/                 xr.py and this README
xr-kit/example-site/       version.txt and apps/xrcube/, as served
```

Rebuild it whenever this README, the tool or xrcube improves.

## Gotchas

- **Dev mode's "site" is the site root folder, but symlinked folders are
  not watched.** Saving inside one won't trigger a reload (here, `/space`
  is a symlink and is deliberately left out).
- **`adb reverse` is lost** when the cable is unplugged or adb restarts.
  Rerun `xr.py dev`.
- **A sleeping headset** accepts `xr.py open` but may not show the page.
  Ask them to wake it and open it again.
- **Chromium reloads** fetch fresh files because both servers send
  `no-cache`. If a change doesn't seem to appear, check the headers first.
- **Don't end the session before reloading.** Ending it first defeats the
  flag. Any in-app "reload" control should call `location.reload()` while
  the session is running.
- **Moving between two different pages** in immersive mode (a link from one
  XR app to another) should work the same way, since that's what the API
  was designed for, but only reloads have been tested here.
