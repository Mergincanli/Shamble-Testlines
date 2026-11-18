// The frag grenade, run at the fixed simulation step: a held charge sets the throw speed (the old game's G key:
// fixed launch angle, speed from slow to fast over the charge), the flight follows its exact arc each step and is
// swept against the blocks so a fast grenade cannot pass through the thin cover wall, it bounces off the ground,
// blocks and the ramp, and goes off when its fuse runs out: damage falls off with distance and needs a clear line
// from the blast. The same step function draws the throw preview, so the preview lands where the grenade does.
// Numbers from the old game (T.grenade*, T_CHARGE.nade); written fresh.
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
}

export interface Blast {
  x: number;
  y: number;
  z: number;
}

/** The throw velocity: along the aim on the ground, at the launch angle, at a speed set by the charge (0..1). */
export function throwVelocity(aimYaw: number, charge: number, P: Store): [number, number, number] {
  const sp = P.num('nadeSpeedMin') + (P.num('nadeSpeedMax') - P.num('nadeSpeedMin')) * Math.min(1, Math.max(0, charge));
  const a = (P.num('nadeAngle') * Math.PI) / 180;
  const h = Math.cos(a) * sp;
  return [Math.sin(aimYaw) * h, Math.sin(a) * sp, Math.cos(aimYaw) * h];
}

export function newGrenade(x: number, y: number, z: number, v: [number, number, number], P: Store): Grenade {
  return { x, y, z, vx: v[0], vy: v[1], vz: v[2], fuse: P.num('nadeFuse'), resting: false, prev: { x, y, z } };
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

/**
 * One fixed step of a grenade's flight. Returns true when it stops at its first contact (for the preview, which
 * only needs where the throw first lands); the flight itself carries on bouncing until the fuse runs out.
 */
export function stepGrenade(g: Grenade, dt: number, P: Store, stopAtContact = false): boolean {
  g.prev = { x: g.x, y: g.y, z: g.z };
  g.fuse -= dt;
  if (g.resting) return true;
  const grav = P.num('nadeGravity');
  // The exact arc for this step, swept as a straight segment (short at either step rate).
  const d: [number, number, number] = [g.vx * dt, g.vy * dt - 0.5 * grav * dt * dt, g.vz * dt];
  g.vy -= grav * dt;
  const p0: [number, number, number] = [g.x, g.y, g.z];
  // Upright faces (block sides, the ramp's sides and high end) are swept, so a fast grenade cannot pass through a
  // thin wall; floors (the ground, block tops, the ramp's slope) are handled after the move.
  let tHit = 1;
  let normal: [number, number, number] | null = null;
  for (const b of BLOCKS) {
    const hit = segBox(p0, d, [b.minX - GRENADE_R, -1, b.minZ - GRENADE_R], [b.maxX + GRENADE_R, b.top + GRENADE_R, b.maxZ + GRENADE_R]);
    if (!hit || hit[0] >= tHit || hit[1] === 1) continue;
    if (b.ramp) {
      // A ramp's sides count only below the slope's height there, and its low end has no height at all.
      const r = b.ramp;
      const lowFace =
        (r.axis === 'x' && hit[1] === 0 && hit[2] === (r.low < r.high ? -1 : 1)) ||
        (r.axis === 'z' && hit[1] === 2 && hit[2] === (r.low < r.high ? -1 : 1));
      if (lowFace) continue;
      const hx = p0[0] + d[0] * hit[0];
      const hy = p0[1] + d[1] * hit[0];
      const hz = p0[2] + d[2] * hit[0];
      const qx = Math.min(b.maxX, Math.max(b.minX, hx));
      const qz = Math.min(b.maxZ, Math.max(b.minZ, hz));
      if (hy - GRENADE_R > rampHeight(b, qx, qz)) continue;
    } else if (p0[1] + d[1] * hit[0] > b.top + GRENADE_R - 1e-6) continue;
    tHit = hit[0];
    normal = [0, 0, 0];
    normal[hit[1]] = hit[2];
  }
  const t = normal ? Math.max(0, tHit - 1e-4) : 1;
  g.x = p0[0] + d[0] * t;
  g.y = p0[1] + d[1] * t;
  g.z = p0[2] + d[2] * t;
  let contact = false;
  if (normal) {
    surface(g, normal[0], normal[1], normal[2], dt, P);
    contact = true;
  }
  // Floors: the ground, the top of a block it came down onto, the ramp's slope.
  let floorY = GRENADE_R;
  let floorN: [number, number, number] = [0, 1, 0];
  for (const b of BLOCKS) {
    if (g.x < b.minX - GRENADE_R || g.x > b.maxX + GRENADE_R || g.z < b.minZ - GRENADE_R || g.z > b.maxZ + GRENADE_R) continue;
    if (b.ramp) {
      if (g.x < b.minX || g.x > b.maxX || g.z < b.minZ || g.z > b.maxZ) continue;
      const h = rampHeight(b, g.x, g.z) + GRENADE_R;
      if (h > floorY && p0[1] >= h - 0.6) {
        floorY = h;
        const r = b.ramp;
        const slope = b.top / (r.high - r.low);
        const n: [number, number, number] = r.axis === 'x' ? [-slope, 1, 0] : [0, 1, -slope];
        const l = Math.hypot(n[0], n[1], n[2]);
        floorN = [n[0] / l, n[1] / l, n[2] / l];
      }
    } else {
      const top = b.top + GRENADE_R;
      if (top > floorY && p0[1] >= top - 1e-6) {
        floorY = top;
        floorN = [0, 1, 0];
      }
    }
  }
  if (g.y < floorY) {
    g.y = floorY;
    surface(g, floorN[0], floorN[1], floorN[2], dt, P);
    contact = true;
  }
  if (contact && !g.firstContact) g.firstContact = { x: g.x, y: g.y, z: g.z };
  // Come to rest when barely moving on a surface.
  if (contact && Math.hypot(g.vx, g.vy, g.vz) < REST_SPEED) {
    g.vx = g.vy = g.vz = 0;
    g.resting = true;
  }
  return stopAtContact && contact;
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

/** The throw's path up to its first contact, by the same step function and step rate as the flight. */
export function previewPath(x: number, y: number, z: number, v: [number, number, number], dt: number, P: Store): { x: number; y: number; z: number }[] {
  const g = newGrenade(x, y, z, v, P);
  const pts = [{ x, y, z }];
  for (let i = 0; i < 400; i++) {
    const stop = stepGrenade(g, dt, P, true);
    pts.push({ x: g.x, y: g.y, z: g.z });
    if (stop) break;
  }
  return pts;
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
