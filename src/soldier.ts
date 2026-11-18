// The Conscript stand-in of appendix A4, built in code from boxes and 8-sided cylinders, in its four flat
// colours, on one root at 1.80 m. Rigid parts: the chest turns and the body leans with the pose, the arms
// reach the gun by a simple two-joint solve, and nothing else animates.
// Soldier frame: x = his left (L), y = up (U), z = forward (F); A4's (L, F, U) becomes (x, z, y).
import * as THREE from 'three';
import { box, hullOf, merge, taperBox, taperCyl } from './geom';
import { gunModels, POSES, type GunId, type Pose } from './guns';
import { INK_UNIT, toon, UNIFORM, type Faction } from './look';

type Slot = 'coat' | 'top' | 'trim' | 'dark';

/** A rigid set of parts: one mesh per colour plus one ink hull for the whole set. */
class RigidSet {
  readonly group = new THREE.Group();
  readonly meshes: { mesh: THREE.Mesh; slot: Slot }[] = [];

  constructor(parts: Partial<Record<Slot, THREE.BufferGeometry[]>>, faction: Faction) {
    const all: THREE.BufferGeometry[] = [];
    for (const slot of ['coat', 'top', 'trim', 'dark'] as Slot[]) {
      const list = parts[slot];
      if (!list?.length) continue;
      const mesh = new THREE.Mesh(merge(list), toon(UNIFORM[faction][slot]));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.meshes.push({ mesh, slot });
      all.push(...list);
    }
    this.group.add(new THREE.Mesh(hullOf(all), INK_UNIT));
  }

  setFaction(f: Faction) {
    for (const m of this.meshes) m.mesh.material = toon(UNIFORM[f][m.slot]);
  }
}

// Arm lengths from A4's rest joints: shoulder (0.19, 0, 1.44), elbow (0.255, 0, 1.14), wrist (0.31, 0.03, 0.875),
// hand centre (0.32, 0.04, 0.82).
const UPPER = Math.hypot(0.065, 0.3);
const FORE = Math.hypot(0.055, 0.03, 0.265);
const HAND = 0.055;
const LEAN_PIVOT = 1.07;
const UP = new THREE.Vector3(0, 1, 0);

function armParts(faction: Faction) {
  const upper = new RigidSet({ coat: [taperCyl(0.115, 0.115, 0, 0.1, 0.1, UPPER)] }, faction);
  const lower = new RigidSet(
    {
      coat: [taperCyl(0.1, 0.1, 0, 0.09, 0.09, FORE), taperCyl(0.125, 0.125, FORE - 0.07, 0.125, 0.125, FORE)],
      dark: [box(0, FORE + HAND, 0, 0.09, 0.1, 0.1)],
    },
    faction,
  );
  return { upper, lower };
}

/** Two-joint reach from shoulder S to target T with lengths a and b; the elbow bends towards `pole`. */
function solveElbow(S: THREE.Vector3, T: THREE.Vector3, a: number, b: number, pole: THREE.Vector3, out: THREE.Vector3) {
  const toT = new THREE.Vector3().subVectors(T, S);
  const dist = Math.min(Math.max(toT.length(), Math.abs(a - b) + 1e-4), a + b - 1e-4);
  const dir = toT.normalize();
  const x = (a * a - b * b + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, a * a - x * x));
  const p = pole.clone().addScaledVector(dir, -pole.dot(dir));
  if (p.lengthSq() < 1e-8) p.set(0, -1, 0);
  p.normalize();
  return out.copy(S).addScaledVector(dir, x).addScaledVector(p, h);
}

function placeSegment(obj: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
  obj.position.copy(from);
  const d = new THREE.Vector3().subVectors(to, from);
  if (d.lengthSq() > 1e-10) obj.quaternion.setFromUnitVectors(UP, d.normalize());
}

export class Soldier {
  readonly root = new THREE.Group();
  private sets: RigidSet[] = [];
  private lean = new THREE.Group();
  private chest = new THREE.Group();
  private head = new THREE.Group();
  private shoulderL = new THREE.Object3D();
  private shoulderR = new THREE.Object3D();
  private arms: { upper: RigidSet; lower: RigidSet; side: 1 | -1 }[] = [];
  private gunGroup = new THREE.Group();
  private gunMesh: THREE.Mesh;
  private gunHull: THREE.Mesh;
  gun: GunId = 'smg';
  private blend = 0;

  constructor(faction: Faction) {
    // Lower body, fixed to the root.
    const lower = new RigidSet(
      {
        coat: [taperBox(0.61, 0.46, 0.43, 0.33, 0.23, 1.045)],
        dark: [
          box(0, 1.0725, 0, 0.345, 0.055, 0.245),
          ...[1, -1].flatMap((s) => [
            taperCyl(0.12, 0.12, 0.1, 0.145, 0.145, 0.5, 0.11 * s, 0),
            box(0.11 * s, 0.05, 0.06, 0.11, 0.1, 0.28),
            taperCyl(0.165, 0.165, 0.36, 0.165, 0.165, 0.5, 0.11 * s, 0),
          ]),
        ],
      },
      faction,
    );
    this.root.add(lower.group);

    // Upper body: leans at the belt, and the chest turns with the pose. Parts are built at their real heights
    // and shifted down by the pivot height.
    this.lean.position.y = LEAN_PIVOT;
    this.root.add(this.lean);
    this.lean.add(this.chest, this.head);
    const chest = new RigidSet(
      {
        coat: [taperBox(0.33, 0.22, 1.1, 0.38, 0.25, 1.47), taperCyl(0.2, 0.2, 1.45, 0.2, 0.2, 1.51)],
        trim: [1, -1].map((s) => box(0.165 * s, 1.485, 0, 0.17, 0.015, 0.09)),
        top: [1, -1].map((s) => box(0.165 * s, 1.4975, 0, 0.13, 0.01, 0.05)),
      },
      faction,
    );
    chest.group.position.y = -LEAN_PIVOT;
    this.chest.add(chest.group);
    this.shoulderL.position.set(0.19, 1.44 - LEAN_PIVOT, 0);
    this.shoulderR.position.set(-0.19, 1.44 - LEAN_PIVOT, 0);
    this.chest.add(this.shoulderL, this.shoulderR);

    // Head and hat: they lean with the body but keep facing forward.
    const head = new RigidSet(
      {
        dark: [
          taperCyl(0.15, 0.15, 1.49, 0.17, 0.17, 1.615),
          taperCyl(0.18, 0.21, 1.54, 0.18, 0.21, 1.7),
          box(0, 1.7075, 0.13, 0.19, 0.085, 0.02),
        ],
        coat: [
          taperCyl(0.235, 0.25, 1.66, 0.235, 0.25, 1.76),
          taperCyl(0.225, 0.225, 1.76, 0.2, 0.2, 1.795),
          ...[1, -1].map((s) => box(0.125 * s, 1.635, 0, 0.03, 0.17, 0.12)),
        ],
        top: [taperCyl(0.19, 0.19, 1.795, 0.19, 0.19, 1.8)],
      },
      faction,
    );
    head.group.position.y = -LEAN_PIVOT;
    this.head.add(head.group);

    for (const side of [1, -1] as const) {
      const a = armParts(faction);
      this.root.add(a.upper.group, a.lower.group);
      this.arms.push({ ...a, side });
    }

    const g = gunModels().smg;
    this.gunMesh = new THREE.Mesh(g.geometry, toon(UNIFORM[faction].dark));
    this.gunMesh.castShadow = true;
    this.gunHull = new THREE.Mesh(g.hull, INK_UNIT);
    this.gunGroup.add(this.gunMesh, this.gunHull);
    this.root.add(this.gunGroup);

    this.sets = [lower, chest, head, ...this.arms.flatMap((a) => [a.upper, a.lower])];
    this.setPose(0);
  }

  setFaction(f: Faction) {
    for (const s of this.sets) s.setFaction(f);
    this.gunMesh.material = toon(UNIFORM[f].dark);
  }

  setGun(id: GunId) {
    if (id === this.gun) return;
    this.gun = id;
    const g = gunModels()[id];
    this.gunMesh.geometry = g.geometry;
    this.gunHull.geometry = g.hull;
    // The hands go to the new gun's sockets.
    this.setPose(this.blend);
  }

  /** Where the muzzle is, in world space. */
  muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    out.copy(gunModels()[this.gun].sockets.muzzle);
    return this.gunGroup.localToWorld(out);
  }

  private tmpPose: Pose = { grip: new THREE.Vector3(), rot: new THREE.Quaternion(), chest: 0, lean: 0 };

  /** Blend between the aiming pose (0) and the sprint pose (1) of the current gun, then reach the hands. */
  setPose(sprint: number) {
    const P = POSES[this.gun];
    const t = Math.min(1, Math.max(0, sprint));
    this.blend = t;
    const pose = this.tmpPose;
    pose.grip.lerpVectors(P.aim.grip, P.sprint.grip, t);
    pose.rot.slerpQuaternions(P.aim.rot, P.sprint.rot, t);
    pose.chest = P.aim.chest + (P.sprint.chest - P.aim.chest) * t;
    pose.lean = P.aim.lean + (P.sprint.lean - P.aim.lean) * t;

    this.lean.rotation.x = pose.lean;
    this.chest.rotation.y = pose.chest;
    this.gunGroup.position.copy(pose.grip);
    this.gunGroup.quaternion.copy(pose.rot);

    // Hands: right on the grip socket, left on the support socket, in the root's frame.
    const sockets = gunModels()[this.gun].sockets;
    const handR = sockets.grip.clone().applyQuaternion(pose.rot).add(pose.grip);
    const handL = sockets.support.clone().applyQuaternion(pose.rot).add(pose.grip);
    // Shoulders in the root's frame (the root's own transform is left out).
    this.lean.updateMatrix();
    this.chest.updateMatrix();
    const m = new THREE.Matrix4().multiplyMatrices(this.lean.matrix, this.chest.matrix);
    const sL = this.shoulderL.position.clone().applyMatrix4(m);
    const sR = this.shoulderR.position.clone().applyMatrix4(m);
    const elbow = new THREE.Vector3();
    for (const arm of this.arms) {
      const S = arm.side > 0 ? sL : sR;
      const T = arm.side > 0 ? handL : handR;
      // Elbows bend down, outwards and a little back.
      const pole = new THREE.Vector3(0.7 * arm.side, -1, -0.35);
      solveElbow(S, T, UPPER, FORE + HAND, pole, elbow);
      placeSegment(arm.upper.group, S, elbow);
      placeSegment(arm.lower.group, elbow, T);
    }
  }
}
