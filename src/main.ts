// Shamble Testlines: a throwaway feel sandbox for Shamble Frontlines. Nothing here is the game.
import * as THREE from 'three';
import './style.css';
import { attenuation, audioState, click, CLICK_VOLUME, clicksPlayed, unlockAudio, worldSound, worldSounds, type FalloffCurve } from './audio';
import { FollowCamera } from './camera';
import { springStep } from './spring';
import { makeDummies, otherFactions, PARKED, SHOOTER, startOf, steerDummy, TEST_DUMMY_RULES, WALKER } from './dummies';
import { dummySeen, packVision, sightBlocked, sightBlockers, type Blockers, type Eye } from './sight';
import { addStandIns } from './standins';
import { Fx } from './fx';
import { aimedThrow, blastDamage, newGrenade, previewFlight, spent, stepGrenade, throwStart, type Blast, type Flight, type Grenade } from './grenade';
import { NadeFx } from './nadefx';
import { clearHornetGun, HORNET, newHornet, stepHornet } from './hornet';
import { HornetModel } from './hornetModel';
import { SightLine } from './sightline';
import type { GunId } from './guns';
import { Hud } from './hud';
import { AIM_KEY, Input } from './input';
import { addLights, GRID, GRID_COLOURS, setInkResolution, type Faction, type GridGroup } from './look';
import { MetricsRoom } from './metrics';
import { buildExport, MEASURED } from './exporter';
import { newMover, stepMover, type MoveInput, type MoverState } from './movement';
import { Panel } from './panel';
import { CAMERA_PRESETS, CAMERA_PROFILES, Store } from './params';
import { softPush } from './push';
import { Soldier } from './soldier';
import {
  AIM_DEAD_ZONE,
  castLevel,
  GUN_KEYS,
  gunValue,
  newWeapons,
  readyIn,
  RISE_TIME,
  rayBodies,
  stepWeapons,
  switchGun,
  traceAim,
  type AimPoint,
  type ShotEvent,
  type Target,
} from './weapons';
import { artGrid, buildYard, floorBelow, rayWorld, resolveWalls, setBodyHeight, surfaceAt } from './yard';

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
// The vision rule's stand-ins: two hedges and a smoke column in a test corner (they block sight only).
addStandIns(scene);

const camera = new FollowCamera(window.innerWidth / window.innerHeight);
const input = new Input(renderer.domElement);
const hud = new Hud();
const panel = new Panel(store);

const soldier = new Soldier(store.get('faction') as Faction);
soldier.setGun(store.get('gun') as GunId);
scene.add(soldier.root);
/** The stand-in's height, measured from its geometry: his headroom in the collision world, and the readout. */
const soldierHeight = new THREE.Box3().setFromObject(soldier.root).max.y;
setBodyHeight(soldierHeight);

// The metrics room beside the yard, and the measuring grid's settings.
const room = new MetricsRoom(scene, store);
function applyGrid() {
  GRID.on.value = store.get('gridOn') === true ? 1 : 0;
  GRID.minor.value = Number(store.get('gridStep')) || 0.5;
  const groups: [GridGroup, string][] = [
    ['ground', 'gridGround'],
    ['blocks', 'gridBlocks'],
    ['room', 'gridRoom'],
  ];
  for (const [g, key] of groups) GRID.base[g].value.set(GRID_COLOURS[String(store.get(key))] ?? GRID_COLOURS.grey);
  if (artGrid) artGrid.visible = GRID.on.value < 0.5;
}
applyGrid();

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

// The vision rule: which dummies are here (the two test dummies can be put away) and which are seen this frame.
const present = dummies.map(() => true);
const seen = dummies.map(() => true);
let lastEye: Eye = { x: 0, y: 1.65, z: 0, aim: 0, widthDeg: 190 };
/** For the scripted checks only: a facing held still (radians), or null (the cursor decides, as always). */
let aimHold: number | null = null;
let lastBlockers: Blockers | null = null;
const stepAcc = dummies.map(() => 0);
let shooterClock = 0;
let burstLeft = 0;
let burstGap = 0;
let shooterShots = 0;
let lastShooterShot: { from: { x: number; y: number; z: number }; to: { x: number; y: number; z: number }; hit: boolean; hidden: boolean } | null = null;
const shooterEvents: { from: THREE.Vector3; to: THREE.Vector3; hit: boolean }[] = [];
/** Outlines of hidden dummies (for explaining only): a ring at the feet and a line up the body, seen through walls. */
const ghostMat = new THREE.MeshBasicMaterial({ color: '#C9695A', transparent: true, opacity: 0.85, depthTest: false, depthWrite: false });
const ghosts = dummies.map(() => {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 28), ghostMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.8, 0.04), ghostMat);
  line.position.y = 0.9;
  g.add(ring, line);
  g.renderOrder = 9;
  ring.renderOrder = line.renderOrder = 9;
  g.visible = false;
  scene.add(g);
  return g;
});
/** Put the test dummies away (far outside the yard, out of every reach) or back on their loops, as switched. */
function placeTestDummies() {
  const on = store.get('visionDummies') === true;
  for (const i of [WALKER, SHOOTER]) {
    if (present[i] === on) continue;
    present[i] = on;
    const [x, z] = on ? startOf(i) : PARKED;
    const d = dummies[i];
    Object.assign(d.state, newMover(x, z));
    d.prev = { ...d.state };
    d.next = 1 % d.loop.length;
    d.best = Infinity;
    d.stalled = 0;
    targets[i].health = store.num('dummyHealth');
    // Put away it counts as down for good, so no shot, blast or push reaches it; back, it stands.
    targets[i].downFor = on ? 0 : Infinity;
    stepAcc[i] = 0;
  }
}
placeTestDummies();
store.onChange(() => placeTestDummies());
/** The dummies the player can see now (all of them here, with the vision rule off): the cursor and the sight line use only these. */
const shownTargets = (): Target[] => targets.filter((_, i) => seen[i]);
/** A dummy's sound at a point, heard from the player's soldier: the attenuation by distance and the pan by screen side. */
function dummySound(kind: 'step' | 'gun', x: number, y: number, z: number) {
  const vol = store.num(kind === 'step' ? 'stepVolume' : 'gunVolume');
  if (vol <= 0) return;
  const dx = x - cur.x;
  const dz = z - cur.z;
  const dist = Math.hypot(dx, y - cur.y, dz);
  const att = attenuation(dist, store.num('soundInner'), store.num('soundOuter'), store.get('soundCurve') as FalloffCurve);
  if (att <= 0) return;
  let pan = 0;
  if (store.get('soundPan') === true) {
    const ax = camera.axes(store);
    const h = Math.hypot(dx, dz);
    if (h > 1e-6) pan = (dx * ax.rightX + dz * ax.rightZ) / h;
  }
  worldSound(kind, vol * CLICK_VOLUME * att, pan, dist);
}
// The Hornet, waiting near the start; E gets on and off when the soldier is within reach.
const hornet = newHornet();
const hornetModel = new HornetModel(scene);
// The sight line while aiming down sights.
const sight = new SightLine(scene);
sight.setFaction(store.get('faction') as Faction);
let sightState: { visible: boolean; end: { x: number; y: number; z: number }; onDummy: boolean; blocked: boolean; height: number } = {
  visible: false,
  end: { x: 0, y: 0, z: 0 },
  onDummy: false,
  blocked: false,
  height: 0,
};
/** The point under the cursor (the first body, block, ramp or ground the cursor's ray meets), found each frame. */
let cursorPoint: AimPoint = null;
/** Shots aim at the point under the cursor, or fly level. */
const aimPoint3 = (): AimPoint => (store.get('aimAt') === 'point' ? cursorPoint : null);
const sightFrom = new THREE.Vector3();
const sightTo = new THREE.Vector3();
let riding = false;
const nadeFx = new NadeFx(scene, renderer);
/** The explosion sheet's settings, from the panel. */
const explosionLook = () => ({ time: store.num('nadeFxTime'), width: store.num('nadeFxWidth'), pull: store.num('nadeFxPull') });
nadeFx.setFaction(store.get('faction') as Faction);

// Grenades (the right button or G): carried count and refill, the throw being aimed, the grenades in flight, this
// frame's blasts.
const grenades: Grenade[] = [];
const blasts: { at: Blast; hits: number[]; killed: boolean }[] = [];
let nadesHeld = store.num('nadeCount');
let nadeRefillT = 0;
/** A throw is being aimed (the button is held and the arc shows). */
let nadeAiming = false;
/** The arc drawn for this aim at the last frame: the throw launches exactly this (from this place, at this velocity). */
let nadeArc: { o: [number, number, number]; v: [number, number, number]; flight: Flight; target: { x: number; y: number; z: number } } | null =
  null;
/** The point under the cursor (ground, block or ramp), found at each frame: where the next throw is aimed. */
let nadeTarget: { x: number; y: number; z: number } | null = null;
let nadesThrown = 0;
let blastsDone = 0;
let lastFirstContact: { x: number; y: number; z: number } | null = null;
/** The blast's camera kick: a spring, solved exactly at each simulation step, and its offset at the step before. */
const kick = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
const kickPrev = { x: 0, y: 0, z: 0 };
const W = newWeapons(store, store.get('gun') as GunId);
const events: ShotEvent[] = [];
let shotsFired = 0;
let lastShotSpread = 0;
let lastShotRays = 0;
let lastShotEnd = { x: 0, y: 0, z: 0 };
/** The arc drawn at the last frame, and the arc shown just before the last throw (for the scripted checks). */
let lastPreview: Flight | null = null;
let lastThrow: { preview: Flight | null; target: { x: number; y: number; z: number } } | null = null;
/** The last blast: where it went off and where that grenade bounced on the way (for the scripted checks). */
let lastBlast: { at: Blast; bounces: { x: number; y: number; z: number }[] } | null = null;

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
  room.rebuild();
  applyGrid();
  if (key === null || key === 'faction') {
    soldier.setFaction(store.get('faction') as Faction);
    dressDummies();
    nadeFx.setFaction(store.get('faction') as Faction);
    sight.setFaction(store.get('faction') as Faction);
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
  // A gun key puts a readied grenade away (and drops a throw being aimed).
  if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') putNadeAway();
});
renderer.domElement.addEventListener('pointerdown', () => unlockAudio());

const moveInput: MoveInput = { wishX: 0, wishZ: 0, sprint: false, jump: false, speedMult: 1 };
/** Aiming down sights, decided at each simulation step from the right button (unless a grenade is ready) and Q. */
let aiming = false;
let lastAdsMode = store.get('adsMode');
/** A grenade is in hand (G or F): the right button aims and throws it, and the gun is put away. */
let nadeReady = false;
input.onFocusLoss(() => {
  aiming = false;
  // A readied grenade goes away (a throw being aimed is dropped) when the page loses focus; so does the Hornet's charge.
  putNadeAway();
  clearHornetGun(hornet);
});
input.onForcedMenu(() => endNadeAim());

/** Stop aiming a throw (thrown or dropped): the arc goes. */
function endNadeAim() {
  nadeAiming = false;
  nadeArc = null;
  lastPreview = null;
}

/** Put a readied grenade away: back to the gun, and any throw being aimed is dropped. */
function putNadeAway() {
  nadeReady = false;
  endNadeAim();
}

function readMoveInput(rightPress: boolean) {
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
  // Aiming down sights: the right button (unless a grenade is ready) and Q, held or toggled.
  const rightAims = !nadeReady;
  const aimPress = input.takePress(AIM_KEY) || (rightAims && rightPress);
  if (store.get('adsMode') === 'toggle') {
    if (aimPress) aiming = !aiming;
  } else aiming = input.down(AIM_KEY) || (rightAims && input.rightHeld());
  moveInput.speedMult = aiming ? store.num('adsMoveMult') : 1;
  // Firing stops the sprint, and so do a press waiting for the gun to come up (after the gun's sprint-to-fire
  // delay) and aiming down sights.
  moveInput.sprint =
    (input.down('ShiftLeft') || input.down('ShiftRight')) && (!input.fireHeld() || nadeReady) && !W.queued && !aiming;
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
const measureA = new THREE.Vector3();
const measureB = new THREE.Vector3();

/** One fixed simulation step: the player's soldier, his gun, the dummies, then the soft push. */
function simStep(dt: number) {
  prev = { ...cur };
  // The right button's press and let-go are read once a step and go to the grenade or to aiming down sights.
  const rightPress = input.takeRightPress();
  const rightRelease = input.takeRightRelease();
  if (input.takePress('KeyE')) toggleRide();
  if (riding) {
    // On the Hornet: W/S throttle, A/D turn, the left button its gun; the soldier's own keys wait.
    aiming = false;
    for (const k of ['KeyG', 'KeyF', AIM_KEY, 'KeyR', 'Space']) input.takePress(k);
    input.takeRelease('KeyG');
    input.takeRelease('KeyF');
    stepHornet(
      hornet,
      {
        throttle: (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0),
        steer: (input.down('KeyA') ? 1 : 0) - (input.down('KeyD') ? 1 : 0),
        firePressed: input.takeFirePress(),
        fireReleased: input.takeFireRelease(),
        fireHeld: input.fireHeld(),
        aimYaw,
      },
      dt,
      store,
      targets,
      events,
    );
    // The player's body is the Hornet while he rides it (the camera, the pushing and the readouts follow it).
    const b = hornet.body;
    Object.assign(cur, { x: b.x, y: b.y, z: b.z, vx: b.vx, vz: b.vz, vy: b.vy, grounded: b.grounded, sprinting: false });
  } else {
    readMoveInput(rightPress);
    nadeInput(rightPress, rightRelease);
    stepMover(cur, moveInput, dt, store);
    // While a grenade is ready the gun is put away: the left button does nothing.
    const firePress = input.takeFirePress();
    input.takeFireRelease();
    stepWeapons(
      W,
      cur,
      { held: input.fireHeld() && !nadeReady, pressed: firePress && !nadeReady, reload: input.takePress('KeyR'), aimYaw, ads: aiming, aimAt: aimPoint3() },
      targets,
      dt,
      store,
      events,
    );
    // The Hornet left standing rolls to a stop and its lean settles.
    stepHornet(hornet, { throttle: 0, steer: 0, firePressed: false, fireReleased: false, fireHeld: false, aimYaw: hornet.turret }, dt, store, targets, events);
  }
  const walking = store.get('dummiesWalk') === true;
  dummies.forEach((d, i) => {
    const t = targets[i];
    d.prev = { ...d.state };
    // A test dummy put away stays where it was put (the yard's edge would pull it back in).
    if (!present[i]) return;
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
    // A footstep every so many metres walked on the ground, heard as the dummies' sounds are (hidden or not).
    if (t.downFor <= 0 && d.state.grounded) {
      stepAcc[i] += Math.hypot(d.state.x - d.prev.x, d.state.z - d.prev.z);
      const every = store.num('stepEvery');
      if (stepAcc[i] >= every) {
        stepAcc[i] %= every;
        dummySound('step', d.state.x, d.state.y, d.state.z);
      }
    }
  });
  stepShooter(dt);
  softPush(
    [cur, ...dummies.map((d) => d.state)],
    [true, ...targets.map((t, i) => present[i] && t.downFor <= 0)],
    store.num('pushRadius'),
    store.num('pushStrength'),
    dt,
    store.num('bodyRadius'),
    store.num('stepUp'),
    // The ridden Hornet pushes the dummies aside but is not pushed.
    [riding],
  );
  stepNades(dt);
  if (cur.y > peakY) peakY = cur.y;
}

/**
 * The vision rule, each drawn frame from the drawn positions: the eyes (on the Hornet, from its footplates) and the
 * cone where the soldier faces; what blocks sight (the Hornet too, unless he rides it); which dummies are seen. The
 * grid shader gets the same test, so the white shows exactly where the eyes reach.
 */
function updateVision(alpha: number) {
  const on = store.get('visionOn') === true;
  const eye: Eye = {
    x: renderPos.x,
    y: renderPos.y + (riding ? HORNET.footplate_height_m : 0) + store.num('visionEye'),
    z: renderPos.z,
    aim: aimYaw,
    widthDeg: store.num('visionWidth'),
  };
  lastEye = eye;
  // (The Hornet as drawn this frame.)
  const hp = hornetModel.root.position;
  const B = sightBlockers(riding ? null : { x: hp.x, y: hp.y, z: hp.z, r: store.num('hornetRadius') });
  lastBlockers = B;
  packVision(B, eye, on, store.num('visionWhite'));
  dummies.forEach((d, i) => {
    if (!present[i]) {
      seen[i] = false;
      return;
    }
    if (!on) {
      seen[i] = true;
      return;
    }
    // (A dummy down on the ground is looked at low.)
    seen[i] = dummySeen(B, eye, d.prev.x + (d.state.x - d.prev.x) * alpha, d.prev.y + (d.state.y - d.prev.y) * alpha, d.prev.z + (d.state.z - d.prev.z) * alpha, targets[i].downFor > 0);
  });
}

/**
 * The vision rule's shooter: while switched on, every few seconds, if no wall stands between its gun and your
 * soldier's chest, a short burst at you (with some spread). Its shots pass through hedges and smoke, stop at blocks
 * and the ground, and do no damage; their tracers are always drawn and each is heard.
 */
function stepShooter(dt: number) {
  const R = TEST_DUMMY_RULES;
  const s = dummies[SHOOTER].state;
  if (!present[SHOOTER] || store.get('shooterOn') !== true || targets[SHOOTER].downFor > 0) {
    burstLeft = 0;
    shooterClock = 0;
    return;
  }
  const gx = s.x;
  const gy = s.y + R.shooter_gun_height_m;
  const gz = s.z;
  const chestY = cur.y + (riding ? HORNET.footplate_height_m : 0) + R.shooter_aims_at_height_m;
  shooterClock += dt;
  if (burstLeft > 0) {
    burstGap -= dt;
    if (burstGap > 0) return;
    burstLeft--;
    burstGap = R.shooter_gap_s;
    const sp = R.shooter_spread_m;
    const tx = cur.x + (Math.random() * 2 - 1) * sp;
    const ty = chestY + (Math.random() * 2 - 1) * sp * 0.5;
    const tz = cur.z + (Math.random() * 2 - 1) * sp;
    const len = Math.hypot(tx - gx, ty - gy, tz - gz) || 1;
    const dx = (tx - gx) / len;
    const dy = (ty - gy) / len;
    const dz = (tz - gz) / len;
    const w = rayWorld(gx, gy, gz, dx, dy, dz);
    const wd = w ? Math.hypot(w.x - gx, w.y - gy, w.z - gz) : Infinity;
    const hit = wd <= R.shooter_range_m;
    const d = hit ? wd : R.shooter_range_m;
    const from = new THREE.Vector3(gx, gy, gz);
    const to = new THREE.Vector3(gx + dx * d, gy + dy * d, gz + dz * d);
    shooterEvents.push({ from, to, hit });
    shooterShots++;
    lastShooterShot = { from: { x: gx, y: gy, z: gz }, to: { x: to.x, y: to.y, z: to.z }, hit, hidden: !seen[SHOOTER] };
    return;
  }
  if (shooterClock < R.shooter_period_s) return;
  shooterClock -= R.shooter_period_s;
  // Only within its range and with a clear line of fire: no block between its gun and your chest.
  const len = Math.hypot(cur.x - gx, chestY - gy, cur.z - gz);
  if (len < 1e-6 || len > R.shooter_range_m) return;
  const w = rayWorld(gx, gy, gz, (cur.x - gx) / len, (chestY - gy) / len, (cur.z - gz) / len);
  if (w && Math.hypot(w.x - gx, w.y - gy, w.z - gz) < len - 0.3) return;
  burstLeft = R.shooter_burst;
  burstGap = 0;
}

/** True if a waist-high line between two points on the ground meets no block. */
function clearBetween(ax: number, az: number, bx: number, bz: number, y: number): boolean {
  const d = Math.hypot(bx - ax, bz - az);
  if (d < 1e-6) return true;
  return castLevel(ax, az, y + 1, (bx - ax) / d, (bz - az) / d, d, []).t >= d - 1e-6;
}

/** True if the soldier stands within reach of the Hornet (at about its height, with no wall between them). */
function nearHornet(): boolean {
  const b = hornet.body;
  return (
    Math.hypot(cur.x - b.x, cur.z - b.z) <= store.num('hornetMountRange') &&
    Math.abs(cur.y - b.y) < 1 &&
    clearBetween(cur.x, cur.z, b.x, b.z, Math.max(cur.y, b.y))
  );
}

/**
 * E: get on the Hornet within reach, or off it, onto a free spot beside it (its right, left, back or front). Either
 * way the soldier's and the Hornet's held buttons, charge and aims are let go.
 */
function toggleRide() {
  // Nothing happens away from it, nor getting off while it is in the air.
  if (!riding ? !nearHornet() || !cur.grounded : !hornet.body.grounded) return;
  input.takeFirePress();
  input.takeFireRelease();
  clearHornetGun(hornet);
  W.queued = false;
  aiming = false;
  putNadeAway();
  if (!riding) {
    riding = true;
    hornetModel.seat.add(soldier.root);
    soldier.root.position.set(0, 0, 0);
    soldier.root.rotation.set(0, 0, 0);
    soldier.setGunVisible(false);
    const b = hornet.body;
    Object.assign(cur, { x: b.x, y: b.y, z: b.z, vx: 0, vz: 0, vy: 0, grounded: true, sprinting: false, pullX: 0, pullZ: 0 });
    prev = { ...cur };
    return;
  }
  riding = false;
  const r = store.num('bodyRadius');
  const d = store.num('hornetRadius') + r + 0.15;
  const h = hornet.heading;
  const b = hornet.body;
  let spot = { x: b.x, z: b.z };
  for (const [ox, oz] of [
    [-Math.cos(h), Math.sin(h)],
    [Math.cos(h), -Math.sin(h)],
    [-Math.sin(h), -Math.cos(h)],
    [Math.sin(h), Math.cos(h)],
  ]) {
    const x = b.x + ox * d;
    const z = b.z + oz * d;
    const [rx, rz] = resolveWalls(x, z, r, b.y, store.num('stepUp'));
    if (
      Math.hypot(rx - x, rz - z) < 1e-6 &&
      Math.abs(surfaceAt(x, z, 0.15, b.y + 0.3, store.num('stepUp')) - b.y) < store.num('stepUp') &&
      clearBetween(b.x, b.z, x, z, b.y)
    ) {
      spot = { x, z };
      break;
    }
  }
  // A fresh body on the spot, keeping his stamina as it was.
  Object.assign(cur, newMover(spot.x, spot.z), {
    y: surfaceAt(spot.x, spot.z, 0.15, b.y + 0.3, store.num('stepUp')),
    stamina: cur.stamina,
    staminaLocked: cur.staminaLocked,
  });
  prev = { ...cur };
  scene.add(soldier.root);
  soldier.setGunVisible(true);
}

/** Where a throw starts: the soldier's middle, at throwing height. */
function throwOrigin(): [number, number, number] {
  return throwStart(cur.x, cur.y, cur.z);
}

/**
 * The grenade buttons, first thing in a step, so a throw leaves for exactly the target, from exactly the place the
 * arc showed at the last frame. G or F readies a grenade (or puts it away); with one ready, hold the right button
 * to aim, let go to throw, and it is back to the gun.
 */
function nadeInput(rightPress: boolean, rightRelease: boolean) {
  // G or F readies a grenade (the gun goes away and aiming down sights ends), or puts it away again, dropping a
  // throw being aimed. With none in hand, nothing.
  const toggle = input.takePress('KeyG') || input.takePress('KeyF');
  input.takeRelease('KeyG');
  input.takeRelease('KeyF');
  if (toggle) {
    if (nadeReady) putNadeAway();
    else if (nadesHeld > 0) {
      nadeReady = true;
      aiming = false;
      // A shot waiting for the gun to come up is let go: the gun is put away.
      W.queued = false;
    }
    // The right button pressed with that key starts nothing: the throw needs a fresh press.
    return;
  }
  if (!nadeReady) return;
  const held = input.rightHeld();
  if (nadeAiming && (rightRelease || !held)) {
    // The arc drawn at the last frame, if it was drawn from here; with none drawn yet (a click within one frame),
    // the throw is worked out now for the target under the cursor; with no target at all, it is dropped.
    const o = throwOrigin();
    const arc = nadeArc && nadeArc.o[0] === o[0] && nadeArc.o[1] === o[1] && nadeArc.o[2] === o[2] ? nadeArc : null;
    const target = arc ? arc.target : nadeTarget;
    if (target) {
      const v = arc ? arc.v : aimedThrow(o, target, aimYaw, store);
      grenades.push(newGrenade(o[0], o[1], o[2], v, store));
      lastThrow = { preview: arc ? arc.flight : null, target };
      nadesHeld--;
      nadesThrown++;
    }
    // Thrown: back to the gun.
    putNadeAway();
    return;
  }
  if (rightPress && !nadeAiming && nadesHeld > 0) nadeAiming = true;
}

/** One step of the grenades: the refill, the flights, the blasts, the camera kick. */
function stepNades(dt: number) {
  const max = Math.round(store.num('nadeCount'));
  if (nadesHeld > max) nadesHeld = max;
  if (nadesHeld < max) {
    nadeRefillT += dt;
    if (nadeRefillT >= store.num('nadeRefill')) {
      nadesHeld++;
      nadeRefillT = 0;
    }
  } else nadeRefillT = 0;
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    stepGrenade(g, dt, store);
    if (g.firstContact) lastFirstContact = g.firstContact;
    if (!spent(g)) continue;
    grenades.splice(i, 1);
    const at: Blast = { x: g.x, y: g.y, z: g.z };
    lastBlast = { at, bounces: g.bounceAt };
    const hits: number[] = [];
    let killed = false;
    targets.forEach((t, k) => {
      if (t.downFor > 0) return;
      const dmg = blastDamage(at, dummies[k].state, store);
      if (dmg <= 0) return;
      t.health -= dmg;
      hits.push(k);
      if (t.health <= 0) {
        t.health = 0;
        t.downFor = Math.max(RISE_TIME + 0.05, store.num('dummyDownTime'));
        killed = true;
      }
    });
    // The camera lurches away from the blast, harder the closer it is.
    let ax = cur.x - at.x;
    let az = cur.z - at.z;
    const d = Math.hypot(ax, az);
    const prox = Math.max(0, 1 - d / store.num('nadeKickRange'));
    if (prox > 0) {
      if (d > 0.6) {
        ax /= d;
        az /= d;
      } else {
        const a = (blastsDone * 2.39) % (Math.PI * 2);
        ax = Math.cos(a);
        az = Math.sin(a);
      }
      const imp = store.num('nadeKick') * prox;
      kick.vx += ax * imp;
      kick.vz += az * imp;
      kick.vy += imp * 0.4;
    }
    blasts.push({ at, hits, killed });
    blastsDone++;
  }
  // The kick's spring, solved here at each step; the picture is smoothed between steps.
  const k = store.num('nadeKickStiff');
  const c = store.num('nadeKickDamp');
  for (const ax of ['x', 'y', 'z'] as const) {
    const v = ('v' + ax) as 'vx' | 'vy' | 'vz';
    kickPrev[ax] = kick[ax];
    [kick[ax], kick[v]] = springStep(kick[ax], kick[v], k, c, dt);
  }
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

  // The cursor's ray, cast through the steady camera (before the shake is added): the facing and the aim point.
  camera.cam.updateMatrixWorld();
  ndc.set(input.ndcX, input.ndcY);
  raycaster.setFromCamera(ndc, camera.cam);
  // The soldier's size on screen, from the steady camera: feet to the top of his head, in CSS pixels.
  {
    const r = renderer.domElement.getBoundingClientRect();
    // (On the Hornet he stands on its footplates.)
    const feetY = renderPos.y + (riding ? HORNET.footplate_height_m : 0);
    const a = measureA.set(renderPos.x, feetY, renderPos.z).project(camera.cam);
    const b = measureB.set(renderPos.x, feetY + soldierHeight, renderPos.z).project(camera.cam);
    const px = Math.hypot(((b.x - a.x) / 2) * r.width, ((b.y - a.y) / 2) * r.height);
    MEASURED.soldierHeightM = soldierHeight;
    MEASURED.soldierOnScreenPx = px;
    MEASURED.viewHeightPx = r.height;
    hud.updateMeasure(soldierHeight, px, r.height);
  }
  // The grenade's target: the first surface under the cursor (a wall's face too, for a throw off it).
  const ro = raycaster.ray.origin;
  const rd = raycaster.ray.direction;
  nadeTarget = rayWorld(ro.x, ro.y, ro.z, rd.x, rd.y, rd.z);
  // The shots' aim point: the nearer of a standing dummy's body (where it really stands) and that surface. (Only the
  // dummies you see: under the vision rule the cursor does not land on a hidden one.)
  {
    const [tb] = rayBodies(ro.x, ro.y, ro.z, rd.x, rd.y, rd.z, shownTargets());
    const tw = nadeTarget ? Math.hypot(nadeTarget.x - ro.x, nadeTarget.y - ro.y, nadeTarget.z - ro.z) : Infinity;
    const t = Math.min(tb, tw);
    cursorPoint = Number.isFinite(t) ? { x: ro.x + rd.x * t, y: ro.y + rd.y * t, z: ro.z + rd.z * t } : null;
  }
  // Facing: aiming at the point (on foot), toward that point, the way the shot goes; otherwise (level shots, the
  // Hornet, the cursor on the sky) toward where the cursor's ray crosses gun height. Within 0.3 m of him he keeps
  // the facing he had.
  const facePoint = aimPoint3() && !riding ? cursorPoint : null;
  aimPlane.constant = -(renderPos.y + (riding ? HORNET.gun_height_m : 1.36));
  const onPlane = raycaster.ray.intersectPlane(aimPlane, aimPoint) !== null;
  // (The scripted checks can hold the facing still; the player never does.)
  if (aimHold !== null) aimYaw = aimHold;
  else if (facePoint || onPlane) {
    const dx = (facePoint ? facePoint.x : aimPoint.x) - renderPos.x;
    const dz = (facePoint ? facePoint.z : aimPoint.z) - renderPos.z;
    if (dx * dx + dz * dz > AIM_DEAD_ZONE * AIM_DEAD_ZONE) aimYaw = Math.atan2(dx, dz);
  }

  // Effects age first; then this frame's shots start theirs, so they are drawn at full strength. The tracer
  // leaves the gun's muzzle as drawn; the hit marker shows on a confirmed hit.
  fx.update(dt, input.mouseX, input.mouseY);
  nadeFx.update(dt, explosionLook());
  // Blasts of this frame: the explosion (the sheet, or the plain flash and ring) and fragments; hit dummies flinch
  // and show their bars; the hit marker on a hit.
  for (const b of blasts) {
    nadeFx.blast(b.at, store.num('nadeRadius'), store.get('nadeLook') === 'plain' ? 'plain' : 'sheet', store.get('nadeFrags') !== false);
    const prox = Math.max(0, 1 - Math.hypot(cur.x - b.at.x, cur.z - b.at.z) / store.num('nadeKickRange'));
    fx.shake = Math.max(fx.shake, 0.4 * prox);
    if (b.hits.length) fx.hit(b.hits[0], b.killed, input.mouseX, input.mouseY);
    for (const h of b.hits) {
      fx.showBar(h);
      dummyFlinch[h] = 1;
      const dx = dummies[h].state.x - b.at.x;
      const dz = dummies[h].state.z - b.at.z;
      const l = Math.hypot(dx, dz) || 1;
      const fy = dummyYaw[h];
      dummyTip[h] = (dx * Math.sin(fy) + dz * Math.cos(fy)) / l > 0 ? 1 : -1;
      dummyKnock[h].x += (dx / l) * 0.3;
      dummyKnock[h].y += (dz / l) * 0.3;
      if (dummyKnock[h].length() > 0.5) dummyKnock[h].setLength(0.5);
    }
  }
  blasts.length = 0;
  nadeFx.showGrenades(grenades, alpha);
  // While a throw is aimed: its whole flight, bounces and burst included, exactly as the grenade will fly it.
  if (nadeAiming && nadeTarget) {
    const o = throwOrigin();
    const v = aimedThrow(o, nadeTarget, aimYaw, store);
    lastPreview = previewFlight(o, v, store);
    nadeArc = { o, v, flight: lastPreview, target: { ...nadeTarget } };
    nadeFx.preview(lastPreview, store.num('nadeRadius'));
  } else {
    if (nadeAiming) {
      nadeArc = null;
      lastPreview = null;
    }
    nadeFx.preview(null, 0);
  }
  if (events.length) {
    hornetModel.update(hornet, alpha);
    for (const e of events) {
      // One shot: one flash, one kick, one click, and one hit marker however many pellets hit. The Hornet's
      // shots start at its gun as drawn (its kick is its own), and its full charge draws a beam.
      const hornetShot = e.gun === 'hornet';
      if (hornetShot) hornetModel.muzzleWorld(muzzle);
      else soldier.muzzleWorld(muzzle);
      fx.shot(
        muzzle,
        e.rays.map((r, i) => ({
          to: (rayEnds[i] ??= new THREE.Vector3()).set(r.ex, r.ey, r.ez),
          hitSomething: r.hit >= 0 || r.hitBlock,
          tracer: !e.beam && Math.hypot(r.ex - e.ox, r.ez - e.oz) > 1,
        })),
        hornetShot ? (e.beam ? HORNET.camera_kick_beam : HORNET.camera_kick_pellets) : gunValue(store, e.gun as GunId, 'Recoil'),
        store.num('camLens'),
      );
      if (e.beam) fx.beam(muzzle, rayEnds[0]);
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
    {
      const r0 = events[events.length - 1].rays[0];
      lastShotEnd = { x: r0.ex, y: r0.ey, z: r0.ez };
    }
    shotsFired += events.length;
    lastShotSpread = events[events.length - 1].spread;
    events.length = 0;
  }

  // The shooter's shots: tracers always drawn (whether it is seen or not), and each heard from where it fired.
  for (const e of shooterEvents) {
    fx.enemyShot(e.from, e.to, e.hit);
    dummySound('gun', e.from.x, e.from.y, e.from.z);
  }
  shooterEvents.length = 0;

  // The sprint pose comes in quickly; going back to aiming takes the gun's sprint-to-fire delay.
  const sprintTarget = cur.sprinting ? 1 : 0;
  const back = Math.max(0.05, gunValue(store, W.gun, 'SprintDelay'));
  sprintBlend =
    sprintTarget > sprintBlend ? Math.min(1, sprintBlend + dt / 0.15) : Math.max(0, sprintBlend - dt / back);

  hornetModel.update(hornet, alpha);
  updateVision(alpha);
  if (riding) {
    // On the footplates, facing the way the Hornet faces, leaning with it.
    soldier.root.position.set(0, 0, 0);
    soldier.root.rotation.set(0, 0, 0);
    soldier.setPose(0, 0);
  } else {
    soldier.root.position.copy(renderPos);
    soldier.root.rotation.y = aimYaw;
    soldier.setPose(sprintBlend, fx.gunKick);
  }
  // The sight line while aiming down sights: the shot's own cast from where the soldier is, drawn from his muzzle.
  if (aiming && !riding && !nadeReady && store.get('sightLine') === true) {
    // (Under the vision rule the line passes hidden dummies: it does not stop on them or take their colour. The shot
    // itself still hits them.)
    const t = traceAim(cur, aimYaw, gunValue(store, W.gun, 'Range'), shownTargets(), aimPoint3());
    soldier.root.updateMatrixWorld(true);
    soldier.muzzleWorld(sightFrom);
    sightTo.set(t.ex, t.ey, t.ez);
    sight.show(sightFrom, sightTo, t.hit >= 0, floorBelow(t.ex, t.ez, t.ey));
    sightState = { visible: true, end: { x: t.ex, y: t.ey, z: t.ez }, onDummy: t.hit >= 0, blocked: t.hitBlock, height: t.ey - floorBelow(t.ex, t.ez, t.ey) };
  } else {
    sight.show(null, sightTo, false);
    sightState = { ...sightState, visible: false };
  }
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
    // Under the vision rule only the dummies the soldier sees are drawn (body, ink line and shadow alike); a test
    // dummy put away is never drawn.
    s.root.visible = seen[i];
    // Outlines of the hidden ones, when asked for (for explaining only).
    const g = ghosts[i];
    g.visible = present[i] && !seen[i] && store.get('visionOn') === true && store.get('visionGhosts') === true;
    if (g.visible) g.position.set(s.root.position.x, s.root.position.y, s.root.position.z);
    // Face the way they walk, turning smoothly; the shooter faces the soldier.
    const sp = Math.hypot(d.state.vx, d.state.vz);
    const facesYou = i === SHOOTER && present[i];
    if ((sp > 0.3 || facesYou) && t.downFor <= 0) {
      const want = facesYou ? Math.atan2(renderPos.x - d.state.x, renderPos.z - d.state.z) : Math.atan2(d.state.vx, d.state.vz);
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
      hidden: !seen[i],
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
  hud.hint(!riding && nearHornet() ? 'E: ride the Hornet' : '');
  if (riding)
    hud.updateHornet(Math.sign(hornet.speed) * Math.hypot(cur.vx, cur.vz), hornet.charging ? hornet.charge : -1, hornet.cooldown <= 0 && hornet.weak <= 0, hornet.weak > 0);
  else hud.updateGun(
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

  hud.updateNade(nadesHeld, Math.round(store.num('nadeCount')), nadeAiming, nadeReady);
  // The view kick goes on last, so it never moves the aim (and the blast's kick with it).
  camera.cam.position.x += kickPrev.x + (kick.x - kickPrev.x) * alpha;
  camera.cam.position.y += kickPrev.y + (kick.y - kickPrev.y) * alpha;
  camera.cam.position.z += kickPrev.z + (kick.z - kickPrev.z) * alpha;
  fx.shakeOffset(shake);
  camera.cam.translateX(shake.x);
  camera.cam.translateY(shake.y);
  if (fx.fovPunch > 0) {
    camera.cam.fov = store.num('camLens') + fx.fovPunch;
    camera.cam.updateProjectionMatrix();
  }
  // The explosion pictures face the camera as it is drawn, kick and shake included.
  nadeFx.place(camera.cam, explosionLook());
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
      /** False for a vision test dummy put away. */
      present: present[i],
    })),
  /** The camera as drawn: its position and its angle below the horizon, in degrees. */
  cam: () => {
    const d = new THREE.Vector3();
    camera.cam.getWorldDirection(d);
    return { x: camera.cam.position.x, y: camera.cam.position.y, z: camera.cam.position.z, pitch: (Math.asin(-d.y) * 180) / Math.PI };
  },
  /** Put a dummy somewhere, at rest and at full health (for the scripted checks only). */
  placeDummy: (i: number, x: number, z: number, y = 0) => {
    Object.assign(dummies[i].state, newMover(x, z), { y });
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
  /** The Hornet's state (for the scripted checks). */
  hornet: () => ({
    riding,
    x: hornet.body.x,
    y: hornet.body.y,
    z: hornet.body.z,
    heading: hornet.heading,
    speed: hornet.speed,
    pitch: (hornet.pitch * 180) / Math.PI,
    roll: (hornet.roll * 180) / Math.PI,
    charging: hornet.charging,
    charge: hornet.charge,
    cooldown: hornet.cooldown,
    weak: hornet.weak,
    shots: hornet.shots,
    beams: hornet.beams,
    leanSinceBeam: (hornet.leanSinceBeam * 180) / Math.PI,
    turret: hornet.turret,
  }),
  /** Put the Hornet somewhere, at rest, facing a heading in degrees (for the scripted checks only). */
  placeHornet: (x: number, z: number, headingDeg = 180) => {
    const { shots, beams } = hornet;
    Object.assign(hornet, newHornet(x, z, (headingDeg * Math.PI) / 180), { shots, beams });
    if (riding) {
      Object.assign(cur, { x, z, y: 0 });
      prev = { ...cur };
    }
  },
  /** The point under the cursor at the last frame (the shots' aim point when they aim at it). */
  cursorPoint: () => cursorPoint,
  /** The sight line as drawn at the last frame. */
  sight: () => ({ ...sightState }),
  /** The soldier's measured height and size on screen at the last frame. */
  measured: () => ({ ...MEASURED }),
  aiming: () => aiming,
  aimPoint: () => ({ x: aimPoint.x, y: aimPoint.y, z: aimPoint.z }),
  nades: () => ({
    held: nadesHeld,
    aiming: nadeAiming,
    ready: nadeReady,
    target: nadeTarget,
    thrown: nadesThrown,
    blasts: blastsDone,
    flying: grenades.map((g) => ({ x: g.x, y: g.y, z: g.z })),
    firstContact: lastFirstContact,
    preview: lastPreview ? { end: lastPreview.end, bounces: lastPreview.bounces } : null,
    lastThrow: lastThrow ? { target: lastThrow.target, end: lastThrow.preview?.end ?? null, bounces: lastThrow.preview?.bounces ?? null } : null,
    lastBlast,
    kick: Math.hypot(kick.x, kick.y, kick.z),
  }),
  gun: () => ({
    gun: W.gun,
    ...W.guns[W.gun],
    shots: shotsFired,
    readyIn: readyIn(W, store),
    queued: W.queued,
    lastShotSpread,
    lastShotRays,
    lastShotEnd,
  }),
  /** Where a world point is on the page, in CSS pixels. */
  screenOf: (x: number, y: number, z: number) => {
    const v = new THREE.Vector3(x, y, z).project(camera.cam);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  },
  /** The explosion sheets playing: clock, frame, burst point, where the picture is drawn, its scale and turn. */
  explosions: () => nadeFx.explosions.state(),
  /** Start an explosion at a point (held at one frame when given), as a blast would. */
  explode: (x: number, y: number, z: number, heldFrame = -1) => nadeFx.explosions.play(x, y, z, heldFrame),
  clearExplosions: () => nadeFx.explosions.clear(),
  /** Fragments flying and plain flashes or rings showing now. */
  blastBits: () => nadeFx.shown(),
  /** The drawn camera's turn (the explosion pictures copy it). */
  camQuat: () => camera.cam.quaternion.toArray(),
  /**
   * The vision rule now: on or off, the eyes and the cone, which dummies are here, seen, drawn and outlined, and
   * whether their bars show.
   */
  vision: () => ({
    on: store.get('visionOn') === true,
    eye: { ...lastEye },
    present: [...present],
    seen: [...seen],
    drawn: dummySoldiers.map((s) => s.root.visible),
    outlined: ghosts.map((g) => g.visible),
    bars: dummies.map((_, i) => fx.barShown(i)),
  }),
  /** For the scripted checks only: hold the soldier's facing at a direction (radians), or give it back (null). */
  holdAim: (yaw: number | null) => {
    aimHold = yaw;
  },
  /** Whether something blocks sight between two points (with what blocks it now). */
  visionLine: (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) =>
    sightBlocked(lastBlockers ?? sightBlockers(null), x1, y1, z1, x2, y2, z2),
  /** The shooter: its shots so far, the last one, and the tracers drawn now. */
  shooter: () => ({ shots: shooterShots, last: lastShooterShot, burstLeft, clock: shooterClock, tracers: fx.tracersShown(), tracersStarted: fx.enemyTracers }),
  /** The dummies' sounds heard so far (footsteps, the shooter's shots), the last one, and your own clicks. */
  sounds: () => ({ step: worldSounds.step, gun: worldSounds.gun, last: { ...worldSounds.last }, clicks: clicksPlayed }),
  /** How loud a dummy's sound is at a distance with the current settings (1 inside the inner radius). */
  attenuationAt: (d: number) => attenuation(d, store.num('soundInner'), store.num('soundOuter'), store.get('soundCurve') as FalloffCurve),
  /** Import an Export's text through the same path as the Import button (it asks first, as the button does). */
  importText: (text: string) => panel.importText(text),
  /** The Export's text as the Export button would make it. */
  exportText: () => buildExport(store),
  /** The values as saved in the browser (the raw string), to check that nothing clears them. */
  storedRaw: () => {
    try {
      return window.localStorage.getItem('shamble-testlines.values.v2');
    } catch {
      return null;
    }
  },
  /**
   * Draw the frame now and read the picture in a box (CSS pixels, from the top left): how many pixels are pure
   * chroma blue, how many are white-hot (the fireball's core) and where their middle is, how many are fire, and how
   * many are the sheet's own deep red (about 104, 8, 8) and orange (about 248, 136, 56), which a wrong colour
   * conversion would move.
   */
  pixels: (x0: number, y0: number, w: number, h: number) => {
    nadeFx.place(camera.cam, explosionLook());
    renderer.render(scene, camera.cam);
    const gl = renderer.getContext();
    const pr = renderer.getPixelRatio();
    const r = renderer.domElement.getBoundingClientRect();
    const bx = Math.round((x0 - r.left) * pr);
    const bw = Math.max(1, Math.round(w * pr));
    const bh = Math.max(1, Math.round(h * pr));
    const by = Math.round(gl.drawingBufferHeight - (y0 - r.top) * pr - bh);
    const buf = new Uint8Array(bw * bh * 4);
    gl.readPixels(bx, by, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let blue = 0, hot = 0, fire = 0, deep = 0, orange = 0, hx = 0, hy = 0, sr = 0, sg = 0, sb = 0;
    for (let j = 0; j < bh; j++) {
      for (let i = 0; i < bw; i++) {
        const o = (j * bw + i) * 4;
        const R = buf[o], G = buf[o + 1], B = buf[o + 2];
        sr += R;
        sg += G;
        sb += B;
        if (B > 180 && R < 80 && G < 80) blue++;
        if (R > 235 && G > 215 && B > 170) {
          hot++;
          hx += i;
          hy += bh - 1 - j;
        }
        if (R > 200 && G > 60 && G < 200 && B < 110) fire++;
        if (R >= 85 && R <= 140 && G < 30 && B < 30) deep++;
        if (R > 235 && G >= 115 && G <= 160 && B >= 30 && B <= 85) orange++;
      }
    }
    const n = bw * bh;
    return { total: n, mean: [sr / n, sg / n, sb / n], blue, hot, fire, deep, orange, hotX: hot ? x0 + hx / hot / pr : null, hotY: hot ? y0 + hy / hot / pr : null };
  },
};
