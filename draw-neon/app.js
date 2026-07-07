/* ============================================================================
   Draw Neon — drawing surface (vector / SVG) + live neon hookup
   stroke = { color: '#rrggbb', width: Number, pts: [{x,y}, ...] }   x,y in 0..1000
   ============================================================================ */

import { initNeon } from './neon.js';

const svg = document.getElementById('draw');
const colorPicker = document.getElementById('colorPicker');
const widthSlider = document.getElementById('widthSlider');
const widthOut = document.getElementById('widthOut');
const penBtn = document.getElementById('penBtn');
const eraserBtn = document.getElementById('eraserBtn');
const undoBtn = document.getElementById('undoBtn');
const clearBtn = document.getElementById('clearBtn');
const placeholder = document.getElementById('neonPlaceholder');
const tip = document.getElementById('tip');
const NS = 'http://www.w3.org/2000/svg';
const VB = 1000;

export const strokes = [];
let live = null;                 // in-progress stroke (for live neon)
let drawing = false, mode = 'pen', snapped = false, curPath = null, holdTimer = null;
let neon = null;

function changed() {
  placeholder.style.display = (strokes.length || (live && live.pts.length > 1)) ? 'none' : '';
  if (neon) neon.markDirty();
}

// ── Coordinate mapping ───────────────────────────────────────────────────────
function toVB(e) {
  const r = svg.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * VB, y: ((e.clientY - r.top) / r.height) * VB };
}

// ── SVG path from points (quadratic smoothing) ───────────────────────────────
function pathD(pts) {
  if (!pts.length) return '';
  if (pts.length === 1) { const p = pts[0]; return `M ${p.x} ${p.y} L ${p.x + 0.01} ${p.y}`; }
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
    d += ` Q ${pts[i].x} ${pts[i].y} ${mx} ${my}`;
  }
  const l = pts[pts.length - 1];
  return d + ` L ${l.x} ${l.y}`;
}
function mkPath(s) {
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', pathD(s.pts));
  p.setAttribute('stroke', s.color);
  p.setAttribute('stroke-width', s.width);
  return p;
}
function render() {
  svg.innerHTML = '';
  strokes.forEach((s) => svg.appendChild(mkPath(s)));
  changed();
}

// ── Shape-lock (Procreate-style): snap circles & straight lines on hold ──────
function detectShape(pts) {
  let cx = 0, cy = 0;
  pts.forEach((p) => { cx += p.x; cy += p.y; });
  cx /= pts.length; cy /= pts.length;
  const rs = pts.map((p) => Math.hypot(p.x - cx, p.y - cy));
  const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
  const sd = Math.sqrt(rs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / rs.length);
  const closed = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  if (mean > 40 && sd / mean < 0.20 && closed < mean * 1.3) {
    const out = [], N = 64;
    for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI * 2; out.push({ x: cx + Math.cos(a) * mean, y: cy + Math.sin(a) * mean }); }
    return { type: 'circle', pts: out };
  }
  const A = pts[0], B = pts[pts.length - 1], len = Math.hypot(B.x - A.x, B.y - A.y);
  if (len > 60) {
    let md = 0;
    pts.forEach((p) => { const d = Math.abs((B.y - A.y) * p.x - (B.x - A.x) * p.y + B.x * A.y - B.y * A.x) / len; if (d > md) md = d; });
    if (md < Math.max(14, len * 0.06)) return { type: 'line', pts: [A, B] };
  }
  return null;
}
function trySnap() {
  if (!drawing || mode !== 'pen' || snapped || !live || live.pts.length < 8) return;
  const s = detectShape(live.pts);
  if (s) {
    live.pts = s.pts; snapped = true;
    curPath.setAttribute('d', pathD(live.pts));
    tip.textContent = `Snapped to a perfect ${s.type}. Lift to keep it.`;
    changed();
  }
}
function scheduleHold() { if (holdTimer) clearTimeout(holdTimer); holdTimer = setTimeout(trySnap, 350); }

// ── Eraser ───────────────────────────────────────────────────────────────────
function erase(vb) {
  const before = strokes.length;
  const kept = strokes.filter((s) => {
    const hitR = s.width / 2 + 18;
    return !s.pts.some((p) => Math.hypot(p.x - vb.x, p.y - vb.y) < hitR);
  });
  if (kept.length !== before) { strokes.length = 0; strokes.push(...kept); render(); }
}

// ── Pointer events ───────────────────────────────────────────────────────────
svg.addEventListener('pointerdown', (e) => {
  svg.setPointerCapture(e.pointerId);
  drawing = true;
  const vb = toVB(e);
  if (mode === 'eraser') { erase(vb); return; }
  snapped = false;
  live = { color: colorPicker.value, width: +widthSlider.value, pts: [vb] };
  curPath = mkPath(live);
  svg.appendChild(curPath);
  scheduleHold();
});
svg.addEventListener('pointermove', (e) => {
  if (!drawing) return;
  const vb = toVB(e);
  if (mode === 'eraser') { erase(vb); return; }
  if (snapped) return;
  const last = live.pts[live.pts.length - 1];
  if (Math.hypot(vb.x - last.x, vb.y - last.y) < 2) return;
  live.pts.push(vb);
  curPath.setAttribute('d', pathD(live.pts));
  changed();
  scheduleHold();
});
function stop() {
  if (!drawing) return;
  drawing = false;
  if (holdTimer) clearTimeout(holdTimer);
  if (mode === 'eraser') return;
  if (live && live.pts.length > 1) strokes.push(live);
  else if (curPath) curPath.remove();
  live = null; curPath = null; snapped = false;
  changed();
}
svg.addEventListener('pointerup', stop);
svg.addEventListener('pointercancel', stop);
svg.addEventListener('pointerleave', stop);

// ── Tools ────────────────────────────────────────────────────────────────────
function setMode(m) {
  mode = m;
  penBtn.classList.toggle('active', m === 'pen');
  eraserBtn.classList.toggle('active', m === 'eraser');
  svg.classList.toggle('erasing', m === 'eraser');
  tip.textContent = m === 'eraser'
    ? 'Eraser: drag over strokes to remove them.'
    : 'Tip: draw a circle or line and hold still at the end to snap it perfect.';
}
penBtn.addEventListener('click', () => setMode('pen'));
eraserBtn.addEventListener('click', () => setMode('eraser'));
widthSlider.addEventListener('input', () => { widthOut.textContent = widthSlider.value; });
undoBtn.addEventListener('click', () => { strokes.pop(); render(); });
clearBtn.addEventListener('click', () => { strokes.length = 0; render(); });

render();

// ── Live neon (step 1b) — kept in a separate module so drawing works even if
// the Three.js CDN is unavailable. ──────────────────────────────────────────
try {
  neon = initNeon(() => ({ strokes, live }), document.getElementById('neonStage'));
} catch (err) {
  console.warn('Neon renderer failed to init:', err);
}
