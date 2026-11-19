// The sight line while aiming down sights. The old game, as described, drew a line from the muzzle to the aim
// point; here it runs to where the shot would stop, and its look is the sandbox's own (both are the sandbox's
// choices): a thin line from the gun as drawn to the end of the shot's own cast, in the faction's Top colour, in
// the sun colour when it rests on a dummy, with a dot where it stops (on a block, a dummy or at the gun's range),
// and a thin upright mark from the floor beneath its end whenever that end is above the floor (aiming at height).
import * as THREE from 'three';
import { PAL, UNIFORM, type Faction } from './look';

export class SightLine {
  private line: THREE.Mesh;
  private dot: THREE.Mesh;
  private mark: THREE.Mesh;
  private lineMat: THREE.MeshBasicMaterial;
  private dotMat: THREE.MeshBasicMaterial;
  private top = new THREE.Color(UNIFORM.soviets.top);
  private sun = new THREE.Color(PAL.sun);

  constructor(scene: THREE.Scene) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0, 0.5);
    this.lineMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75, depthWrite: false });
    this.line = new THREE.Mesh(box, this.lineMat);
    this.line.renderOrder = 6;
    this.dotMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false });
    this.dot = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), this.dotMat);
    this.dot.renderOrder = 6;
    const up = new THREE.BoxGeometry(1, 1, 1);
    up.translate(0, 0.5, 0);
    this.mark = new THREE.Mesh(up, this.dotMat);
    this.mark.renderOrder = 6;
    this.line.visible = this.dot.visible = this.mark.visible = false;
    scene.add(this.line, this.dot, this.mark);
  }

  setFaction(f: Faction) {
    this.top.set(UNIFORM[f].top);
  }

  /**
   * Show the line from `from` to `to` (onDummy: it rests on a dummy; floor: the floor's height under its end, for
   * the upright mark), or hide it with null.
   */
  show(from: THREE.Vector3 | null, to: THREE.Vector3, onDummy: boolean, floor = to.y) {
    if (!from) {
      this.line.visible = this.dot.visible = this.mark.visible = false;
      return;
    }
    const rise = to.y - floor;
    this.mark.visible = rise > 0.15;
    if (this.mark.visible) {
      this.mark.position.set(to.x, floor, to.z);
      this.mark.scale.set(0.025, rise, 0.025);
    }
    const c = onDummy ? this.sun : this.top;
    this.lineMat.color.copy(c);
    this.dotMat.color.copy(c);
    this.line.position.copy(from);
    this.line.lookAt(to);
    this.line.scale.set(0.035, 0.035, Math.max(0.01, from.distanceTo(to)));
    this.dot.position.copy(to);
    this.line.visible = this.dot.visible = true;
  }
}
