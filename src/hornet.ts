// The Hornet: an early Empire vehicle on one wheel with a gun above it (the owner's description; every number is
// the sandbox's pick, in the panel's Hornet group). Run at the fixed simulation step:
// - Driving, as a one-wheeler: W/S throttle (S brakes first, then reverses), A/D turn, on the soldiers' own ground
//   code (walls, curbs, slopes, falls) with its own radius, step-up and height (the rider stands on footplates),
//   in sub-steps shorter than half its radius, so no speed carries it through a thin wall.
// - The lean is in the picture only: the body pitches forward as it speeds up and back as it brakes or starts
//   backwards, and a spring (solved exactly per step) rights it with a little wobble. Nothing in the simulation
//   reads the lean, and walls or pushes do not feed it: only the throttle's own acceleration does.
// - The gun aims at the cursor. A tap fires pellets; holding charges, and the pellets close in as it charges; a
//   full charge fires one slug as a short beam. A full-charge shot tips the body away from the shot, slides the
//   Hornet a few centimetres away from it (the one movement the shot makes) and leaves a weak moment: no firing,
//   poor steering.
import type { Store } from './params';
import { moveBody, newMover, type Body, type MoverState } from './movement';
import { springStep } from './spring';
import { castLevel, RISE_TIME, type ShotEvent, type ShotRay, type Target } from './weapons';
import { BODY_HEIGHT } from './yard';

/** The Hornet's fixed numbers (in the Export's constants): where it waits at the start, and its shape. */
export const HORNET = {
  park_x_m: 6,
  park_z_m: 1,
  park_heading_deg: 180,
  /** The gun's barrel height above the ground (the shots fly level at this height). */
  gun_height_m: 1.25,
  /** The rider stands on footplates this high, either side of the wheel. */
  footplate_height_m: 0.25,
  wheel_radius_m: 0.42,
  wheel_width_m: 0.12,
  /** The full-charge slide fades at this rate (it adds up to the slider's distance at any step rate). */
  slide_fade_per_s: 14,
  /** Pressed against a wall, the speed it cannot use fades at this rate (the same drag at any step rate). */
  wall_drag_per_s: 8,
  /** The camera's shot kick (as the guns' recoil value): pellets, and the beam. */
  camera_kick_pellets: 1.4,
  camera_kick_beam: 3.2,
};

export interface HornetState {
  body: MoverState;
  /** Facing on the ground, radians (forward is (sin, cos), as the soldier's aim). */
  heading: number;
  /** Speed along the heading, m/s (negative going backwards). */
  speed: number;
  /** Picture only: lean forward (+) or back (-), and to its right (+) or left (-), radians, with their rates. */
  pitch: number;
  pitchV: number;
  roll: number;
  rollV: number;
  /** The full-charge slide's velocity on the ground, fading. */
  slideX: number;
  slideZ: number;
  /** The gun: whether the button is charging it, the charge (0..1), time to the next shot, the weak moment left. */
  charging: boolean;
  charge: number;
  cooldown: number;
  weak: number;
  /** Picture only: the wheel's roll angle and the turret's aim. */
  wheel: number;
  turret: number;
  /** The step before, for smoothing the picture. */
  prev: { x: number; y: number; z: number; heading: number; pitch: number; roll: number; wheel: number; turret: number };
  shots: number;
  beams: number;
  /** The deepest lean since the last full-charge shot, radians (for the scripted checks). */
  leanSinceBeam: number;
  /** After getting on, a button still held from before does not charge until it has been let go. */
  holdBlocked: boolean;
}

export interface HornetInput {
  /** W - S: +1 forward, -1 back. */
  throttle: number;
  /** A - D: +1 turns left, -1 right. */
  steer: number;
  firePressed: boolean;
  fireReleased: boolean;
  fireHeld: boolean;
  /** Where the gun points (the cursor), radians. */
  aimYaw: number;
}

export function newHornet(x = HORNET.park_x_m, z = HORNET.park_z_m, heading = (HORNET.park_heading_deg * Math.PI) / 180): HornetState {
  const h: HornetState = {
    body: newMover(x, z),
    heading,
    speed: 0,
    pitch: 0,
    pitchV: 0,
    roll: 0,
    rollV: 0,
    slideX: 0,
    slideZ: 0,
    charging: false,
    charge: 0,
    cooldown: 0,
    weak: 0,
    wheel: 0,
    turret: heading,
    prev: { x, y: 0, z, heading, pitch: 0, roll: 0, wheel: 0, turret: heading },
    shots: 0,
    beams: 0,
    leanSinceBeam: 0,
    holdBlocked: false,
  };
  return h;
}

/** The Hornet's body for the ground code: its radius and step-up, the rider's height on the footplates. */
export function hornetBody(P: Store): Body {
  return { r: P.num('hornetRadius'), stepUp: P.num('hornetStepUp'), height: HORNET.footplate_height_m + BODY_HEIGHT, gravity: P.num('gravity') };
}

/** The angular speed that tips a spring (natural rate w, settling z) to `peak` radians at its first swing. */
function impulseForPeak(peak: number, w: number, z: number): number {
  if (z < 0.999) {
    const s = Math.sqrt(1 - z * z);
    return peak * w * Math.exp((z / s) * Math.atan2(s, z));
  }
  if (z <= 1.001) return peak * w * Math.E;
  // Overdamped: x(t) = v0 (e^(r1 t) - e^(r2 t)) / (r1 - r2), at its top when t = ln(r2 / r1) / (r1 - r2).
  const s = Math.sqrt(z * z - 1);
  const r1 = -w * (z - s);
  const r2 = -w * (z + s);
  const t = Math.log(r2 / r1) / (r1 - r2);
  return (peak * (r1 - r2)) / (Math.exp(r1 * t) - Math.exp(r2 * t));
}

let seed = 777;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

/** One fixed step of the Hornet: its gun (first, from the button's state as the last frame saw it), then driving. */
export function stepHornet(h: HornetState, inp: HornetInput, dt: number, P: Store, targets: Target[], events: ShotEvent[]) {
  h.prev = { x: h.body.x, y: h.body.y, z: h.body.z, heading: h.heading, pitch: h.pitch, roll: h.roll, wheel: h.wheel, turret: h.turret };
  h.turret = inp.aimYaw;
  stepGun(h, inp, dt, P, targets, events);
  drive(h, inp, dt, P);
}

function stepGun(h: HornetState, inp: HornetInput, dt: number, P: Store, targets: Target[], events: ShotEvent[]) {
  h.cooldown = Math.max(0, h.cooldown - dt);
  h.weak = Math.max(0, h.weak - dt);
  if (!inp.fireHeld) h.holdBlocked = false;
  // A let-go fires what has been charged (a tap within one step fires with no charge); then a press, or a button
  // held through the gap or the weak moment, starts charging once the gun is ready (checked after the let-go, so
  // a quick re-press never fires inside the gap or the weak moment). Charging grows while held.
  if (h.charging && (inp.fireReleased || !inp.fireHeld)) {
    fire(h, h.charge, inp.aimYaw, P, targets, events);
    h.charging = false;
    h.charge = 0;
  }
  const ready = h.cooldown <= 0 && h.weak <= 0;
  if (!h.charging && ready && (inp.firePressed || (inp.fireHeld && !h.holdBlocked))) {
    h.charging = true;
    h.charge = 0;
  }
  if (h.charging && inp.fireHeld) h.charge = Math.min(1, h.charge + dt / P.num('hornetCharge'));
}

function fire(h: HornetState, charge: number, aimYaw: number, P: Store, targets: Target[], events: ShotEvent[]) {
  const full = charge >= 1 - 1e-9;
  const s = h.body;
  // The shot leaves the gun's height over the wheel, level, whatever the picture's lean.
  const oy = s.y + HORNET.gun_height_m;
  const spread = full ? P.num('hornetSpreadFull') : P.num('hornetSpreadNone') + (P.num('hornetSpreadFull') - P.num('hornetSpreadNone')) * charge;
  const n = full ? 1 : Math.max(1, Math.round(P.num('hornetPellets')));
  const range = full ? P.num('hornetBeamRange') : P.num('hornetPelletRange');
  const dmgEach = full ? P.num('hornetBeamDamage') : P.num('hornetPelletDamage');
  const rays: ShotRay[] = [];
  const hit = new Set<number>();
  let damage = 0;
  let killed = false;
  for (let i = 0; i < n; i++) {
    const yaw = aimYaw + (rand() * 2 - 1) * spread;
    const dx = Math.sin(yaw);
    const dz = Math.cos(yaw);
    const c = castLevel(s.x, s.z, oy, dx, dz, range, targets);
    if (c.hit >= 0) {
      const t = targets[c.hit];
      t.health -= dmgEach;
      damage += dmgEach;
      hit.add(c.hit);
      if (t.health <= 0) {
        killed = true;
        t.health = 0;
        t.downFor = Math.max(RISE_TIME + 0.05, P.num('dummyDownTime'));
      }
    }
    rays.push({ ex: s.x + dx * c.t, ey: oy, ez: s.z + dz * c.t, hit: c.hit, hitBlock: c.hitBlock });
  }
  events.push({ gun: 'hornet', beam: full, ox: s.x, oy, oz: s.z, rays, hits: [...hit], damage, killed, spread });
  h.cooldown = P.num('hornetGap');
  h.shots++;
  if (!full) return;
  h.beams++;
  h.leanSinceBeam = 0;
  // It also brakes a little: the shot takes this much speed off (never adds any).
  const brake = P.num('hornetKickBrake');
  h.speed = h.speed > 0 ? Math.max(0, h.speed - brake) : Math.min(0, h.speed + brake);
  // The full-charge kick: the body tips away from the shot (picture only), the Hornet slides that way a few
  // centimetres, and the weak moment starts.
  const bx = -Math.sin(aimYaw);
  const bz = -Math.cos(aimYaw);
  const fwd = bx * Math.sin(h.heading) + bz * Math.cos(h.heading);
  const right = bx * -Math.cos(h.heading) + bz * Math.sin(h.heading);
  const w = P.num('hornetLeanRecover');
  const v0 = impulseForPeak((P.num('hornetKickPitch') * Math.PI) / 180, w, P.num('hornetLeanSettle'));
  h.pitchV += v0 * fwd;
  h.rollV += v0 * right;
  const slide = P.num('hornetKickSlide') * HORNET.slide_fade_per_s;
  h.slideX += bx * slide;
  h.slideZ += bz * slide;
  h.weak = P.num('hornetWeakTime');
}

function drive(h: HornetState, inp: HornetInput, dt: number, P: Store) {
  const top = P.num('hornetTopSpeed');
  const acc = P.num('hornetAccel');
  const brake = P.num('hornetBrake');
  const rev = P.num('hornetReverse');
  const coast = P.num('hornetCoast');
  const t = Math.sign(inp.throttle);
  const v0 = h.speed;
  let v = v0;
  if (t > 0) v = v0 < 0 ? Math.min(0, v0 + brake * dt) : Math.min(v0 + acc * dt, top);
  else if (t < 0) v = v0 > 0 ? Math.max(0, v0 - brake * dt) : Math.max(v0 - acc * dt, -rev);
  else v = v0 > 0 ? Math.max(0, v0 - coast * dt) : Math.min(0, v0 + coast * dt);
  // The throttle's own acceleration (before any wall): what the lean follows, as a share of braking when the speed
  // falls and of acceleration when it grows (so braking and starting backwards both lean it fully back).
  const a = (v - v0) / dt;
  const leanShare = Math.min(1, Math.abs(a) / (Math.abs(v) < Math.abs(v0) ? brake : acc));
  h.speed = v;

  // Turning (poorly in the weak moment).
  const turn = ((P.num('hornetTurn') * Math.PI) / 180) * (h.weak > 0 ? P.num('hornetWeakSteer') : 1);
  h.heading += Math.sign(inp.steer) * turn * dt;

  // The slide moves it by exactly its share of the fading slide this step, whatever the step rate.
  const k = HORNET.slide_fade_per_s;
  const fade = Math.exp(-k * dt);
  const slideShare = (1 - fade) / (k * dt);
  const sx = h.slideX * slideShare;
  const sz = h.slideZ * slideShare;
  h.slideX *= fade;
  h.slideZ *= fade;
  if (Math.abs(h.slideX) < 1e-6 && Math.abs(h.slideZ) < 1e-6) h.slideX = h.slideZ = 0;

  const fx = Math.sin(h.heading);
  const fz = Math.cos(h.heading);
  const s = h.body;
  const x0 = s.x;
  const z0 = s.z;
  const body = hornetBody(P);
  s.vx = fx * h.speed + sx;
  s.vz = fz * h.speed + sz;
  // Sub-steps no longer than half its radius, so it never skips through a thin wall.
  const n = Math.max(1, Math.ceil((Math.hypot(s.vx, s.vz) * dt) / (0.5 * body.r)));
  for (let i = 0; i < n; i++) moveBody(s, dt / n, body);
  // A wall takes the speed it stopped, at a steady rate (so brushing a wall drags the same at any step rate).
  const went = ((s.x - x0) * fx + (s.z - z0) * fz) / dt - (sx * fx + sz * fz);
  const drag = 1 - Math.exp(-HORNET.wall_drag_per_s * dt);
  if (h.speed > 0 && went < h.speed) h.speed += (Math.max(0, went) - h.speed) * drag;
  else if (h.speed < 0 && went > h.speed) h.speed += (Math.min(0, went) - h.speed) * drag;

  // Picture only: the wheel turns with the ground it covered; the lean follows the throttle's acceleration.
  h.wheel += (((s.x - x0) * fx + (s.z - z0) * fz) / HORNET.wheel_radius_m) || 0;
  const leanTarget =
    a > 1e-6 ? ((P.num('hornetLeanFwd') * Math.PI) / 180) * leanShare : a < -1e-6 ? -((P.num('hornetLeanBack') * Math.PI) / 180) * leanShare : 0;
  const w = P.num('hornetLeanRecover');
  const kk = w * w;
  const c = 2 * P.num('hornetLeanSettle') * w;
  let x: number;
  [x, h.pitchV] = springStep(h.pitch - leanTarget, h.pitchV, kk, c, dt);
  h.pitch = x + leanTarget;
  [h.roll, h.rollV] = springStep(h.roll, h.rollV, kk, c, dt);
  if (h.beams > 0 && Math.abs(h.pitch) > Math.abs(h.leanSinceBeam)) h.leanSinceBeam = h.pitch;
}

/** Drop a charge, and wait for a fresh press (getting on or off, the page losing focus). */
export function clearHornetGun(h: HornetState) {
  h.charging = false;
  h.charge = 0;
  h.holdBlocked = true;
}
