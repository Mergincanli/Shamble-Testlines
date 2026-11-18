// Eleven dummies that walk loops around the blocks, in the other two factions' colours. They move by the same
// movement step as the player's soldier, steered toward the next point of their loop, so every movement value
// on the panel applies to them too.
import { newMover, type MoveInput, type MoverState } from './movement';
import { FACTIONS, type Faction } from './look';

/** Closed loops on open ground (x, z), clear of the blocks; some are walked one way, some the other. */
const LOOPS: [number, number][][] = [
  // Around the spawn, crossing the lane between the steps.
  [[4, 4], [-1, 9], [-9, 6], [-9, -1], [-3, -3]],
  // Around the cover wall.
  [[3.5, -8], [-2, -12.5], [-7.5, -9], [-2, -5.5]],
  // In front of the three ledges.
  [[-9.5, 2], [-9.5, -16], [-10.5, -16], [-10.5, 2]],
  // A long oval along the lane.
  [[-8, 13], [-58, 13], [-58, 7], [-8, 7]],
  // A wide loop out to the right.
  [[8, -2], [14, -14], [6, -20], [5, -11]],
  // A small square near the start, crossing the first loop.
  [[6, 9], [1, 13], [-4, 9], [1, 5]],
];

interface Assignment {
  loop: number;
  /** Start at this share of the way round. */
  phase: number;
  dir: 1 | -1;
}

const ASSIGN: Assignment[] = [
  { loop: 0, phase: 0, dir: 1 },
  { loop: 0, phase: 0.5, dir: -1 },
  { loop: 1, phase: 0.2, dir: 1 },
  { loop: 1, phase: 0.7, dir: -1 },
  { loop: 2, phase: 0.1, dir: 1 },
  { loop: 2, phase: 0.6, dir: 1 },
  { loop: 3, phase: 0.0, dir: 1 },
  { loop: 3, phase: 0.5, dir: -1 },
  { loop: 4, phase: 0.3, dir: 1 },
  { loop: 5, phase: 0.0, dir: 1 },
  { loop: 5, phase: 0.5, dir: -1 },
];

export const DUMMY_COUNT = ASSIGN.length;

export interface Dummy {
  state: MoverState;
  prev: MoverState;
  loop: [number, number][];
  dir: 1 | -1;
  next: number;
  input: MoveInput;
  /** Which of the two other factions this dummy wears (0 or 1). */
  side: 0 | 1;
  /** For getting unstuck: the closest it has come to its next point, and for how long it has not improved. */
  best: number;
  stalled: number;
}

function pointAt(loop: [number, number][], share: number): { x: number; z: number; seg: number } {
  const lens = loop.map((p, i) => {
    const q = loop[(i + 1) % loop.length];
    return Math.hypot(q[0] - p[0], q[1] - p[1]);
  });
  const total = lens.reduce((a, b) => a + b, 0);
  let d = (((share % 1) + 1) % 1) * total;
  for (let i = 0; i < loop.length; i++) {
    if (d <= lens[i]) {
      const p = loop[i];
      const q = loop[(i + 1) % loop.length];
      const t = lens[i] > 0 ? d / lens[i] : 0;
      return { x: p[0] + (q[0] - p[0]) * t, z: p[1] + (q[1] - p[1]) * t, seg: i };
    }
    d -= lens[i];
  }
  return { x: loop[0][0], z: loop[0][1], seg: 0 };
}

export function makeDummies(): Dummy[] {
  return ASSIGN.map((a, i) => {
    const loop = LOOPS[a.loop];
    const start = pointAt(loop, a.phase);
    const s = newMover(start.x, start.z);
    const n = loop.length;
    const next = a.dir > 0 ? (start.seg + 1) % n : start.seg;
    return {
      state: s,
      prev: { ...s },
      loop,
      dir: a.dir,
      next,
      input: { wishX: 0, wishZ: 0, sprint: false, jump: false },
      side: (i % 2) as 0 | 1,
      best: Infinity,
      stalled: 0,
    };
  });
}

/** The two factions the dummies wear: the ones the player's soldier does not. */
export function otherFactions(mine: Faction): [Faction, Faction] {
  const o = FACTIONS.filter((f) => f !== mine);
  return [o[0], o[1]];
}

/** A dummy that has not come closer to its next point for this long goes back onto its loop. */
const STALL_TIME = 2;

/** Steer toward the next loop point; move on to the following point when close. */
export function steerDummy(d: Dummy, walking: boolean, dt: number) {
  if (!walking) {
    d.input.wishX = 0;
    d.input.wishZ = 0;
    d.best = Infinity;
    d.stalled = 0;
    return;
  }
  const n = d.loop.length;
  let [tx, tz] = d.loop[d.next];
  let dx = tx - d.state.x;
  let dz = tz - d.state.z;
  if (dx * dx + dz * dz < 0.6 * 0.6) {
    d.next = (d.next + d.dir + n) % n;
    [tx, tz] = d.loop[d.next];
    dx = tx - d.state.x;
    dz = tz - d.state.z;
    d.best = Infinity;
    d.stalled = 0;
  }
  // Stuck (pushed behind a wall, say): put it back on its loop, at the point it last left.
  const dist = Math.hypot(dx, dz);
  if (dist < d.best - 0.05) {
    d.best = dist;
    d.stalled = 0;
  } else if ((d.stalled += dt) > STALL_TIME) {
    const [bx, bz] = d.loop[(d.next - d.dir + n) % n];
    d.state.x = bx;
    d.state.z = bz;
    d.state.y = 0;
    d.state.vx = d.state.vz = d.state.vy = 0;
    d.state.grounded = true;
    d.prev = { ...d.state };
    d.best = Infinity;
    d.stalled = 0;
    dx = tx - bx;
    dz = tz - bz;
  }
  const l = Math.hypot(dx, dz);
  d.input.wishX = l > 1e-6 ? dx / l : 0;
  d.input.wishZ = l > 1e-6 ? dz / l : 0;
}
