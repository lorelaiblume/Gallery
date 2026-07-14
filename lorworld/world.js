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
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const host = document.getElementById('world');
const loading = document.getElementById('loading');

let W = innerWidth, H = innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(W, H);
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02040a);
scene.fog = new THREE.FogExp2(0x02040a, 0.011);

const camera = new THREE.PerspectiveCamera(65, W / H, 0.1, 1000);

// Two side-by-side worlds. You spawn between them.
const CLAUDE_WORLD = new THREE.Vector3(-44, 0, -16);
const LOR_WORLD = new THREE.Vector3(44, 0, -16);

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

// ── Lighting for the vehicle (neon sculptures use MeshBasic, unaffected) ──────
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.AmbientLight(0xffffff, 0.85));
scene.add(new THREE.HemisphereLight(0xbfe0ff, 0x202838, 0.6));
const vehicleLight = new THREE.DirectionalLight(0xffffff, 2.3);
vehicleLight.position.set(20, 40, 15);
scene.add(vehicleLight);

// ── Selective bloom: the neon world glows, the solid car stays crisp ──────────
// Bloom pass renders with the vehicle hidden; final pass adds that glow over the
// full (sharp) scene.
const bloomComposer = new EffectComposer(renderer);
bloomComposer.renderToScreen = false;
bloomComposer.addPass(new RenderPass(scene, camera));
bloomComposer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 1.3, 0.6, 0.0));

const mixPass = new ShaderPass(new THREE.ShaderMaterial({
  uniforms: {
    baseTexture: { value: null },
    bloomTexture: { value: bloomComposer.renderTarget2.texture },
  },
  vertexShader: `varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D baseTexture; uniform sampler2D bloomTexture; varying vec2 vUv;
    void main() { gl_FragColor = texture2D(baseTexture, vUv) + texture2D(bloomTexture, vUv); }`,
}), 'baseTexture');
mixPass.needsSwap = true;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(mixPass);
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
  group.userData.art = art;                          // the neon part that spins
  group.userData.spin = 0.0025 + Math.random() * 0.0035;
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
  const R = Math.max(22, 10 + N * 3.5);   // Lor's ring grows as you add drawings
  withArt.forEach((d, i) => {
    const g = buildSculpture(d.strokes, d.title || '');
    // Use the saved position/rotation if the drawing has one (set in Map mode),
    // otherwise fall back to the default circular layout.
    let x, z, ry;
    if (typeof d.x === 'number' && typeof d.z === 'number') {
      x = d.x; z = d.z;
      ry = (typeof d.ry === 'number') ? d.ry : (-(i / N) * Math.PI * 2 + Math.PI / 2);
    } else {
      const a = (i / N) * Math.PI * 2;
      x = LOR_WORLD.x + Math.cos(a) * R;
      z = LOR_WORLD.z + Math.sin(a) * R;
      ry = -a + Math.PI / 2;              // face Lor's World center
    }
    g.position.set(x, 0, z);
    g.rotation.set(0, ry, 0);
    g.userData.id = d.id;                 // Firestore doc id (for rename/delete/move)
    g.userData.title = d.title || '';
    initPhysics(g);                       // home = this (saved) position
    addHitPad(g);                         // invisible click target for Map mode
    scene.add(g);
    sculptures.push(g);
  });
  // After a rebuild (e.g. our own save landed), re-select the same drawing.
  if (selectedId) {
    const g = sculptures.find((s) => s.userData.id === selectedId);
    if (mode === 'map' && g) selectDrawing(g);
    else if (!g) selectDrawing(null);
  }
}

// ── "Add design" portal ──────────────────────────────────────────────────────
const PORTAL = LOR_WORLD.clone();
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
let db = null;
try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  db.collection('neonDrawings').orderBy('createdAt', 'asc').onSnapshot((snap) => {
    const docs = [];
    snap.forEach((doc) => {
      const d = doc.data();
      docs.push({ id: doc.id, title: d.title, strokes: d.strokes, x: d.x, z: d.z, ry: d.ry });
    });
    layoutFromDocs(docs);
  }, (err) => console.error('Firestore snapshot error:', err));
} catch (err) {
  console.warn('Firebase init failed:', err);
}

// ── Original generated sculptures — their own outer ring ─────────────────────
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
const generated = [
  { title: 'ring', strokes: [{ color: '#57e0c8', width: 12, pts: circlePts(500, 500, 340) }] },
  { title: 'heart', strokes: [{ color: '#ff2bd6', width: 12, pts: heartPts() }] },
  { title: 'spiral', strokes: [{ color: '#ffd23f', width: 10, pts: spiralPts() }] },
  { title: 'star', strokes: [{ color: '#4d8bff', width: 12, pts: starPts() }] },
  { title: 'wave', strokes: [{ color: '#7bff57', width: 12, pts: wavePts() }] },
];
const generatedGroups = [];
(function placeGenerated() {
  const R = 26, N = generated.length;
  generated.forEach((d, i) => {
    const a = (i / N) * Math.PI * 2;
    const g = buildSculpture(d.strokes, d.title);
    g.position.set(CLAUDE_WORLD.x + Math.cos(a) * R, 0, CLAUDE_WORLD.z + Math.sin(a) * R);
    g.rotation.y = -a + Math.PI / 2;   // face Claude's World center
    initPhysics(g);
    scene.add(g);
    generatedGroups.push(g);
  });
})();

// ── Floating world titles ────────────────────────────────────────────────────
function worldTitle(text, center, y, color) {
  const l = makeLabel(text, color, 4.6);
  l.material.fog = false;              // stay crisp from across the map
  l.position.set(center.x, y, center.z);
  scene.add(l);
}
worldTitle("Claude's World", CLAUDE_WORLD, 15, '#57e0c8');
worldTitle("Lor's World", LOR_WORLD, 18, '#ff2bd6');

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

// ── Near a Lor's World design → rename / delete ──────────────────────────────
const editPanel = document.getElementById('editPanel');
const editName = document.getElementById('editName');
const mapHintEl = document.getElementById('mapHint');
const rotWrap = document.getElementById('rotWrap');
let nearSculpt = null;
let selectedSculpt = null, selectedId = null;
// Whichever drawing the rename/delete/rotate buttons act on.
function editTarget() { return mode === 'map' ? selectedSculpt : nearSculpt; }
function updateNear() {
  if (mode === 'map') return;         // map mode drives the panel via selection instead
  if (paused) { editPanel.classList.add('hidden'); nearSculpt = null; return; }
  let best = null, bestD = 8;
  for (const g of sculptures) {
    const d = Math.hypot(player.x - g.position.x, player.z - g.position.z);
    if (d < bestD) { bestD = d; best = g; }
  }
  nearSculpt = best;
  if (best) { editName.textContent = best.userData.title || '(untitled)'; editPanel.classList.remove('hidden'); }
  else editPanel.classList.add('hidden');
}
function ruleError(e) {
  console.error(e);
  if (e && e.code === 'permission-denied') alert('Your database rules don’t allow this yet — we need to enable update & delete on neonDrawings.');
  else alert('Something went wrong: ' + (e && e.message ? e.message : 'unknown error'));
}
document.getElementById('renameBtn').addEventListener('click', async () => {
  const t = editTarget();
  if (!t || !db) return;
  const cur = t.userData.title || '';
  const name = (prompt('Rename this design:', cur) || '').trim();
  if (!name || name === cur) return;
  try { await db.collection('neonDrawings').doc(t.userData.id).update({ title: name }); }
  catch (e) { ruleError(e); }
});
document.getElementById('deleteBtn').addEventListener('click', async () => {
  const t = editTarget();
  if (!t || !db) return;
  const name = t.userData.title || 'this design';
  if (!confirm(`Delete “${name}”? This can’t be undone.`)) return;
  try { await db.collection('neonDrawings').doc(t.userData.id).delete(); }
  catch (e) { ruleError(e); }
});

// Rotate buttons (map mode) — rotate the selected drawing 15° and save to the DB.
function rotateSelected(delta) {
  if (mode !== 'map' || !selectedSculpt) return;
  const p = selectedSculpt.userData.phys;
  const ry = (p ? p.ry : selectedSculpt.rotation.y) + delta;
  if (p) p.ry = ry;
  selectedSculpt.rotation.y = ry;
  if (selectedSculpt.userData.home) selectedSculpt.userData.home.ry = ry;
  saveDrawingTransform(selectedSculpt);
}
document.getElementById('rotL').addEventListener('click', () => rotateSelected(Math.PI / 12));
document.getElementById('rotR').addEventListener('click', () => rotateSelected(-Math.PI / 12));

// ── Player / tank controls ───────────────────────────────────────────────────
const player = new THREE.Vector3(0, 0, 34);   // spawn between the two worlds
let heading = 0;                 // yaw, radians; 0 = looking toward -Z (toward both worlds)
let pitch = 0;                   // look up/down, radians
const EYE = 3.6;
const BOUND = 150;
// Top speeds + how quickly speed/turn ramp toward them (higher = snappier).
const MAX_SPEED = 1.1, MAX_TURN = 0.05, MOVE_ACCEL = 0.18, TURN_ACCEL = 0.22;
let speed = 0, turnSpeed = 0;   // eased each frame for smooth accel/decel
const PITCH_LIMIT = 1.2;
const keys = { fwd: false, back: false, left: false, right: false };

// ── Motion modes ─────────────────────────────────────────────────────────────
const MODE_LABELS = { firstPerson: 'First Person', flyover: 'Flyover', map: 'Map' };
let mode = 'firstPerson';
const modeNameEl = document.getElementById('modeName');
const modeKeyEls = [...document.querySelectorAll('.lw-mode-key')];
function updateModeHud() {
  if (modeNameEl) modeNameEl.textContent = MODE_LABELS[mode] || mode;
  modeKeyEls.forEach((el) => el.classList.toggle('active', el.dataset.mode === mode));
}
function setMode(m) {
  if (!MODE_LABELS[m] || m === mode) return;
  mode = m; updateModeHud();
  resetDrawings();   // switching modes snaps drawings back to their saved positions
  const inMap = (m === 'map');
  mapHintEl.classList.toggle('hidden', !inMap);
  selectDrawing(null);               // clear any selection on mode change
  if (!inMap) editPanel.classList.add('hidden');
}
modeKeyEls.forEach((el) => el.addEventListener('click', () => setMode(el.dataset.mode)));
updateModeHud();

// Flyover chase camera: sits behind the car following the heading, so the penguin
// leads when you drive. Drag orbits (flyOffset); driving eases it back behind.
let flyOffset = 0, flyPitch = 0.5, flyDist = 22;
const FLY_TARGET_Y = 3;

// Map (top-down) camera: pan center + height (zoom).
const mapCenter = { x: LOR_WORLD.x, z: LOR_WORLD.z };
let mapHeight = 95;

// Neon placeholder shown outside first-person until the car loads.
const avatar = new THREE.Group();
avatar.add(new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 20), new THREE.MeshBasicMaterial({ color: 0x1affff })));
const aNose = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.1, 18), new THREE.MeshBasicMaterial({ color: 0xff2bd6 }));
aNose.rotation.x = -Math.PI / 2; aNose.position.z = -1.7; avatar.add(aNose);
avatar.visible = false; scene.add(avatar);

// ── The car: assembled from two aligned Tinkercad exports (fiducial-cube method) ─
// rest-of-car.glb + wheels.glb share a fiducial cube at identical coords, so they
// line up. We drop the cube from each and spin the wheels around their shared axle.
const vehicle = new THREE.Group();
vehicle.visible = false; scene.add(vehicle);
let vehicleReady = false;
const VEHICLE_HEIGHT = 6;
let VEHICLE_FACE = Math.PI / 2;   // +90° left so the penguin faces forward
const WHEEL_SPIN = -0.6;   // sign flips the roll direction
const wheels = [];             // pivots that roll with speed

const _loader = new GLTFLoader();
function loadBaked(url) {
  return new Promise((resolve) => _loader.load(url, (gltf) => {
    gltf.scene.updateWorldMatrix(true, true);
    let mesh = null;
    gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
    const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrixWorld);   // bake to upright world coords
    resolve({ geo, mat: mesh.material });
  }));
}
// Drop the fiducial cube: the far-outlier triangles (the cube sits ~50 units away).
function dropCube(geo) {
  const pos = geo.attributes.position, n = pos.count;
  let mx = 0, my = 0, mz = 0;
  for (let i = 0; i < n; i++) { mx += pos.getX(i); my += pos.getY(i); mz += pos.getZ(i); }
  mx /= n; my /= n; mz /= n;
  let maxD = 0;
  for (let i = 0; i < n; i++) { const dx = pos.getX(i) - mx, dy = pos.getY(i) - my, dz = pos.getZ(i) - mz; maxD = Math.max(maxD, dx * dx + dy * dy + dz * dz); }
  const thr = maxD * 0.36;    // ≈ (0.6·maxDist)² → only the distant cube is beyond it
  const col = geo.attributes.color, ci = col ? col.itemSize : 0;
  const P = [], C = [];
  const farV = (v) => { const dx = pos.getX(v) - mx, dy = pos.getY(v) - my, dz = pos.getZ(v) - mz; return dx * dx + dy * dy + dz * dz > thr; };
  for (let t = 0; t < n; t += 3) {
    if (farV(t) || farV(t + 1) || farV(t + 2)) continue;
    for (const v of [t, t + 1, t + 2]) {
      P.push(pos.getX(v), pos.getY(v), pos.getZ(v));
      if (col) { C.push(col.getX(v), col.getY(v), col.getZ(v)); if (ci > 3) C.push(col.getW(v)); }
    }
  }
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  if (col) ng.setAttribute('color', new THREE.Float32BufferAttribute(C, ci));
  ng.computeVertexNormals();
  return ng;
}

Promise.all([loadBaked('rest-of-car.glb'), loadBaked('wheels.glb')]).then(([bodyD, wheelD]) => {
  const bodyGeo = dropCube(bodyD.geo);
  const wheelGeo = dropCube(wheelD.geo);
  [bodyD.mat, wheelD.mat].forEach((m) => { if ('envMapIntensity' in m) m.envMapIntensity = 1.7; });

  const asm = new THREE.Group();
  asm.add(new THREE.Mesh(bodyGeo, bodyD.mat));

  // Wheels roll around their axle (the longest bbox axis = the two-wheel separation).
  wheelGeo.computeBoundingBox();
  const wb = wheelGeo.boundingBox, wc = wb.getCenter(new THREE.Vector3()), ws = wb.getSize(new THREE.Vector3());
  const axle = (ws.x >= ws.y && ws.x >= ws.z) ? 'x' : (ws.y >= ws.z ? 'y' : 'z');
  wheelGeo.translate(axle === 'x' ? 0 : -wc.x, axle === 'y' ? 0 : -wc.y, axle === 'z' ? 0 : -wc.z);
  const wheelPivot = new THREE.Group();
  wheelPivot.position.set(axle === 'x' ? 0 : wc.x, axle === 'y' ? 0 : wc.y, axle === 'z' ? 0 : wc.z);
  wheelPivot.add(new THREE.Mesh(wheelGeo, wheelD.mat));
  wheelPivot.userData.axle = axle;
  asm.add(wheelPivot);
  wheels.push(wheelPivot);

  // Glass dome over the ball (body's bounding-box centre).
  bodyGeo.computeBoundingBox();
  const bb = bodyGeo.boundingBox, bc = bb.getCenter(new THREE.Vector3()), bs = bb.getSize(new THREE.Vector3());
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xdff2ff, metalness: 0, roughness: 0.08, transparent: true, opacity: 0.3,
    envMapIntensity: 1.4, side: THREE.DoubleSide, clearcoat: 0.85, clearcoatRoughness: 0.08,
  });
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), glassMat);
  canopy.scale.setScalar(Math.min(bs.x, bs.z) * 0.47);
  canopy.position.copy(bc);
  asm.add(canopy);

  // Centre on x/z and sit on the ground, then face + scale.
  const ab = new THREE.Box3().setFromObject(asm), asz = ab.getSize(new THREE.Vector3()), ac = ab.getCenter(new THREE.Vector3());
  asm.position.set(-ac.x, -ab.min.y, -ac.z);
  const rig = new THREE.Group();
  rig.add(asm);
  rig.rotation.y = VEHICLE_FACE;
  vehicle.add(rig);
  vehicle.scale.setScalar(VEHICLE_HEIGHT / asz.y);
  vehicleReady = true;
});

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

// Number keys switch view mode (ignored while the draw modal is open).
addEventListener('keydown', (e) => {
  if (paused) return;
  if (e.code === 'Digit1') setMode('firstPerson');
  else if (e.code === 'Digit2') setMode('flyover');
  else if (e.code === 'Digit3') setMode('map');
});

function updatePlayer() {
  if (!paused && mode !== 'map') {
    // Tank controls (first person + flyover). A/D turn, W/S move along the heading,
    // so the car (penguin = driver) always faces the way it drives. Speed & turn are
    // eased toward their targets so motion ramps smoothly instead of snapping.
    const turnTarget = ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) * MAX_TURN;
    turnSpeed += (turnTarget - turnSpeed) * TURN_ACCEL;
    heading += turnSpeed;

    const speedTarget = ((keys.fwd ? 1 : 0) - (keys.back ? 1 : 0)) * MAX_SPEED;
    speed += (speedTarget - speed) * MOVE_ACCEL;
    player.addScaledVector(forwardVec(), speed);
    // Roll the wheels around their axle in proportion to speed.
    if (Math.abs(speed) > 0.001) for (const w of wheels) w.rotation[w.userData.axle] += speed * WHEEL_SPIN;

    player.x = Math.max(-BOUND, Math.min(BOUND, player.x));
    player.z = Math.max(-BOUND, Math.min(BOUND, player.z));
    // While actually moving, ease the flyover camera back behind so the penguin leads.
    if (mode === 'flyover' && Math.abs(speed) > 0.02) flyOffset *= 0.85;
  }

  selectRing.visible = false;
  if (mode === 'map') {
    // Straight top-down camera. camera.up = -Z so "north" points up on screen.
    camera.up.set(0, 0, -1);
    camera.position.set(mapCenter.x, mapHeight, mapCenter.z);
    camera.lookAt(mapCenter.x, 0, mapCenter.z);
    if (selectedSculpt) {
      selectRing.visible = true;
      selectRing.position.set(selectedSculpt.position.x, 0.08, selectedSculpt.position.z);
    }
  } else if (mode === 'flyover') {
    camera.up.set(0, 1, 0);
    // Chase camera behind the car (A = -heading), plus your drag orbit offset.
    const tx = player.x, ty = FLY_TARGET_Y, tz = player.z;
    const A = -heading + flyOffset;
    const cp = Math.cos(flyPitch);
    camera.position.set(
      tx + Math.sin(A) * cp * flyDist,
      ty + Math.sin(flyPitch) * flyDist,
      tz + Math.cos(A) * cp * flyDist
    );
    camera.lookAt(tx, ty, tz);
  } else {
    camera.up.set(0, 1, 0);
    // First person: you ARE the penguin/driver, looking forward.
    camera.position.set(player.x, EYE, player.z);
    camera.lookAt(camera.position.clone().addScaledVector(lookVec(), 4));
  }

  // The car shows only in flyover.
  const showMarker = (mode === 'flyover');
  if (vehicleReady) {
    avatar.visible = false;
    vehicle.visible = showMarker;
    vehicle.position.set(player.x, 0, player.z);
    vehicle.rotation.y = -heading;   // local -Z (front) aligns with forwardVec
  } else {
    vehicle.visible = false;
    avatar.visible = showMarker;
    avatar.position.set(player.x, 1.3, player.z);
    avatar.rotation.y = -heading;
  }

  // "Add design" portal proximity → prompt, then enter to open the drawing tool.
  const dist = Math.hypot(player.x - PORTAL.x, player.z - PORTAL.z);
  if (!paused && mode !== 'map') {
    promptEl.classList.toggle('hidden', dist >= 8);
    if (dist < 3 && !insidePortal) { insidePortal = true; openModal(); }
    if (dist > 5) insidePortal = false;
  } else if (mode === 'map') {
    promptEl.classList.add('hidden');
  }
}

// ── Drag to look around (mouse / trackpad / touch) ───────────────────────────
const dom = renderer.domElement;
dom.style.touchAction = 'none';
dom.style.cursor = 'grab';
let dragging = false, lastX = 0, lastY = 0;
const LOOK_SENS = 0.0028;

// ── Map-mode editing: raycast to pick / move / rotate drawings ────────────────
const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let grabbed = null, panning = false;

const selectRing = new THREE.Mesh(
  new THREE.RingGeometry(4.4, 5.1, 48),
  new THREE.MeshBasicMaterial({ color: 0xffd23f, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
);
selectRing.rotation.x = -Math.PI / 2;
selectRing.position.y = 0.08;
selectRing.visible = false;
scene.add(selectRing);

function addHitPad(g) {
  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(4.6, 24),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.06;
  g.add(pad);
  g.userData.hitPad = pad;
}
function pointerNDC(e) {
  const r = dom.getBoundingClientRect();
  _ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  return _ndc;
}
function groundPoint(e) {
  _ray.setFromCamera(pointerNDC(e), camera);
  const p = new THREE.Vector3();
  return _ray.ray.intersectPlane(_ground, p) ? p : null;
}
function raycastPads(e) {
  _ray.setFromCamera(pointerNDC(e), camera);
  const pads = sculptures.map((g) => g.userData.hitPad).filter(Boolean);
  const hits = _ray.intersectObjects(pads, false);
  return hits.length ? hits[0].object.parent : null;
}
function selectDrawing(g) {
  selectedSculpt = g;
  selectedId = g ? g.userData.id : null;
  if (g) {
    editName.textContent = g.userData.title || '(untitled)';
    editPanel.classList.remove('hidden');
    rotWrap.classList.remove('hidden');
  } else {
    editPanel.classList.add('hidden');
    rotWrap.classList.add('hidden');
  }
}
// Debounced save of a drawing's position + rotation straight to Firestore.
const _saveTimers = new Map();
function saveDrawingTransform(g) {
  if (!db || !g || !g.userData.id) return;
  const id = g.userData.id;
  const ry = g.userData.phys ? g.userData.phys.ry : g.rotation.y;
  const data = { x: g.position.x, z: g.position.z, ry };
  clearTimeout(_saveTimers.get(id));
  _saveTimers.set(id, setTimeout(() => {
    db.collection('neonDrawings').doc(id).update(data).catch(ruleError);
    _saveTimers.delete(id);
  }, 250));
}

dom.addEventListener('pointerdown', (e) => {
  dragging = true; lastX = e.clientX; lastY = e.clientY;
  dom.setPointerCapture(e.pointerId); dom.style.cursor = 'grabbing';
  if (mode === 'map') {
    const hit = raycastPads(e);
    if (hit) { grabbed = hit; selectDrawing(hit); }
    else { grabbed = null; panning = true; selectDrawing(null); }
  }
});
dom.addEventListener('pointermove', (e) => {
  if (!dragging || paused) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  if (mode === 'map') {
    if (grabbed) {
      const p = groundPoint(e);
      if (p) {
        grabbed.position.x = p.x; grabbed.position.z = p.z;
        if (grabbed.userData.home) { grabbed.userData.home.x = p.x; grabbed.userData.home.z = p.z; }
      }
    } else if (panning) {
      const s = (2 * mapHeight * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / H;
      mapCenter.x -= dx * s;
      mapCenter.z -= dy * s;
    }
    lastX = e.clientX; lastY = e.clientY;
    return;
  }
  if (mode === 'flyover') {
    // Spin the camera around the car (to see the penguin) without turning the car.
    flyOffset -= dx * LOOK_SENS;
    flyPitch += dy * LOOK_SENS;
    flyPitch = Math.max(0.12, Math.min(1.35, flyPitch));
  } else {
    heading += dx * LOOK_SENS;
    pitch -= dy * LOOK_SENS;
    pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
  }
  lastX = e.clientX; lastY = e.clientY;
});
function endDrag() {
  dragging = false; dom.style.cursor = 'grab';
  if (mode === 'map' && grabbed) saveDrawingTransform(grabbed);   // save the move
  grabbed = null; panning = false;
}
dom.addEventListener('pointerup', endDrag);
dom.addEventListener('pointercancel', endDrag);
// Scroll to zoom (flyover distance, or map height).
dom.addEventListener('wheel', (e) => {
  if (mode === 'flyover') { flyDist = Math.max(9, Math.min(60, flyDist + e.deltaY * 0.03)); e.preventDefault(); }
  else if (mode === 'map') { mapHeight = Math.max(35, Math.min(200, mapHeight + e.deltaY * 0.1)); e.preventDefault(); }
}, { passive: false });

// ── Physics: the car shoves the neon drawings around (flyover only) ───────────
// Displacements live ONLY in memory — nothing is written to Firestore. Switching
// modes calls resetDrawings(), snapping everything back to the saved home positions.
const CAR_R = 4.5, SCULPT_R = 3.5;
const PUSH_BASE = 0.15, PUSH_K = 1.6;
const FRICTION = 0.9, SPIN_FRICTION = 0.9;
const TILT_K = 0.16, TILT_STIFF = 0.03, TILT_DAMP = 0.88, TILT_MAX = 1.4;

function initPhysics(g) {
  g.userData.home = { x: g.position.x, z: g.position.z, ry: g.rotation.y };
  g.userData.phys = { vx: 0, vz: 0, ry: g.rotation.y, vry: 0, tx: 0, vtx: 0, tz: 0, vtz: 0 };
}
function drawingGroups() { return sculptures.concat(generatedGroups); }
function resetDrawings() {
  for (const g of drawingGroups()) {
    const h = g.userData.home, p = g.userData.phys;
    if (!h || !p) continue;
    g.position.set(h.x, 0, h.z);
    g.rotation.set(0, h.ry, 0);
    if (g.userData.art) { g.userData.art.rotation.x = 0; g.userData.art.rotation.z = 0; }
    p.vx = p.vz = p.vry = p.tx = p.vtx = p.tz = p.vtz = 0;
    p.ry = h.ry;
  }
}
function updatePhysics() {
  const groups = drawingGroups();
  const carSpeed = Math.abs(speed);
  const cf = forwardVec();

  // Car → drawing: push out of overlap, add velocity/spin/tilt by hit strength.
  for (const g of groups) {
    const p = g.userData.phys; if (!p) continue;
    const dx = g.position.x - player.x, dz = g.position.z - player.z;
    const dist = Math.hypot(dx, dz), minD = CAR_R + SCULPT_R;
    if (dist < minD && dist > 1e-3) {
      const nx = dx / dist, nz = dz / dist, overlap = minD - dist;
      g.position.x += nx * overlap; g.position.z += nz * overlap;
      const hit = PUSH_BASE + carSpeed * PUSH_K;
      p.vx += nx * hit; p.vz += nz * hit;
      const cross = cf.x * nz - cf.z * nx;          // glancing hits → spin
      p.vry += cross * (0.02 + carSpeed * 0.06);
      p.vtx += nz * carSpeed * TILT_K;              // topple away from the hit
      p.vtz += -nx * carSpeed * TILT_K;
    }
  }

  // Drawing ↔ drawing: separate + trade velocity along the contact normal (domino).
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i], b = groups[j], pa = a.userData.phys, pb = b.userData.phys;
      if (!pa || !pb) continue;
      const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
      const dist = Math.hypot(dx, dz), minD = 2 * SCULPT_R;
      if (dist < minD && dist > 1e-3) {
        const nx = dx / dist, nz = dz / dist, overlap = minD - dist;
        a.position.x -= nx * overlap / 2; a.position.z -= nz * overlap / 2;
        b.position.x += nx * overlap / 2; b.position.z += nz * overlap / 2;
        const diff = (pb.vx * nx + pb.vz * nz) - (pa.vx * nx + pa.vz * nz);
        pa.vx += nx * diff; pa.vz += nz * diff;
        pb.vx -= nx * diff; pb.vz -= nz * diff;
        const t = Math.abs(diff) * 0.4;
        pa.vtx += nz * t; pa.vtz += -nx * t;
        pb.vtx += -nz * t; pb.vtz += nx * t;
      }
    }
  }

  // Integrate positions, decay velocities, and spring the tilt back upright.
  for (const g of groups) {
    const p = g.userData.phys; if (!p) continue;
    g.position.x = Math.max(-BOUND, Math.min(BOUND, g.position.x + p.vx));
    g.position.z = Math.max(-BOUND, Math.min(BOUND, g.position.z + p.vz));
    p.vx *= FRICTION; p.vz *= FRICTION;
    p.ry += p.vry; p.vry *= SPIN_FRICTION;
    p.vtx += -p.tx * TILT_STIFF; p.vtx *= TILT_DAMP; p.tx += p.vtx;
    p.vtz += -p.tz * TILT_STIFF; p.vtz *= TILT_DAMP; p.tz += p.vtz;
    p.tx = Math.max(-TILT_MAX, Math.min(TILT_MAX, p.tx));
    p.tz = Math.max(-TILT_MAX, Math.min(TILT_MAX, p.tz));
    g.rotation.y = p.ry;                 // yaw only → the ground ring stays flat & visible
    const art = g.userData.art;
    if (art) { art.rotation.x = p.tx; art.rotation.z = p.tz; }   // tilt just the drawing
  }
}

// ── Resize + loop ────────────────────────────────────────────────────────────
function resize() {
  W = innerWidth; H = innerHeight;
  renderer.setSize(W, H);
  bloomComposer.setSize(W, H);
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
  if (mode !== 'map') {   // freeze the decorative spin in Map mode so rotation is clear
    for (const g of sculptures) if (g.userData.art) g.userData.art.rotation.y += g.userData.spin;
    for (const g of generatedGroups) if (g.userData.art) g.userData.art.rotation.y += g.userData.spin;
  }
  updatePlayer();
  if (mode === 'flyover') updatePhysics();
  updateNear();
  // Bloom pass with the vehicle hidden, then the full-scene pass with bloom added.
  const vehicleWasVisible = vehicle.visible;
  vehicle.visible = false;
  bloomComposer.render();
  vehicle.visible = vehicleWasVisible;
  composer.render();
  if (!started) { started = true; loading.classList.add('hidden'); }
}
loop();
