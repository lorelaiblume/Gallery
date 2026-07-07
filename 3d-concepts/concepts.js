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

      // A tilted flat patch.
      const c0 = new THREE.Vector3(0, 0, 0);
      const e1 = new THREE.Vector3(2.4, 0.4, 0.6);
      const e2 = new THREE.Vector3(0.3, 0.5, 2.4);
      const normal = new THREE.Vector3().crossVectors(e1, e2).normalize().multiplyScalar(2);

      const p0 = c0, p1 = c0.clone().add(e1), p3 = c0.clone().add(e2);
      const p2 = c0.clone().add(e1).add(e2);
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

      // Edge vectors + normal at the corner.
      scene.add(makeArrow(c0, e1, e1.length(), COL.x));
      scene.add(makeArrow(c0, e2, e2.length(), COL.z));
      scene.add(makeArrow(c0, normal, normal.length(), COL.accent, 0.35, 0.045));

      const nl = makeLabel('n = e₁ × e₂', '#57e0c8');
      nl.position.copy(c0).add(normal).add(new THREE.Vector3(0, 0.35, 0));
      scene.add(nl);

      camera.position.set(5, 4, 6);
      controls.target.set(1.2, 0.6, 1.2);
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
