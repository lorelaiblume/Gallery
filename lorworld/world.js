/* ============================================================================
   LorWorld — roam a TRON-like world of neon sculptures.
   Step 3a: world + WASD/arrow roaming + placeholder sculptures.
   Controls: W/↑ forward, S/↓ back, A/← turn left, D/→ turn right.
   ============================================================================ */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const host = document.getElementById('world');
const loading = document.getElementById('loading');

let W = innerWidth, H = innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(W, H);
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02040a);
scene.fog = new THREE.FogExp2(0x02040a, 0.014);

const camera = new THREE.PerspectiveCamera(65, W / H, 0.1, 1000);

// ── TRON floor: glowing grids ────────────────────────────────────────────────
const grid = new THREE.GridHelper(400, 200, 0x1affff, 0x0c3a4a);
grid.material.transparent = true;
grid.material.opacity = 0.65;
scene.add(grid);
const grid2 = new THREE.GridHelper(400, 40, 0x2affff, 0x145566);
grid2.material.transparent = true;
grid2.material.opacity = 0.5;
scene.add(grid2);

// A dark reflective-looking base plane just under the grid.
const base = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshBasicMaterial({ color: 0x02060a })
);
base.rotation.x = -Math.PI / 2;
base.position.y = -0.02;
scene.add(base);

// ── Bloom pipeline ───────────────────────────────────────────────────────────
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 1.3, 0.6, 0.0));
composer.addPass(new OutputPass());

// ── Label sprite ─────────────────────────────────────────────────────────────
function makeLabel(text, color = '#57e0c8', size = 2.4) {
  const fontPx = 64, pad = 16;
  const meas = document.createElement('canvas').getContext('2d');
  meas.font = `bold ${fontPx}px Karla, sans-serif`;
  const w = Math.ceil(meas.measureText(text).width) + pad * 2, h = fontPx + pad * 2;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.font = `bold ${fontPx}px Karla, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = color; ctx.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(size * (w / h), size, 1);
  return sp;
}

// ── Sculpture: strokes → glowing tubes, upright, on a pedestal ring ───────────
function buildSculpture(strokes, title) {
  const group = new THREE.Group();
  const art = new THREE.Group();

  strokes.forEach((s) => {
    if (!s.pts || s.pts.length < 2) return;
    const v = [];
    let prev = null;
    s.pts.forEach((p) => {
      const x = (p.x - 500) / 50, y = (500 - p.y) / 50;
      if (prev && Math.hypot(x - prev.x, y - prev.y) < 0.001) return;
      v.push(new THREE.Vector3(x, y, 0)); prev = { x, y };
    });
    if (v.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(v);
    const seg = Math.min(600, Math.max(12, v.length * 4));
    const r = Math.max(0.07, s.width * 0.022);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(s.color) });
    art.add(new THREE.Mesh(new THREE.TubeGeometry(curve, seg, r, 12, false), mat));
    const cap = new THREE.SphereGeometry(r, 10, 10);
    const a = new THREE.Mesh(cap, mat); a.position.copy(v[0]); art.add(a);
    const b = new THREE.Mesh(cap, mat); b.position.copy(v[v.length - 1]); art.add(b);
  });

  art.scale.setScalar(0.5);
  art.position.y = 5.5;          // lift so it stands above the floor
  group.add(art);

  // Glowing pedestal ring on the ground.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.6, 3.0, 48),
    new THREE.MeshBasicMaterial({ color: 0x1affff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  group.add(ring);

  if (title) {
    const lbl = makeLabel(title);
    lbl.position.set(0, 11, 0);
    group.add(lbl);
  }
  return group;
}

// ── Placeholder sample drawings (0..1000 space) — replaced by Firestore in 3b ─
function circlePts(cx, cy, r) {
  const p = []; for (let i = 0; i <= 60; i++) { const a = (i / 60) * Math.PI * 2; p.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); } return p;
}
function heartPts() {
  const p = []; for (let i = 0; i <= 80; i++) { const t = (i / 80) * Math.PI * 2; const x = 16 * Math.sin(t) ** 3; const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); p.push({ x: 500 + x * 14, y: 500 - y * 14 }); } return p;
}
function spiralPts() {
  const p = []; for (let i = 0; i <= 120; i++) { const t = i / 120; const a = t * Math.PI * 6; const r = 60 + t * 300; p.push({ x: 500 + Math.cos(a) * r, y: 500 + Math.sin(a) * r }); } return p;
}
function starPts() {
  const p = []; for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2; const r = i % 2 ? 150 : 360; p.push({ x: 500 + Math.cos(a) * r, y: 500 + Math.sin(a) * r }); } return p;
}
function wavePts() {
  const p = []; for (let i = 0; i <= 100; i++) { const x = 120 + i * 7.6; const y = 500 + Math.sin(i / 100 * Math.PI * 4) * 220; p.push({ x, y }); } return p;
}

const placeholders = [
  { title: 'ring', strokes: [{ color: '#57e0c8', width: 12, pts: circlePts(500, 500, 340) }] },
  { title: 'heart', strokes: [{ color: '#ff2bd6', width: 12, pts: heartPts() }] },
  { title: 'spiral', strokes: [{ color: '#ffd23f', width: 10, pts: spiralPts() }] },
  { title: 'star', strokes: [{ color: '#4d8bff', width: 12, pts: starPts() }] },
  { title: 'wave', strokes: [{ color: '#7bff57', width: 12, pts: wavePts() }] },
];

// Arrange sculptures in a ring around the origin.
const sculptures = [];
function layoutSculptures(items) {
  const R = 34;
  items.forEach((d, i) => {
    const a = (i / items.length) * Math.PI * 2;
    const g = buildSculpture(d.strokes, d.title);
    g.position.set(Math.cos(a) * R, 0, Math.sin(a) * R);
    g.rotation.y = -a + Math.PI / 2;   // face the center
    scene.add(g);
    sculptures.push(g);
  });
}
layoutSculptures(placeholders);

// ── Player / tank controls ───────────────────────────────────────────────────
const player = new THREE.Vector3(0, 0, 0);
let heading = 0;                 // yaw, radians; 0 = looking toward -Z
let pitch = 0;                   // look up/down, radians
const EYE = 3.6;
const MOVE = 0.24, TURN = 0.033, BOUND = 150;
const PITCH_LIMIT = 1.2;
const keys = { fwd: false, back: false, left: false, right: false };

// Horizontal forward (movement follows yaw only, so W/S never fly).
function forwardVec() { return new THREE.Vector3(Math.sin(heading), 0, -Math.cos(heading)); }
// Full look direction including pitch (for where the camera aims).
function lookVec() {
  const cp = Math.cos(pitch);
  return new THREE.Vector3(Math.sin(heading) * cp, Math.sin(pitch), -Math.cos(heading) * cp);
}

addEventListener('keydown', (e) => {
  switch (e.code) {
    case 'KeyW': case 'ArrowUp': keys.fwd = true; e.preventDefault(); break;
    case 'KeyS': case 'ArrowDown': keys.back = true; e.preventDefault(); break;
    case 'KeyA': case 'ArrowLeft': keys.left = true; e.preventDefault(); break;
    case 'KeyD': case 'ArrowRight': keys.right = true; e.preventDefault(); break;
  }
});
addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'KeyW': case 'ArrowUp': keys.fwd = false; break;
    case 'KeyS': case 'ArrowDown': keys.back = false; break;
    case 'KeyA': case 'ArrowLeft': keys.left = false; break;
    case 'KeyD': case 'ArrowRight': keys.right = false; break;
  }
});

function updatePlayer() {
  if (keys.left) heading -= TURN;
  if (keys.right) heading += TURN;
  const f = forwardVec();
  if (keys.fwd) player.addScaledVector(f, MOVE);
  if (keys.back) player.addScaledVector(f, -MOVE);
  player.x = Math.max(-BOUND, Math.min(BOUND, player.x));
  player.z = Math.max(-BOUND, Math.min(BOUND, player.z));
  camera.position.set(player.x, EYE, player.z);
  camera.lookAt(camera.position.clone().addScaledVector(lookVec(), 4));
}

// ── Drag to look around (mouse / trackpad / touch) ───────────────────────────
const dom = renderer.domElement;
dom.style.touchAction = 'none';
dom.style.cursor = 'grab';
let dragging = false, lastX = 0, lastY = 0;
const LOOK_SENS = 0.0028;
dom.addEventListener('pointerdown', (e) => {
  dragging = true; lastX = e.clientX; lastY = e.clientY;
  dom.setPointerCapture(e.pointerId); dom.style.cursor = 'grabbing';
});
dom.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  heading += (e.clientX - lastX) * LOOK_SENS;
  pitch -= (e.clientY - lastY) * LOOK_SENS;
  pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
  lastX = e.clientX; lastY = e.clientY;
});
function endDrag() { dragging = false; dom.style.cursor = 'grab'; }
dom.addEventListener('pointerup', endDrag);
dom.addEventListener('pointercancel', endDrag);

// ── Resize + loop ────────────────────────────────────────────────────────────
function resize() {
  W = innerWidth; H = innerHeight;
  renderer.setSize(W, H);
  composer.setSize(W, H);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
updatePlayer();

let started = false;
function loop() {
  requestAnimationFrame(loop);
  updatePlayer();
  composer.render();
  if (!started) { started = true; loading.classList.add('hidden'); }
}
loop();
