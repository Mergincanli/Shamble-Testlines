// Plain shot feedback, kept small on purpose: a tracer, a muzzle flash, an impact spark, a hit marker at the
// cursor when a hit is confirmed, health bars over hurt dummies, and the view kick (a camera shake and a small
// zoom punch per shot, as the old game's recoil did). Nothing here is from the old game's look; the punch of the
// real feel kit is the game's own work.
import * as THREE from 'three';

const TRACER_LIFE = 0.08;
const FLASH_LIFE = 0.05;
const SPARK_LIFE = 0.09;

interface Pooled {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  /** Spawned this frame: shown for at least one drawn frame, however slow the frames are. */
  fresh: boolean;
}

function unlit(hex: string, transparent = false) {
  return new THREE.MeshBasicMaterial({ color: hex, transparent, depthWrite: !transparent });
}

export class Fx {
  private tracers: Pooled[] = [];
  private flashes: Pooled[] = [];
  private sparks: Pooled[] = [];
  private next = { tracer: 0, flash: 0, spark: 0 };
  private marker: HTMLDivElement;
  private markerLife = 0;
  private markerFresh = false;
  private bars: { group: THREE.Group; fill: THREE.Mesh; shownFor: number }[] = [];
  shake = 0;
  fovPunch = 0;
  gunKick = 0;

  constructor(scene: THREE.Scene, dummyCount: number) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0, 0.5);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(box, unlit('#FFF1B8', true));
      m.visible = false;
      m.renderOrder = 5;
      scene.add(m);
      this.tracers.push({ mesh: m, life: 0, max: TRACER_LIFE, fresh: false });
    }
    const star = new THREE.OctahedronGeometry(0.5, 0);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(star, unlit('#FFF8DC'));
      m.visible = false;
      scene.add(m);
      this.flashes.push({ mesh: m, life: 0, max: FLASH_LIFE, fresh: false });
    }
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(star, unlit('#FFE6A0'));
      m.visible = false;
      scene.add(m);
      this.sparks.push({ mesh: m, life: 0, max: SPARK_LIFE, fresh: false });
    }
    // Health bars over the dummies: a dark back and a fill, always facing the camera.
    const plane = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < dummyCount; i++) {
      const group = new THREE.Group();
      const back = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ color: '#1a1a1a', depthTest: false }));
      back.scale.set(0.9, 0.13, 1);
      const fillGeo = plane.clone();
      fillGeo.translate(0.5, 0, 0);
      const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: '#e8e2d0', depthTest: false }));
      fill.position.set(-0.42, 0, 0.001);
      fill.scale.set(0.84, 0.08, 1);
      back.renderOrder = fill.renderOrder = 10;
      group.add(back, fill);
      group.visible = false;
      scene.add(group);
      this.bars.push({ group, fill, shownFor: 0 });
    }
    this.marker = document.createElement('div');
    this.marker.id = 'hitmarker';
    for (let i = 0; i < 4; i++) this.marker.append(document.createElement('i'));
    document.body.append(this.marker);
  }

  private take(pool: Pooled[], key: 'tracer' | 'flash' | 'spark'): Pooled {
    const p = pool[this.next[key] % pool.length];
    this.next[key]++;
    p.life = p.max;
    p.fresh = true;
    p.mesh.visible = true;
    return p;
  }

  /** A shot leaves the muzzle: tracer, flash and view kick, all at once. */
  shot(from: THREE.Vector3, to: THREE.Vector3, recoil: number, lens: number, hitSomething: boolean) {
    const t = this.take(this.tracers, 'tracer');
    const len = from.distanceTo(to);
    t.mesh.position.copy(from);
    t.mesh.lookAt(to);
    t.mesh.scale.set(0.05, 0.05, Math.max(0.01, len));
    (t.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
    const f = this.take(this.flashes, 'flash');
    f.mesh.position.copy(from);
    f.mesh.scale.setScalar(0.32);
    f.mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    if (hitSomething) {
      const s = this.take(this.sparks, 'spark');
      s.mesh.position.copy(to);
      s.mesh.scale.setScalar(0.18);
    }
    // The view kick, as the old game: shake grows with recoil, and a zoom punch scaled to the lens.
    this.shake = Math.min(0.6, this.shake + recoil * 0.187);
    const k = lens / 52;
    this.fovPunch = Math.min(7 * k, this.fovPunch + (1.85 + recoil * 0.68) * k);
    this.gunKick = Math.min(1.1, this.gunKick + 0.4 + recoil * 0.05);
  }

  /** The hit is confirmed: the marker at the cursor, bigger and red on a kill; the target's bar shows. */
  hit(dummy: number, killed: boolean) {
    this.markerLife = killed ? 0.3 : 0.12;
    this.markerFresh = true;
    this.marker.classList.toggle('kill', killed);
    this.marker.classList.add('show');
    if (dummy >= 0) this.bars[dummy].shownFor = 3;
  }

  update(dt: number, mouseX: number, mouseY: number) {
    const age = (pool: Pooled[], fade: boolean) => {
      for (const p of pool) {
        if (p.life <= 0) continue;
        if (p.fresh) {
          p.fresh = false;
          continue;
        }
        p.life -= dt;
        if (p.life <= 0) p.mesh.visible = false;
        else if (fade) (p.mesh.material as THREE.MeshBasicMaterial).opacity = p.life / p.max;
      }
    };
    age(this.tracers, true);
    age(this.flashes, false);
    age(this.sparks, false);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.fovPunch = Math.max(0, this.fovPunch - dt * 15);
    this.gunKick = Math.max(0, this.gunKick - dt * 8);
    if (this.markerLife > 0) {
      if (this.markerFresh) this.markerFresh = false;
      else this.markerLife -= dt;
      this.marker.style.transform = `translate(${mouseX}px, ${mouseY}px)`;
      if (this.markerLife <= 0) this.marker.classList.remove('show');
    }
  }

  /** Camera offset for the shake this frame (applied on top of the framing). */
  shakeOffset(out: THREE.Vector3): THREE.Vector3 {
    if (this.shake <= 0.001) return out.set(0, 0, 0);
    return out.set((Math.random() * 2 - 1) * this.shake * 0.18, (Math.random() * 2 - 1) * this.shake * 0.34, 0);
  }

  /** Health bars: shown for a while after a hit, hidden while the dummy is down. */
  updateBars(dt: number, cam: THREE.Camera, dummies: { x: number; y: number; z: number; health: number; max: number; down: boolean }[]) {
    dummies.forEach((d, i) => {
      const b = this.bars[i];
      b.shownFor = Math.max(0, b.shownFor - dt);
      const show = b.shownFor > 0 && !d.down && d.health < d.max;
      b.group.visible = show;
      if (!show) return;
      b.group.position.set(d.x, d.y + 2.2, d.z);
      b.group.quaternion.copy(cam.quaternion);
      const k = Math.max(0, Math.min(1, d.health / d.max));
      b.fill.scale.x = 0.84 * Math.max(0.001, k);
    });
  }
}
