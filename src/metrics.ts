// The metrics room: test pieces of ordinary real sizes beside the yard, to judge the soldier's size against
// them and to tune them: a doorway and a window in two short walls, a waist-high cover and a stair to a landing.
// Every size is a slider (params.ts, group 'metrics'); the pieces join the collision world as blocks (the wall
// over the door and over the window float), and are rebuilt whenever a size changes. They stand in a row along
// z at x 20, their faces toward +x, where the Original camera looks from. The stair is walked on a slope through
// its nosings (the soldier's body is wider than a tread, so stepping each one would lurch), with the steps drawn
// over it.
import * as THREE from 'three';
import { hullOf } from './geom';
import { gridToon, INK_BLOCK, PAL } from './look';
import type { Store } from './params';
import { BLOCKS, blockMesh, type Block } from './yard';

/** The plane of the walls, and where along z each piece stands (its centre). */
export const ROOM_X = 20;
const DOOR_Z = -11;
const WINDOW_Z = -17;
const COVER_Z = -22.5;
const STAIR_Z = -27.5;
/** Each wall is 4 m long (the sandbox's pick); the stair's first riser is 1.5 m in front of the wall plane. */
const WALL_LEN = 4;
const STAIR_X0 = ROOM_X + 1.5;
const LANDING = 1.5;

/** The pieces' blocks for the current sizes, with dependent sizes kept possible and empty pieces left out. */
export function roomBlocks(P: Store): Block[] {
  const wallH = P.num('roomWallHeight');
  const t = P.num('roomWallThick');
  const x0 = ROOM_X - t / 2;
  const x1 = ROOM_X + t / 2;
  const out: Block[] = [];
  const add = (minX: number, maxX: number, minZ: number, maxZ: number, bottom: number, top: number, extra: Partial<Block> = {}) => {
    if (maxX - minX < 1e-3 || maxZ - minZ < 1e-3 || top - bottom < 1e-3) return;
    out.push({ minX, maxX, minZ, maxZ, top, ...(bottom > 0 ? { bottom } : {}), ...extra });
  };
  // A wall with an opening (door: sill 0): full height either side, a sill below, a floating wall above.
  const opening = (cz: number, width: number, sill: number, height: number) => {
    const w = Math.min(width, WALL_LEN - 0.2);
    const s = Math.min(Math.max(0, sill), wallH - 0.1);
    const top = Math.min(s + height, wallH - 0.05);
    const a = cz - WALL_LEN / 2;
    const b = cz + WALL_LEN / 2;
    add(x0, x1, a, cz - w / 2, 0, wallH);
    add(x0, x1, cz + w / 2, b, 0, wallH);
    add(x0, x1, cz - w / 2, cz + w / 2, 0, s);
    add(x0, x1, cz - w / 2, cz + w / 2, top, wallH);
  };
  opening(DOOR_Z, P.num('doorWidth'), 0, P.num('doorHeight'));
  opening(WINDOW_Z, P.num('windowWidth'), P.num('windowSill'), P.num('windowHeight'));
  // Waist-high cover, its face toward the camera like the walls.
  const ct = P.num('coverThick');
  const cl = P.num('coverLength');
  add(ROOM_X - ct / 2, ROOM_X + ct / 2, COVER_Z - cl / 2, COVER_Z + cl / 2, 0, P.num('coverHeight'));
  // The stair: rising toward -x from its first riser, to a landing the depth of the last tread plus 1.5 m. It
  // is walked on a hidden slope through the step nosings (from one tread in front of the first riser, at the
  // ground, to the last riser's top).
  const rise = P.num('stairRise');
  const tread = P.num('stairTread');
  const n = Math.round(P.num('stairSteps'));
  const sw = P.num('stairWidth');
  const z0 = STAIR_Z - sw / 2;
  const z1 = STAIR_Z + sw / 2;
  const highX = STAIR_X0 - (n - 1) * tread;
  add(highX, STAIR_X0 + tread, z0, z1, 0, n * rise, { ramp: { axis: 'x', low: STAIR_X0 + tread, high: highX }, hidden: true });
  add(highX - LANDING, highX, z0, z1, 0, n * rise);
  return out;
}

/** The visible steps (all but the last, which is part of the landing): x from, x to, top. */
function stairSteps(P: Store): { a: number; b: number; top: number }[] {
  const rise = P.num('stairRise');
  const tread = P.num('stairTread');
  const n = Math.round(P.num('stairSteps'));
  const out: { a: number; b: number; top: number }[] = [];
  for (let k = 0; k < n - 1; k++) out.push({ a: STAIR_X0 - (k + 1) * tread, b: STAIR_X0 - k * tread, top: (k + 1) * rise });
  return out;
}

export class MetricsRoom {
  private group = new THREE.Group();
  private blocks: Block[] = [];
  private key = '';

  constructor(
    scene: THREE.Scene,
    private store: Store,
  ) {
    scene.add(this.group);
    this.rebuild();
  }

  /** Rebuild the pieces if any size changed (cheap to call on every store change). */
  rebuild() {
    const key = KEYS.map((k) => this.store.num(k)).join(',');
    if (key === this.key) return;
    this.key = key;
    // Out of the collision world, out of the scene, geometry freed.
    for (const b of this.blocks) {
      const i = BLOCKS.indexOf(b);
      if (i >= 0) BLOCKS.splice(i, 1);
    }
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      (child as THREE.Mesh).geometry?.dispose();
    }
    this.blocks = roomBlocks(this.store);
    BLOCKS.push(...this.blocks);
    const wallMat = gridToon(PAL.plaster, 'room');
    const lowMat = gridToon(PAL.stone, 'room');
    for (const b of this.blocks) {
      if (b.hidden) continue;
      const m = blockMesh(b, b.top - (b.bottom ?? 0) > 2 || (b.bottom ?? 0) > 0 ? wallMat : lowMat);
      this.group.add(m, new THREE.Mesh(hullOf([m.geometry]), INK_BLOCK));
    }
    const sw = this.store.num('stairWidth');
    for (const s of stairSteps(this.store)) {
      const m = blockMesh({ minX: s.a, maxX: s.b, minZ: STAIR_Z - sw / 2, maxZ: STAIR_Z + sw / 2, top: s.top }, lowMat);
      this.group.add(m, new THREE.Mesh(hullOf([m.geometry]), INK_BLOCK));
    }
  }
}

/** The sizes the room is built from. */
const KEYS = [
  'roomWallHeight',
  'roomWallThick',
  'doorWidth',
  'doorHeight',
  'windowWidth',
  'windowHeight',
  'windowSill',
  'coverHeight',
  'coverLength',
  'coverThick',
  'stairRise',
  'stairTread',
  'stairSteps',
  'stairWidth',
];
