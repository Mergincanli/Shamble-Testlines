// The owner's vision rule (26 November): a dummy is drawn only while some part of its body is inside the cone with
// a clear line from your soldier's eyes. One sight test, in 3D, decides both who is drawn and where the cone's white
// shows (the white is the same test run per pixel in the grid shader, look.ts), so the two always agree.
//
// What blocks sight: every block of the yard and the metrics room (walls, ledges, steps, posts, the ramp's slope,
// floating pieces over doors and windows), the stand-in hedges, the smoke cloud, and the Hornet (an upright
// cylinder) unless you ride it. Soldiers and dummies do not block. A thing lower than your eyes blocks only the lines
// that pass through it: you see over it, and what stands just behind it is hidden from the feet up. Nothing here
// comes from the old game or Shamble VFX; nothing here is decided for the game.
import { BLOCKS, bottomOf } from './yard';
import { HEDGES, SMOKE } from './standins';
import { HIT_RADIUS } from './weapons';
import { VISION, VISION_MAX_BOXES, VISION_MAX_CYLS } from './look';

/** An axis-aligned box that blocks sight; a ramp blocks only under its slope. */
export interface SightBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  /** The slope: height rises from 0 at `low` to `top` at `high` along the axis. */
  ramp?: { axis: 'x' | 'z'; low: number; high: number; top: number };
}
/** An upright cylinder that blocks sight (the smoke cloud, the Hornet). */
export interface SightCyl {
  cx: number;
  cz: number;
  r: number;
  y0: number;
  y1: number;
}
export interface Blockers {
  boxes: SightBox[];
  cyls: SightCyl[];
}

/** The Hornet's height for sight: its body and gun (the gun sits at 1.25 m). */
export const HORNET_SIGHT_HEIGHT_M = 1.4;
/** Lines are cut this short at the far end, so a surface (or a body standing on one) does not hide itself. */
export const SIGHT_END_MARGIN_M = 0.02;
/** Under this distance from the eyes (on the ground) a point counts as inside the cone, whatever its direction. */
export const CONE_NEAR_M = 0.3;
/**
 * The points of a dummy's body the rule looks at (heights above its feet): five up its middle, and two each side
 * (at the edge of its hit body, square to the line from the eyes) at chest and hip height. Seen if any is.
 */
export const BODY_POINTS = {
  middle_heights_m: [0.1, 0.5, 0.9, 1.3, 1.7],
  side_heights_m: [0.9, 1.3],
  side_offset_m: HIT_RADIUS,
};

/** Everything that blocks sight now; the Hornet given (as a cylinder) unless you ride it. */
export function sightBlockers(hornet: { x: number; y: number; z: number; r: number } | null): Blockers {
  const boxes: SightBox[] = [];
  for (const b of BLOCKS) {
    // (The slope a stair is walked on is not drawn: its steps block instead.)
    if (b.hidden) continue;
    const box: SightBox = { minX: b.minX, maxX: b.maxX, minY: bottomOf(b), maxY: b.top, minZ: b.minZ, maxZ: b.maxZ };
    if (b.ramp) box.ramp = { axis: b.ramp.axis, low: b.ramp.low, high: b.ramp.high, top: b.top };
    boxes.push(box);
  }
  for (const h of HEDGES) boxes.push({ minX: h.minX, maxX: h.maxX, minY: 0, maxY: h.top, minZ: h.minZ, maxZ: h.maxZ });
  const cyls: SightCyl[] = [{ cx: SMOKE.x, cz: SMOKE.z, r: SMOKE.r, y0: 0, y1: SMOKE.top }];
  if (hornet) cyls.push({ cx: hornet.x, cz: hornet.z, r: hornet.r, y0: hornet.y, y1: hornet.y + HORNET_SIGHT_HEIGHT_M });
  return { boxes, cyls };
}

/** Whether the segment from a to b, between shares t0 and t1 of it, passes through a box (or under a ramp's slope). */
function hitsBox(b: SightBox, ax: number, ay: number, az: number, dx: number, dy: number, dz: number, t0: number, t1: number): boolean {
  let lo = t0;
  let hi = t1;
  for (const [o, d, mn, mx] of [
    [ax, dx, b.minX, b.maxX],
    [ay, dy, b.minY, b.maxY],
    [az, dz, b.minZ, b.maxZ],
  ] as const) {
    if (Math.abs(d) < 1e-9) {
      if (o < mn || o > mx) return false;
      continue;
    }
    let ta = (mn - o) / d;
    let tb = (mx - o) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    lo = Math.max(lo, ta);
    hi = Math.min(hi, tb);
    if (lo >= hi) return false;
  }
  if (!b.ramp) return true;
  // Under the slope somewhere between lo and hi: the height over the slope changes evenly, so the ends tell.
  const r = b.ramp;
  const under = (t: number) => {
    const c = r.axis === 'x' ? ax + dx * t : az + dz * t;
    const h = r.top * Math.min(1, Math.max(0, (c - r.low) / (r.high - r.low)));
    return ay + dy * t - h;
  };
  return Math.min(under(lo), under(hi)) < 0;
}

/** Whether the segment passes through an upright cylinder between shares t0 and t1. */
function hitsCyl(c: SightCyl, ax: number, ay: number, az: number, dx: number, dy: number, dz: number, t0: number, t1: number): boolean {
  const fx = ax - c.cx;
  const fz = az - c.cz;
  const a = dx * dx + dz * dz;
  let lo = t0;
  let hi = t1;
  if (a < 1e-12) {
    if (fx * fx + fz * fz > c.r * c.r) return false;
  } else {
    const b = 2 * (fx * dx + fz * dz);
    const k = fx * fx + fz * fz - c.r * c.r;
    const disc = b * b - 4 * a * k;
    if (disc < 0) return false;
    const q = Math.sqrt(disc);
    lo = Math.max(lo, (-b - q) / (2 * a));
    hi = Math.min(hi, (-b + q) / (2 * a));
    if (lo >= hi) return false;
  }
  const ya = ay + dy * lo;
  const yb = ay + dy * hi;
  return Math.max(ya, yb) > c.y0 && Math.min(ya, yb) < c.y1;
}

/** Whether something solid stands between a (the eyes) and b (a point looked at). */
export function sightBlocked(B: Blockers, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return false;
  const t0 = 1e-4;
  const t1 = 1 - SIGHT_END_MARGIN_M / len;
  if (t1 <= t0) return false;
  for (const b of B.boxes) if (hitsBox(b, ax, ay, az, dx, dy, dz, t0, t1)) return true;
  for (const c of B.cyls) if (hitsCyl(c, ax, ay, az, dx, dy, dz, t0, t1)) return true;
  return false;
}

/** The eyes and the cone: where they are, which way the soldier faces (forward is (sin, cos)), how wide. */
export interface Eye {
  x: number;
  y: number;
  z: number;
  aim: number;
  widthDeg: number;
}

/** Whether a point is inside the cone (by direction on the ground only: there is no reach, and no up or down). */
export function inCone(e: Eye, px: number, pz: number): boolean {
  if (e.widthDeg >= 360) return true;
  const vx = px - e.x;
  const vz = pz - e.z;
  const l = Math.hypot(vx, vz);
  if (l < CONE_NEAR_M) return true;
  return (vx * Math.sin(e.aim) + vz * Math.cos(e.aim)) / l >= Math.cos(((e.widthDeg / 2) * Math.PI) / 180);
}

/** Whether a dummy standing at (x, y, z) is seen: any point of its body inside the cone with a clear line. */
export function dummySeen(B: Blockers, e: Eye, x: number, y: number, z: number): boolean {
  const vx = x - e.x;
  const vz = z - e.z;
  const l = Math.hypot(vx, vz) || 1;
  // Square to the line from the eyes, on the ground.
  const sx = (-vz / l) * BODY_POINTS.side_offset_m;
  const sz = (vx / l) * BODY_POINTS.side_offset_m;
  const look = (px: number, py: number, pz: number) => inCone(e, px, pz) && !sightBlocked(B, e.x, e.y, e.z, px, py, pz);
  for (const h of BODY_POINTS.middle_heights_m) if (look(x, y + h, z)) return true;
  for (const h of BODY_POINTS.side_heights_m) {
    if (look(x + sx, y + h, z + sz)) return true;
    if (look(x - sx, y + h, z - sz)) return true;
  }
  return false;
}

/** Hand the eyes, the cone and what blocks sight to the grid shader, so the white is the very same test. */
export function packVision(B: Blockers, e: Eye, on: boolean, white: number) {
  VISION.on.value = on ? 1 : 0;
  VISION.white.value = white;
  VISION.eye.value.set(e.x, e.y, e.z);
  VISION.aim.value.set(Math.sin(e.aim), Math.cos(e.aim));
  VISION.cosHalf.value = e.widthDeg >= 360 ? -2 : Math.cos(((e.widthDeg / 2) * Math.PI) / 180);
  VISION.margin.value = SIGHT_END_MARGIN_M;
  VISION.near.value = CONE_NEAR_M;
  const nb = Math.min(B.boxes.length, VISION_MAX_BOXES);
  for (let i = 0; i < nb; i++) {
    const b = B.boxes[i];
    VISION.boxMin.value[i].set(b.minX, b.minY, b.minZ);
    VISION.boxMax.value[i].set(b.maxX, b.maxY, b.maxZ);
    const r = b.ramp;
    VISION.boxRamp.value[i].set(r ? (r.axis === 'x' ? 1 : 2) : 0, r ? r.low : 0, r ? r.high : 1, r ? r.top : 0);
  }
  VISION.boxCount.value = nb;
  const nc = Math.min(B.cyls.length, VISION_MAX_CYLS);
  for (let i = 0; i < nc; i++) {
    const c = B.cyls[i];
    VISION.cyl.value[i].set(c.cx, c.cz, c.r);
    VISION.cylY.value[i].set(c.y0, c.y1);
  }
  VISION.cylCount.value = nc;
}
