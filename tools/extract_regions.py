#!/usr/bin/env python3
"""
Color Region Extractor
Loads an image, finds every contiguous color region, and outputs
an HTML file showing the original alongside the extracted SVG shapes.

Usage: python3 tools/extract_regions.py
"""

import sys, io, base64, webbrowser, urllib.request
from pathlib import Path

# ── Auto-install dependencies ─────────────────────────────────────────────────
def pip(*pkgs):
    import subprocess
    subprocess.run([sys.executable, '-m', 'pip', 'install', *pkgs,
                   '--break-system-packages', '-q'], check=True)

try:
    from PIL import Image
    import numpy as np
except ImportError:
    print("Installing pillow, numpy…")
    pip('pillow', 'numpy')
    from PIL import Image
    import numpy as np

try:
    from scipy import ndimage
    from skimage import measure
except ImportError:
    print("Installing scipy, scikit-image…")
    pip('scipy', 'scikit-image')
    from scipy import ndimage
    from skimage import measure

# ── Config ────────────────────────────────────────────────────────────────────
IMAGE_URL = (
    "https://firebasestorage.googleapis.com/v0/b/"
    "lorelai-blume-gallery.firebasestorage.app/o/"
    "pieces%2F1782059153231_hrag4il2sr9.jpg"
    "?alt=media&token=8f3c0487-9c4d-4178-8d35-8a8e856f6ebe"
)

N_COLORS   = 20    # number of quantized colors (raise for more regions)
MIN_AREA   = 300   # ignore regions smaller than this many pixels (at work res)
WORK_WIDTH = 500   # image is processed at this width for speed
SUBSAMPLE  = 3     # take every Nth contour point (lower = smoother, slower)
OUT_FILE   = Path(__file__).parent / "regions.html"

# ── Load image ────────────────────────────────────────────────────────────────
print(f"Fetching image…")
with urllib.request.urlopen(IMAGE_URL) as r:
    raw = r.read()

img_orig = Image.open(io.BytesIO(raw)).convert('RGB')
orig_w, orig_h = img_orig.size
print(f"  Original size: {orig_w}×{orig_h}")

# ── Resize for processing ─────────────────────────────────────────────────────
scale  = WORK_WIDTH / orig_w
work_h = round(orig_h * scale)
work   = img_orig.resize((WORK_WIDTH, work_h), Image.LANCZOS)
print(f"  Working size:  {WORK_WIDTH}×{work_h}")

# ── Quantize colors ───────────────────────────────────────────────────────────
print(f"Quantizing to {N_COLORS} colors…")
quant   = work.quantize(colors=N_COLORS, method=Image.Quantize.MEDIANCUT)
indices = np.array(quant)          # 2-D array of color-index per pixel
palette = quant.getpalette()       # flat list: [R,G,B, R,G,B, …]

# ── Extract regions ───────────────────────────────────────────────────────────
print("Extracting regions…")
svg_shapes = []

for ci in range(N_COLORS):
    r, g, b = palette[ci*3], palette[ci*3+1], palette[ci*3+2]
    hex_col  = f'#{r:02x}{g:02x}{b:02x}'

    mask               = (indices == ci).astype(np.uint8)
    labeled, n_labels  = ndimage.label(mask)

    for lbl in range(1, n_labels + 1):
        comp = (labeled == lbl)
        if comp.sum() < MIN_AREA:
            continue

        # Sample the actual color from the original image at the component centroid
        ys, xs = np.where(comp)
        cy_px, cx_px = int(ys.mean()), int(xs.mean())
        actual_r, actual_g, actual_b = work.getpixel((cx_px, cy_px))
        fill = f'#{actual_r:02x}{actual_g:02x}{actual_b:02x}'

        # Pad so contours on the image edge close properly
        padded   = np.pad(comp.astype(float), 1)
        contours = measure.find_contours(padded, 0.5)

        if not contours:
            continue

        # Only use the LARGEST contour (outer boundary) — skip interior holes
        contour = max(contours, key=len)
        pts = contour[::SUBSAMPLE]
        if len(pts) < 4:
            continue

        # Remove the padding offset (1 px) and scale back to original size
        coords = " ".join(
            f"{(x - 1) / scale:.1f},{(y - 1) / scale:.1f}"
            for y, x in pts
        )
        svg_shapes.append(
            f'<polygon points="{coords}" fill="{fill}" stroke="none"/>'
        )

print(f"  Total shapes: {len(svg_shapes)}")

# ── Build HTML ────────────────────────────────────────────────────────────────
img_b64 = base64.b64encode(raw).decode()

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Color Region Extractor</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ background: #0e0e0e; color: #ccc; font-family: Georgia, serif; }}
  header {{ padding: 24px 32px 12px; }}
  h1 {{ font-weight: 300; font-size: 0.78rem; letter-spacing: 0.28em;
        text-transform: uppercase; color: #555; }}
  .stats {{ font-size: 0.7rem; color: #383838; letter-spacing: 0.1em;
            margin-top: 6px; }}
  .panels {{ display: flex; gap: 16px; padding: 12px 32px 32px; }}
  .panel {{ flex: 1; }}
  .label {{ font-size: 0.65rem; letter-spacing: 0.18em; text-transform: uppercase;
            color: #383838; margin-bottom: 8px; }}
  img, svg {{ width: 100%; display: block;
              border: 1px solid #1e1e1e; background: #000; }}
</style>
</head>
<body>
<header>
  <h1>Color Region Extractor</h1>
  <p class="stats">{len(svg_shapes)} shapes · {N_COLORS} colors · {MIN_AREA}px min area</p>
</header>
<div class="panels">
  <div class="panel">
    <p class="label">Original</p>
    <img src="data:image/jpeg;base64,{img_b64}" alt="original">
  </div>
  <div class="panel">
    <p class="label">Extracted regions</p>
    <svg viewBox="0 0 {orig_w} {orig_h}" xmlns="http://www.w3.org/2000/svg"
         style="aspect-ratio:{orig_w}/{orig_h}">
      {''.join(svg_shapes)}
    </svg>
  </div>
</div>
</body>
</html>"""

OUT_FILE.write_text(html, encoding='utf-8')
print(f"\nDone! Saved to: {OUT_FILE.resolve()}")

import subprocess, platform
try:
    if platform.system() == 'Darwin':
        subprocess.run(['open', str(OUT_FILE.resolve())])
    else:
        webbrowser.open(OUT_FILE.resolve().as_uri())
    print("Opening in browser…")
except Exception as e:
    print(f"Couldn't auto-open. Manually open this file in your browser:")
    print(f"  {OUT_FILE.resolve()}")
