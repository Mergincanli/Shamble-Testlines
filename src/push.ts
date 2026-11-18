// Soft pushing between soldiers (START-RULES: "they push each other softly and never block"). Each step, two
// soldiers closer than two push radii move apart by a share of the overlap. The push moves positions only, and
// three rules keep it from ever stopping anyone:
// - meeting head-on, the push turns partly sideways, so the two slide round each other;
// - no push may undo more than half of a soldier's own step forward, so a walking soldier always gets through;
// - one step's push is capped well under a body's width, so it can never carry anyone through a thin wall.
import type { MoverState } from './movement';
import { resolveWalls } from './yard';

/** Soldiers whose feet are this far apart in height or more do not push (one on a wall or ledge, one below). */
const HEIGHT_GAP = 1.0;
/** How far a head-on push turns sideways (as a share of the push). */
const SIDEWAYS = 0.7;
/** Share of a soldier's own step forward that a push may undo. */
const KEEP_GOING = 0.5;
/** Largest push in one step, in metres. */
const MAX_STEP = 0.25;

export function softPush(
  bodies: MoverState[],
  active: boolean[],
  radius: number,
  strength: number,
  dt: number,
  wallRadius: number,
  stepUp: number,
) {
  if (strength <= 0 || radius <= 0) return;
  const share = 1 - Math.exp(-strength * dt);
  const min = 2 * radius;
  const n = bodies.length;
  const px = new Float64Array(n);
  const pz = new Float64Array(n);
  const touched = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!active[i]) continue;
    const a = bodies[i];
    for (let j = i + 1; j < n; j++) {
      if (!active[j]) continue;
      const b = bodies[j];
      if (Math.abs(a.y - b.y) >= HEIGHT_GAP) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const dist = Math.sqrt(d2);
      let nx: number;
      let nz: number;
      if (dist < 1e-6) {
        // Exactly on top of each other: part along a fixed direction that depends on the pair.
        const ang = (i * 7 + j * 13) * 0.7;
        nx = Math.cos(ang);
        nz = Math.sin(ang);
      } else {
        nx = dx / dist;
        nz = dz / dist;
      }
      // Head-on: turn the push sideways, to the side they are already drifting (or a fixed side).
      const rvx = a.vx - b.vx;
      const rvz = a.vz - b.vz;
      const rs = Math.hypot(rvx, rvz);
      if (rs > 0.2) {
        const headOn = Math.abs((nx * rvx + nz * rvz) / rs);
        const cross = nx * rvz - nz * rvx;
        const side = cross >= 0 ? 1 : -1;
        const tx = -nz * side;
        const tz = nx * side;
        nx += tx * SIDEWAYS * headOn;
        nz += tz * SIDEWAYS * headOn;
        const l = Math.hypot(nx, nz);
        nx /= l;
        nz /= l;
      }
      const move = (min - dist) * share * 0.5;
      px[i] -= nx * move;
      pz[i] -= nz * move;
      px[j] += nx * move;
      pz[j] += nz * move;
      touched[i] = touched[j] = 1;
    }
  }
  for (let i = 0; i < n; i++) {
    if (!touched[i]) continue;
    const s = bodies[i];
    let mx = px[i];
    let mz = pz[i];
    // Never undo more than half of his own step forward.
    const sp = Math.hypot(s.vx, s.vz);
    if (sp > 0.1) {
      const ux = s.vx / sp;
      const uz = s.vz / sp;
      const along = mx * ux + mz * uz;
      const limit = -KEEP_GOING * sp * dt;
      if (along < limit) {
        mx -= ux * (along - limit);
        mz -= uz * (along - limit);
      }
    }
    const m = Math.hypot(mx, mz);
    if (m > MAX_STEP) {
      mx *= MAX_STEP / m;
      mz *= MAX_STEP / m;
    }
    // A push never moves anyone into a block.
    [s.x, s.z] = resolveWalls(s.x + mx, s.z + mz, wallRadius, s.y, stepUp);
  }
}
