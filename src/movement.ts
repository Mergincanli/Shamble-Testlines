// The soldier's movement, run at a fixed step (30 or 60 per second). Written fresh from the old game's numbers
// and described behaviour: speed eases toward the wanted speed (one rate to speed up, one to stop), sprint
// drains stamina, the jump starts from the speed that gives the chosen reach, and blocks no taller than the
// step-up are walked onto, on the ground and in the air.
import { resolveWalls, stepUpTarget, surfaceAt } from './yard';
import type { Store } from './params';

export interface MoverState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  vy: number;
  grounded: boolean;
  stamina: number;
  staminaLocked: boolean;
  sprinting: boolean;
}

export interface MoveInput {
  /** Wanted direction on the ground, world space, length 0 or 1. */
  wishX: number;
  wishZ: number;
  sprint: boolean;
  jump: boolean;
}

export function newMover(x = 0, z = 0): MoverState {
  return { x, y: 0, z, vx: 0, vz: 0, vy: 0, grounded: true, stamina: 1, staminaLocked: false, sprinting: false };
}

/** The soldier stands on what is under his feet: a small circle, so he never stands on air past an edge. */
const FOOT_RADIUS = 0.15;
/** Small drops (going down a ramp) keep the feet on the ground instead of a string of tiny falls. */
const SNAP_DOWN = 0.2;
const LN10 = Math.log(10);

export function stepMover(s: MoverState, inp: MoveInput, dt: number, P: Store) {
  const moving = inp.wishX !== 0 || inp.wishZ !== 0;
  const wantSprint = inp.sprint && moving;

  // Stamina, as the old game: drains while sprinting, refills otherwise, locks when it runs dry.
  if (P.get('staminaOn')) {
    if (wantSprint && !s.staminaLocked) {
      s.stamina -= dt / P.num('staminaTime');
      if (s.stamina <= 0) {
        s.stamina = 0;
        s.staminaLocked = true;
      }
    } else {
      s.stamina = Math.min(1, s.stamina + dt / P.num('staminaRefill'));
      if (s.staminaLocked && s.stamina >= P.num('staminaUnlock') / 100) s.staminaLocked = false;
    }
    s.sprinting = wantSprint && !s.staminaLocked && s.stamina > 0;
  } else {
    s.stamina = 1;
    s.staminaLocked = false;
    s.sprinting = wantSprint;
  }

  // Horizontal speed eases toward the wanted speed.
  const speed = P.num('walkSpeed') * (s.sprinting ? P.num('sprintMult') : 1);
  const tx = inp.wishX * speed;
  const tz = inp.wishZ * speed;
  let rate = LN10 / (moving ? P.num('accelTime') : P.num('stopTime'));
  if (!s.grounded) rate *= P.num('airControl') / 100;
  const k = 1 - Math.exp(-rate * dt);
  s.vx += (tx - s.vx) * k;
  s.vz += (tz - s.vz) * k;

  const r = P.num('bodyRadius');
  const stepUp = P.num('stepUp');
  const g = P.num('gravity');

  // Jump: the take-off speed that rises (reach - step-up), so the reach is the highest ledge gained.
  if (inp.jump && s.grounded) {
    const rise = Math.max(0.01, P.num('jumpReach') - stepUp);
    s.vy = Math.sqrt(2 * g * rise);
    s.grounded = false;
  }

  // Vertical: the exact arc for this step, so the jump's height does not depend on the step rate.
  const wasGrounded = s.grounded;
  if (!s.grounded) {
    s.y += s.vy * dt - 0.5 * g * dt * dt;
    s.vy -= g * dt;
  }
  // Move, then leave any block that is too tall from the new feet height (after this step's arc, so a
  // ledge stops being a wall at the very step the jump reaches it).
  const wantX = s.x + s.vx * dt;
  const wantZ = s.z + s.vz * dt;
  const [rx, rz] = resolveWalls(wantX, wantZ, r, s.y, stepUp);
  // Lose the speed that went into a wall, so the soldier slides along it instead of pressing into it.
  const px = rx - wantX;
  const pz = rz - wantZ;
  const pl = Math.hypot(px, pz);
  if (pl > 1e-9) {
    const vn = (s.vx * px + s.vz * pz) / pl;
    if (vn < 0) {
      s.vx -= (px / pl) * vn;
      s.vz -= (pz / pl) * vn;
    }
  }
  s.x = rx;
  s.z = rz;

  // Step up onto a block the body meets, in the air too (that is how a jump gains a ledge): rise to its top and
  // move the feet onto it.
  const rs = Math.min(FOOT_RADIUS, r);
  const up = stepUpTarget(s.x, s.z, r, s.y, stepUp, s.vx, s.vz);
  if (up) {
    s.y = up.top;
    s.vy = 0;
    s.grounded = true;
    const dx = up.qx - s.x;
    const dz = up.qz - s.z;
    const d = Math.hypot(dx, dz);
    const inside = rs * 0.9;
    if (d > inside) {
      s.x += (dx / d) * (d - inside);
      s.z += (dz / d) * (d - inside);
    }
  }
  const surf = surfaceAt(s.x, s.z, rs, s.y, stepUp);
  if (s.y <= surf) {
    s.y = surf;
    s.vy = 0;
    s.grounded = true;
  } else if (wasGrounded && s.y - surf <= SNAP_DOWN) {
    s.y = surf;
    s.vy = 0;
    s.grounded = true;
  } else if (wasGrounded) {
    // Walked off an edge: start falling from rest.
    s.grounded = false;
    s.vy = 0;
  }
}
