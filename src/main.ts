// Shamble Testlines: a throwaway feel sandbox for Shamble Frontlines. Nothing here is the game.
import * as THREE from 'three';
import './style.css';
import { FollowCamera } from './camera';
import { Hud } from './hud';
import { Input } from './input';
import { addLights, setInkResolution, type Faction } from './look';
import { newMover, stepMover, type MoveInput, type MoverState } from './movement';
import { Panel } from './panel';
import { Store } from './params';
import { Soldier } from './soldier';
import type { GunId } from './guns';
import { buildYard } from './yard';
import { makeDummies, otherFactions, steerDummy } from './dummies';
import { softPush } from './push';

const store = new Store();

// Renderer and scene.
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.append(renderer.domElement);
renderer.domElement.id = 'view';

const scene = new THREE.Scene();
scene.background = new THREE.Color('#cdd5de');
const lights = addLights(scene);
buildYard(scene);

const camera = new FollowCamera(window.innerWidth / window.innerHeight);
const input = new Input(renderer.domElement);
const hud = new Hud();
const panel = new Panel(store);

const soldier = new Soldier(store.get('faction') as Faction);
soldier.setGun(store.get('gun') as GunId);
scene.add(soldier.root);

// Eleven dummies in the other two factions' colours, half with each gun.
const dummies = makeDummies();
const dummySoldiers = dummies.map((d, i) => {
  const s = new Soldier(otherFactions(store.get('faction') as Faction)[d.side]);
  // Both factions carry both guns.
  s.setGun(Math.floor(i / 2) % 2 ? 'smg' : 'rifle');
  scene.add(s.root);
  return s;
});
const dummyYaw = dummies.map(() => 0);
function dressDummies() {
  const other = otherFactions(store.get('faction') as Faction);
  dummies.forEach((d, i) => dummySoldiers[i].setFaction(other[d.side]));
}

function resize() {
  const canvas = renderer.domElement;
  const w = Math.max(1, canvas.clientWidth);
  const h = Math.max(1, canvas.clientHeight);
  renderer.setSize(w, h, false);
  camera.cam.aspect = w / h;
  camera.cam.updateProjectionMatrix();
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  setInkResolution(size.x, size.y);
}
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(renderer.domElement);
resize();

// Simulation state: the step before and the current step, for smoothing the picture between steps.
let cur: MoverState = newMover(0, 0);
let prev: MoverState = { ...cur };
let acc = 0;
let last = performance.now();
/** Highest feet height since the last check (for the scripted checks). */
let peakY = 0;
store.onChange((key) => {
  if (key === null || key === 'faction') {
    soldier.setFaction(store.get('faction') as Faction);
    dressDummies();
  }
  if (key === null || key === 'gun') soldier.setGun(store.get('gun') as GunId);
  if (key === null || key === 'tickRate') acc = 0;
  if (key === null || key === 'camTurn') camera.resetTurn();
});

input.onKey((code, key) => {
  if (code === 'Backquote' || key === '`') panel.toggle();
  if (code === 'Digit1') store.set('gun', 'smg');
  if (code === 'Digit2') store.set('gun', 'rifle');
});

const moveInput: MoveInput = { wishX: 0, wishZ: 0, sprint: false, jump: false };

function readMoveInput() {
  const ax = camera.axes(store);
  let x = 0;
  let z = 0;
  if (input.down('KeyW')) {
    x += ax.fwdX;
    z += ax.fwdZ;
  }
  if (input.down('KeyS')) {
    x -= ax.fwdX;
    z -= ax.fwdZ;
  }
  if (input.down('KeyD')) {
    x += ax.rightX;
    z += ax.rightZ;
  }
  if (input.down('KeyA')) {
    x -= ax.rightX;
    z -= ax.rightZ;
  }
  const l = Math.hypot(x, z);
  moveInput.wishX = l > 1e-6 ? x / l : 0;
  moveInput.wishZ = l > 1e-6 ? z / l : 0;
  moveInput.sprint = input.down('ShiftLeft') || input.down('ShiftRight');
  // Held Space keeps jumping on landing, as the old game; a tap between two steps is not lost.
  moveInput.jump = input.takePress('Space') || input.down('Space');
}

// Aim: the cursor's ray meets a level plane at the gun's height above the soldier's feet.
const raycaster = new THREE.Raycaster();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const aimPoint = new THREE.Vector3();
const ndc = new THREE.Vector2();
let aimYaw = Math.PI * 1.25;
let sprintBlend = 0;
const renderPos = new THREE.Vector3();

function frame(now: number) {
  const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
  last = now;

  const stepDt = 1 / Number(store.get('tickRate'));
  acc += dt;
  let steps = 0;
  while (acc >= stepDt && steps < 12) {
    prev = { ...cur };
    readMoveInput();
    stepMover(cur, moveInput, stepDt, store);
    const walking = store.get('dummiesWalk') === true;
    for (const d of dummies) {
      d.prev = { ...d.state };
      steerDummy(d, walking, stepDt);
      stepMover(d.state, d.input, stepDt, store);
    }
    softPush(
      [cur, ...dummies.map((d) => d.state)],
      [true, ...dummies.map(() => true)],
      store.num('pushRadius'),
      store.num('pushStrength'),
      stepDt,
      store.num('bodyRadius'),
      store.num('stepUp'),
    );
    if (cur.y > peakY) peakY = cur.y;
    acc -= stepDt;
    steps++;
  }
  if (steps === 12) acc = 0;
  const alpha = Math.min(1, acc / stepDt);
  renderPos.set(
    prev.x + (cur.x - prev.x) * alpha,
    prev.y + (cur.y - prev.y) * alpha,
    prev.z + (cur.z - prev.z) * alpha,
  );

  const turn = input.takeTurn();
  if (turn) camera.turnBy(turn, store);
  // Off the view (on the panel, outside the window) the cursor stops pushing the camera; the aim stays.
  camera.update(dt, renderPos, input.over ? input.ndcX : 0, input.over ? input.ndcY : 0, store);

  // Face the cursor.
  camera.cam.updateMatrixWorld();
  ndc.set(input.ndcX, input.ndcY);
  raycaster.setFromCamera(ndc, camera.cam);
  aimPlane.constant = -(renderPos.y + 1.36);
  if (raycaster.ray.intersectPlane(aimPlane, aimPoint)) {
    const dx = aimPoint.x - renderPos.x;
    const dz = aimPoint.z - renderPos.z;
    if (dx * dx + dz * dz > 0.09) aimYaw = Math.atan2(dx, dz);
  }

  // The sprint pose comes in quickly and goes back to aiming over a short swing.
  const sprintTarget = cur.sprinting ? 1 : 0;
  const swing = sprintTarget > sprintBlend ? dt / 0.15 : dt / 0.2;
  sprintBlend = sprintTarget > sprintBlend ? Math.min(1, sprintBlend + swing) : Math.max(0, sprintBlend - swing);

  soldier.root.position.copy(renderPos);
  soldier.root.rotation.y = aimYaw;
  soldier.setPose(sprintBlend);
  dummies.forEach((d, i) => {
    const s = dummySoldiers[i];
    s.root.position.set(
      d.prev.x + (d.state.x - d.prev.x) * alpha,
      d.prev.y + (d.state.y - d.prev.y) * alpha,
      d.prev.z + (d.state.z - d.prev.z) * alpha,
    );
    // Face the way they walk, turning smoothly.
    const sp = Math.hypot(d.state.vx, d.state.vz);
    if (sp > 0.3) {
      const want = Math.atan2(d.state.vx, d.state.vz);
      let diff = want - dummyYaw[i];
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      dummyYaw[i] += diff * (1 - Math.exp(-10 * dt));
    }
    s.root.rotation.y = dummyYaw[i];
  });
  lights.follow(renderPos.x, renderPos.y, renderPos.z);

  hud.update(
    dt,
    Math.hypot(cur.vx, cur.vz),
    cur.y,
    Number(store.get('tickRate')),
    cur.stamina,
    cur.staminaLocked,
    store.get('staminaOn') === true,
  );
  renderer.render(scene, camera.cam);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// A small hook for the scripted browser checks (tools/browser-check.mjs).
(window as unknown as Record<string, unknown>).__testlines = {
  state: () => ({ ...cur }),
  values: () => ({ ...store.values }),
  aimYaw: () => aimYaw,
  info: () => ({ ...renderer.info.render }),
  axes: () => camera.axes(store),
  /** Highest feet height since the last call, then start again. */
  peak: () => {
    const p = peakY;
    peakY = cur.y;
    return p;
  },
  fps: () => document.getElementById('readout')?.textContent ?? '',
  set: (key: string, value: unknown) => store.set(key, value),
  /** Put the soldier somewhere, at rest (for the scripted checks only). */
  dummies: () => dummies.map((d) => ({ x: d.state.x, y: d.state.y, z: d.state.z })),
  /** Put a dummy somewhere, at rest (for the scripted checks only). */
  placeDummy: (i: number, x: number, z: number) => {
    Object.assign(dummies[i].state, newMover(x, z));
    dummies[i].prev = { ...dummies[i].state };
  },
  place: (x: number, z: number, y = 0) => {
    Object.assign(cur, newMover(x, z), { y });
    prev = { ...cur };
    peakY = y;
  },
};
