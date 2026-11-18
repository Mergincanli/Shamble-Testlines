// Soft pushing between soldiers (START-RULES: "they push each other softly and never block"). Each step, two
// soldiers closer than two push radii move apart by a share of the overlap. The push moves positions only and
// never stops anyone: at a soft strength a soldier walks through a crowd, shoving it aside as he goes.
import type { MoverState } from './movement';
import { resolveWalls } from './yard';

/** Soldiers whose feet are further apart in height than this do not push (one on a ledge, one below). */
const HEIGHT_GAP = 1.5;

export function softPush(
  bodies: MoverState[],
  radius: number,
  strength: number,
  dt: number,
  wallRadius: number,
  stepUp: number,
) {
  if (strength <= 0 || radius <= 0) return;
  const share = 1 - Math.exp(-strength * dt);
  const min = 2 * radius;
  const moved = new Set<number>();
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      if (Math.abs(a.y - b.y) > HEIGHT_GAP) continue;
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
      const move = (min - dist) * share * 0.5;
      a.x -= nx * move;
      a.z -= nz * move;
      b.x += nx * move;
      b.z += nz * move;
      moved.add(i);
      moved.add(j);
    }
  }
  // A push never moves anyone into a block.
  for (const i of moved) {
    const s = bodies[i];
    [s.x, s.z] = resolveWalls(s.x, s.z, wallRadius, s.y, stepUp);
  }
}
