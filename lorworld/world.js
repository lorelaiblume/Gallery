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

// ── Sculptures loaded from Firestore, arranged in circular order ─────────────
const sculptures = [];
function disposeGroup(g) {
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach((x) => { if (x.map) x.map.dispose(); x.dispose(); }); }
  });
}
function layoutFromDocs(docs) {
  sculptures.forEach((g) => { scene.remove(g); disposeGroup(g); });
  sculptures.length = 0;
  const withArt = docs.filter((d) => d.strokes && d.strokes.length);
  const N = withArt.length;
  const R = Math.max(30, 12 + N * 4);   // grow the ring as the collection grows
  withArt.forEach((d, i) => {
    const a = (i / N) * Math.PI * 2;
    const g = buildSculpture(d.strokes, d.title || '');
    g.position.set(Math.cos(a) * R, 0, Math.sin(a) * R);
    g.rotation.y = -a + Math.PI / 2;    // face the center
    scene.add(g);
    sculptures.push(g);
  });
}

// ── "Add design" portal ──────────────────────────────────────────────────────
const PORTAL = new THREE.Vector3(0, 0, -16);
const portal = new THREE.Group();
const portalRing = new THREE.Mesh(
  new THREE.RingGeometry(2.4, 2.9, 64),
  new THREE.MeshBasicMaterial({ color: 0xff2bd6, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
);
portalRing.rotation.x = -Math.PI / 2; portalRing.position.y = 0.03; portal.add(portalRing);
const portalBeam = new THREE.Mesh(
  new THREE.CylinderGeometry(2.4, 2.4, 12, 40, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xff2bd6, transparent: true, opacity: 0.07, side: THREE.DoubleSide })
);
portalBeam.position.y = 6; portal.add(portalBeam);
const portalPlus = makeLabel('+', '#ff2bd6', 3.2); portalPlus.position.set(0, 3, 0); portal.add(portalPlus);
const portalLabel = makeLabel('ADD DESIGN', '#ff2bd6', 1.5); portalLabel.position.set(0, 6.6, 0); portal.add(portalLabel);
portal.position.copy(PORTAL); scene.add(portal);

// ── Firebase: live-load saved drawings as sculptures ─────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBqcTGjJDyGk71hrbqo9fQk5Iz82LMuEz0",
  authDomain: "lorelai-blume-gallery.firebaseapp.com",
  projectId: "lorelai-blume-gallery",
  storageBucket: "lorelai-blume-gallery.firebasestorage.app",
  messagingSenderId: "921923872934",
  appId: "1:921923872934:web:2177895d7817a267132c67",
  measurementId: "G-53XC5MSN88",
};
try {
  firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();
  db.collection('neonDrawings').orderBy('createdAt', 'asc').onSnapshot((snap) => {
    const docs = [];
    snap.forEach((doc) => { const d = doc.data(); docs.push({ title: d.title, strokes: d.strokes }); });
    layoutFromDocs(docs);
  }, (err) => console.error('Firestore snapshot error:', err));
} catch (err) {
  console.warn('Firebase init failed:', err);
}

// ── Draw portal modal + pause ────────────────────────────────────────────────
const promptEl = document.getElementById('prompt');
const modal = document.getElementById('modal');
const drawFrame = document.getElementById('drawFrame');
let paused = false, insidePortal = false;
function keysReset() { keys.fwd = keys.back = keys.left = keys.right = false; }
function openModal() {
  paused = true; keysReset();
  promptEl.classList.add('hidden');
  drawFrame.src = '/draw-neon?embed=1';
  modal.classList.remove('hidden');
}
function closeModal() {
  modal.classList.add('hidden');
  drawFrame.src = '';
  paused = false;   // insidePortal stays true until you step out, so it won't reopen
}
document.getElementById('modalClose').addEventListener('click', closeModal);
addEventListener('message', (e) => { if (e.data && e.data.type === 'neon-saved') closeModal(); });

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
  if (!paused) {
    if (keys.left) heading -= TURN;
    if (keys.right) heading += TURN;
    const f = forwardVec();
    if (keys.fwd) player.addScaledVector(f, MOVE);
    if (keys.back) player.addScaledVector(f, -MOVE);
    player.x = Math.max(-BOUND, Math.min(BOUND, player.x));
    player.z = Math.max(-BOUND, Math.min(BOUND, player.z));
  }
  camera.position.set(player.x, EYE, player.z);
  camera.lookAt(camera.position.clone().addScaledVector(lookVec(), 4));

  // "Add design" portal proximity → prompt, then enter to open the drawing tool.
  const dist = Math.hypot(player.x - PORTAL.x, player.z - PORTAL.z);
  if (!paused) {
    promptEl.classList.toggle('hidden', dist >= 8);
    if (dist < 3 && !insidePortal) { insidePortal = true; openModal(); }
    if (dist > 5) insidePortal = false;
  }
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
  if (!dragging || paused) return;
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

addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && !modal.classList.contains('hidden')) closeModal();
});

let started = false;
function loop(t) {
  requestAnimationFrame(loop);
  const tt = (t || 0) * 0.001;
  portalRing.material.opacity = 0.55 + 0.35 * Math.sin(tt * 2.5);
  portalRing.scale.setScalar(1 + 0.05 * Math.sin(tt * 2.5));
  updatePlayer();
  composer.render();
  if (!started) { started = true; loading.classList.add('hidden'); }
}
loop();
