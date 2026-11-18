// The follow camera, written fresh from the old game's described framing: placed behind and above the soldier
// at a fixed turn, a screen dead zone in which the cursor does not move the view, and past it a look-ahead and
// a small shift toward where the cursor pushes. Height, distance and angle are separate (the angle moves the
// point the camera looks at, as the old panel's pitch override did). Smoothed every frame.
import * as THREE from 'three';
import type { Store } from './params';

const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

/** 0 inside the dead zone, then a smooth rise to 1 at the screen edge. */
function deadZonePush(n: number, dz: number): number {
  const a = (Math.abs(n) - dz) / Math.max(1e-6, 1 - dz);
  if (a <= 0) return 0;
  const s = Math.min(1, a);
  return Math.sign(n) * s * s * (3 - 2 * s);
}

export class FollowCamera {
  readonly cam: THREE.PerspectiveCamera;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private pushX = 0;
  private pushY = 0;
  /** Live turn from the middle mouse button, added to the panel's turn. */
  private yaw = 0;
  private yawTarget = 0;
  private started = false;
  private desired = new THREE.Vector3();
  private lookT = new THREE.Vector3();

  constructor(aspect: number) {
    this.cam = new THREE.PerspectiveCamera(15, aspect, 1, 700);
  }

  /** Ground axes for movement: W moves away from the camera, whatever the turn. */
  axes(P: Store) {
    const a = this.yaw + (P.num('camTurn') * Math.PI) / 180;
    return { fwdX: -Math.sin(a), fwdZ: -Math.cos(a), rightX: Math.cos(a), rightZ: -Math.sin(a) };
  }

  turnBy(pixels: number, P: Store) {
    this.yawTarget -= pixels * P.num('mouseSens');
  }

  resetTurn() {
    this.yaw = 0;
    this.yawTarget = 0;
  }

  update(dt: number, target: THREE.Vector3, ndcX: number, ndcY: number, P: Store) {
    // Turn, smoothed. Both angles keep counting past a full turn, so the plain difference is the right way round.
    this.yaw += (this.yawTarget - this.yaw) * ease(P.num('turnRate'), dt);
    const { fwdX, fwdZ, rightX, rightZ } = this.axes(P);

    const kp = ease(P.num('pushRate'), dt);
    this.pushX += (deadZonePush(ndcX, P.num('deadX')) - this.pushX) * kp;
    this.pushY += (deadZonePush(ndcY, P.num('deadY')) - this.pushY) * kp;

    const reach = this.pushY >= 0 ? this.pushY * P.num('lookFwdRange') : this.pushY * P.num('lookBackRange');
    const lookFwd = Math.min(P.num('lookMax'), Math.max(P.num('lookMin'), P.num('lookBase') + reach * P.num('lookGain')));
    const sideMax = P.num('lookSideMax');
    const lookSide = Math.min(sideMax, Math.max(-sideMax, this.pushX * sideMax));
    const posFwd = this.pushY >= 0 ? this.pushY * P.num('posFwdMax') : this.pushY * P.num('posBackMax');
    const posSide = this.pushX * P.num('posSideMax');

    this.lookT.set(
      target.x + fwdX * lookFwd + rightX * lookSide,
      target.y + 1.2,
      target.z + fwdZ * lookFwd + rightZ * lookSide,
    );
    const ax = target.x + fwdX * posFwd + rightX * posSide;
    const az = target.z + fwdZ * posFwd + rightZ * posSide;
    const back = P.num('camBack');
    this.desired.set(ax - fwdX * back, target.y + P.num('camHeight'), az - fwdZ * back);

    // Angle override: slide the look point along the ground direction so the view meets that angle.
    if (P.get('camAngle') !== null) {
      const ang = (P.num('camAngle') * Math.PI) / 180;
      const h = this.desired.y - this.lookT.y;
      let dx = this.lookT.x - this.desired.x;
      let dz = this.lookT.z - this.desired.z;
      let dh = Math.hypot(dx, dz);
      if (dh < 1e-3) {
        dx = fwdX;
        dz = fwdZ;
        dh = 1;
      }
      if (h > 0.01) {
        const want = h / Math.tan(ang);
        this.lookT.x = this.desired.x + (dx / dh) * want;
        this.lookT.z = this.desired.z + (dz / dh) * want;
      }
    }

    if (!this.started) {
      this.pos.copy(this.desired);
      this.look.copy(this.lookT);
      this.started = true;
    } else {
      this.pos.lerp(this.desired, ease(P.num('camFollow'), dt));
      this.look.lerp(this.lookT, ease(P.num('lookFollow'), dt));
    }
    this.cam.position.copy(this.pos);
    this.cam.lookAt(this.look);
    const fov = P.num('camLens');
    if (this.cam.fov !== fov) {
      this.cam.fov = fov;
      this.cam.updateProjectionMatrix();
    }
  }

  /** Jump straight to the framing (after a preset or a reset), without easing. */
  snap() {
    this.started = false;
  }
}
