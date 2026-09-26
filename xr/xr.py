#!/usr/bin/env python3
"""Develop WebXR apps on a Meta Quest without leaving immersive mode.

    xr.py dev [--open]        serve the site locally, reachable from a USB-connected Quest
    xr.py open [--live] [URL] open a page in the Quest Browser (default: the app)
    xr.py flags               print how to turn on the Quest Browser flag this setup needs
    xr.py deploy              bump version.txt, commit + push (GitHub Actions deploys), confirm it's live
    xr.py package             build xr-kit.zip on the Desktop, for handing to another Claude

Standard library only. See README.md beside this file for the whole story.
"""

import argparse
import http.server
import io
import os
import shutil
import subprocess
import sys
import tarfile
import time
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

# --- Site configuration: the only part to change when moving to another site.
REPO = Path(__file__).resolve().parent.parent
# lorelaiblume.com serves the whole repo as "/" (firebase.json: "public": "."),
# so this xr/ folder is kept off the site by an "xr/**" ignore in firebase.json.
SITE_ROOT = REPO  # the folder served at the site's "/"
APP_PATH = "/apps/xrcube/"  # the app's URL path, from the site root
LIVE_ORIGIN = "https://lorelaiblume.com"
# Deploying is a push to main: GitHub Actions then runs firebase deploy.
DEPLOY_REMOTE = "origin"
DEPLOY_BRANCH = "main"
DEPLOY_WAIT_SECONDS = 300  # how long to wait for the Actions deploy to go live
DEV_PORT = 8766  # 8765 is taken by server.py, the gallery server
# Served-root entries Firebase doesn't publish (see "ignore" in firebase.json);
# the dev server hides them too and doesn't watch them. Dotfiles are also hidden.
UNPUBLISHED = {"xr", "firebase.json", "node_modules"}
# ---

VERSION_NAME = "version.txt"
VERSION_FILE = SITE_ROOT / VERSION_NAME
QUEST_BROWSER = "com.oculus.browser"
FLAG_URL = "chrome://flags/#webxr-navigation-permission"

# The Quest Browser won't open chrome:// (or about://) pages sent over adb,
# so turning the flag on is always done by hand.
FLAG_STEPS = f"""\
In the Quest Browser, on the headset:
  1. Open a new tab, tap the address bar, and type:  {FLAG_URL}
  2. The page should jump to "WebXR Navigation Permission"; set it to Enabled.
  3. Relaunch the browser when it offers, so the flag takes effect.
This lets a page reload without dropping out of immersive mode. It's needed
once per headset, and again if a browser update resets flags.
"""


def dev_url(path=APP_PATH):
    return f"http://localhost:{DEV_PORT}{path}"


def live_url(path=APP_PATH):
    return f"{LIVE_ORIGIN}{path}"


def adb(*args, check=True):
    if shutil.which("adb") is None:
        sys.exit("adb not found: install Android platform-tools and put adb on PATH")
    return subprocess.run(["adb", *args], check=check, capture_output=True, text=True)


def quest_problem():
    """None if a Quest is ready for adb, otherwise what's wrong."""
    if shutil.which("adb") is None:
        return "adb not found: install Android platform-tools and put adb on PATH"
    devices = [line for line in adb("devices").stdout.splitlines()[1:] if line.strip()]
    if not devices:
        return "No Quest found: plug it in by USB, put it on, and accept the USB debugging prompt"
    if any(line.split()[1] == "unauthorized" for line in devices):
        return "Quest is connected but unauthorized: put it on and accept the USB debugging prompt"
    return None


def require_quest():
    problem = quest_problem()
    if problem:
        sys.exit(problem)


def is_unpublished(relative_parts):
    """True for paths Firebase doesn't publish: dotfiles/dot-folders and UNPUBLISHED."""
    parts = [part for part in relative_parts if part]
    return bool(parts) and (parts[0] in UNPUBLISHED or any(part.startswith(".") for part in parts))


def open_on_quest(url):
    require_quest()
    adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", url, QUEST_BROWSER)
    print(f"Opened on Quest: {url}")


def site_version():
    """A value that changes whenever any served file is added, removed or saved.

    Symlinked directories aren't followed, which keeps an unrelated app
    exposed by symlink (like /space here) out of the walk.
    """
    newest = 0
    count = 0
    for folder, subfolders, files in os.walk(SITE_ROOT):
        relative = Path(folder).relative_to(SITE_ROOT).parts
        # Skip what isn't published (.git, xr/, ...), so git activity or
        # editing this tool doesn't reload the headset.
        subfolders[:] = [name for name in subfolders if not is_unpublished((*relative, name))]
        for name in files:
            path = Path(folder, name)
            if path == VERSION_FILE or is_unpublished((*relative, name)):
                continue
            try:
                newest = max(newest, path.stat().st_mtime_ns)
                count += 1
            except FileNotFoundError:  # deleted mid-walk, e.g. an editor's temp file
                pass
    return f"dev-{newest}-{count}"


class DevHandler(http.server.SimpleHTTPRequestHandler):
    """Serves the site root as-is, except that version.txt is computed from
    the files' modification times, so the app's version polling reloads it
    on every save."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SITE_ROOT), **kwargs)

    def send_head(self):
        # Match the live site: what Firebase doesn't publish isn't served here either.
        request_path = urllib.parse.unquote(self.path.split("?")[0].split("#")[0])
        if is_unpublished(request_path.split("/")):
            self.send_error(404)
            return None
        return super().send_head()

    def do_GET(self):
        if self.path.split("?")[0] == "/" + VERSION_NAME:
            body = site_version().encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, format, *args):
        # The app polls version.txt several times a second; only log the rest.
        if VERSION_NAME not in self.path:
            super().log_message(format, *args)


def dev(open_app):
    # Without a Quest the server still runs, for trying pages in a desktop
    # browser; plug the Quest in and rerun to reach it from the headset.
    problem = quest_problem()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", DEV_PORT), DevHandler)
    if problem:
        print(f"{problem}\nServing on this computer only (rerun once the Quest is connected).")
    else:
        # The Quest's localhost:PORT now reaches this machine's localhost:PORT.
        # WebXR requires a secure context, and localhost counts as one, so
        # this works over plain http with no certificate.
        adb("reverse", f"tcp:{DEV_PORT}", f"tcp:{DEV_PORT}")
        print("Forwarded to the Quest over USB")
    print(f"Serving {SITE_ROOT} at {dev_url('/')}")
    print(f"App: {dev_url()}   (Ctrl-C to stop)")
    if open_app and not problem:
        open_on_quest(dev_url())
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        if not problem:
            adb("reverse", "--remove", f"tcp:{DEV_PORT}", check=False)


def git(*args, check=True):
    return subprocess.run(["git", *args], cwd=REPO, check=check, capture_output=True, text=True)


def fetch_live_version():
    # A throwaway query string and no-cache header get past any cache on the way.
    request = urllib.request.Request(
        f"{LIVE_ORIGIN}/{VERSION_NAME}?t={time.time()}", headers={"Cache-Control": "no-cache"}
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return response.read().decode().strip()


def deploy():
    """Publishing this site is a push to main (GitHub Actions runs firebase deploy),
    so deploying means: commit a new version.txt, push, and wait for it to go live."""
    version_rel = VERSION_FILE.relative_to(REPO).as_posix()
    dirty = [line for line in git("status", "--porcelain").stdout.splitlines() if line[3:] != version_rel]
    if dirty:
        listing = "\n".join(dirty)
        sys.exit(f"Commit these first; only committed work goes live:\n{listing}")

    version = str(int(time.time()))
    VERSION_FILE.write_text(version + "\n")
    git("add", version_rel)
    git("commit", "-m", f"Deploy: {VERSION_NAME} -> {version}", "--", version_rel)
    print(f"{VERSION_NAME} -> {version} (committed)")

    push = subprocess.run(["git", "push", DEPLOY_REMOTE, DEPLOY_BRANCH], cwd=REPO)
    if push.returncode != 0:
        sys.exit(f"Push failed (see above). The version bump is committed; rerun: git push {DEPLOY_REMOTE} {DEPLOY_BRANCH}")

    print(f"Pushed. Waiting for GitHub Actions to publish (up to {DEPLOY_WAIT_SECONDS // 60} min)...")
    deadline = time.time() + DEPLOY_WAIT_SECONDS
    live = None
    while time.time() < deadline:
        try:
            live = fetch_live_version()
        except Exception as error:  # offline, 404 before the first deploy, a cert problem...
            live = f"(couldn't read it: {error})"
        if live == version:
            print(f"Live: {live_url()} is serving version {version}")
            return
        time.sleep(5)
    sys.exit(f"Pushed, but {LIVE_ORIGIN}/{VERSION_NAME} still reads {live!r}, not {version!r}. "
             "Check the Actions tab on GitHub for the deploy's status.")


def package():
    """Zip the kit from the last commit, so it never holds half-finished edits.

    The public root's files land in example-site/, xr/START-HERE.md moves to
    the top, and everything else keeps its place under xr-kit/.
    """
    xr_dir = Path(__file__).resolve().parent.relative_to(REPO).as_posix()
    public = SITE_ROOT.relative_to(REPO).as_posix()
    # Here the site root is the repo itself ("."), so served paths have no prefix.
    prefix = "" if public == "." else public + "/"
    app_dir = prefix + APP_PATH.strip("/")
    sources = [xr_dir, prefix + VERSION_NAME, app_dir]

    dirty = subprocess.run(["git", "status", "--porcelain", "--", *sources], cwd=REPO, capture_output=True, text=True, check=True).stdout
    if dirty:
        sys.exit(f"Commit these first; the kit is built from the last commit:\n{dirty}")

    archive = subprocess.run(["git", "archive", "--format=tar", "HEAD", *sources], cwd=REPO, capture_output=True, check=True).stdout
    destination = Path.home() / "Desktop" / "xr-kit.zip"
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar, zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as kit:
        for member in tar.getmembers():
            if not member.isfile():
                continue
            if member.name == f"{xr_dir}/START-HERE.md":
                name = "START-HERE.md"
            elif not member.name.startswith(xr_dir + "/"):
                name = "example-site/" + member.name[len(prefix) :]
            else:
                name = member.name
            info = zipfile.ZipInfo(f"xr-kit/{name}", time.localtime(member.mtime)[:6])
            info.external_attr = (member.mode & 0o777) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            kit.writestr(info, tar.extractfile(member).read())
    print(f"Wrote {destination}")


def main():
    # Keep output in order when it's piped or logged, not only on a terminal.
    sys.stdout.reconfigure(line_buffering=True)
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    dev_parser = commands.add_parser("dev", help="serve locally for a USB-connected Quest")
    dev_parser.add_argument("--open", action="store_true", help="also open the app on the Quest")
    open_parser = commands.add_parser("open", help="open a page in the Quest Browser")
    open_parser.add_argument("--live", action="store_true", help="the deployed site rather than the dev server")
    open_parser.add_argument("url", nargs="?", help="a full URL, or a path like /apps/xrcube/ (default: the app)")
    commands.add_parser("flags", help="print how to turn on the Quest Browser flag this setup needs")
    commands.add_parser("deploy", help="bump version.txt, commit and push, confirm it's live")
    commands.add_parser("package", help="build xr-kit.zip on the Desktop")
    args = parser.parse_args()

    if args.command == "dev":
        dev(args.open)
    elif args.command == "open":
        url = args.url or APP_PATH
        if url.startswith("/"):
            url = live_url(url) if args.live else dev_url(url)
        open_on_quest(url)
    elif args.command == "flags":
        print(FLAG_STEPS, end="")
    elif args.command == "deploy":
        deploy()
    elif args.command == "package":
        package()


if __name__ == "__main__":
    main()
