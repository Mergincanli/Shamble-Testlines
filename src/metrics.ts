// The metrics room: test pieces of ordinary real sizes beside the yard, to judge the soldier's size against
// them and to tune them: a doorway and a window in two short walls, a waist-high cover and a stair to a landing.
// Every size is a slider (params.ts, group 'metrics'); the pieces join the collision world as blocks (the wall
// over the door and over the window float), and are rebuilt whenever a size changes. They stand in a row along
// z at x 20, their faces toward +x, where the Original camera looks from. The stair is walked on a slope through
// the middle of each tread (the soldier's body is wider than a tread, so stepping each one would lurch), with the
// steps drawn over it: his feet are at most half a rise above or below a drawn tread.
import * as THREE from 'three';
import { hullOf } from './geom';
import { gridToon, INK_BLOCK, PAL } from './look';
import { builtOpening, type Store } from './params';
import { BLOCKS, blockMesh, type Block } from './yard';

/** The plane of the walls, where along z each piece stands (its centre), and the stair's first riser. */
export const ROOM_X = 20;
const DOOR_Z = -11;
const WINDOW_Z = -17;
const COVER_Z = -22.5;
const STAIR_Z = -27.5;
const STAIR_X0 = ROOM_X + 1.5;
/** The layout, for the Export (the sizes are sliders; these place the pieces). */
export const ROOM_LAYOUT = {
  wall_plane_x_m: ROOM_X,
  door_wall_centre_z_m: DOOR_Z,
  window_wall_centre_z_m: WINDOW_Z,
  cover_centre_z_m: COVER_Z,
  stair_centre_z_m: STAIR_Z,
  stair_first_riser_x_m: STAIR_X0,
  stair_slope: 'through the middle of each tread',
  opening_limits: 'no wider than the wall less 0.2 m; sill at least 0.1 m under the top; at least 0.05 m of wall over it',
};

/** The pieces' blocks for the current sizes, with dependent sizes kept possible and empty pieces left out. */
export function roomBlocks(P: Store): Block[] {
  const wallH = P.num('roomWallHeight');
  const wallLen = P.num('roomWallLength');
  const t = P.num('roomWallThick');
  const x0 = ROOM_X - t / 2;
  const x1 = ROOM_X + t / 2;
  const out: Block[] = [];
  const add = (minX: number, maxX: number, minZ: number, maxZ: number, bottom: number, top: number, extra: Partial<Block> = {}) => {
    if (maxX - minX < 1e-3 || maxZ - minZ < 1e-3 || top - bottom < 1e-3) return;
    out.push({ minX, maxX, minZ, maxZ, top, ...(bottom > 0 ? { bottom } : {}), ...extra });
  };
  // A wall with an opening (door: sill 0): full height either side, a sill below, a floating wall above.
  const opening = (cz: number, which: 'door' | 'window') => {
    const o = builtOpening(P.values, which);
    const a = cz - wallLen / 2;
    const b = cz + wallLen / 2;
    add(x0, x1, a, cz - o.width / 2, 0, wallH);
    add(x0, x1, cz + o.width / 2, b, 0, wallH);
    add(x0, x1, cz - o.width / 2, cz + o.width / 2, 0, o.sill);
    add(x0, x1, cz - o.width / 2, cz + o.width / 2, o.sill + o.height, wallH);
  };
  opening(DOOR_Z, 'door');
  opening(WINDOW_Z, 'window');
  // Waist-high cover, its face toward the camera like the walls.
  const ct = P.num('coverThick');
  const cl = P.num('coverLength');
  add(ROOM_X - ct / 2, ROOM_X + ct / 2, COVER_Z - cl / 2, COVER_Z + cl / 2, 0, P.num('coverHeight'));
  // The stair: rising toward -x from its first riser, to a landing the depth of the last tread plus the landing
  // slider. It is walked on a hidden slope through the middle of each tread: from the ground half a tread in
  // front of the first riser to the landing's height half a tread into the landing (which, being a full block,
  // carries him from its front edge on).
  const rise = P.num('stairRise');
  const tread = P.num('stairTread');
  const n = Math.round(P.num('stairSteps'));
  const sw = P.num('stairWidth');
  const z0 = STAIR_Z - sw / 2;
  const z1 = STAIR_Z + sw / 2;
  const landingX = STAIR_X0 - (n - 1) * tread;
  const lowX = STAIR_X0 + tread / 2;
  const highX = landingX - tread / 2;
  add(highX, lowX, z0, z1, 0, n * rise, { ramp: { axis: 'x', low: lowX, high: highX }, hidden: true });
  add(landingX - P.num('stairLanding'), landingX, z0, z1, 0, n * rise);
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

/** The stair's drawn steps as boxes, for the vision rule's sight test (kept up to date as the room is rebuilt). */
export const STAIR_STEP_BLOCKS: Block[] = [];

export class MetricsRoom {
  private group = new THREE.Group();
  private blocks: Block[] = [];
  private key = '';
  private wallMat = gridToon(PAL.plaster, 'room');
  private lowMat = gridToon(PAL.stone, 'room');

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
    const wallMat = this.wallMat;
    const lowMat = this.lowMat;
    for (const b of this.blocks) {
      if (b.hidden) continue;
      const m = blockMesh(b, b.top - (b.bottom ?? 0) > 2 || (b.bottom ?? 0) > 0 ? wallMat : lowMat);
      this.group.add(m, new THREE.Mesh(hullOf([m.geometry]), INK_BLOCK));
    }
    const sw = this.store.num('stairWidth');
    STAIR_STEP_BLOCKS.length = 0;
    for (const s of stairSteps(this.store)) {
      const step: Block = { minX: s.a, maxX: s.b, minZ: STAIR_Z - sw / 2, maxZ: STAIR_Z + sw / 2, top: s.top };
      STAIR_STEP_BLOCKS.push(step);
      const m = blockMesh(step, lowMat);
      this.group.add(m, new THREE.Mesh(hullOf([m.geometry]), INK_BLOCK));
    }
  }
}

/** The sizes the room is built from. */
const KEYS = [
  'roomWallHeight',
  'roomWallThick',
  'roomWallLength',
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
  'stairLanding',
];
