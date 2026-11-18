// The test yard: a flat street-coloured square with a faint 1 m grid, grass beyond its uneven edge, and test
// blocks (steps either side of the step-up limit, a cover wall, ledges under, at and over the jump reach,
// a ramp to a platform, and a 50 m lane with a post every 10 m). Colours from appendix A5 part C:
// higher is lighter. The same block list is the collision world.
import * as THREE from 'three';
import { box, hullOf } from './geom';
import { INK_BLOCK, PAL, toon } from './look';

export interface Block {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  top: number;
  /** Ramps rise along an axis from `low` to `high` (coordinates on that axis). */
  ramp?: { axis: 'x' | 'z'; low: number; high: number };
}

export const YARD_HALF = 60;
/** How far above a reachable height a surface may sit and still count as reachable (float noise). */
const EPS = 0.005;

function blk(cx: number, cz: number, sx: number, sz: number, top: number): Block {
  return { minX: cx - sx / 2, maxX: cx + sx / 2, minZ: cz - sz / 2, maxZ: cz + sz / 2, top };
}

/** Ramp footprint with its rise from `low` to `high` along `axis`, up to `top`. */
function ramp(cx: number, cz: number, sx: number, sz: number, top: number, axis: 'x' | 'z', rising: 1 | -1): Block {
  const b = blk(cx, cz, sx, sz, top);
  const lo = axis === 'x' ? (rising > 0 ? b.minX : b.maxX) : rising > 0 ? b.minZ : b.maxZ;
  const hi = axis === 'x' ? (rising > 0 ? b.maxX : b.minX) : rising > 0 ? b.maxZ : b.minZ;
  b.ramp = { axis, low: lo, high: hi };
  return b;
}

/**
 * The default camera looks toward -x, -z, so the blocks sit in that direction from the spawn at (0, 0).
 */
export const BLOCKS: Block[] = [
  // Steps: 0.55 m walks up (the step-up), 0.56 m needs a jump.
  blk(-5, 3, 3, 3, 0.55),
  blk(3, -5, 3, 3, 0.56),
  // Cover wall, 1.5 m.
  blk(-2, -9, 5, 0.5, 1.5),
  // Ledges under, at and over the jump reach.
  blk(-14, -2, 4, 4, 2.5),
  blk(-14, -8, 4, 4, 3.07),
  blk(-14, -14, 4, 4, 3.5),
  // A ramp up to a 2.5 m platform.
  ramp(-6, -18, 3, 9, 2.5, 'z', -1),
  blk(-6, -25, 5, 5, 2.5),
  // Range posts every 10 m along a 50 m lane.
  ...[0, 10, 20, 30, 40, 50].map((d) => blk(-10 - d, 10, 0.25, 0.25, 1.2)),
];

export function rampHeight(b: Block, x: number, z: number): number {
  const r = b.ramp!;
  const c = r.axis === 'x' ? x : z;
  const t = Math.min(1, Math.max(0, (c - r.low) / (r.high - r.low)));
  return t * b.top;
}

/**
 * The first solid surface along a ray (the cursor's, from the camera): the ground, a block's top or side, the
 * ramp's slope or side. Null if it meets nothing (it always meets the ground when looking down).
 */
export function rayWorld(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
): { x: number; y: number; z: number } | null {
  let best = Infinity;
  if (dy < -1e-9) best = -oy / dy;
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  for (const b of BLOCKS) {
    if (!b.ramp) {
      // Slab test against the block's box: the entry point.
      const lo = [b.minX, 0, b.minZ];
      const hi = [b.maxX, b.top, b.maxZ];
      let t0 = 0;
      let t1 = Infinity;
      let ok = true;
      for (let i = 0; i < 3 && ok; i++) {
        if (Math.abs(d[i]) < 1e-12) {
          if (o[i] < lo[i] || o[i] > hi[i]) ok = false;
          continue;
        }
        let a = (lo[i] - o[i]) / d[i];
        let c = (hi[i] - o[i]) / d[i];
        if (a > c) [a, c] = [c, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, c);
        if (t0 > t1) ok = false;
      }
      if (ok && t0 > 0 && t0 < best) best = t0;
      continue;
    }
    // The ramp: its slope, its two sides (under the slope) and its high end.
    const r = b.ramp;
    const ax = r.axis === 'x' ? 0 : 2;
    const cx = ax === 0 ? 2 : 0;
    const s = b.top / (r.high - r.low);
    const inside = (p: number[], eps: number) =>
      p[0] >= b.minX - eps && p[0] <= b.maxX + eps && p[2] >= b.minZ - eps && p[2] <= b.maxZ + eps;
    const at = (t: number) => [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
    // Slope: y = s * (c - low), c the coordinate along the rise.
    const den = d[1] - s * d[ax];
    if (Math.abs(den) > 1e-12) {
      const t = (s * (o[ax] - r.low) - o[1]) / den;
      if (t > 0 && t < best && inside(at(t), 1e-6)) best = t;
    }
    // Sides: the planes across the ramp, under the slope.
    const lo = cx === 0 ? b.minX : b.minZ;
    const hi = cx === 0 ? b.maxX : b.maxZ;
    for (const plane of [lo, hi]) {
      if (Math.abs(d[cx]) < 1e-12) continue;
      const t = (plane - o[cx]) / d[cx];
      if (t <= 0 || t >= best) continue;
      const p = at(t);
      if (inside(p, 1e-6) && p[1] >= 0 && p[1] <= rampHeight(b, p[0], p[2])) best = t;
    }
    // High end.
    if (Math.abs(d[ax]) > 1e-12) {
      const t = (r.high - o[ax]) / d[ax];
      const p = at(t);
      if (t > 0 && t < best && inside(p, 1e-6) && p[1] >= 0 && p[1] <= b.top) best = t;
    }
  }
  if (!Number.isFinite(best)) return null;
  return { x: ox + dx * best, y: oy + dy * best, z: oz + dz * best };
}

/** The highest surface at (x, z) at or just below height y: the ground, a block's top or the ramp (for effects). */
export function floorBelow(x: number, z: number, y: number): number {
  let f = 0;
  for (const b of BLOCKS) {
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    const h = b.ramp ? rampHeight(b, x, z) : b.top;
    if (h <= y + 0.05 && h > f) f = h;
  }
  return f;
}

/** Height of a block's surface at the point of its footprint nearest to (x, z). */
function heightNear(b: Block, x: number, z: number): number {
  if (!b.ramp) return b.top;
  const qx = Math.min(b.maxX, Math.max(b.minX, x));
  const qz = Math.min(b.maxZ, Math.max(b.minZ, z));
  return rampHeight(b, qx, qz);
}

function overlaps(b: Block, x: number, z: number, r: number): boolean {
  const qx = Math.min(b.maxX, Math.max(b.minX, x));
  const qz = Math.min(b.maxZ, Math.max(b.minZ, z));
  const dx = x - qx;
  const dz = z - qz;
  return dx * dx + dz * dz < r * r;
}

/**
 * The highest surface under a body of radius r that it can stand on from its feet height: the ground, or any
 * block it overlaps whose top is no more than step-up above the feet.
 */
export function surfaceAt(x: number, z: number, r: number, feet: number, stepUp: number): number {
  let h = 0;
  for (const b of BLOCKS) {
    if (!overlaps(b, x, z, r)) continue;
    const top = heightNear(b, x, z);
    if (top <= feet + stepUp + EPS && top > h) h = top;
  }
  return h;
}

/**
 * Stepping up (or catching a ledge in a jump): the body touches a block whose top is above the feet but no
 * more than step-up above them, while moving towards it. Returns that top and the block's nearest point, or
 * null. Taken together with the narrow foot circle that the soldier stands on, this lets him step up as soon
 * as his body meets the block, without ever standing on air past an edge.
 */
export function stepUpTarget(
  x: number,
  z: number,
  r: number,
  feet: number,
  stepUp: number,
  vx: number,
  vz: number,
): { top: number; qx: number; qz: number } | null {
  let best: { top: number; qx: number; qz: number } | null = null;
  for (const b of BLOCKS) {
    if (!overlaps(b, x, z, r)) continue;
    const top = heightNear(b, x, z);
    if (top <= feet + 1e-6 || top > feet + stepUp + EPS) continue;
    const qx = Math.min(b.maxX, Math.max(b.minX, x));
    const qz = Math.min(b.maxZ, Math.max(b.minZ, z));
    // Moving towards it (or already over it).
    if ((qx - x) * vx + (qz - z) * vz <= 0 && (qx !== x || qz !== z)) continue;
    if (!best || top > best.top) best = { top, qx, qz };
  }
  return best;
}

/**
 * Push a body of radius r out of every block too tall to step onto from its feet height. Returns the pushed
 * position. A few passes settle corners where two blocks meet.
 */
export function resolveWalls(x: number, z: number, r: number, feet: number, stepUp: number): [number, number] {
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const b of BLOCKS) {
      if (heightNear(b, x, z) <= feet + stepUp + EPS) continue;
      const qx = Math.min(b.maxX, Math.max(b.minX, x));
      const qz = Math.min(b.maxZ, Math.max(b.minZ, z));
      let dx = x - qx;
      let dz = z - qz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2);
        dx /= d;
        dz /= d;
        x = qx + dx * r;
        z = qz + dz * r;
      } else {
        // Centre inside the block: leave by the nearest face.
        const pen = [x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z];
        const m = Math.min(...pen);
        if (m === pen[0]) x = b.minX - r;
        else if (m === pen[1]) x = b.maxX + r;
        else if (m === pen[2]) z = b.minZ - r;
        else z = b.maxZ + r;
      }
      moved = true;
    }
    if (!moved) break;
  }
  const lim = YARD_HALF - 0.5;
  return [Math.min(lim, Math.max(-lim, x)), Math.min(lim, Math.max(-lim, z))];
}

// ---------------------------------------------------------------------------------------------------------
// The picture of the yard.

/** A small seeded random source, so the uneven edge is the same on every visit. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The yard's outline with its edge wandering about 0.1 m either side, pushed out by `grow`. */
function edgeShape(half: number, grow: number, seed: number): THREE.Shape {
  const rand = rng(seed);
  const pts: THREE.Vector2[] = [];
  const step = 0.5;
  const corners: [number, number, number, number][] = [
    [-half, -half, 1, 0],
    [half, -half, 0, 1],
    [half, half, -1, 0],
    [-half, half, 0, -1],
  ];
  for (const [sx, sz, dx, dz] of corners) {
    const n = Math.round((2 * half) / step);
    for (let i = 0; i < n; i++) {
      const j = (rand() - 0.5) * 0.2;
      // Outward normal of this edge is (dz, -dx).
      const ox = (dz * (grow + j));
      const oz = (-dx * (grow + j));
      pts.push(new THREE.Vector2(sx + dx * i * step + ox, sz + dz * i * step + oz));
    }
  }
  return new THREE.Shape(pts);
}

/**
 * Ground pieces are drawn first and write no depth, so the ink shell of a block or a soldier shows below its
 * base: the line goes all the way round them, while the ground itself never gets a line.
 */
function flat(shape: THREE.Shape | null, w: number, d: number, hex: string, y: number, order: number): THREE.Mesh {
  const geo = shape ? new THREE.ShapeGeometry(shape) : new THREE.PlaneGeometry(w, d);
  // Shapes and planes are built in XY; lay them on the ground (y up), keeping x and turning y into z.
  geo.rotateX(Math.PI / 2);
  // rotateX(+90°) maps +y to +z; faces now point down, so flip them up.
  const idx = geo.getIndex();
  if (idx) {
    const a = idx.array as Uint16Array | Uint32Array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1];
      a[i + 1] = a[i + 2];
      a[i + 2] = t;
    }
  }
  geo.computeVertexNormals();
  const mat = toon(hex).clone();
  mat.depthWrite = false;
  const m = new THREE.Mesh(geo, mat);
  m.position.y = y;
  m.receiveShadow = true;
  m.renderOrder = order;
  return m;
}

function grid(): THREE.Group {
  const g = new THREE.Group();
  const fine: number[] = [];
  const coarse: number[] = [];
  for (let i = -YARD_HALF; i <= YARD_HALF; i++) {
    const arr = i % 10 === 0 ? coarse : fine;
    arr.push(i, 0, -YARD_HALF, i, 0, YARD_HALF, -YARD_HALF, 0, i, YARD_HALF, 0, i);
  }
  const mk = (pos: number[], opacity: number) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: '#4a4236', transparent: true, opacity, depthWrite: false });
    return new THREE.LineSegments(geo, mat);
  };
  const f = mk(fine, 0.1);
  const c = mk(coarse, 0.22);
  f.renderOrder = c.renderOrder = -0.5;
  g.add(f, c);
  g.position.y = 0.01;
  return g;
}

function blockColour(b: Block): string {
  if (b.maxX - b.minX < 0.5 && b.maxZ - b.minZ < 0.5) return PAL.timber; // range posts
  if (b.ramp) return PAL.stone;
  return b.top >= 2 ? PAL.plaster : PAL.stone;
}

function rampGeometry(b: Block): THREE.BufferGeometry {
  // A wedge: full height at the high end, zero at the low end. Built as a prism along the ramp's width.
  const r = b.ramp!;
  const pos: number[] = [];
  const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const corners = (c: number) => (r.axis === 'z' ? [P(b.minX, 0, c), P(b.maxX, 0, c)] : [P(c, 0, b.minZ), P(c, 0, b.maxZ)]);
  const [l0, l1] = corners(r.low);
  const [h0, h1] = corners(r.high);
  const t0 = h0.clone().setY(b.top);
  const t1 = h1.clone().setY(b.top);
  // A point strictly inside the wedge, to turn every face outward.
  const mid = new THREE.Vector3().add(l0).add(l1).add(h0).add(h1).add(t0).add(t1).divideScalar(6);
  const tri = (a: THREE.Vector3, bb: THREE.Vector3, c: THREE.Vector3) => {
    const n = new THREE.Vector3().subVectors(bb, a).cross(new THREE.Vector3().subVectors(c, a));
    const out = new THREE.Vector3().add(a).add(bb).add(c).divideScalar(3).sub(mid);
    const ordered = n.dot(out) < 0 ? [a, c, bb] : [a, bb, c];
    for (const v of ordered) pos.push(v.x, v.y, v.z);
  };
  tri(l0, l1, t1); // slope
  tri(l0, t1, t0);
  tri(h0, h1, t1); // high end
  tri(h0, t1, t0);
  tri(l0, h0, t0); // sides
  tri(l1, h1, t1);
  tri(l0, l1, h1); // bottom
  tri(l0, h1, h0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function buildYard(scene: THREE.Scene) {
  // Grass to the horizon, the worn strip along the street's edge, then the street (A5 part C2).
  scene.add(flat(null, 900, 900, PAL.grass, 0, -3));
  scene.add(flat(edgeShape(YARD_HALF, 0.25, 7), 0, 0, PAL.worn, 0, -2));
  scene.add(flat(edgeShape(YARD_HALF, 0, 7), 0, 0, PAL.street, 0, -1));
  scene.add(grid());

  for (const b of BLOCKS) {
    const sx = b.maxX - b.minX;
    const sz = b.maxZ - b.minZ;
    const geo = b.ramp ? rampGeometry(b) : box((b.minX + b.maxX) / 2, b.top / 2, (b.minZ + b.maxZ) / 2, sx, b.top, sz);
    const m = new THREE.Mesh(geo, toon(blockColour(b)));
    m.castShadow = true;
    m.receiveShadow = true;
    const ink = new THREE.Mesh(hullOf([geo]), INK_BLOCK);
    scene.add(m, ink);
  }
}
