// Small geometry helpers: flat-shaded prisms built from simple shapes (boxes and 8-sided cylinders),
// and the matching "hull" geometry with averaged normals that the ink line is drawn from.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A closed outline in a plane: [a, b] pairs, any winding. */
export type Ring = [number, number][];

export function rectRing(w: number, d: number, cx = 0, cz = 0): Ring {
  return [
    [cx - w / 2, cz - d / 2],
    [cx + w / 2, cz - d / 2],
    [cx + w / 2, cz + d / 2],
    [cx - w / 2, cz + d / 2],
  ];
}

/**
 * Regular n-gon whose flat sides face the axes and measure w (first axis) and d (second axis) across, so an
 * 8-sided part "0.235 across" is 0.235 wide.
 */
export function ngonRing(n: number, w: number, d: number, cx = 0, cz = 0): Ring {
  const r: Ring = [];
  const k = 1 / Math.cos(Math.PI / n);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    r.push([cx + (Math.cos(a) * w * k) / 2, cz + (Math.sin(a) * d * k) / 2]);
  }
  return r;
}

/**
 * A prism along +Y between ring `bot` (at y0) and ring `top` (at y1); rings are (x, z) and must have the same
 * number of points. Closed at both ends, non-indexed, flat normals. Triangles are wound so they face outward.
 */
export function prism(bot: Ring, y0: number, top: Ring, y1: number): THREE.BufferGeometry {
  const n = bot.length;
  const pos: number[] = [];
  const cBot = centroid(bot);
  const cTop = centroid(top);
  const mid = new THREE.Vector3((cBot[0] + cTop[0]) / 2, (y0 + y1) / 2, (cBot[1] + cTop[1]) / 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const tri = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3) => {
    // Orient the triangle away from the prism's centre.
    const n1 = new THREE.Vector3().subVectors(q, p).cross(new THREE.Vector3().subVectors(r, p));
    const out = new THREE.Vector3().addVectors(p, q).add(r).divideScalar(3).sub(mid);
    if (n1.dot(out) < 0) pos.push(p.x, p.y, p.z, r.x, r.y, r.z, q.x, q.y, q.z);
    else pos.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const b0 = new THREE.Vector3(bot[i][0], y0, bot[i][1]);
    const b1 = new THREE.Vector3(bot[j][0], y0, bot[j][1]);
    const t0 = new THREE.Vector3(top[i][0], y1, top[i][1]);
    const t1 = new THREE.Vector3(top[j][0], y1, top[j][1]);
    tri(b0, b1, t1);
    tri(b0, t1, t0);
  }
  for (let i = 1; i < n - 1; i++) {
    a.set(bot[0][0], y0, bot[0][1]);
    b.set(bot[i][0], y0, bot[i][1]);
    c.set(bot[i + 1][0], y0, bot[i + 1][1]);
    tri(a.clone(), b.clone(), c.clone());
    a.set(top[0][0], y1, top[0][1]);
    b.set(top[i][0], y1, top[i][1]);
    c.set(top[i + 1][0], y1, top[i + 1][1]);
    tri(a.clone(), b.clone(), c.clone());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function centroid(r: Ring): [number, number] {
  let x = 0;
  let z = 0;
  for (const p of r) {
    x += p[0];
    z += p[1];
  }
  return [x / r.length, z / r.length];
}

/** Axis-aligned box centred at (cx, cy, cz), turned by rotY about its vertical axis. */
export function box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, rotY = 0) {
  const g = prism(rectRing(sx, sz), -sy / 2, rectRing(sx, sz), sy / 2);
  if (rotY) g.rotateY(rotY);
  g.translate(cx, cy, cz);
  return g;
}

/** Box tapered along Y: bottom w0 x d0 at y0, top w1 x d1 at y1 (sizes in X and Z). */
export function taperBox(w0: number, d0: number, y0: number, w1: number, d1: number, y1: number, cx = 0, cz = 0) {
  return prism(rectRing(w0, d0, cx, cz), y0, rectRing(w1, d1, cx, cz), y1);
}

/** 8-sided cylinder along Y, tapered and optionally elliptical. */
export function taperCyl(
  w0: number,
  d0: number,
  y0: number,
  w1: number,
  d1: number,
  y1: number,
  cx = 0,
  cz = 0,
  sides = 8,
) {
  return prism(ngonRing(sides, w0, d0, cx, cz), y0, ngonRing(sides, w1, d1, cx, cz), y1);
}

/**
 * A part laid along +Z from z0 to z1 (used for guns): the cross-section is (width in X, height in Y) and its
 * centre (cx, cy) may move from start to end, so tapers and drops are possible.
 */
export function alongZ(
  z0: number,
  z1: number,
  s0: { w: number; h: number; cx?: number; cy?: number },
  s1: { w: number; h: number; cx?: number; cy?: number },
  round = false,
) {
  // Build along +Y with ring axes (x, z), then turn so +Y becomes +Z. A ring's z becomes -y.
  const ring = (s: { w: number; h: number; cx?: number; cy?: number }) =>
    round ? ngonRing(8, s.w, s.h, s.cx ?? 0, -(s.cy ?? 0)) : rectRing(s.w, s.h, s.cx ?? 0, -(s.cy ?? 0));
  const g = prism(ring(s0), 0, ring(s1), z1 - z0);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, z0);
  return g;
}

/** Merge flat-shaded parts that share one material into one geometry. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('merge failed');
  return g;
}

/**
 * The ink hull of a set of parts: each part's corners are welded and its normals averaged, so pushing the
 * vertices out along the normals gives a closed shell without gaps at the corners.
 */
export function hullOf(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const welded = parts.map((p) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', p.getAttribute('position').clone());
    const m = mergeVertices(g, 1e-4);
    m.computeVertexNormals();
    return m;
  });
  const g = mergeGeometries(welded, false);
  if (!g) throw new Error('hull merge failed');
  return g;
}
