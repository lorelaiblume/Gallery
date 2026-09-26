import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const CUBE_SIZE = 0.1; // meters
const CUBE_DISTANCE = 0.5; // meters in front of the viewer when the session starts
const CUBE_SIDE_OFFSET = 0.1; // meters each cube sits to either side of the view axis
const CUBE_DROP = 0.1; // meters the cubes sit below eye level
const FINGERTIP_DIAMETER = 0.01; // meters
const PINCH_START_DISTANCE = 0.02; // meters between thumb and index tips
const PINCH_END_DISTANCE = 0.04; // wider than the start, so a pinch near the threshold doesn't flicker
const VERSION_URL = "/version.txt";
// Faster against the local dev server, where a reload is a save away.
const VERSION_POLL_MS = location.hostname === "localhost" ? 250 : 1000;
const FINGERTIP_JOINTS = ["thumb-tip", "index-finger-tip"]; // the pinching fingers

// outputBufferType HalfFloat enables the renderer's built-in post-processing
// (setEffects), which, unlike EffectComposer, also runs during an XR session.
// alpha: true keeps the cleared background transparent so passthrough shows.
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, outputBufferType: THREE.HalfFloatType });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.AgXToneMapping;
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

// UnrealBloomPass gives its glow an alpha equal to its brightness, so the
// halo draws over passthrough rather than as an opaque black-backed layer.
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.2, 0);
renderer.setEffects([bloom]);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
camera.position.set(0, 1.6, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x404060, 1.5));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
keyLight.position.set(1, 2, 1);
scene.add(keyLight);

// Pinching inside either cube drags it.
const cubeGeometry = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
const orangeCube = new THREE.Mesh(
  cubeGeometry,
  new THREE.MeshStandardMaterial({ color: 0xff8a1f, emissive: 0xff5a00, emissiveIntensity: 0.6, roughness: 0.35 })
);
orangeCube.position.set(-CUBE_SIDE_OFFSET, 1.6 - CUBE_DROP, -CUBE_DISTANCE);
scene.add(orangeCube);

const greenCube = new THREE.Mesh(
  cubeGeometry,
  new THREE.MeshStandardMaterial({ color: 0xff5fc8, emissive: 0xff1fa8, emissiveIntensity: 0.6, roughness: 0.35 })
);
greenCube.position.set(CUBE_SIDE_OFFSET, 1.6 - CUBE_DROP, -CUBE_DISTANCE);
scene.add(greenCube);

const cubes = [orangeCube, greenCube];

// Color above 1.0 so the spheres stay bright white through tone mapping
// and feed the bloom pass.
const fingertipMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(2) });
const fingertipGeometry = new THREE.SphereGeometry(FINGERTIP_DIAMETER / 2, 16, 12);

// A hand's joint objects only exist once that hand connects; each joint
// then follows its fingertip and hides itself whenever it isn't tracked,
// so a sphere parented to it needs no per-frame work.
const hands = [0, 1].map((index) => renderer.xr.getHand(index));
for (const hand of hands) {
  scene.add(hand);
  hand.addEventListener("connected", () => {
    for (const name of FINGERTIP_JOINTS) {
      const joint = hand.joints[name];
      if (joint && joint.children.length === 0) joint.add(new THREE.Mesh(fingertipGeometry, fingertipMaterial));
    }
  });
}

const arButton = ARButton.createButton(renderer, { optionalFeatures: ["hand-tracking"] });
document.body.appendChild(arButton);

// With chrome://flags/#webxr-navigation-permission enabled, Quest Browser
// keeps immersive mode up across a navigation (a reload, hopefully) and
// fires sessiongranted on the new page, which may then start a session
// without a user gesture. Clicking the button starts it the same way a tap
// would, so the button's own session bookkeeping stays right. The button
// only gets its click handler once its isSessionSupported check resolves;
// this check was queued after that one, so it resolves after it.
navigator.xr?.addEventListener("sessiongranted", () => {
  console.log("xrcube: sessiongranted");
  navigator.xr.isSessionSupported("immersive-ar").then((supported) => {
    if (supported) arButton.click();
  });
});

let placeOnNextFrame = false;
renderer.xr.addEventListener("sessionstart", () => {
  placeOnNextFrame = true;
});

// Per hand: whether it's pinching, and the cube that pinch is dragging (if any).
const handStates = hands.map((hand) => ({
  hand,
  pinching: false,
  heldCube: null,
  holdOffset: new THREE.Vector3(),
}));

const thumbTip = new THREE.Vector3();
const indexTip = new THREE.Vector3();
const pinchPoint = new THREE.Vector3();
const pointInCube = new THREE.Vector3();

function isInCube(point, cube) {
  cube.updateMatrixWorld();
  cube.worldToLocal(pointInCube.copy(point));
  const half = CUBE_SIZE / 2;
  return Math.abs(pointInCube.x) <= half && Math.abs(pointInCube.y) <= half && Math.abs(pointInCube.z) <= half;
}

// Moves whatever cube this hand is dragging. A pinch only grabs a cube if
// it starts inside one, so dragging a cube through another never picks up
// the second.
function updateHand(state) {
  const thumb = state.hand.joints["thumb-tip"];
  const index = state.hand.joints["index-finger-tip"];
  if (!thumb?.visible || !index?.visible) {
    // Tracking lost: let go.
    state.pinching = false;
    state.heldCube = null;
    return;
  }
  thumb.getWorldPosition(thumbTip);
  index.getWorldPosition(indexTip);
  pinchPoint.addVectors(thumbTip, indexTip).multiplyScalar(0.5);

  const wasPinching = state.pinching;
  state.pinching = thumbTip.distanceTo(indexTip) < (wasPinching ? PINCH_END_DISTANCE : PINCH_START_DISTANCE);
  if (state.pinching && !wasPinching) {
    const isFree = (cube) => !handStates.some((other) => other.heldCube === cube);
    state.heldCube = cubes.find((cube) => isFree(cube) && isInCube(pinchPoint, cube)) ?? null;
    if (state.heldCube) state.holdOffset.subVectors(state.heldCube.position, pinchPoint);
  } else if (!state.pinching) {
    state.heldCube = null;
  }
  if (state.heldCube) state.heldCube.position.addVectors(pinchPoint, state.holdOffset);
}

const viewerPosition = new THREE.Vector3();
const viewerOrientation = new THREE.Quaternion();
const viewerForward = new THREE.Vector3();
const viewerRight = new THREE.Vector3();
const cubesCenter = new THREE.Vector3();

// The viewer's pose isn't known at sessionstart, only once the first XR
// frame arrives -- so placement waits for that frame.
function placeInFrontOfViewer(frame) {
  const pose = frame.getViewerPose(renderer.xr.getReferenceSpace());
  if (!pose) return false;
  const { position, orientation } = pose.transform;
  viewerPosition.set(position.x, position.y, position.z);
  viewerOrientation.set(orientation.x, orientation.y, orientation.z, orientation.w);
  viewerForward.set(0, 0, -1).applyQuaternion(viewerOrientation);
  viewerRight.set(1, 0, 0).applyQuaternion(viewerOrientation);
  cubesCenter.copy(viewerPosition).addScaledVector(viewerForward, CUBE_DISTANCE);
  cubesCenter.y -= CUBE_DROP;
  orangeCube.position.copy(cubesCenter).addScaledVector(viewerRight, -CUBE_SIDE_OFFSET);
  greenCube.position.copy(cubesCenter).addScaledVector(viewerRight, CUBE_SIDE_OFFSET);
  return true;
}

async function fetchVersion() {
  const response = await fetch(VERSION_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`${VERSION_URL}: ${response.status}`);
  return (await response.text()).trim();
}

// Every deploy of this app bumps the site's version.txt; the page reloads
// as soon as it sees a new value, and the session stays up so the browser
// can carry immersive mode over to the reloaded page. Hosting releases a
// deploy's files all at once, so the new version.txt never shows up ahead
// of the code it goes with. Polling stops once the reload starts, since
// calling reload() again would restart it. A failed poll (say, briefly
// offline) is simply retried.
async function watchVersion() {
  let loadedVersion = null;
  for (;;) {
    try {
      const version = await fetchVersion();
      if (loadedVersion === null) loadedVersion = version;
      else if (version !== loadedVersion) {
        location.reload();
        return;
      }
    } catch (error) {
      console.warn("xrcube: version check failed", error);
    }
    await new Promise((resolve) => setTimeout(resolve, VERSION_POLL_MS));
  }
}
watchVersion();

renderer.setAnimationLoop((time, frame) => {
  if (placeOnNextFrame && frame && placeInFrontOfViewer(frame)) placeOnNextFrame = false;

  const seconds = time / 1000;
  orangeCube.rotation.set(seconds * 0.5, seconds * 0.8, 0);
  greenCube.rotation.set(seconds * 0.9, seconds * 0.5, 0);

  for (const state of handStates) updateHand(state);

  renderer.render(scene, camera);
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
