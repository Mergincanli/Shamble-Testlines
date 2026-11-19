// The grenade's explosion from the owner's own sprite sheet (art/explosion-sheet.png: 4 x 4 frames on chroma blue,
// keyed at build time by tools/key-sheet.mjs into src/assets/explosion-keyed.png). Each explosion is one flat
// picture that always faces the camera, stepping through the frames in reading order (no blending between frames:
// the sheet's own comic steps). The picture's ground line (measured on the sheet) sits on the burst point; the
// picture is drawn nearer the camera along the line to it, and shrunk to keep its size on screen, so the floor
// under the burst and a wall just behind it do not cut it. Nothing here comes from the old game or Shamble VFX.
import * as THREE from 'three';
import sheetUrl from './assets/explosion-keyed.png';
import SHEET from './assets/explosion-keyed.json';

export { SHEET as EXPLOSION_SHEET };
/** Explosions drawn at once; one more takes over the oldest. */
export const EXPLOSION_POOL = 8;

/** The settings each frame: how long the sheet plays, its width in metres, how far it is drawn nearer the camera. */
export interface ExplosionLook {
  time: number;
  width: number;
  pull: number;
}

interface Play {
  mesh: THREE.Mesh;
  uv: THREE.BufferAttribute;
  at: THREE.Vector3;
  t: number;
  on: boolean;
  frame: number;
  /** Held at one frame (the test hook's still picture). */
  held: boolean;
  scale: number;
}

const [COLS, ROWS] = SHEET.grid;
const FRAMES = SHEET.frames;
const [PX_W, PX_H] = SHEET.picture_px;
const ASPECT = SHEET.cell_px[1] / SHEET.cell_px[0];
const GROUND = SHEET.anchor_ground_line_from_top;
const MIDDLE = SHEET.anchor_middle_from_left;

export class Explosions {
  private tex: THREE.Texture;
  private mat: THREE.MeshBasicMaterial;
  private plays: Play[] = [];
  private next = 0;
  private toCam = new THREE.Vector3();
  /** The sheet has loaded and is on the graphics card. */
  ready = false;
  /** Draws left to warm up (compile the material at boot, so the first explosion does not stall). */
  private warm = 1;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.tex = new THREE.TextureLoader().load(sheetUrl, (t) => {
      renderer.initTexture(t);
      this.ready = true;
    });
    this.tex.colorSpace = THREE.SRGBColorSpace;
    // The picture is drawn larger than its pixels: plain smoothing, no smaller copies (they would mix the frames).
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, toneMapped: false });
    for (let i = 0; i < EXPLOSION_POOL; i++) {
      // A picture 1 m wide, with its ground line's middle at the origin.
      const g = new THREE.PlaneGeometry(1, 1);
      const pos = g.attributes.position as THREE.BufferAttribute;
      // PlaneGeometry's corners: top left, top right, bottom left, bottom right.
      const top = GROUND * ASPECT;
      const bottom = -(1 - GROUND) * ASPECT;
      pos.setXY(0, -MIDDLE, top);
      pos.setXY(1, 1 - MIDDLE, top);
      pos.setXY(2, -MIDDLE, bottom);
      pos.setXY(3, 1 - MIDDLE, bottom);
      pos.needsUpdate = true;
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, this.mat);
      mesh.renderOrder = 7;
      mesh.frustumCulled = false;
      mesh.visible = false;
      scene.add(mesh);
      this.plays.push({ mesh, uv: g.attributes.uv as THREE.BufferAttribute, at: new THREE.Vector3(), t: 0, on: false, frame: -1, held: false, scale: 0 });
    }
  }

  /** Start one at a burst point (the oldest is taken over when all are playing). */
  play(x: number, y: number, z: number, heldFrame = -1) {
    const p = this.plays[this.next++ % EXPLOSION_POOL];
    p.at.set(x, y, z);
    p.on = true;
    p.held = heldFrame >= 0;
    p.t = 0;
    p.frame = -1;
    if (p.held) this.setFrame(p, Math.min(FRAMES - 1, heldFrame));
  }

  /** Clear every explosion (the test hooks). */
  clear() {
    for (const p of this.plays) {
      p.on = false;
      p.mesh.visible = false;
    }
  }

  private setFrame(p: Play, f: number) {
    if (p.frame === f) return;
    p.frame = f;
    const col = f % COLS;
    const row = Math.floor(f / COLS);
    // Half a pixel in from the cell's edges, so smoothing never reaches the next frame. (v = 1 is the picture's top.)
    const iu = 0.5 / PX_W;
    const iv = 0.5 / PX_H;
    const u0 = col / COLS + iu;
    const u1 = (col + 1) / COLS - iu;
    const vT = 1 - row / ROWS - iv;
    const vB = 1 - (row + 1) / ROWS + iv;
    p.uv.setXY(0, u0, vT);
    p.uv.setXY(1, u1, vT);
    p.uv.setXY(2, u0, vB);
    p.uv.setXY(3, u1, vB);
    p.uv.needsUpdate = true;
  }

  /** Age them: each steps through the frames over the play time, then goes. */
  update(dt: number, look: ExplosionLook) {
    for (const p of this.plays) {
      if (!p.on || p.held) continue;
      p.t += dt;
      const f = Math.floor((p.t / Math.max(0.01, look.time)) * FRAMES);
      if (f >= FRAMES) {
        p.on = false;
        continue;
      }
      this.setFrame(p, f);
    }
  }

  /** Face the camera as it is drawn this frame (after its kick and shake), and place each picture. */
  place(cam: THREE.Camera, look: ExplosionLook) {
    for (let i = 0; i < this.plays.length; i++) {
      const p = this.plays[i];
      if (!p.on) {
        // The warm-up: the first frame draws one picture whose corners all sit on a clear pixel (nothing shows).
        if (i === 0 && this.warm > 0) {
          this.warm--;
          for (let k = 0; k < 4; k++) p.uv.setXY(k, 0.5 / PX_W, 1 - 0.5 / PX_H);
          p.uv.needsUpdate = true;
          p.frame = -1;
          p.mesh.position.copy(cam.position);
          p.mesh.translateZ(-10);
          p.mesh.visible = true;
          continue;
        }
        p.mesh.visible = false;
        continue;
      }
      const d = this.toCam.copy(cam.position).sub(p.at);
      const dist = d.length();
      const pull = Math.min(Math.max(0, look.pull), dist * 0.5);
      d.multiplyScalar(pull / Math.max(dist, 1e-6));
      p.mesh.position.copy(p.at).add(d);
      p.mesh.quaternion.copy(cam.quaternion);
      p.scale = (look.width * (dist - pull)) / Math.max(dist, 1e-6);
      p.mesh.scale.setScalar(p.scale);
      p.mesh.visible = true;
    }
  }

  /** For the test hook: the playing ones. */
  state() {
    return {
      ready: this.ready,
      plays: this.plays
        .filter((p) => p.on)
        .map((p) => ({
          t: p.t,
          frame: p.frame,
          at: { x: p.at.x, y: p.at.y, z: p.at.z },
          drawnAt: { x: p.mesh.position.x, y: p.mesh.position.y, z: p.mesh.position.z },
          scale: p.scale,
          quaternion: p.mesh.quaternion.toArray(),
        })),
    };
  }
}
