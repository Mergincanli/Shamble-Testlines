// The frag grenade, run at the fixed simulation step. The throw is aimed freely: it is solved to land on the point
// under the cursor, at the launch angle (raised for a target above the hand), up to the longest throw's speed. The
// flight follows its exact arc in fixed sub-steps (the same path at either step rate) and is swept against the
// blocks so a fast grenade cannot pass through the thin cover wall; it bounces off the ground, blocks and the
// ramp, and goes off when its fuse runs out: damage falls off with distance and needs a clear line from the
// blast. The same step function draws the whole preview, bounces and burst included, so the grenade flies exactly
// the path shown. Numbers from the old game (T.grenade*, the grenade's launch angle and top speed); written fresh.
import type { Store } from './params';
import type { MoverState } from './movement';
import { BLOCKS, rampHeight } from './yard';

/** The grenade's size for collisions, and how high the throw leaves the hand. */
export const GRENADE_R = 0.1;
export const THROW_HEIGHT = 1.5;

export interface Grenade {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Seconds until it goes off. */
  fuse: number;
  resting: boolean;
  prev: { x: number; y: number; z: number };
  /** Where it first touched anything (for the scripted checks: the preview must land there). */
  firstContact?: { x: number; y: number; z: number };
  /** Where it bounced (real impacts, not rolling), in order: the preview marks these. */
  bounceAt: { x: number; y: number; z: number }[];
}

export interface Blast {
  x: number;
  y: number;
  z: number;
}

/**
 * The throw that lands on a target point (its centre one grenade size above it): toward the target on the ground,
 * at the launch angle (raised for a target above the hand, by half its elevation), at the speed that reaches it,
 * but no faster than the longest throw; a target out of reach falls short. If that arc would hit something before
 * the target (the edge of a ledge, cover in the way), it is lobbed higher, 5° at a time up to 80°, and the first arc
 * that lands at the target is taken; if none does, the plain arc stays and the preview shows where it hits.
 * `yaw` gives the direction when the target is straight below the hand.
 */
export function aimedThrow(
  o: [number, number, number],
  target: { x: number; y: number; z: number },
  yaw: number,
  P: Store,
): [number, number, number] {
  const d = Math.hypot(target.x - o[0], target.z - o[2]);
  const elev = Math.atan2(target.y + GRENADE_R - o[1], d);
  let a = (P.num('nadeAngle') * Math.PI) / 180;
  if (elev > 0) a = Math.max(a + elev / 2, (elev + Math.PI / 2) / 2);
  a = Math.min(a, (89 * Math.PI) / 180);
  const plain = throwAt(o, target, yaw, a, P);
  const near = Math.max(0.5, 0.03 * d);
  if (landsNear(o, plain, target, near, P)) return plain;
  for (let lob = a + (5 * Math.PI) / 180; lob <= (80.001 * Math.PI) / 180; lob += (5 * Math.PI) / 180) {
    const v = throwAt(o, target, yaw, lob, P);
    if (landsNear(o, v, target, near, P)) return v;
  }
  return plain;
}

/** The throw that reaches the target at launch angle a (capped at the longest throw's speed). */
function throwAt(
  o: [number, number, number],
  target: { x: number; y: number; z: number },
  yaw: number,
  a: number,
  P: Store,
): [number, number, number] {
  const dx = target.x - o[0];
  const dz = target.z - o[2];
  const h = target.y + GRENADE_R - o[1];
  const d = Math.hypot(dx, dz);
  const ux = d > 1e-6 ? dx / d : Math.sin(yaw);
  const uz = d > 1e-6 ? dz / d : Math.cos(yaw);
  const g = P.num('nadeGravity');
  const c = Math.cos(a);
  const under = 2 * c * c * (d * Math.tan(a) - h);
  let sp = under > 1e-9 ? Math.sqrt((g * d * d) / under) : 0;
  if (!Number.isFinite(sp)) sp = 0;
  sp = Math.min(sp, P.num('nadeSpeedMax'));
  return [ux * c * sp, Math.sin(a) * sp, uz * c * sp];
}

/** Whether this throw first touches anything within `near` of the target. */
function landsNear(
  o: [number, number, number],
  v: [number, number, number],
  target: { x: number; y: number; z: number },
  near: number,
  P: Store,
): boolean {
  const g = newGrenade(o[0], o[1], o[2], v, P);
  g.fuse = 4;
  while (!spent(g) && !g.firstContact) stepGrenade(g, SUB_DT, P);
  const c = g.firstContact;
  return !!c && Math.hypot(c.x - target.x, c.y - (target.y + GRENADE_R), c.z - target.z) < near;
}

export function newGrenade(x: number, y: number, z: number, v: [number, number, number], P: Store): Grenade {
  return { x, y, z, vx: v[0], vy: v[1], vz: v[2], fuse: P.num('nadeFuse'), resting: false, prev: { x, y, z }, bounceAt: [] };
}

/** First hit of the segment p0 -> p0 + d against a box grown by r: [t in 0..1, normal axis 0/1/2, sign], or null. */
function segBox(
  p0: [number, number, number],
  d: [number, number, number],
  lo: [number, number, number],
  hi: [number, number, number],
): [number, number, number] | null {
  let t0 = 0;
  let t1 = 1;
  let axis = -1;
  let sign = 0;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-12) {
      if (p0[i] < lo[i] || p0[i] > hi[i]) return null;
      continue;
    }
    let a = (lo[i] - p0[i]) / d[i];
    let b = (hi[i] - p0[i]) / d[i];
    let s = -1;
    if (a > b) {
      [a, b] = [b, a];
      s = 1;
    }
    if (a > t0) {
      t0 = a;
      axis = i;
      sign = s;
    }
    t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  if (axis < 0) return null; // started inside: let the ground and ramp rules handle it
  return [t0, axis, sign];
}

function bounce(g: Grenade, nx: number, ny: number, nz: number, P: Store) {
  const e = P.num('nadeBounce');
  const vn = g.vx * nx + g.vy * ny + g.vz * nz;
  if (vn >= 0) return;
  // Reflect the part into the surface (losing some), and slow the part along it.
  const tx = g.vx - vn * nx;
  const ty = g.vy - vn * ny;
  const tz = g.vz - vn * nz;
  const keep = P.num('nadeSlide');
  g.vx = tx * keep - vn * e * nx;
  g.vy = ty * keep - vn * e * ny;
  g.vz = tz * keep - vn * e * nz;
}

type V3 = [number, number, number];

/** The grenade flies in fixed sub-steps of this length, so its path is the same at 30 or 60 steps a second. */
export const SUB_DT = 1 / 120;
/** Within this of a block's top edge, a grenade counts as on top of the block, not against its side. */
const EDGE = 0.05;

interface Hit {
  t: number;
  n: V3;
}

/**
 * The first block surface the segment p0 -> p0 + d meets: a block's side, a ramp's side below its slope, or a
 * block's top entered from above (a floor). Null if none. Floors the end point sinks into are found separately.
 */
function sweep(p0: V3, d: V3): Hit | null {
  const R = GRENADE_R;
  let best: Hit | null = null;
  for (const b of BLOCKS) {
    const hit = segBox(p0, d, [b.minX - R, -1, b.minZ - R], [b.maxX + R, b.top + R, b.maxZ + R]);
    if (!hit || (best && hit[0] >= best.t)) continue;
    const [t, axis, sign] = hit;
    const hy = p0[1] + d[1] * t;
    if (axis === 1) {
      // A block's top, entered from above, is a floor (so a steep fall cannot clip through a top edge). The
      // top of a ramp's box is not its surface: the slope is found as a floor after the move.
      if (sign !== 1 || b.ramp) continue;
      best = { t, n: [0, 1, 0] };
      continue;
    }
    if (b.ramp) {
      const r = b.ramp;
      const along = r.axis === 'x' ? 0 : 2;
      if (axis === along) {
        // The low end has no height; the high end meets the platform, so it is a wall only well below the top.
        if (sign === (r.low < r.high ? -1 : 1)) continue;
        if (hy - R > b.top - 0.2) continue;
      } else {
        // A side counts only below the slope's height there.
        const qx = Math.min(b.maxX, Math.max(b.minX, p0[0] + d[0] * t));
        const qz = Math.min(b.maxZ, Math.max(b.minZ, p0[2] + d[2] * t));
        if (hy - R > rampHeight(b, qx, qz) - EDGE) continue;
      }
    } else if (hy > b.top + R - EDGE) continue;
    const n: V3 = [0, 0, 0];
    n[axis] = sign;
    best = { t, n };
  }
  return best;
}

/**
 * Where a throw starts: the soldier's middle, at throwing height. His body keeps this point clear of every block,
 * and the arc rises out of it, so a throw from right behind the cover wall clears it, while a block taller than
 * the throw sends the grenade back.
 */
export function throwStart(x: number, y: number, z: number): V3 {
  return [x, y + THROW_HEIGHT, z];
}

/** One fixed step of a grenade's flight, run as sub-steps of SUB_DT; it carries on bouncing until the fuse runs out. */
export function stepGrenade(g: Grenade, dt: number, P: Store) {
  g.prev = { x: g.x, y: g.y, z: g.z };
  const n = Math.max(1, Math.round(dt / SUB_DT));
  for (let i = 0; i < n; i++) {
    // The fuse runs in the same sub-steps, so the grenade goes off at the same place at either step rate.
    if (spent(g)) break;
    g.fuse -= SUB_DT;
    if (!g.resting) subStep(g, P);
  }
}

/** True once the fuse has run out (the blast follows at the end of that step). */
export function spent(g: Grenade): boolean {
  return g.fuse <= 1e-9;
}

function subStep(g: Grenade, P: Store): boolean {
  const h = SUB_DT;
  const grav = P.num('nadeGravity');
  // The exact arc for this sub-step, swept as a straight segment (at most 0.22 m at the fastest throw).
  const d: V3 = [g.vx * h, g.vy * h - 0.5 * grav * h * h, g.vz * h];
  g.vy -= grav * h;
  const p0: V3 = [g.x, g.y, g.z];
  const hit = sweep(p0, d);
  const t = hit ? Math.max(0, hit.t - 1e-4) : 1;
  g.x = p0[0] + d[0] * t;
  g.y = p0[1] + d[1] * t;
  g.z = p0[2] + d[2] * t;
  let contact = false;
  /** Whether it touched a level floor this sub-step (the only place it may come to rest). */
  let level = false;
  if (hit) {
    surface(g, hit.n[0], hit.n[1], hit.n[2], h, P);
    contact = true;
    level = hit.n[1] > 0.99;
  }
  // Floors: the ground, the top of a block it is over (from above, or within EDGE of the top), the ramp's slope.
  const high = Math.max(p0[1], g.y);
  let floorY = GRENADE_R;
  let floorN: V3 = [0, 1, 0];
  for (const b of BLOCKS) {
    if (g.x < b.minX - GRENADE_R || g.x > b.maxX + GRENADE_R || g.z < b.minZ - GRENADE_R || g.z > b.maxZ + GRENADE_R) continue;
    if (b.ramp) {
      // The slope reaches out by the grenade's size on the ramp's two sides (so it rolls clear of a side before it
      // drops, as off a block's top), but not past its ends: the low end has no height, the high end meets the platform.
      const r = b.ramp;
      if (r.axis === 'x' ? g.x < b.minX || g.x > b.maxX : g.z < b.minZ || g.z > b.maxZ) continue;
      const fy = rampHeight(b, g.x, g.z) + GRENADE_R;
      if (fy > floorY && high >= fy - 0.6) {
        floorY = fy;
        const slope = b.top / (r.high - r.low);
        const nn: V3 = r.axis === 'x' ? [-slope, 1, 0] : [0, 1, -slope];
        const l = Math.hypot(nn[0], nn[1], nn[2]);
        floorN = [nn[0] / l, nn[1] / l, nn[2] / l];
      }
    } else {
      const top = b.top + GRENADE_R;
      if (top > floorY && high >= top - EDGE) {
        floorY = top;
        floorN = [0, 1, 0];
      }
    }
  }
  if (g.y < floorY) {
    g.y = floorY;
    surface(g, floorN[0], floorN[1], floorN[2], h, P);
    contact = true;
    level = floorN[1] > 0.99;
  }
  if (contact && !g.firstContact) g.firstContact = { x: g.x, y: g.y, z: g.z };
  // Come to rest when barely moving on a level floor (on the slope it rolls back down instead).
  if (level && Math.hypot(g.vx, g.vy, g.vz) < REST_SPEED) {
    g.vx = g.vy = g.vz = 0;
    g.resting = true;
  }
  return contact;
}

/** Below this speed into a surface it is not a bounce but rolling or sliding along it. */
const IMPACT_SPEED = 1;
/** Rolling or sliding along a surface slows at this rate per second (the sandbox's own; the old game lost speed per frame). */
const ROLL_SLOW = 3;
const REST_SPEED = 0.3;

/** Meeting a surface: a real impact bounces (the old game's shares); otherwise it rolls along, slowing steadily. */
function surface(g: Grenade, nx: number, ny: number, nz: number, dt: number, P: Store) {
  const vn = g.vx * nx + g.vy * ny + g.vz * nz;
  if (vn < -IMPACT_SPEED) {
    bounce(g, nx, ny, nz, P);
    if (g.bounceAt.length < 16) g.bounceAt.push({ x: g.x, y: g.y, z: g.z });
    return;
  }
  if (vn < 0) {
    g.vx -= vn * nx;
    g.vy -= vn * ny;
    g.vz -= vn * nz;
  }
  const k = Math.exp(-ROLL_SLOW * dt);
  g.vx *= k;
  g.vy *= k;
  g.vz *= k;
}

export interface Flight {
  /** The path, one point per sub-step, from the hand to where it goes off. */
  pts: { x: number; y: number; z: number }[];
  /** Where it bounces on the way. */
  bounces: { x: number; y: number; z: number }[];
  /** Where it goes off. */
  end: { x: number; y: number; z: number };
}

/**
 * The whole flight of a throw, to the end of its fuse, by the same sub-steps as the real one: the grenade flies
 * exactly this path, bounces where this one does and goes off where this one does.
 */
export function previewFlight(o: [number, number, number], v: [number, number, number], P: Store): Flight {
  const g = newGrenade(o[0], o[1], o[2], v, P);
  const pts = [{ x: g.x, y: g.y, z: g.z }];
  for (let i = 0; i < 2000 && !spent(g); i++) {
    stepGrenade(g, SUB_DT, P);
    const last = pts[pts.length - 1];
    if (g.x !== last.x || g.y !== last.y || g.z !== last.z) pts.push({ x: g.x, y: g.y, z: g.z });
  }
  return { pts, bounces: g.bounceAt, end: { x: g.x, y: g.y, z: g.z } };
}

/** True if nothing solid lies between two points (for the blast's reach). */
export function clearLine(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const p0: [number, number, number] = [ax, ay, az];
  const d: [number, number, number] = [bx - ax, by - ay, bz - az];
  for (const b of BLOCKS) {
    if (b.ramp) {
      // Sample the ramp's surface along the line.
      for (let i = 1; i < 16; i++) {
        const t = i / 16;
        const x = ax + d[0] * t;
        const z = az + d[2] * t;
        if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
        if (ay + d[1] * t < rampHeight(b, x, z)) return false;
      }
      continue;
    }
    const hit = segBox(p0, d, [b.minX, 0, b.minZ], [b.maxX, b.top, b.maxZ]);
    if (hit && hit[0] < 1) return false;
  }
  return true;
}

/** How hard a blast hits a soldier at this distance (0 outside the radius or behind cover). */
export function blastDamage(bl: Blast, s: MoverState, P: Store): number {
  const R = P.num('nadeRadius');
  const dist = Math.hypot(s.x - bl.x, s.y - bl.y, s.z - bl.z);
  if (dist >= R) return 0;
  if (!clearLine(bl.x, Math.max(bl.y, 0.5), bl.z, s.x, s.y + 1.1, s.z)) return 0;
  return P.num('nadeDamage') * (1 - dist / R);
}
