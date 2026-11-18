// The two guns as simple shapes in the Dark colour. Gun frame (as in the Art briefs): +Z to the muzzle, +Y up,
// +X to the gun's left, origin at the grip socket.
// - SMG: appendix A6 with the corrections of A10 (magazine of three 0.06 pieces bent 0°, 8°, 16°).
// - Rifle: appendix A4 item 17's sizes (1.12 m; butt 0.26 behind the grip, muzzle 0.86 ahead; 0.13 thick at
//   the butt, 0.075 at the grip, 0.055 at the fore-end, barrel 0.03) with A10's socket offsets.
import * as THREE from 'three';
import { alongZ, box, hullOf, merge } from './geom';

export type GunId = 'smg' | 'rifle';

export interface GunModel {
  id: GunId;
  geometry: THREE.BufferGeometry;
  hull: THREE.BufferGeometry;
  sockets: { grip: THREE.Vector3; support: THREE.Vector3; muzzle: THREE.Vector3 };
}

function smg(): GunModel {
  // d = distance from the muzzle tip; the grip socket is at d 0.64, so z = 0.64 - d. Bore line 0.036 above it.
  const z = (d: number) => 0.64 - d;
  const bore = 0.036;
  const parts: THREE.BufferGeometry[] = [];
  // 1 receiver, 2 jacket (fatter on purpose), 6 collar, 8 barrel and muzzle collar
  parts.push(alongZ(z(0.63), z(0.28), { w: 0.042, h: 0.042, cy: bore }, { w: 0.042, h: 0.042, cy: bore }, true));
  parts.push(alongZ(z(0.28), z(0.11), { w: 0.05, h: 0.05, cy: bore }, { w: 0.05, h: 0.05, cy: bore }, true));
  parts.push(alongZ(z(0.32), z(0.28), { w: 0.058, h: 0.058, cy: bore }, { w: 0.058, h: 0.058, cy: bore }, true));
  parts.push(alongZ(z(0.11), z(0), { w: 0.02, h: 0.02, cy: bore }, { w: 0.02, h: 0.02, cy: bore }, true));
  parts.push(alongZ(z(0.07), z(0.035), { w: 0.034, h: 0.034, cy: bore }, { w: 0.034, h: 0.034, cy: bore }, true));
  // 3 stock: fore-end (top 0.018 below the bore), wrist (sinking), butt (wedge, top just below the bore)
  parts.push(alongZ(z(0.61), z(0.42), { w: 0.04, h: 0.032, cy: bore - 0.034 }, { w: 0.04, h: 0.032, cy: bore - 0.034 }));
  parts.push(alongZ(z(0.675), z(0.61), { w: 0.036, h: 0.036, cy: bore - 0.04 }, { w: 0.036, h: 0.04, cy: bore - 0.032 }));
  parts.push(alongZ(z(0.8), z(0.675), { w: 0.036, h: 0.1, cy: bore - 0.002 - 0.05 }, { w: 0.036, h: 0.04, cy: bore - 0.002 - 0.02 }));
  // 4 magazine housing: d 0.32 to 0.42, from the centre to 0.08 on the gun's left
  parts.push(box(0.04, bore, z(0.37), 0.08, 0.045, 0.1));
  // 5 magazine: three straight pieces of 0.06, bent 0°, 8° and 16° towards the muzzle, then a floor plate
  let px = 0.08;
  let pz = z(0.37);
  for (const deg of [0, 8, 16]) {
    const a = (deg * Math.PI) / 180;
    const dx = Math.cos(a) * 0.06;
    const dz = Math.sin(a) * 0.06;
    parts.push(box(px + dx / 2, bore, pz + dz / 2, 0.06, 0.02, 0.045, -a));
    px += dx;
    pz += dz;
  }
  {
    const a = (16 * Math.PI) / 180;
    parts.push(box(px + Math.cos(a) * 0.004, bore, pz + Math.sin(a) * 0.004, 0.008, 0.026, 0.05, -a));
  }
  // 7 fore grip: the bump under the collar, 0.06 down from its underside
  const collarBottom = bore - 0.029;
  parts.push(box(0, collarBottom - 0.03, z(0.3), 0.03, 0.06, 0.04));
  // 9 trigger guard: a thin plate 0.03 below the fore-end
  const foreEndBottom = bore - 0.018 - 0.032;
  parts.push(box(0, foreEndBottom - 0.015, z(0.585), 0.011, 0.03, 0.05));

  return {
    id: 'smg',
    geometry: merge(parts),
    hull: hullOf(parts),
    sockets: {
      grip: new THREE.Vector3(0, 0, 0),
      support: new THREE.Vector3(0, -0.034, 0.34),
      muzzle: new THREE.Vector3(0, bore, 0.64),
    },
  };
}

function rifle(): GunModel {
  const bore = 0.08;
  const parts: THREE.BufferGeometry[] = [];
  // Butt: 0.13 thick at its end, 0.075 at the wrist.
  parts.push(alongZ(-0.259, -0.03, { w: 0.05, h: 0.13, cy: 0.035 }, { w: 0.048, h: 0.075, cy: 0.0475 }));
  // Wrist and grip: 0.075 thick.
  parts.push(alongZ(-0.03, 0.06, { w: 0.048, h: 0.075, cy: 0.0475 }, { w: 0.05, h: 0.07, cy: 0.055 }));
  // Receiver: steps down from 0.07 to 0.06.
  parts.push(alongZ(0.06, 0.3, { w: 0.05, h: 0.07, cy: 0.055 }, { w: 0.05, h: 0.06, cy: 0.06 }));
  // Fore-end: 0.055 thick, ending short of the muzzle.
  parts.push(alongZ(0.3, 0.62, { w: 0.048, h: 0.055, cy: 0.06 }, { w: 0.044, h: 0.05, cy: 0.062 }));
  // Barrel: 0.03 across, on the bore line to the muzzle.
  parts.push(alongZ(0.3, 0.864, { w: 0.03, h: 0.03, cy: bore }, { w: 0.03, h: 0.03, cy: bore }, true));
  // Front sight post and a bolt handle to the right (bolt action).
  parts.push(box(0, bore + 0.026, 0.83, 0.012, 0.024, 0.02));
  parts.push(box(-0.045, bore + 0.002, 0.14, 0.07, 0.014, 0.014));
  parts.push(box(-0.082, bore - 0.006, 0.14, 0.022, 0.022, 0.022));
  return {
    id: 'rifle',
    geometry: merge(parts),
    hull: hullOf(parts),
    sockets: {
      grip: new THREE.Vector3(0, 0, 0),
      support: new THREE.Vector3(0, 0.03, 0.452),
      muzzle: new THREE.Vector3(0, bore, 0.864),
    },
  };
}

let cache: Record<GunId, GunModel> | null = null;
export function gunModels(): Record<GunId, GunModel> {
  if (!cache) cache = { smg: smg(), rifle: rifle() };
  return cache;
}

/** Where each gun is held: grip position in the soldier's frame (x left, y up, z forward), aim and chest turn. */
export interface Pose {
  grip: THREE.Vector3;
  rot: THREE.Quaternion;
  /** Chest turn about the vertical, radians; negative turns to his right. */
  chest: number;
  /** Forward lean of the body, radians. */
  lean: number;
}

const deg = Math.PI / 180;
const q = (x: number, y: number, z: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'ZYX'));

/** The aiming and sprinting poses of appendix A10 (the Art lead's proposals). */
export const POSES: Record<GunId, { aim: Pose; sprint: Pose }> = {
  rifle: {
    aim: { grip: new THREE.Vector3(-0.13, 1.36, 0.21), rot: new THREE.Quaternion(), chest: -45 * deg, lean: 0 },
    // Points to his left and 25° up, across the chest.
    sprint: { grip: new THREE.Vector3(-0.13, 1.1, 0.22), rot: q(0, 90 * deg, 25 * deg), chest: 0, lean: 10 * deg },
  },
  smg: {
    aim: { grip: new THREE.Vector3(-0.12, 1.36, 0.19), rot: new THREE.Quaternion(), chest: -30 * deg, lean: 0 },
    // Straight ahead, tipped 50° up.
    sprint: { grip: new THREE.Vector3(-0.14, 1.18, 0.18), rot: q(-50 * deg, 0, 0), chest: 0, lean: 10 * deg },
  },
};
