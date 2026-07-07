/* ============================================================================
   Draw Neon — neon renderer: strokes → glowing 3D tubes (UnrealBloomPass)
   initNeon(getState, container) → { markDirty() }
   getState() returns { strokes, live } from the drawing module.
   ============================================================================ */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export function initNeon(getState, container) {
  let W = container.clientWidth || 500;
  let H = container.clientHeight || 500;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(W, H);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 1000);
  camera.position.set(0, 0, 24);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;

  const grid = new THREE.GridHelper(60, 30, 0x0e1626, 0x0a0f18);
  grid.position.y = -11;
  scene.add(grid);

  const group = new THREE.Group();
  scene.add(group);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 1.5, 0.5, 0.0));
  composer.addPass(new OutputPass());

  // ── Build one neon tube (with rounded caps) from a stroke ──────────────────
  function tubeFor(s) {
    if (!s.pts || s.pts.length < 2) return null;
    const v = [];
    let prev = null;
    s.pts.forEach((p) => {
      const x = (p.x - 500) / 50, y = (500 - p.y) / 50;
      if (prev && Math.hypot(x - prev.x, y - prev.y) < 0.001) return;
      v.push(new THREE.Vector3(x, y, 0));
      prev = { x, y };
    });
    if (v.length < 2) return null;

    const curve = new THREE.CatmullRomCurve3(v);
    const seg = Math.min(600, Math.max(12, v.length * 4));
    const r = Math.max(0.06, s.width * 0.02);
    const col = new THREE.Color(s.color);
    const mat = new THREE.MeshBasicMaterial({ color: col });

    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, seg, r, 12, false), mat));
    const cap = new THREE.SphereGeometry(r, 12, 12);
    const s0 = new THREE.Mesh(cap, mat); s0.position.copy(v[0]); g.add(s0);
    const s1 = new THREE.Mesh(cap, mat); s1.position.copy(v[v.length - 1]); g.add(s1);
    return g;
  }

  function rebuild() {
    while (group.children.length) {
      const c = group.children.pop();
      c.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
    const { strokes, live } = getState();
    const all = strokes.slice();
    if (live && live.pts.length > 1) all.push(live);
    all.forEach((s) => { const t = tubeFor(s); if (t) group.add(t); });
  }

  function resize() {
    W = container.clientWidth; H = container.clientHeight;
    if (!W || !H) return;
    renderer.setSize(W, H);
    composer.setSize(W, H);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  let dirty = true, last = 0;
  function loop(t) {
    requestAnimationFrame(loop);
    if (dirty && t - last > 50) { rebuild(); dirty = false; last = t; }
    controls.update();
    composer.render();
  }
  loop(0);

  return { markDirty() { dirty = true; } };
}
