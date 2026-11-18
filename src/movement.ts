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
  /** What is left of a step-up's pull onto the block, spread over a few steps so it does not lurch. */
  pullX: number;
  pullZ: number;
}

export interface MoveInput {
  /** Wanted direction on the ground, world space, length 0 or 1. */
  wishX: number;
  wishZ: number;
  sprint: boolean;
  jump: boolean;
}

export function newMover(x = 0, z = 0): MoverState {
  return {
    x,
    y: 0,
    z,
    vx: 0,
    vz: 0,
    vy: 0,
    grounded: true,
    stamina: 1,
    staminaLocked: false,
    sprinting: false,
    pullX: 0,
    pullZ: 0,
  };
}

/** The soldier stands on what is under his feet: a small circle, so he never stands on air past an edge. */
const FOOT_RADIUS = 0.15;
/** A step-up's pull onto the block: this share of what is left each step, all of it once less than PULL_MIN. */
const PULL_SHARE = 0.5;
const PULL_MIN = 0.03;
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
  // Feet height for this step's wall and step-up tests: when the top of the arc falls between two steps, use
  // the top itself, so the reach does not depend on the step rate or the gravity.
  let testFeet = s.y;
  if (!s.grounded) {
    const y0 = s.y;
    const vy0 = s.vy;
    s.y += s.vy * dt - 0.5 * g * dt * dt;
    s.vy -= g * dt;
    testFeet = vy0 > 0 && s.vy <= 0 ? Math.max(s.y, y0 + (vy0 * vy0) / (2 * g)) : s.y;
  }
  // Move, then leave any block that is too tall from the new feet height (after this step's arc, so a
  // ledge stops being a wall at the very step the jump reaches it).
  const wantX = s.x + s.vx * dt;
  const wantZ = s.z + s.vz * dt;
  const [rx, rz] = resolveWalls(wantX, wantZ, r, testFeet, stepUp);
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

  // Step up onto a block the body meets, in the air too (that is how a jump gains a ledge): rise to its top, and
  // pull the feet onto it over the next few steps.
  const rs = Math.min(FOOT_RADIUS, r);
  const up = stepUpTarget(s.x, s.z, r, testFeet, stepUp, s.vx, s.vz);
  if (up && up.top > s.y) {
    s.y = up.top;
    s.vy = 0;
    s.grounded = true;
    const dx = up.qx - s.x;
    const dz = up.qz - s.z;
    const d = Math.hypot(dx, dz);
    const need = d - rs * 0.9;
    if (need > 0) {
      s.pullX = (dx / d) * need;
      s.pullZ = (dz / d) * need;
    }
  }
  // Walking back the other way drops what is left of the pull.
  if ((s.pullX || s.pullZ) && s.pullX * s.vx + s.pullZ * s.vz < 0) {
    s.pullX = 0;
    s.pullZ = 0;
  }
  const pulling = s.pullX !== 0 || s.pullZ !== 0;
  if (pulling) {
    const left = Math.hypot(s.pullX, s.pullZ);
    const take = left < PULL_MIN ? 1 : PULL_SHARE;
    s.x += s.pullX * take;
    s.z += s.pullZ * take;
    s.pullX *= 1 - take;
    s.pullZ *= 1 - take;
    if (take === 1) s.pullX = s.pullZ = 0;
  }
  // While a pull is under way the body stands on the block; after that, only the feet do.
  const surf = surfaceAt(s.x, s.z, pulling ? r : rs, s.y, stepUp);
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
