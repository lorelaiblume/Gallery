import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ============================================================================
   3D Concepts — slide framework
   Each slide provides { title, body (HTML), build(stage) }.
   build() receives a Stage (scene/camera/renderer/controls already wired) and
   may return { update(t) } for per-frame animation.
   Only the active slide holds a live WebGL context; leaving a slide disposes it.
   ============================================================================ */

const COL = {
  x: 0xff5c6c,   // red   — X
  y: 0x6cff9e,   // green — Y
  z: 0x5c9dff,   // blue  — Z
  accent: 0x57e0c8,
  ink: 0xeef1f6,
};

// ── Shared helpers ──────────────────────────────────────────────────────────

// Text label as a camera-facing sprite. The canvas is sized to the text so
// nothing clips, and the sprite is scaled to keep the text's aspect ratio.
// `size` is the label's world height.
function makeLabel(text, color = '#eef1f6', size = 0.42) {
  const fontPx = 64, pad = 14;
  const meas = document.createElement('canvas').getContext('2d');
  meas.font = `bold ${fontPx}px Karla, sans-serif`;
  const w = Math.ceil(meas.measureText(text).width) + pad * 2;
  const h = fontPx + pad * 2;

  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.font = `bold ${fontPx}px Karla, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(size * (w / h), size, 1);
  return sprite;
}

// A single colored axis with an arrowhead and a letter label.
function makeAxis(dir, length, colorHex, label) {
  const g = new THREE.Group();
  const color = new THREE.Color(colorHex);
  const end = dir.clone().multiplyScalar(length);

  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), end]),
    new THREE.LineBasicMaterial({ color })
  );
  g.add(line);

  const head = new THREE.Mesh(
    new THREE.ConeGeometry(0.09, 0.28, 16),
    new THREE.MeshBasicMaterial({ color })
  );
  head.position.copy(end);
  head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  g.add(head);

  const lbl = makeLabel(label, '#' + color.getHexString());
  lbl.position.copy(end).addScaledVector(dir.clone().normalize(), 0.32);
  g.add(lbl);

  return g;
}

// The standard X/Y/Z triad + faint ground grid, added to a scene.
function addAxes(scene, len = 3) {
  scene.add(makeAxis(new THREE.Vector3(1, 0, 0), len, COL.x, 'X'));
  scene.add(makeAxis(new THREE.Vector3(0, 1, 0), len, COL.y, 'Y'));
  scene.add(makeAxis(new THREE.Vector3(0, 0, 1), len, COL.z, 'Z'));
  const grid = new THREE.GridHelper(2 * len, 2 * len, 0x2a3242, 0x1c2230);
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  scene.add(grid);
}

function dashedSegment(a, b, colorHex) {
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  const line = new THREE.Line(geo, new THREE.LineDashedMaterial({
    color: colorHex, dashSize: 0.14, gapSize: 0.09,
  }));
  line.computeLineDistances();
  return line;
}

// Arrow (shaft + head) as a Group, from origin along dir with given length.
function makeArrow(origin, dir, length, colorHex, headLen = 0.3, shaftR = 0.03) {
  const g = new THREE.Group();
  const color = new THREE.Color(colorHex);
  const d = dir.clone().normalize();
  const shaftLen = Math.max(0.001, length - headLen);

  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(shaftR, shaftR, shaftLen, 16),
    new THREE.MeshBasicMaterial({ color })
  );
  shaft.position.set(0, shaftLen / 2, 0);
  const head = new THREE.Mesh(
    new THREE.ConeGeometry(headLen * 0.45, headLen, 20),
    new THREE.MeshBasicMaterial({ color })
  );
  head.position.set(0, shaftLen + headLen / 2, 0);
  g.add(shaft, head);

  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  g.position.copy(origin);
  return g;
}

// Procedural brick texture drawn to a canvas (no external image needed).
function brickTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a2320';           // mortar
  ctx.fillRect(0, 0, 256, 256);
  const rows = 8, bh = 256 / rows, bw = 64, gap = 4;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * (bw / 2);
    for (let x = -bw; x < 256 + bw; x += bw) {
      const bx = x + off + gap / 2;
      const by = r * bh + gap / 2;
      const v = 0.82 + Math.random() * 0.18;
      ctx.fillStyle = `rgb(${Math.round(150 * v)},${Math.round(70 * v)},${Math.round(55 * v)})`;
      ctx.fillRect(bx, by, bw - gap, bh - gap);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Procedural marble texture: pale base with soft grey veins.
function marbleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, '#f3f1ec');
  grad.addColorStop(1, '#dcd8cf');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 22; i++) {
    ctx.strokeStyle = `rgba(120,120,130,${0.06 + Math.random() * 0.12})`;
    ctx.beginPath();
    let x = Math.random() * 256, y = Math.random() * 256;
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (Math.random() - 0.5) * 90;
      y += (Math.random() - 0.5) * 90;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A text sprite whose text can be rewritten each frame (for live readouts).
// Returns a Sprite with an added .setText(str) method.
function makeDynamicLabel(color = '#eef1f6', size = 0.5) {
  const fontPx = 64, pad = 14, W = 512, H = fontPx + pad * 2;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(size * (W / H), size, 1);
  sprite.setText = (text) => {
    ctx.clearRect(0, 0, W, H);
    ctx.font = `bold ${fontPx}px Karla, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, W / 2, H / 2);
    tex.needsUpdate = true;
  };
  return sprite;
}

// Rounded-rectangle path helper for canvas drawing.
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A billboard-ish "file card": a flat panel textured with a filename and a few
// lines of body text, framed in an accent color. `lines` is an array of
// { text, color?, mono? }. Returns a Mesh (world width ~= wWorld).
function makeFileCard(lines, accent = '#57e0c8', wWorld = 2.0) {
  const CW = 400, LH = 54, padY = 30, padX = 28;
  const CH = padY * 2 + lines.length * LH;
  const c = document.createElement('canvas');
  c.width = CW; c.height = CH;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#10151f';
  roundRect(ctx, 0, 0, CW, CH, 20); ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = accent;
  roundRect(ctx, 3, 3, CW - 6, CH - 6, 18); ctx.stroke();

  lines.forEach((ln, i) => {
    ctx.font = ln.mono ? '30px monospace' : `${i === 0 ? 'bold ' : ''}32px Karla, sans-serif`;
    ctx.fillStyle = ln.color || '#eef1f6';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(ln.text, padX, padY + LH * i + LH / 2);
  });

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const hWorld = wWorld * CH / CW;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(wWorld, hWorld),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
  );
}

// A live "raw bytes" panel: a grid of 0/1 that reshuffles a few times a second,
// with a scatter of highlighted bits. Returns { mesh, tick(t) }.
function makeBinaryPanel(wWorld = 4.4) {
  const CW = 660, CH = 380, cols = 30, rows = 16;
  const c = document.createElement('canvas');
  c.width = CW; c.height = CH;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(wWorld, wWorld * CH / CW),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
  );
  const cw = CW / cols, ch = CH / rows;
  let last = -1;
  function redraw() {
    ctx.fillStyle = '#0a0f18';
    ctx.fillRect(0, 0, CW, CH);
    ctx.font = '20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const bit = Math.random() < 0.5 ? '0' : '1';
        const hot = Math.random() < 0.10;
        ctx.fillStyle = hot ? '#57e0c8' : (bit === '1' ? '#43597f' : '#1d2736');
        ctx.fillText(bit, col * cw + cw / 2, r * ch + ch / 2);
      }
    }
    tex.needsUpdate = true;
  }
  redraw();
  return {
    mesh,
    tick(t) { const s = Math.floor(t * 4); if (s !== last) { last = s; redraw(); } },
  };
}

// ── Stage: one live renderer/scene/camera/controls bound to a container ──────

class Stage {
  constructor(container) {
    this.container = container;
    const w = container.clientWidth || 600;
    const h = container.clientHeight || 420;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    this.camera.position.set(5, 4, 7);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);

    this.clock = new THREE.Clock();
    this._raf = null;
    this._update = null;
  }

  setUpdate(fn) { this._update = fn; }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  start() {
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      const t = this.clock.getElapsedTime();
      if (this._update) this._update(t);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    this.controls.dispose();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      }
    });
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}

// ── Slides ──────────────────────────────────────────────────────────────────

const slides = [
  {
    title: 'How do we represent a point in 3D space?',
    body: `
      <p>On the flat coordinate plane a point needs two numbers: <code>(x, y)</code> —
      how far <strong>right</strong> and how far <strong>up</strong>.</p>
      <p>To locate a point in 3D we simply add a third axis, <strong>Z</strong>, pointing
      out of the plane toward us. Now every point is an ordered triple
      <code>(x, y, z)</code>: right, up, and toward the viewer.</p>
      <p>The green point below sits at <code>(2, 3, 1.5)</code>. The dashed lines trace
      how those three numbers combine — walk 2 along X, 1.5 along Z, then 3 up along Y —
      to pin down exactly one location in space. Drag to orbit and see it from every side.</p>
    `,
    build(stage) {
      const { scene, camera, controls } = stage;
      scene.add(new THREE.AmbientLight(0xffffff, 0.9));
      addAxes(scene, 3.4);

      const P = new THREE.Vector3(2, 3, 1.5);

      // Glowing point.
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 32, 32),
        new THREE.MeshBasicMaterial({ color: COL.y })
      );
      dot.position.copy(P);
      scene.add(dot);
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.26, 24, 24),
        new THREE.MeshBasicMaterial({ color: COL.y, transparent: true, opacity: 0.18 })
      );
      halo.position.copy(P);
      scene.add(halo);

      // Decomposition path: O → x → (x,0,z) → P, each leg colored by its axis.
      const O = new THREE.Vector3(0, 0, 0);
      const A = new THREE.Vector3(P.x, 0, 0);
      const B = new THREE.Vector3(P.x, 0, P.z);
      scene.add(dashedSegment(O, A, COL.x));   // along X
      scene.add(dashedSegment(A, B, COL.z));   // along Z
      scene.add(dashedSegment(B, P, COL.y));   // up along Y
      // Faint direct line from origin to the point.
      scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([O, P]),
        new THREE.LineBasicMaterial({ color: 0x57e0c8, transparent: true, opacity: 0.35 })
      ));

      const label = makeLabel('(2, 3, 1.5)', '#6cff9e', 0.5);
      label.position.copy(P).add(new THREE.Vector3(0, 0.5, 0));
      scene.add(label);

      camera.position.set(5.5, 4.5, 6.5);
      controls.target.set(1, 1.4, 0.75);
      controls.update();

      // Gentle halo pulse.
      stage.setUpdate((t) => {
        const s = 1 + Math.sin(t * 2) * 0.12;
        halo.scale.setScalar(s);
      });
    },
  },

  {
    title: 'How would you represent a polygon in 3D space?',
    body: `
      <p>A <strong>polygon</strong> is a flat shape whose corners — the
      <strong>vertices</strong> — are points in 3D space. You store it as an
      <em>ordered</em> list of those points: <code>[v₀, v₁, v₂, …]</code>.</p>
      <p>Consecutive vertices are joined by <strong>edges</strong>, and the loop
      closes back to the start, enclosing a filled <strong>face</strong>. Because
      the vertices are full <code>(x, y, z)</code> triples, the polygon can sit at
      any angle in space — here's a pentagon tilted off the ground plane.</p>
      <p>The corners all lie on one flat plane, but that plane itself floats freely
      in 3D. Orbit around to confirm it really is flat.</p>
    `,
    build(stage) {
      const { scene, camera, controls } = stage;
      scene.add(new THREE.AmbientLight(0xffffff, 0.9));
      addAxes(scene, 3);

      // Pentagon vertices on a tilted plane.
      const n = 5, R = 2;
      const tilt = new THREE.Euler(0.5, 0.3, 0.15);
      const verts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        verts.push(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0).applyEuler(tilt));
      }

      // Filled face.
      const shape = new THREE.BufferGeometry().setFromPoints([...verts, verts[0]]);
      const faceGeo = new THREE.BufferGeometry();
      const facePts = [];
      for (let i = 1; i < n - 1; i++) { facePts.push(verts[0], verts[i], verts[i + 1]); }
      faceGeo.setFromPoints(facePts);
      faceGeo.computeVertexNormals();
      const face = new THREE.Mesh(faceGeo, new THREE.MeshBasicMaterial({
        color: 0x57e0c8, transparent: true, opacity: 0.22, side: THREE.DoubleSide,
      }));
      scene.add(face);

      // Edges.
      scene.add(new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(verts),
        new THREE.LineBasicMaterial({ color: 0x57e0c8 })
      ));

      // Vertex dots + labels.
      verts.forEach((v, i) => {
        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(0.1, 20, 20),
          new THREE.MeshBasicMaterial({ color: COL.ink })
        );
        dot.position.copy(v);
        scene.add(dot);
        const lbl = makeLabel('v' + i, '#57e0c8', 0.38);
        lbl.position.copy(v).addScaledVector(v.clone().normalize(), 0.35);
        scene.add(lbl);
      });

      camera.position.set(4.5, 3.5, 6);
      controls.target.set(0, 0.3, 0);
      controls.update();
    },
  },

  {
    title: 'What is a mesh?',
    body: `
      <p>One polygon is a single flat face. A <strong>mesh</strong> is many polygons
      stitched together along shared edges and vertices to approximate a whole
      surface — the fundamental way 3D objects are stored.</p>
      <p>In practice almost every mesh is made of <strong>triangles</strong>, because
      three points are always guaranteed to be flat. A mesh is really just two lists:
      the <strong>vertices</strong> (the <code>(x, y, z)</code> points) and the
      <strong>faces</strong> (which triples of vertices form each triangle).</p>
      <p>Below is a sphere built from triangles. The glowing lines are the triangle
      edges — the more triangles, the smoother the surface looks.</p>
    `,
    build(stage) {
      const { scene, camera, controls } = stage;
      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      const key = new THREE.DirectionalLight(0xffffff, 1.0);
      key.position.set(4, 6, 5);
      scene.add(key);

      const geo = new THREE.IcosahedronGeometry(2, 2);
      const mesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
        color: 0x2a3550, shininess: 40, flatShading: true,
      }));
      scene.add(mesh);

      const wire = new THREE.LineSegments(
        new THREE.WireframeGeometry(geo),
        new THREE.LineBasicMaterial({ color: 0x57e0c8, transparent: true, opacity: 0.6 })
      );
      mesh.add(wire);

      // Highlight the vertices.
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.07 }));
      mesh.add(pts);

      camera.position.set(4, 3, 5);
      controls.target.set(0, 0, 0);
      controls.update();
      stage.setUpdate(() => { mesh.rotation.y += 0.003; });
    },
  },

  {
    title: 'What is a torus, and how is it a triangle mesh?',
    body: `
      <p>A <strong>torus</strong> is a doughnut: take a small circle and sweep its
      center around a larger circle. It's defined by two radii — <code>R</code> to
      the tube's center and <code>r</code> for the tube itself.</p>
      <p>To turn that smooth surface into a mesh, we <strong>sample</strong> it on a
      grid of two angles: <code>u</code> going the long way around, <code>v</code>
      going around the tube. Each cell of the grid is a little four-sided patch, and
      we split every patch into <strong>two triangles</strong>.</p>
      <p>The result is the wireframe you see — a grid of quads, each cut corner to
      corner. Finer sampling → more triangles → a rounder doughnut.</p>
    `,
    build(stage) {
      const { scene, camera, controls } = stage;
      scene.add(new THREE.AmbientLight(0xffffff, 0.5));
      const key = new THREE.DirectionalLight(0xffffff, 1.1);
      key.position.set(5, 6, 4);
      scene.add(key);

      const geo = new THREE.TorusGeometry(2, 0.7, 16, 32);
      const torus = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
        color: 0x3a2b55, shininess: 60, specular: 0x8f7bd6,
      }));
      scene.add(torus);
      torus.add(new THREE.LineSegments(
        new THREE.WireframeGeometry(geo),
        new THREE.LineBasicMaterial({ color: 0x57e0c8, transparent: true, opacity: 0.5 })
      ));

      camera.position.set(4, 3.5, 5.5);
      controls.target.set(0, 0, 0);
      controls.update();
      stage.setUpdate(() => { torus.rotation.x += 0.004; torus.rotation.y += 0.006; });
    },
  },

  {
    title: 'What is a vector?',
    body: `
      <p>A <strong>vector</strong> is an arrow: it has a <strong>direction</strong>
      and a <strong>length</strong> (its magnitude). We write it with components
      <code>(x, y, z)</code> — the same three numbers as a point, but the meaning is
      different.</p>
      <p>A point says <em>"here is a location."</em> A vector says <em>"move this far
      in this direction."</em> Because it's a displacement, the same vector is valid
      no matter where you draw it — the two teal arrows below are the
      <strong>identical</strong> vector <code>(2, 3, 1.5)</code> starting from
      different places.</p>
      <p>Its length is <code>√(2² + 3² + 1.5²) ≈ 3.9</code>. The dashed lines show
      how the components add up to it.</p>
    `,
    build(stage) {
      const { scene, camera, controls } = stage;
      scene.add(new THREE.AmbientLight(0xffffff, 0.9));
      addAxes(scene, 3.4);

      const v = new THREE.Vector3(2, 3, 1.5);

      // Arrow 1 from origin, with component decomposition.
      scene.add(makeArrow(new THREE.Vector3(0, 0, 0), v, v.length(), COL.accent));
      const A = new THREE.Vector3(v.x, 0, 0);
      const B = new THREE.Vector3(v.x, 0, v.z);
      scene.add(dashedSegment(new THREE.Vector3(), A, COL.x));
      scene.add(dashedSegment(A, B, COL.z));
      scene.add(dashedSegment(B, v, COL.y));
      const mag = makeLabel('|v| ≈ 3.9', '#57e0c8', 0.48);
      mag.position.copy(v.clone().multiplyScalar(0.55)).add(new THREE.Vector3(0.3, 0.3, 0));
      scene.add(mag);

      // Arrow 2: same vector, different starting point.
      const origin2 = new THREE.Vector3(-2.5, 0.2, 1.5);
      scene.add(makeArrow(origin2, v, v.length(), 0x2f8f80));

      camera.position.set(5.5, 4, 6.5);
      controls.target.set(0.5, 1.2, 0.75);
      controls.update();
    },
  },

  {
    title: "What is a surface's normal?",
    body: `
      <p>At any point on a surface, the <strong>normal</strong> is the vector that
      points straight <em>out</em> of it — perpendicular to the surface at that spot.
      It answers "which way is this face pointing?"</p>
      <p>For a flat polygon you get it from two of its edge vectors: their
      <strong>cross product</strong> <code>e₁ × e₂</code> is perpendicular to both, so
      it's perpendicular to the whole face. Below, the two colored arrows are edges of
      the tilted patch, and the teal arrow is their normal.</p>
      <p>Normals are the hinge between geometry and light: the next slide uses them to
      decide how bright each point should be. Orbit to see the normal stay locked
      perpendicular to the surface.</p>
    `,
    build(stage) {
      const { scene, camera, controls } = stage;
      scene.add(new THREE.AmbientLight(0xffffff, 0.9));

      // A tilted flat patch. Edge order is chosen so e₁ × e₂ points "up" (+Y),
      // so the normal reads naturally without fighting the orbit limits.
      const c0 = new THREE.Vector3(0, 0, 0);
      const e1 = new THREE.Vector3(0.3, 0.5, 2.4);
      const e2 = new THREE.Vector3(2.4, 0.4, 0.6);
      const normal = new THREE.Vector3().crossVectors(e1, e2).normalize().multiplyScalar(2.2);

      const p0 = c0, p1 = c0.clone().add(e1), p3 = c0.clone().add(e2);
      const p2 = c0.clone().add(e1).add(e2);
      const center = e1.clone().add(e2).multiplyScalar(0.5); // polygon centroid
      const quad = new THREE.BufferGeometry();
      quad.setFromPoints([p0, p1, p2, p0, p2, p3]);
      quad.computeVertexNormals();
      scene.add(new THREE.Mesh(quad, new THREE.MeshBasicMaterial({
        color: 0x38507a, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
      })));
      scene.add(new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints([p0, p1, p2, p3]),
        new THREE.LineBasicMaterial({ color: 0x9fb4d8 })
      ));

      // Edge vectors at the corner (the inputs to the cross product).
      scene.add(makeArrow(c0, e1, e1.length(), COL.x));
      scene.add(makeArrow(c0, e2, e2.length(), COL.z));

      // Normal coming out of the CENTER of the polygon, pointing up.
      const nDot = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 16, 16),
        new THREE.MeshBasicMaterial({ color: COL.accent })
      );
      nDot.position.copy(center);
      scene.add(nDot);
      scene.add(dashedSegment(center, center.clone().add(normal), COL.accent));
      scene.add(makeArrow(center, normal, normal.length(), COL.accent, 0.32, 0.04));

      const nl = makeLabel('n = e₁ × e₂', '#57e0c8');
      nl.position.copy(center).add(normal).add(new THREE.Vector3(0, 0.4, 0));
      scene.add(nl);

      camera.position.set(5.5, 3.5, 6);
      controls.target.copy(center);
      controls.update();
    },
  },

  {
    title: 'What is a shader, and what is Phong shading?',
    body: `
      <p>A <strong>shader</strong> is a small program that runs on the GPU to decide
      the color of every pixel of a surface. Give it the geometry, the
      <strong>normals</strong>, the camera, and the lights, and it computes how bright
      each spot should be.</p>
      <p><strong>Phong shading</strong> is a classic recipe that adds three terms:
      <strong>ambient</strong> (a base fill so nothing is pure black),
      <strong>diffuse</strong> (matte brightness from the angle between the
      <em>normal</em> and the light — the dot product), and
      <strong>specular</strong> (the shiny highlight where the surface reflects the
      light toward your eye).</p>
      <p>The sphere below uses Phong; the small white orb is the moving light. Watch
      the bright highlight chase it — that's specular, driven entirely by the normals
      from the previous slide.</p>
    `,
    build(stage) {
      const { scene, camera, controls } = stage;
      scene.add(new THREE.AmbientLight(0x404a5c, 1.0));   // ambient term

      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(2, 64, 64),
        new THREE.MeshPhongMaterial({ color: 0x2b6cff, shininess: 90, specular: 0xffffff })
      );
      scene.add(sphere);

      const light = new THREE.PointLight(0xffffff, 120, 0, 2);
      scene.add(light);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      scene.add(bulb);

      camera.position.set(4, 3, 6);
      controls.target.set(0, 0, 0);
      controls.update();

      stage.setUpdate((t) => {
        const x = Math.cos(t * 0.9) * 4;
        const z = Math.sin(t * 0.9) * 4;
        const y = 2.2 + Math.sin(t * 0.6) * 1.5;
        light.position.set(x, y, z);
        bulb.position.copy(light.position);
      });
    },
  },

  {
    title: 'What is a texture, and what is a light source?',
    body: `
      <p>A <strong>texture</strong> is an image wrapped onto a surface, letting one
      flat mesh show fine detail — brick, marble, wood — without millions of extra
      triangles. Each vertex carries a <code>(u, v)</code> coordinate saying which
      part of the image lands where.</p>
      <p>A <strong>light source</strong> is what makes any of it visible. Combined
      with the surface normals, it decides how bright each textured point is and where
      shadows and highlights fall.</p>
      <p>Here's a half-room to show both: two <strong>brick</strong> walls and a
      <strong>marble</strong> floor (textures), lit by a single point light — the
      glowing orb — that drifts across the corner. Orbit around and watch the
      brightness fall off with distance and angle.</p>
    `,
    build(stage) {
      const { scene, camera, controls } = stage;
      scene.background = new THREE.Color(0x07090d);
      scene.add(new THREE.AmbientLight(0x2a3040, 0.8));

      const brick = brickTexture(); brick.repeat.set(3, 2);
      const brick2 = brickTexture(); brick2.repeat.set(3, 2);
      const marble = marbleTexture(); marble.repeat.set(3, 3);

      const wallMat = (t) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
      const S = 8, H = 5;

      // Floor (marble) on the xz plane.
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(S, S),
        new THREE.MeshStandardMaterial({ map: marble, roughness: 0.4, metalness: 0.05 }));
      floor.rotation.x = -Math.PI / 2;
      scene.add(floor);

      // Back wall (brick) at z = -S/2.
      const back = new THREE.Mesh(new THREE.PlaneGeometry(S, H), wallMat(brick));
      back.position.set(0, H / 2, -S / 2);
      scene.add(back);

      // Left wall (brick) at x = -S/2.
      const left = new THREE.Mesh(new THREE.PlaneGeometry(S, H), wallMat(brick2));
      left.rotation.y = Math.PI / 2;
      left.position.set(-S / 2, H / 2, 0);
      scene.add(left);

      // Point light + visible bulb.
      const light = new THREE.PointLight(0xfff2d6, 60, 0, 2);
      scene.add(light);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 20, 20),
        new THREE.MeshBasicMaterial({ color: 0xfff2d6 })
      );
      scene.add(bulb);

      camera.position.set(6, 5, 7);
      controls.target.set(-0.5, 2, -0.5);
      controls.update();

      stage.setUpdate((t) => {
        const x = -1 + Math.cos(t * 0.5) * 2.2;
        const z = -1 + Math.sin(t * 0.5) * 2.2;
        light.position.set(x, 3.2, z);
        bulb.position.copy(light.position);
      });
    },
  },

  {
    title: 'What is the camera? What are position and orientation?',
    body: `
      <p>Everything so far lives in the 3D world. The <strong>camera</strong> is the
      imaginary eye that decides <em>what you actually see</em> — it turns the whole
      scene into the flat picture on your screen. Move it and the view changes; the
      world itself never moves.</p>
      <p>A camera needs just two things. Its <strong>position</strong> is where the eye
      sits — a single point <code>(x, y, z)</code>, drawn here as the gold arrow from
      the origin. Its <strong>orientation</strong> is which way it faces: the red arrow
      is the direction it looks ("forward"), and the green arrow is which way is "up"
      so the image isn't tilted or upside-down.</p>
      <p>The wireframe pyramid is the camera's view — everything inside it lands on
      screen. Watch it fly around while staying locked on the knot: that's position
      changing while orientation keeps re-aiming at the target. Drag to orbit the
      whole setup.</p>
    `,
    build(stage) {
      const { scene, camera, controls } = stage;
      scene.add(new THREE.AmbientLight(0xffffff, 0.7));
      const key = new THREE.DirectionalLight(0xffffff, 0.8);
      key.position.set(4, 6, 5); scene.add(key);
      addAxes(scene, 3);

      // The subject the demo camera is looking at.
      const subject = new THREE.Mesh(
        new THREE.TorusKnotGeometry(0.5, 0.17, 90, 16),
        new THREE.MeshPhongMaterial({ color: 0x57e0c8, shininess: 70, specular: 0x8fe6d8 })
      );
      subject.position.set(0, 0.6, 0);
      scene.add(subject);
      const target = new THREE.Vector3(0, 0.6, 0);

      // A second camera we *visualize* (it does not render the view we see).
      const demoCam = new THREE.PerspectiveCamera(38, 1.5, 0.6, 3.4);
      const helper = new THREE.CameraHelper(demoCam);
      scene.add(helper);

      const camDot = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 20, 20),
        new THREE.MeshBasicMaterial({ color: 0xffd166 })
      );
      scene.add(camDot);

      const posArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0xffd166, 0.3, 0.18);
      const fwdArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 1.3, 0xff5c6c, 0.3, 0.18);
      const upArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1.0, 0x6cff9e, 0.26, 0.15);
      scene.add(posArrow, fwdArrow, upArrow);

      const posLbl = makeLabel('position', '#ffd166', 0.4);
      const fwdLbl = makeLabel('forward', '#ff8a94', 0.36);
      const upLbl = makeLabel('up', '#6cff9e', 0.34);
      scene.add(posLbl, fwdLbl, upLbl);

      camera.position.set(6.5, 4.5, 7);
      controls.target.set(0, 0.6, 0);
      controls.update();

      const up = new THREE.Vector3(0, 1, 0);
      stage.setUpdate((t) => {
        const r = 4.4;
        const camPos = new THREE.Vector3(
          Math.cos(t * 0.4) * r,
          2.4 + Math.sin(t * 0.3) * 1.1,
          Math.sin(t * 0.4) * r
        );
        demoCam.position.copy(camPos);
        demoCam.lookAt(target);
        demoCam.updateProjectionMatrix();
        demoCam.updateMatrixWorld(true);
        helper.update();

        camDot.position.copy(camPos);

        posArrow.position.set(0, 0, 0);
        posArrow.setDirection(camPos.clone().normalize());
        posArrow.setLength(camPos.length(), 0.3, 0.18);

        const fwd = target.clone().sub(camPos).normalize();
        fwdArrow.position.copy(camPos);
        fwdArrow.setDirection(fwd);
        upArrow.position.copy(camPos);
        upArrow.setDirection(up);

        posLbl.position.copy(camPos.clone().multiplyScalar(0.5)).add(new THREE.Vector3(0, 0.35, 0));
        fwdLbl.position.copy(camPos).addScaledVector(fwd, 1.5).add(new THREE.Vector3(0, 0.3, 0));
        upLbl.position.copy(camPos).add(new THREE.Vector3(0, 1.15, 0));
      });
    },
  },

  {
    title: 'What are projections? Perspective vs. orthographic',
    body: `
      <p>A <strong>projection</strong> is the rule for flattening the 3D world onto the
      camera's 2D image — deciding where each point in space lands on the screen. There
      are two classic rules, shown side by side below. Each casts the same three
      colored points onto a translucent image plane.</p>
      <p><strong>Perspective</strong> (left) is how eyes and real lenses work: every
      point is projected toward a single eye point, so rays <em>converge</em>. Things
      farther away shrink, and parallel lines meet in the distance. It looks natural
      and gives depth.</p>
      <p><strong>Orthographic</strong> (right) throws the rays straight along one
      direction, perfectly <em>parallel</em>. Distance no longer shrinks anything, so
      spacing and size are preserved exactly. That's ideal for CAD, blueprints,
      isometric games, and diagrams where you need to measure. Orbit to compare how the
      projected dots land.</p>
    `,
    build(stage) {
      const { scene, camera, controls } = stage;
      scene.add(new THREE.AmbientLight(0xffffff, 0.9));

      // Three source points, same relative layout for both systems.
      const basePts = [
        new THREE.Vector3(0, 2.4, -1.3),
        new THREE.Vector3(0, 1.4, 0),
        new THREE.Vector3(0, 3.0, 1.3),
      ];
      const cols = [COL.x, COL.y, COL.z];

      function buildSystem(originX, mode) {
        const g = new THREE.Group();
        g.position.x = originX;

        // Image plane at local x = 0 (a rectangle in the y–z plane).
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(3.2, 3.2),
          new THREE.MeshBasicMaterial({ color: 0x38507a, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
        );
        plane.rotation.y = Math.PI / 2;
        plane.position.set(0, 2.0, 0);
        g.add(plane);

        const eye = new THREE.Vector3(-2.8, 2.0, 0); // used only in perspective
        if (mode === 'persp') {
          const e = new THREE.Mesh(
            new THREE.SphereGeometry(0.14, 18, 18),
            new THREE.MeshBasicMaterial({ color: 0xffd166 })
          );
          e.position.copy(eye);
          g.add(e);
          g.add(makeLabel('eye', '#ffd166', 0.34).translateX(eye.x).translateY(eye.y + 0.4));
        }

        basePts.forEach((p, i) => {
          const col = cols[i];
          const src = p.clone(); src.x = 1.7; // source sits on the +x side of the plane

          g.add(new THREE.Mesh(
            new THREE.SphereGeometry(0.11, 16, 16),
            new THREE.MeshBasicMaterial({ color: col })
          ).translateX(src.x).translateY(src.y).translateZ(src.z));

          let proj;
          if (mode === 'persp') {
            const s = (0 - eye.x) / (src.x - eye.x);       // param where the ray hits x = 0
            proj = eye.clone().add(src.clone().sub(eye).multiplyScalar(s));
            g.add(new THREE.Line(
              new THREE.BufferGeometry().setFromPoints([eye, src]),
              new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.5 })
            ));
          } else {
            proj = new THREE.Vector3(0, src.y, src.z);      // straight along −x
            g.add(new THREE.Line(
              new THREE.BufferGeometry().setFromPoints([src, proj]),
              new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.6 })
            ));
          }
          g.add(new THREE.Mesh(
            new THREE.SphereGeometry(0.09, 16, 16),
            new THREE.MeshBasicMaterial({ color: col })
          ).translateX(proj.x).translateY(proj.y).translateZ(proj.z));
        });

        const lbl = makeLabel(mode === 'persp' ? 'perspective' : 'orthographic',
          mode === 'persp' ? '#ffd166' : '#57e0c8', 0.42);
        lbl.position.set(0, 4.0, 0);
        g.add(lbl);
        return g;
      }

      scene.add(buildSystem(-2.6, 'persp'));
      scene.add(buildSystem(2.6, 'ortho'));

      camera.position.set(1, 5, 9.5);
      controls.target.set(0, 1.8, 0);
      controls.update();
    },
  },

  {
    title: 'What is field of view?',
    body: `
      <p>Building on the camera's viewing pyramid: the <strong>field of view</strong>
      (FOV) is the <em>angle</em> of that pyramid — how wide a slice of the world the
      camera takes in. It's measured in degrees, spreading out from the eye.</p>
      <p>A <strong>wide</strong> FOV (say 90°) sees a lot at once but exaggerates
      depth, like a phone's ultra-wide or a fisheye. A <strong>narrow</strong> FOV
      (say 20°) sees only a sliver but flattens and magnifies it, like a telephoto
      zoom. Same camera position — only the angle changes.</p>
      <p>Below, the eye sits on the left and the wireframe pyramid opens and closes as
      the FOV sweeps between narrow and wide. Each box lights up teal the moment it
      falls <em>inside</em> the view and dims when it drops out. Orbit around to see the
      angle in 3D.</p>
    `,
    build(stage) {
      const { scene, camera, controls } = stage;
      scene.add(new THREE.AmbientLight(0xffffff, 0.7));
      const key = new THREE.DirectionalLight(0xffffff, 0.7);
      key.position.set(4, 6, 5); scene.add(key);

      const eyePos = new THREE.Vector3(-4.5, 1.2, 0);
      const lookAt = new THREE.Vector3(2, 1.2, 0);

      const demoCam = new THREE.PerspectiveCamera(50, 1.4, 0.5, 7);
      demoCam.position.copy(eyePos);
      demoCam.lookAt(lookAt);
      const helper = new THREE.CameraHelper(demoCam);
      scene.add(helper);

      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 20, 20),
        new THREE.MeshBasicMaterial({ color: 0xffd166 })
      );
      eye.position.copy(eyePos);
      scene.add(eye);

      // A field of little pillars for the view to sweep across.
      const objs = [];
      for (let i = 0; i < 9; i++) {
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 1.1, 0.5),
          new THREE.MeshPhongMaterial({ color: 0x33405c })
        );
        m.position.set(0.5 + (i % 3) * 1.3, 0.55, -3 + Math.floor(i / 3) * 3 + (i % 3) * 0.4);
        scene.add(m);
        objs.push(m);
      }

      const fovLbl = makeDynamicLabel('#ffd166', 0.62);
      fovLbl.position.set(-4.5, 2.7, 0);
      scene.add(fovLbl);
      let lastDeg = -1;

      camera.position.set(0, 6.5, 9.5);
      controls.target.set(0, 1, 0);
      controls.update();

      stage.setUpdate((t) => {
        const fov = 55 + Math.sin(t * 0.55) * 35;  // sweeps ~20°..90°
        demoCam.fov = fov;
        demoCam.updateProjectionMatrix();
        demoCam.updateMatrixWorld(true);
        helper.update();

        const deg = Math.round(fov);
        if (deg !== lastDeg) { fovLbl.setText('FOV ' + deg + '°'); lastDeg = deg; }

        // Light up boxes that currently fall inside the camera's frustum.
        objs.forEach((o) => {
          const n = o.position.clone().project(demoCam);
          const inside = Math.abs(n.x) < 1 && Math.abs(n.y) < 1 && n.z > -1 && n.z < 1;
          o.material.color.set(inside ? 0x57e0c8 : 0x33405c);
        });
      });
    },
  },

  {
    title: 'What is physics? What can a physics engine do?',
    body: `
      <p>So far objects only sit where we place them. <strong>Physics</strong> makes
      them <em>move like real matter</em>: a <strong>physics engine</strong> is code
      that, many times per second, applies forces like <strong>gravity</strong>,
      advances every object a tiny time-step, and then detects and resolves
      <strong>collisions</strong> so things don't pass through each other.</p>
      <p>With one you get, for free: falling and bouncing, stacking and toppling,
      rolling and sliding with friction, ragdolls, cloth and rope, vehicles, and
      explosions. Games, simulations, and VFX all lean on them so animators don't have
      to hand-key every impact.</p>
      <p>The demo below is a tiny engine written from scratch — gravity pulls the balls
      down, they bounce off the floor and walls with a little energy lost each time, and
      they collide with <em>each other</em>. Every few seconds they all get a fresh
      upward kick. Orbit around the tumble.</p>
    `,
    build(stage) {
      const { scene, camera, controls } = stage;
      scene.add(new THREE.AmbientLight(0xffffff, 0.5));
      const key = new THREE.DirectionalLight(0xffffff, 1.0);
      key.position.set(5, 9, 4); scene.add(key);

      const W = 3.2; // arena half-width
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(W * 2, W * 2),
        new THREE.MeshStandardMaterial({ color: 0x18223a, roughness: 0.9 })
      );
      floor.rotation.x = -Math.PI / 2;
      scene.add(floor);
      const grid = new THREE.GridHelper(W * 2, 12, 0x2a3242, 0x1c2230);
      grid.position.y = 0.002;
      scene.add(grid);

      const palette = [0xff5c6c, 0x6cff9e, 0x5c9dff, 0x57e0c8, 0xffd166, 0xc792ea, 0xff9e6c];
      const balls = [];
      for (let i = 0; i < 7; i++) {
        const r = 0.34 + Math.random() * 0.22;
        const m = new THREE.Mesh(
          new THREE.SphereGeometry(r, 28, 28),
          new THREE.MeshPhongMaterial({ color: palette[i % palette.length], shininess: 60 })
        );
        m.position.set((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4);
        scene.add(m);
        balls.push({ mesh: m, r, v: new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2) });
      }

      camera.position.set(6.5, 5, 7.5);
      controls.target.set(0, 1, 0);
      controls.update();

      const G = -9.8, REST = 0.72;
      let last = 0, kicked = false;
      stage.setUpdate((t) => {
        let dt = t - last; last = t;
        if (dt > 0.05) dt = 0.05;   // clamp after tab-switches

        // Periodic re-launch so the motion never fully dies out.
        if (Math.floor(t) % 5 === 0) {
          if (!kicked) { balls.forEach((b) => { b.v.y += 6 + Math.random() * 3; }); kicked = true; }
        } else kicked = false;

        // Integrate gravity + bounce off floor and the four walls.
        balls.forEach((b) => {
          b.v.y += G * dt;
          b.mesh.position.addScaledVector(b.v, dt);
          const p = b.mesh.position;
          if (p.y < b.r) { p.y = b.r; b.v.y = -b.v.y * REST; }
          if (p.x > W - b.r) { p.x = W - b.r; b.v.x = -b.v.x * REST; }
          if (p.x < -W + b.r) { p.x = -W + b.r; b.v.x = -b.v.x * REST; }
          if (p.z > W - b.r) { p.z = W - b.r; b.v.z = -b.v.z * REST; }
          if (p.z < -W + b.r) { p.z = -W + b.r; b.v.z = -b.v.z * REST; }
        });

        // Resolve ball-to-ball collisions (equal mass, exchange normal velocity).
        for (let i = 0; i < balls.length; i++) {
          for (let j = i + 1; j < balls.length; j++) {
            const a = balls[i], c = balls[j];
            const d = c.mesh.position.clone().sub(a.mesh.position);
            const dist = d.length(), min = a.r + c.r;
            if (dist > 0 && dist < min) {
              const nrm = d.multiplyScalar(1 / dist);
              const overlap = min - dist;
              a.mesh.position.addScaledVector(nrm, -overlap / 2);
              c.mesh.position.addScaledVector(nrm, overlap / 2);
              const diff = c.v.dot(nrm) - a.v.dot(nrm);
              if (diff < 0) {
                a.v.addScaledVector(nrm, diff * REST);
                c.v.addScaledVector(nrm, -diff * REST);
              }
            }
          }
        }
      });
    },
  },

  {
    title: 'What are file formats, GLTF, and GLB?',
    body: `
      <p>To save a 3D model to disk or send it over the internet, its data — vertices,
      faces, textures, materials, cameras — has to be written out in some agreed layout.
      That agreed layout is a <strong>file format</strong>. The
      <strong>extension</strong> is the short tag after the dot in a filename
      (<code>.jpg</code>, <code>.mp3</code>, <code>.gltf</code>) that tells software
      which format to expect.</p>
      <p><strong>glTF</strong> is the standard format for 3D scenes — often called "the
      JPEG of 3D." A plain <code>.gltf</code> file is <strong>text</strong> (JSON you
      can open and read), and it usually points to <em>separate</em> companion files:
      the geometry in a <code>.bin</code> and the images as <code>.png</code>/<code>.jpg</code>.
      That's the trio on the left.</p>
      <p><strong>GLB</strong> packs that whole bundle into a single <code>.glb</code>
      file — the block on the right — so you ship one tidy file instead of three that
      can get separated. The catch is that it's stored as <strong>binary</strong>
      rather than readable text, which the next slide unpacks. The knot in the middle
      is the model both formats describe.</p>
    `,
    build(stage) {
      const { scene, camera, controls } = stage;
      scene.add(new THREE.AmbientLight(0xffffff, 0.7));
      const key = new THREE.DirectionalLight(0xffffff, 0.9);
      key.position.set(4, 6, 5); scene.add(key);

      // The asset both formats describe.
      const asset = new THREE.Mesh(
        new THREE.TorusKnotGeometry(0.7, 0.24, 120, 20),
        new THREE.MeshPhongMaterial({ color: 0xc792ea, shininess: 80, specular: 0xffffff })
      );
      asset.position.set(0, 1.4, 0);
      scene.add(asset);

      // Left: glTF as a bundle of separate files.
      const gltfHead = makeLabel('glTF  —  a bundle of files', '#57e0c8', 0.44);
      gltfHead.position.set(-3.4, 3.7, 0);
      scene.add(gltfHead);

      const gltfCards = [
        makeFileCard([{ text: 'scene.gltf' }, { text: 'JSON text — readable', color: '#9fb4d8' }, { text: '{ "meshes": [ … ] }', color: '#8de0c8', mono: true }], '#57e0c8'),
        makeFileCard([{ text: 'mesh.bin' }, { text: 'binary geometry', color: '#9fb4d8' }, { text: '01101001 11000101', color: '#ffd166', mono: true }], '#ffd166'),
        makeFileCard([{ text: 'color.png' }, { text: 'texture image', color: '#9fb4d8' }, { text: '(u,v) → pixels', color: '#8de0c8', mono: true }], '#ff8a94'),
      ];
      gltfCards.forEach((c, i) => {
        c.position.set(-3.4, 2.6 - i * 1.15, i * 0.3 - 0.3);
        c.rotation.y = 0.35;
        scene.add(c);
      });

      // Right: GLB as a single packed binary container.
      const glbHead = makeLabel('GLB  —  one binary file', '#ffd166', 0.44);
      glbHead.position.set(3.4, 3.7, 0);
      scene.add(glbHead);

      const container = new THREE.Mesh(
        new THREE.BoxGeometry(2.3, 2.7, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x2a2140, roughness: 0.5, metalness: 0.2, transparent: true, opacity: 0.55 })
      );
      container.position.set(3.4, 1.4, -0.2);
      scene.add(container);
      container.add(new THREE.LineSegments(
        new THREE.WireframeGeometry(container.geometry),
        new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.5 })
      ));

      const glbCard = makeFileCard([
        { text: 'model.glb' },
        { text: 'JSON + geometry + textures', color: '#9fb4d8' },
        { text: 'all packed as raw bytes', color: '#9fb4d8' },
        { text: '01000111 01001100 01000010', color: '#ffd166', mono: true },
      ], '#ffd166', 2.1);
      glbCard.position.set(3.4, 1.4, 0.06);
      scene.add(glbCard);

      camera.position.set(0, 2.6, 10);
      controls.target.set(0, 1.5, 0);
      controls.update();

      stage.setUpdate(() => { asset.rotation.y += 0.006; asset.rotation.x += 0.003; });
    },
  },

  {
    title: 'What does it mean that GLB is a "binary" format?',
    body: `
      <p>Under the hood a computer stores everything as <strong>bits</strong> — 0s and
      1s. The difference between a "text" format and a "binary" one is <em>how</em> those
      bits are arranged and whether they're meant for a human to read.</p>
      <p>A <strong>text</strong> format (like the <code>.gltf</code> JSON) writes data
      out as readable <em>characters</em>. The number <code>0.5</code> is literally
      stored as the characters "0", ".", "5" — open it in any text editor and you can
      read it. A <strong>binary</strong> format skips that and writes the
      <em>raw bytes</em> the machine uses internally: the same <code>0.5</code> becomes
      four bytes like <code>00111111&nbsp;00000000&nbsp;00000000&nbsp;00000000</code>.
      Compact and fast for the computer, but gibberish to a human.</p>
      <p>That's what <strong>GLB</strong> is — the glTF data plus geometry and images
      packed as one binary blob. Smaller files, faster loading, no readable text. The
      wall behind is that raw byte stream; the two cards show the same value as text vs.
      binary. Orbit around it.</p>
    `,
    build(stage) {
      const { scene, camera, controls } = stage;
      scene.add(new THREE.AmbientLight(0xffffff, 0.9));

      // The "raw bytes" backdrop.
      const panel = makeBinaryPanel(6.4);
      panel.mesh.position.set(0, 1.8, -1.2);
      scene.add(panel.mesh);

      // Same value, two ways: readable text vs. the raw bytes.
      const textCard = makeFileCard([
        { text: '.gltf  —  text' },
        { text: 'human-readable', color: '#9fb4d8' },
        { text: '"height": 0.5', color: '#8de0c8', mono: true },
      ], '#57e0c8', 2.2);
      textCard.position.set(-2.1, 1.8, 0.6);
      textCard.rotation.y = 0.28;
      scene.add(textCard);

      const binCard = makeFileCard([
        { text: '.glb  —  binary' },
        { text: 'raw bytes for the machine', color: '#9fb4d8' },
        { text: '00111111 00000000', color: '#ffd166', mono: true },
        { text: '00000000 00000000', color: '#ffd166', mono: true },
      ], '#ffd166', 2.4);
      binCard.position.set(2.2, 1.8, 0.6);
      binCard.rotation.y = -0.28;
      scene.add(binCard);

      // A small "=" bridge between the two cards.
      const eq = makeLabel('=', '#eef1f6', 0.6);
      eq.position.set(0.05, 1.8, 0.8);
      scene.add(eq);

      camera.position.set(0, 2.4, 9);
      controls.target.set(0, 1.8, 0);
      controls.update();

      stage.setUpdate((t) => panel.tick(t));
    },
  },
];

// ── Runtime ─────────────────────────────────────────────────────────────────

const stageEl = document.getElementById('stage');
const titleEl = document.getElementById('slideTitle');
const bodyEl = document.getElementById('slideBody');
const kickerEl = document.getElementById('slideKicker');
const dotsEl = document.getElementById('dots');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

let current = -1;
let stage = null;

function pad(n) { return String(n).padStart(2, '0'); }

function buildDots() {
  dotsEl.innerHTML = '';
  slides.forEach((_, i) => {
    const b = document.createElement('button');
    b.className = 'dc-dot' + (i === current ? ' active' : '');
    b.setAttribute('aria-label', 'Slide ' + (i + 1));
    b.addEventListener('click', () => show(i));
    dotsEl.appendChild(b);
  });
}

function show(i) {
  if (i < 0 || i >= slides.length || i === current) return;
  if (stage) stage.dispose();
  stageEl.innerHTML = '';
  current = i;
  const s = slides[i];

  titleEl.textContent = s.title;
  bodyEl.innerHTML = s.body;
  kickerEl.textContent = `${pad(i + 1)} / ${pad(slides.length)}`;

  stage = new Stage(stageEl);
  s.build(stage);
  stage.resize();
  stage.start();

  prevBtn.disabled = i === 0;
  nextBtn.disabled = i === slides.length - 1;
  [...dotsEl.children].forEach((d, di) => d.classList.toggle('active', di === current));
}

prevBtn.addEventListener('click', () => show(current - 1));
nextBtn.addEventListener('click', () => show(current + 1));
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') show(current - 1);
  if (e.key === 'ArrowRight') show(current + 1);
});

buildDots();
show(0);
