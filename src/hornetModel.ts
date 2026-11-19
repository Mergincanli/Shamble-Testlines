// The Hornet's blockout in the Empire's colours (appendix A4's faction colours: white coat, purple top, dark) with
// the ink line, like the soldier. Its look is not judged here. Frame as the soldier's: +Z forward, +X to its left,
// +Y up, the origin on the ground under the axle. The body (fairing, footplates, gun mast, the rider) pitches and
// rolls about the axle with the lean; the wheel rolls; the gun turns to the aim.
import * as THREE from 'three';
import { box, hullOf, merge, taperCyl } from './geom';
import { HORNET, type HornetState } from './hornet';
import { INK_UNIT, toon, UNIFORM } from './look';

const C = UNIFORM.empire;

function part(geos: THREE.BufferGeometry[], hex: string): THREE.Mesh {
  const m = new THREE.Mesh(merge(geos), toon(hex));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A wheel-like disc along X: radius r, width w, centred on the axle. */
function disc(r: number, w: number, sides = 16): THREE.BufferGeometry {
  const g = taperCyl(2 * r, 2 * r, -w / 2, 2 * r, 2 * r, w / 2, 0, 0, sides);
  g.rotateZ(Math.PI / 2);
  return g;
}

export class HornetModel {
  readonly root = new THREE.Group();
  /** Where the rider stands (moves with the lean). */
  readonly seat = new THREE.Group();
  private body = new THREE.Group();
  private wheel = new THREE.Group();
  private turret = new THREE.Group();
  private muzzle = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    const R = HORNET.wheel_radius_m;
    const W = HORNET.wheel_width_m;
    const foot = HORNET.footplate_height_m;
    const gunY = HORNET.gun_height_m;
    // The wheel: a dark tyre, a purple rim, a white hub.
    const tyre = [disc(R, W)];
    const rim = [disc(R * 0.72, W + 0.02)];
    const hub = [disc(R * 0.3, W + 0.05, 8)];
    this.wheel.add(part(tyre, C.dark), part(rim, C.top), part(hub, C.coat), new THREE.Mesh(hullOf([...tyre, ...rim, ...hub]), INK_UNIT));
    this.wheel.position.y = R;
    // The body, built about the axle (so its pitch and roll turn about it): a white fairing over the front of the
    // wheel with a purple stripe, the axle housings and footplates either side, the gun mast at the front.
    const y = (v: number) => v - R;
    const fairing = [box(0, y(R + 0.12), 0.12, W + 0.1, 0.1, 0.62), box(0, y(R + 0.02), 0.44, W + 0.1, 0.3, 0.12)];
    const stripe = [box(0, y(R + 0.18), 0.12, W + 0.04, 0.03, 0.5)];
    const housings = [box(0.11, y(R), 0, 0.06, 0.14, 0.16), box(-0.11, y(R), 0, 0.06, 0.14, 0.16)];
    const plates = [box(0.17, y(foot - 0.03), -0.02, 0.16, 0.05, 0.3), box(-0.17, y(foot - 0.03), -0.02, 0.16, 0.05, 0.3), box(0.11, y((foot + R) / 2), 0, 0.04, R - foot, 0.06), box(-0.11, y((foot + R) / 2), 0, 0.04, R - foot, 0.06)];
    const mast = [box(0, y((R + 0.17 + gunY - 0.06) / 2), 0.44, 0.07, gunY - 0.06 - (R + 0.17), 0.07)];
    this.body.add(
      part(fairing, C.coat),
      part(stripe, C.top),
      part([...housings, ...plates, ...mast], C.dark),
      new THREE.Mesh(hullOf([...fairing, ...stripe, ...housings, ...plates, ...mast]), INK_UNIT),
    );
    // The gun on its turret: a purple shroud and a dark barrel, along the turret's +Z.
    const base = [box(0, 0, 0, 0.16, 0.08, 0.16)];
    const shroud = [box(0, 0.04, 0.16, 0.11, 0.1, 0.34)];
    const barrel = [box(0, 0.05, 0.48, 0.05, 0.05, 0.36)];
    this.turret.add(part(base, C.dark), part(shroud, C.top), part(barrel, C.dark), new THREE.Mesh(hullOf([...base, ...shroud, ...barrel]), INK_UNIT));
    this.turret.position.set(0, y(gunY) - 0.05, 0.44);
    this.muzzle.position.set(0, 0.05, 0.68);
    this.turret.add(this.muzzle);
    this.seat.position.set(0, y(foot), -0.04);
    this.body.add(this.turret, this.seat);
    this.body.position.y = R;
    this.root.add(this.wheel, this.body);
    scene.add(this.root);
  }

  /** Draw the Hornet between its last two steps. */
  update(h: HornetState, alpha: number) {
    const p = h.prev;
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    const angle = (a: number, b: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * alpha;
    this.root.position.set(lerp(p.x, h.body.x), lerp(p.y, h.body.y), lerp(p.z, h.body.z));
    const heading = angle(p.heading, h.heading);
    this.root.rotation.y = heading;
    this.wheel.rotation.x = lerp(p.wheel, h.wheel);
    // Pitch forward tips +Z down (a positive turn about +X); roll to its right tips toward -X (about +Z).
    // (Drawn no further than 85°, so extreme sliders never flip it over.)
    const cap = (a: number) => Math.max(-1.48, Math.min(1.48, a));
    this.body.rotation.set(cap(lerp(p.pitch, h.pitch)), 0, cap(lerp(p.roll, h.roll)), 'XZY');
    this.turret.rotation.y = angle(p.turret, h.turret) - heading;
  }

  /** The gun's muzzle in the world (the tracer's start in the picture; the shot itself leaves the unleaned gun). */
  muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.muzzle.getWorldPosition(out);
  }
}
