// Stand-ins for the vision rule, in a test corner of the yard (x -22 to -38, z 18 to 32, past the lane): a low hedge
// you see over (1.4 m, under your eyes), a tall hedge that hides (2.0 m), and a column of smoke that hides (3.5 m).
// They block sight only: soldiers walk through them and shots and grenades pass through them (they are not in the
// blocks the movement and the shots use). Stand-in art; nothing here is the game's.
import * as THREE from 'three';
import { hullOf } from './geom';
import { INK_BLOCK, toon } from './look';

export interface Hedge {
  name: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  top: number;
}
export const HEDGES: Hedge[] = [
  { name: 'low hedge (you see over it)', minX: -32, maxX: -24, minZ: 19.7, maxZ: 20.3, top: 1.4 },
  { name: 'tall hedge (it hides)', minX: -32, maxX: -24, minZ: 25.7, maxZ: 26.3, top: 2.0 },
];
/** The smoke cloud: an upright column. */
export const SMOKE = { name: 'smoke column', x: -36, z: 23, r: 1.5, top: 3.5 };

const HEDGE_GREEN = '#5E7F45';
const SMOKE_GREY = '#C9CDC4';

/** Build the stand-ins' meshes into the scene. */
export function addStandIns(scene: THREE.Scene) {
  for (const h of HEDGES) {
    const g = new THREE.BoxGeometry(h.maxX - h.minX, h.top, h.maxZ - h.minZ);
    g.translate((h.minX + h.maxX) / 2, h.top / 2, (h.minZ + h.maxZ) / 2);
    const m = new THREE.Mesh(g, toon(HEDGE_GREEN));
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m, new THREE.Mesh(hullOf([g]), INK_BLOCK));
  }
  const sg = new THREE.CylinderGeometry(SMOKE.r, SMOKE.r, SMOKE.top, 28, 1, true);
  sg.translate(SMOKE.x, SMOKE.top / 2, SMOKE.z);
  const smoke = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: SMOKE_GREY, transparent: true, opacity: 0.82, depthWrite: false, side: THREE.DoubleSide }));
  smoke.renderOrder = 3;
  const cap = new THREE.CircleGeometry(SMOKE.r, 28);
  cap.rotateX(-Math.PI / 2);
  cap.translate(SMOKE.x, SMOKE.top, SMOKE.z);
  const top = new THREE.Mesh(cap, smoke.material);
  top.renderOrder = 3;
  scene.add(smoke, top);
}
