// Shamble Testlines: a throwaway feel sandbox for Shamble Frontlines. Nothing here is the game.
import * as THREE from 'three';
import './style.css';
import { audioState, click, clicksPlayed, unlockAudio } from './audio';
import { FollowCamera } from './camera';
import { makeDummies, otherFactions, steerDummy } from './dummies';
import { Fx } from './fx';
import type { GunId } from './guns';
import { Hud } from './hud';
import { Input } from './input';
import { addLights, setInkResolution, type Faction } from './look';
import { newMover, stepMover, type MoveInput, type MoverState } from './movement';
import { Panel } from './panel';
import { CAMERA_PRESETS, CAMERA_PROFILES, Store } from './params';
import { softPush } from './push';
import { Soldier } from './soldier';
import {
  GUN_KEYS,
  gunValue,
  newWeapons,
  readyIn,
  RISE_TIME,
  stepWeapons,
  switchGun,
  type ShotEvent,
  type Target,
} from './weapons';
import { buildYard } from './yard';

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

// Eleven dummies in the other two factions' colours; both factions carry both guns.
const dummies = makeDummies();
const dummySoldiers = dummies.map((d, i) => {
  const s = new Soldier(otherFactions(store.get('faction') as Faction)[d.side]);
  s.setGun(Math.floor(i / 2) % 2 ? 'smg' : 'rifle');
  // Tilt (flinch, falling) turns about the dummy's own left-right axis, after its facing.
  s.root.rotation.order = 'YXZ';
  scene.add(s.root);
  return s;
});
const targets: Target[] = dummies.map((d) => ({ state: d.state, health: store.num('dummyHealth'), downFor: 0 }));
const dummyYaw = dummies.map(() => 0);
const dummyFall = dummies.map(() => 0);
const dummyFlinch = dummies.map(() => 0);
/** Knockback on a hit: drawn only, so it never moves a dummy off its loop. */
const dummyKnock = dummies.map(() => new THREE.Vector2());
/** Which way a hit dummy tips: forward (+1) when shot from behind, backward (-1) when shot from the front. */
const dummyTip = dummies.map(() => -1);
function dressDummies() {
  const other = otherFactions(store.get('faction') as Faction);
  dummies.forEach((d, i) => dummySoldiers[i].setFaction(other[d.side]));
}

const fx = new Fx(scene, dummies.length);
const W = newWeapons(store, store.get('gun') as GunId);
const events: ShotEvent[] = [];
let shotsFired = 0;
let lastShotSpread = 0;
let lastShotRays = 0;

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
const cur: MoverState = newMover(0, 0);
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
  if (key === null || key === 'gun') {
    const g = store.get('gun') as GunId;
    soldier.setGun(g);
    switchGun(W, g, store);
  }
  if (key === null || key === 'tickRate') acc = 0;
  if (store.get('adsMode') !== lastAdsMode) {
    lastAdsMode = store.get('adsMode');
    aiming = false;
  }
  if (key === null || key === 'camTurn') camera.resetTurn();
  if (key === null || key === 'dummyHealth') for (const t of targets) if (t.downFor <= 0) t.health = store.num('dummyHealth');
});

input.onKey((code, key) => {
  unlockAudio();
  if (code === 'Backquote' || key === '`') panel.toggle();
  if (code === 'Digit1') store.set('gun', 'smg');
  if (code === 'Digit2') store.set('gun', 'rifle');
  if (code === 'Digit3') store.set('gun', 'shotgun');
});
renderer.domElement.addEventListener('pointerdown', () => unlockAudio());

const moveInput: MoveInput = { wishX: 0, wishZ: 0, sprint: false, jump: false, speedMult: 1 };
/** Aiming down sights, decided at each simulation step from the right button (hold or toggle). */
let aiming = false;
let lastAdsMode = store.get('adsMode');
input.onFocusLoss(() => {
  aiming = false;
});

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
  // Aiming down sights: the right button, held or toggled.
  const aimPress = input.takeAimPress();
  if (store.get('adsMode') === 'toggle') {
    if (aimPress) aiming = !aiming;
  } else aiming = input.aimHeld();
  moveInput.speedMult = aiming ? store.num('adsMoveMult') : 1;
  // Firing stops the sprint, and so do a press waiting for the gun to come up (after the gun's sprint-to-fire
  // delay) and aiming down sights.
  moveInput.sprint = (input.down('ShiftLeft') || input.down('ShiftRight')) && !input.fireHeld() && !W.queued && !aiming;
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
const muzzle = new THREE.Vector3();
const rayEnds: THREE.Vector3[] = [];
const shake = new THREE.Vector3();

/** One fixed simulation step: the player's soldier, his gun, the dummies, then the soft push. */
function simStep(dt: number) {
  prev = { ...cur };
  readMoveInput();
  stepMover(cur, moveInput, dt, store);
  stepWeapons(
    W,
    cur,
    { held: input.fireHeld(), pressed: input.takeFirePress(), reload: input.takePress('KeyR'), aimYaw, ads: aiming },
    targets,
    dt,
    store,
    events,
  );
  const walking = store.get('dummiesWalk') === true;
  dummies.forEach((d, i) => {
    const t = targets[i];
    d.prev = { ...d.state };
    if (t.downFor > 0) {
      // Down: lie still, then stand again with full health.
      t.downFor -= dt;
      d.input.wishX = d.input.wishZ = 0;
      if (t.downFor <= 0) {
        t.downFor = 0;
        t.health = store.num('dummyHealth');
        d.best = Infinity;
        d.stalled = 0;
      }
    } else steerDummy(d, walking, dt);
    stepMover(d.state, d.input, dt, store);
  });
  softPush(
    [cur, ...dummies.map((d) => d.state)],
    [true, ...targets.map((t) => t.downFor <= 0)],
    store.num('pushRadius'),
    store.num('pushStrength'),
    dt,
    store.num('bodyRadius'),
    store.num('stepUp'),
  );
  if (cur.y > peakY) peakY = cur.y;
}

function frame(now: number) {
  const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
  last = now;

  const stepDt = 1 / Number(store.get('tickRate'));
  acc += dt;
  let steps = 0;
  while (acc >= stepDt && steps < 12) {
    simStep(stepDt);
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
  camera.update(dt, renderPos, input.over ? input.ndcX : 0, input.over ? input.ndcY : 0, store, aiming);

  // Face the cursor (cast through the steady camera, before the shake is added).
  camera.cam.updateMatrixWorld();
  ndc.set(input.ndcX, input.ndcY);
  raycaster.setFromCamera(ndc, camera.cam);
  aimPlane.constant = -(renderPos.y + 1.36);
  if (raycaster.ray.intersectPlane(aimPlane, aimPoint)) {
    const dx = aimPoint.x - renderPos.x;
    const dz = aimPoint.z - renderPos.z;
    if (dx * dx + dz * dz > 0.09) aimYaw = Math.atan2(dx, dz);
  }

  // Effects age first; then this frame's shots start theirs, so they are drawn at full strength. The tracer
  // leaves the gun's muzzle as drawn; the hit marker shows on a confirmed hit.
  fx.update(dt, input.mouseX, input.mouseY);
  if (events.length) {
    soldier.muzzleWorld(muzzle);
    for (const e of events) {
      // One shot: one flash, one kick, one click, and one hit marker however many pellets hit.
      fx.shot(
        muzzle,
        e.rays.map((r, i) => ({
          to: (rayEnds[i] ??= new THREE.Vector3()).set(r.ex, r.ey, r.ez),
          hitSomething: r.hit >= 0 || r.hitBlock,
          tracer: Math.hypot(r.ex - e.ox, r.ez - e.oz) > 1,
        })),
        gunValue(store, e.gun, 'Recoil'),
        store.num('camLens'),
      );
      click();
      if (e.hits.length) fx.hit(e.hits[0], e.killed, input.mouseX, input.mouseY);
      for (const r of e.rays) {
        if (r.hit < 0) continue;
        fx.showBar(r.hit);
        dummyFlinch[r.hit] = 1;
        const len = Math.hypot(r.ex - e.ox, r.ez - e.oz);
        if (len > 1e-6) {
          const fy = dummyYaw[r.hit];
          dummyTip[r.hit] = ((r.ex - e.ox) * Math.sin(fy) + (r.ez - e.oz) * Math.cos(fy)) > 0 ? 1 : -1;
          const k = dummyKnock[r.hit];
          k.x += ((r.ex - e.ox) / len) * 0.12;
          k.y += ((r.ez - e.oz) / len) * 0.12;
          if (k.length() > 0.35) k.setLength(0.35);
        }
      }
    }
    lastShotRays = events[events.length - 1].rays.length;
    shotsFired += events.length;
    lastShotSpread = events[events.length - 1].spread;
    events.length = 0;
  }

  // The sprint pose comes in quickly; going back to aiming takes the gun's sprint-to-fire delay.
  const sprintTarget = cur.sprinting ? 1 : 0;
  const back = Math.max(0.05, gunValue(store, W.gun, 'SprintDelay'));
  sprintBlend =
    sprintTarget > sprintBlend ? Math.min(1, sprintBlend + dt / 0.15) : Math.max(0, sprintBlend - dt / back);

  soldier.root.position.copy(renderPos);
  soldier.root.rotation.y = aimYaw;
  soldier.setPose(sprintBlend, fx.gunKick);
  dummies.forEach((d, i) => {
    const s = dummySoldiers[i];
    const t = targets[i];
    const knock = dummyKnock[i];
    knock.multiplyScalar(Math.exp(-6 * dt));
    s.root.position.set(
      d.prev.x + (d.state.x - d.prev.x) * alpha + knock.x,
      d.prev.y + (d.state.y - d.prev.y) * alpha,
      d.prev.z + (d.state.z - d.prev.z) * alpha + knock.y,
    );
    // Face the way they walk, turning smoothly.
    const sp = Math.hypot(d.state.vx, d.state.vz);
    if (sp > 0.3 && t.downFor <= 0) {
      const want = Math.atan2(d.state.vx, d.state.vz);
      let diff = want - dummyYaw[i];
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      dummyYaw[i] += diff * (1 - Math.exp(-10 * dt));
    }
    // Flinch on a hit; fall over backwards when dropped, and get up over the last part of the down time.
    if (t.downFor > RISE_TIME) dummyFall[i] = Math.min(1, dummyFall[i] + dt / 0.25);
    else if (t.downFor > 0) dummyFall[i] = Math.min(dummyFall[i], t.downFor / RISE_TIME);
    else dummyFall[i] = 0;
    dummyFlinch[i] = Math.max(0, dummyFlinch[i] - dt * 8);
    const f = dummyFall[i];
    s.root.rotation.y = dummyYaw[i];
    s.root.rotation.x = dummyTip[i] * ((Math.PI / 2) * f * f * (3 - 2 * f) + 0.2 * dummyFlinch[i]);
  });
  fx.updateBars(
    dt,
    camera.cam,
    dummies.map((d, i) => ({
      x: dummySoldiers[i].root.position.x,
      y: d.state.y,
      z: dummySoldiers[i].root.position.z,
      health: targets[i].health,
      max: store.num('dummyHealth'),
      down: targets[i].downFor > 0,
    })),
  );
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
  const g = W.guns[W.gun];
  const winFrom = gunValue(store, W.gun, 'ActiveStart') / 100;
  hud.updateGun(
    dt,
    GUN_KEYS[W.gun].name,
    g.ammo,
    Math.max(1, Math.round(gunValue(store, W.gun, 'Mag'))),
    g.reloadLeft > 0 ? 1 - g.reloadLeft / g.reloadTotal : -1,
    readyIn(W, store) <= 0,
    winFrom,
    winFrom + gunValue(store, W.gun, 'ActiveWidth') / 100,
    g.active,
    aiming,
  );
  if (W.activeNote) {
    hud.activeTap(W.activeNote);
    W.activeNote = '';
  }

  // The view kick goes on last, so it never moves the aim.
  fx.shakeOffset(shake);
  camera.cam.translateX(shake.x);
  camera.cam.translateY(shake.y);
  if (fx.fovPunch > 0) {
    camera.cam.fov = store.num('camLens') + fx.fovPunch;
    camera.cam.updateProjectionMatrix();
  }
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
  /** Apply a camera profile or old preset by name (for the scripted checks). */
  preset: (name: string) => {
    const pr = [...CAMERA_PROFILES, ...CAMERA_PRESETS].find((p) => p.name === name);
    if (pr) store.setMany(pr.values);
  },
  dummies: () =>
    dummies.map((d, i) => ({
      x: d.state.x,
      y: d.state.y,
      z: d.state.z,
      speed: Math.hypot(d.state.vx, d.state.vz),
      health: targets[i].health,
      down: targets[i].downFor > 0,
    })),
  /** The camera as drawn: its position and its angle below the horizon, in degrees. */
  cam: () => {
    const d = new THREE.Vector3();
    camera.cam.getWorldDirection(d);
    return { x: camera.cam.position.x, y: camera.cam.position.y, z: camera.cam.position.z, pitch: (Math.asin(-d.y) * 180) / Math.PI };
  },
  /** Put a dummy somewhere, at rest and at full health (for the scripted checks only). */
  placeDummy: (i: number, x: number, z: number) => {
    Object.assign(dummies[i].state, newMover(x, z));
    dummies[i].prev = { ...dummies[i].state };
    targets[i].health = store.num('dummyHealth');
    targets[i].downFor = 0;
  },
  /** Put the soldier somewhere, at rest (for the scripted checks only). */
  place: (x: number, z: number, y = 0) => {
    Object.assign(cur, newMover(x, z), { y });
    prev = { ...cur };
    peakY = y;
  },
  audio: () => ({ state: audioState(), clicks: clicksPlayed }),
  aiming: () => aiming,
  aimPoint: () => ({ x: aimPoint.x, y: aimPoint.y, z: aimPoint.z }),
  gun: () => ({
    gun: W.gun,
    ...W.guns[W.gun],
    shots: shotsFired,
    readyIn: readyIn(W, store),
    queued: W.queued,
    lastShotSpread,
    lastShotRays,
  }),
  /** Where a world point is on the page, in CSS pixels. */
  screenOf: (x: number, y: number, z: number) => {
    const v = new THREE.Vector3(x, y, z).project(camera.cam);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  },
};
