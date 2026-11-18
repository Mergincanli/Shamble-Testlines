// The grenade's look, kept plain and in the Art texts' colours: the grenade itself in the Dark colour, the throw
// preview in the faction's Top colour (dots along the whole flight, a bigger dot at each bounce, a small ring where
// it goes off and a thin ring of the blast's reach on the floor there), and the blast: a short
// flash in the sun colour, a ring on the ground and fragments flying out (LOOK_V2: fragmentation first). Nothing
// here is the old game's look.
import * as THREE from 'three';
import { PAL, toon, UNIFORM, type Faction } from './look';
import type { Blast, Flight, Grenade } from './grenade';
import { floorBelow } from './yard';

const FRAGMENTS = 22;
/** Blasts drawn at once (each with its flash and ring); a fourth reuses the oldest. */
const BLASTS = 3;

interface Fragment {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

interface BlastFx {
  flash: THREE.Mesh;
  wave: THREE.Mesh;
  life: number;
  radius: number;
}

export class NadeFx {
  private scene: THREE.Scene;
  private body = new THREE.CylinderGeometry(0.08, 0.08, 0.16, 8);
  private grenades: THREE.Mesh[] = [];
  private dots: THREE.Points;
  private dotPos: Float32Array;
  private bounceDots: THREE.Points;
  private bouncePos = new Float32Array(16 * 3);
  private ring: THREE.Mesh;
  private reach: THREE.Mesh;
  private blasts: BlastFx[] = [];
  private nextBlast = 0;
  private frags: Fragment[] = [];
  private nextFrag = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.dotPos = new Float32Array(400 * 3);
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(this.dotPos, 3));
    this.dots = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.45, sizeAttenuation: true, color: '#ffffff', depthWrite: false }));
    this.dots.frustumCulled = false;
    this.dots.visible = false;
    this.dots.renderOrder = 6;
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(this.bouncePos, 3));
    this.bounceDots = new THREE.Points(bg, new THREE.PointsMaterial({ size: 1.0, sizeAttenuation: true, color: '#ffffff', depthWrite: false }));
    this.bounceDots.frustumCulled = false;
    this.bounceDots.visible = false;
    this.bounceDots.renderOrder = 6;
    const rg = new THREE.RingGeometry(0.42, 0.6, 32);
    rg.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }));
    this.ring.visible = false;
    this.ring.renderOrder = 6;
    // The blast's reach: a thin ring of radius 1, scaled to the blast radius.
    const reachGeo = new THREE.RingGeometry(0.97, 1, 72);
    reachGeo.rotateX(-Math.PI / 2);
    this.reach = new THREE.Mesh(reachGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false }));
    this.reach.visible = false;
    this.reach.renderOrder = 6;
    const fl = new THREE.IcosahedronGeometry(1, 1);
    const wg = new THREE.RingGeometry(0.85, 1, 48);
    wg.rotateX(-Math.PI / 2);
    for (let i = 0; i < BLASTS; i++) {
      const flash = new THREE.Mesh(fl, new THREE.MeshBasicMaterial({ color: PAL.sun, transparent: true }));
      flash.visible = false;
      const wave = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ color: UNIFORM.soviets.dark, transparent: true, depthWrite: false }));
      wave.visible = false;
      wave.renderOrder = 5;
      scene.add(flash, wave);
      this.blasts.push({ flash, wave, life: 0, radius: 6.5 });
    }
    const fg = new THREE.BoxGeometry(0.07, 0.05, 0.09);
    for (let i = 0; i < FRAGMENTS * 3; i++) {
      const m = new THREE.Mesh(fg, toon(UNIFORM.soviets.dark));
      m.visible = false;
      scene.add(m);
      this.frags.push({ mesh: m, vx: 0, vy: 0, vz: 0, life: 0 });
    }
    scene.add(this.dots, this.bounceDots, this.ring, this.reach);
  }

  /** The preview's colour follows the player's faction (its Top colour). */
  setFaction(f: Faction) {
    (this.dots.material as THREE.PointsMaterial).color.set(UNIFORM[f].top);
    (this.bounceDots.material as THREE.PointsMaterial).color.set(UNIFORM[f].top);
    (this.ring.material as THREE.MeshBasicMaterial).color.set(UNIFORM[f].top);
    (this.reach.material as THREE.MeshBasicMaterial).color.set(UNIFORM[f].top);
  }

  /** Draw the grenades in flight, between their last two steps. */
  showGrenades(list: Grenade[], alpha: number) {
    // One mesh per grenade in flight, made as needed.
    while (this.grenades.length < list.length) {
      const m = new THREE.Mesh(this.body, toon(UNIFORM.soviets.dark));
      m.castShadow = true;
      this.scene.add(m);
      this.grenades.push(m);
    }
    this.grenades.forEach((m, i) => {
      const g = list[i];
      m.visible = !!g;
      if (!g) return;
      m.position.set(g.prev.x + (g.x - g.prev.x) * alpha, g.prev.y + (g.y - g.prev.y) * alpha, g.prev.z + (g.z - g.prev.z) * alpha);
      m.rotation.x += 0.2;
    });
  }

  /**
   * The throw preview: dots along the whole flight, a bigger dot at each bounce, and where it goes off a small ring
   * with the blast's reach round it, on the floor under that point (so a burst in the air shows its spot below
   * the end of the dots); null hides it.
   */
  preview(flight: Flight | null, radius: number) {
    const path = flight?.pts;
    if (!flight || !path || path.length < 2) {
      this.dots.visible = false;
      this.bounceDots.visible = false;
      this.ring.visible = false;
      this.reach.visible = false;
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
      if (len < 1e-9) continue;
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
    const nb = Math.min(16, flight.bounces.length);
    flight.bounces.slice(0, nb).forEach((p, i) => this.bouncePos.set([p.x, p.y, p.z], i * 3));
    const bgeo = this.bounceDots.geometry as THREE.BufferGeometry;
    bgeo.setDrawRange(0, nb);
    (bgeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.bounceDots.visible = nb > 0;
    const end = flight.end;
    const floor = floorBelow(end.x, end.z, end.y) + 0.02;
    this.ring.position.set(end.x, floor, end.z);
    this.ring.visible = true;
    this.reach.position.set(end.x, floor, end.z);
    this.reach.scale.setScalar(Math.max(0.1, radius));
    this.reach.visible = true;
  }

  /** A blast: flash, a ring on the floor under it, fragments. */
  blast(b: Blast, radius: number) {
    const fx = this.blasts[this.nextBlast++ % BLASTS];
    fx.flash.position.set(b.x, b.y, b.z);
    fx.flash.scale.setScalar(0.9);
    fx.flash.visible = true;
    fx.wave.position.set(b.x, floorBelow(b.x, b.z, b.y) + 0.03, b.z);
    fx.wave.scale.setScalar(0.05);
    fx.wave.visible = true;
    fx.radius = radius;
    fx.life = 0.3;
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
    for (const b of this.blasts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      // The flash shows for the first 0.08 s, growing; the ring spreads to the blast's radius over 0.3 s.
      b.flash.scale.multiplyScalar(1 + dt * 6);
      if (b.life <= 0.22) b.flash.visible = false;
      const k = 1 - Math.max(0, b.life) / 0.3;
      b.wave.scale.setScalar(Math.max(0.05, k * b.radius));
      (b.wave.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k);
      if (b.life <= 0) b.wave.visible = false;
    }
    for (const f of this.frags) {
      if (f.life <= 0) continue;
      f.life -= dt;
      f.vy -= 20 * dt;
      // Land on whatever is under the fragment: the ground, a block's top or the ramp.
      const floor = floorBelow(f.mesh.position.x, f.mesh.position.z, f.mesh.position.y) + 0.03;
      f.mesh.position.x += f.vx * dt;
      f.mesh.position.y += f.vy * dt;
      f.mesh.position.z += f.vz * dt;
      if (f.mesh.position.y < floor) {
        f.mesh.position.y = floor;
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
