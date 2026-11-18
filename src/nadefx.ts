// The grenade's look, kept plain and in the Art texts' colours: the grenade itself in the Dark colour, the throw
// preview (dots along the arc and a ring where it first lands) in the faction's Top colour, and the blast: a short
// flash in the sun colour, a ring on the ground and fragments flying out (LOOK_V2: fragmentation first). Nothing
// here is the old game's look.
import * as THREE from 'three';
import { PAL, toon, UNIFORM, type Faction } from './look';
import type { Blast, Grenade } from './grenade';

const FRAGMENTS = 22;

interface Fragment {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

export class NadeFx {
  private grenades: THREE.Mesh[] = [];
  private dots: THREE.Points;
  private dotPos: Float32Array;
  private ring: THREE.Mesh;
  private flash: THREE.Mesh;
  private flashLife = 0;
  private wave: THREE.Mesh;
  private waveLife = 0;
  private waveR = 6.5;
  private frags: Fragment[] = [];
  private nextFrag = 0;

  constructor(scene: THREE.Scene) {
    const body = new THREE.CylinderGeometry(0.08, 0.08, 0.16, 8);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(body, toon(UNIFORM.soviets.dark));
      m.castShadow = true;
      m.visible = false;
      scene.add(m);
      this.grenades.push(m);
    }
    this.dotPos = new Float32Array(400 * 3);
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(this.dotPos, 3));
    this.dots = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.45, sizeAttenuation: true, color: '#ffffff', depthWrite: false }));
    this.dots.frustumCulled = false;
    this.dots.visible = false;
    this.dots.renderOrder = 6;
    const rg = new THREE.RingGeometry(0.42, 0.6, 32);
    rg.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }));
    this.ring.visible = false;
    this.ring.renderOrder = 6;
    this.flash = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: PAL.sun, transparent: true }));
    this.flash.visible = false;
    const wg = new THREE.RingGeometry(0.85, 1, 48);
    wg.rotateX(-Math.PI / 2);
    this.wave = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ color: UNIFORM.soviets.dark, transparent: true, depthWrite: false }));
    this.wave.visible = false;
    this.wave.renderOrder = 5;
    const fg = new THREE.BoxGeometry(0.07, 0.05, 0.09);
    for (let i = 0; i < FRAGMENTS * 3; i++) {
      const m = new THREE.Mesh(fg, toon(UNIFORM.soviets.dark));
      m.visible = false;
      scene.add(m);
      this.frags.push({ mesh: m, vx: 0, vy: 0, vz: 0, life: 0 });
    }
    scene.add(this.dots, this.ring, this.flash, this.wave);
  }

  /** The preview's colour follows the player's faction (its Top colour). */
  setFaction(f: Faction) {
    (this.dots.material as THREE.PointsMaterial).color.set(UNIFORM[f].top);
    (this.ring.material as THREE.MeshBasicMaterial).color.set(UNIFORM[f].top);
  }

  /** Draw the grenades in flight, between their last two steps. */
  showGrenades(list: Grenade[], alpha: number) {
    this.grenades.forEach((m, i) => {
      const g = list[i];
      m.visible = !!g;
      if (!g) return;
      m.position.set(g.prev.x + (g.x - g.prev.x) * alpha, g.prev.y + (g.y - g.prev.y) * alpha, g.prev.z + (g.z - g.prev.z) * alpha);
      m.rotation.x += 0.2;
    });
  }

  /** The throw preview: dots along the arc to its first contact, a ring there; null hides it. */
  preview(path: { x: number; y: number; z: number }[] | null, charge: number) {
    if (!path || path.length < 2) {
      this.dots.visible = false;
      this.ring.visible = false;
      return;
    }
    // Dots at even spacing along the path.
    let n = 0;
    let carry = 0;
    const gap = 0.45;
    for (let i = 1; i < path.length && n < 400; i++) {
      const a = path[i - 1];
      const b = path[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      let d = gap - carry;
      while (d <= len && n < 400) {
        const t = d / len;
        this.dotPos.set([a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t], n * 3);
        n++;
        d += gap;
      }
      carry = len - (d - gap);
    }
    const geo = this.dots.geometry as THREE.BufferGeometry;
    geo.setDrawRange(0, n);
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.dots.visible = true;
    const end = path[path.length - 1];
    this.ring.position.set(end.x, end.y - 0.08, end.z);
    this.ring.scale.setScalar(1 + charge * 0.35);
    this.ring.visible = true;
  }

  /** A blast: flash, ground ring, fragments. */
  blast(b: Blast, radius: number) {
    this.flash.position.set(b.x, b.y, b.z);
    this.flash.scale.setScalar(0.9);
    this.flash.visible = true;
    this.flashLife = 0.08;
    this.wave.position.set(b.x, 0.03, b.z);
    this.waveR = radius;
    this.waveLife = 0.3;
    this.wave.visible = true;
    for (let i = 0; i < FRAGMENTS; i++) {
      const f = this.frags[this.nextFrag++ % this.frags.length];
      const a = Math.random() * Math.PI * 2;
      const sp = 10 + Math.random() * 12;
      f.vx = Math.cos(a) * sp;
      f.vz = Math.sin(a) * sp;
      f.vy = 2 + Math.random() * 7;
      f.life = 0.6 + Math.random() * 0.3;
      f.mesh.position.set(b.x, Math.max(0.1, b.y), b.z);
      f.mesh.visible = true;
    }
  }

  update(dt: number) {
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      this.flash.scale.multiplyScalar(1 + dt * 6);
      if (this.flashLife <= 0) this.flash.visible = false;
    }
    if (this.waveLife > 0) {
      this.waveLife -= dt;
      const k = 1 - Math.max(0, this.waveLife) / 0.3;
      this.wave.scale.setScalar(Math.max(0.05, k * this.waveR));
      (this.wave.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k);
      if (this.waveLife <= 0) this.wave.visible = false;
    }
    for (const f of this.frags) {
      if (f.life <= 0) continue;
      f.life -= dt;
      f.vy -= 20 * dt;
      f.mesh.position.x += f.vx * dt;
      f.mesh.position.y += f.vy * dt;
      f.mesh.position.z += f.vz * dt;
      if (f.mesh.position.y < 0.03) {
        f.mesh.position.y = 0.03;
        f.vy *= -0.3;
        f.vx *= 0.5;
        f.vz *= 0.5;
      }
      f.mesh.rotation.x += dt * 9;
      f.mesh.rotation.y += dt * 7;
      if (f.life <= 0) f.mesh.visible = false;
    }
  }
}
