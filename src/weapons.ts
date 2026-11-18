// Guns as data, fired at the fixed simulation step: fire timing with the remainder carried between steps, spread
// that grows per shot and recovers over time, a hitscan against the dummies and the blocks, damage with the
// SMG's falloff, and the short sprint-to-fire delay. Written fresh from the old game's numbers and described
// behaviour (docs/LEGACY_TUNING.md, WEAPONS.shabzon for the SMG and WEAPONS.amk for the rifle).
import type { GunId } from './guns';
import type { MoverState } from './movement';
import type { Store } from './params';
import { BLOCKS, rampHeight } from './yard';

/** Height of the shot above the feet: the gun's height in the aiming pose. */
export const SHOT_HEIGHT = 1.36;
/** The dummies' hit volume: an upright cylinder from the feet. */
export const HIT_RADIUS = 0.3;
export const HIT_HEIGHT = 1.8;

/** Per gun: the panel keys that hold its values, and what the old game had that is not a slider. */
export const GUN_KEYS: Record<GunId, { prefix: string; auto: boolean; name: string; falloff: boolean }> = {
  smg: { prefix: 'smg', auto: true, name: 'SMG', falloff: true },
  rifle: { prefix: 'rifle', auto: false, name: 'Rifle', falloff: false },
};

export interface GunState {
  ammo: number;
  cooldown: number;
  spread: number;
  reloadLeft: number;
  reloadTotal: number;
  /** Time until the gun is ready after a sprint (the sprint-to-fire delay). */
  readyIn: number;
}

export interface WeaponsState {
  gun: GunId;
  guns: Record<GunId, GunState>;
  /** A press of a once-per-press gun that came during the gap between shots fires as soon as it can. */
  queued: boolean;
}

export interface ShotEvent {
  gun: GunId;
  ox: number;
  oy: number;
  oz: number;
  ex: number;
  ey: number;
  ez: number;
  /** Index of the dummy hit, or -1 (a block or nothing). */
  hit: number;
  hitBlock: boolean;
  damage: number;
  killed: boolean;
}

export interface Target {
  state: MoverState;
  health: number;
  /** Seconds until it stands again; above 0 while it is down. */
  downFor: number;
}

export function gunValue(P: Store, gun: GunId, key: string): number {
  return P.num(GUN_KEYS[gun].prefix + key);
}

export function newWeapons(P: Store, gun: GunId): WeaponsState {
  const mk = (g: GunId): GunState => ({
    ammo: Math.round(gunValue(P, g, 'Mag')),
    cooldown: 0,
    spread: gunValue(P, g, 'SpreadHip'),
    reloadLeft: 0,
    reloadTotal: 0,
    readyIn: 0,
  });
  return { gun, guns: { smg: mk('smg'), rifle: mk('rifle') }, queued: false };
}

/** Change guns: a reload in progress stops, the spread rests, and the gun comes up after a short moment. */
export function switchGun(W: WeaponsState, gun: GunId, P: Store) {
  if (W.gun === gun) return;
  W.gun = gun;
  const g = W.guns[gun];
  g.reloadLeft = 0;
  g.spread = gunValue(P, gun, 'SpreadHip');
  g.cooldown = Math.max(g.cooldown, SWITCH_TIME);
  W.queued = false;
}

/** The old game's pause after a gun change before the first shot. */
const SWITCH_TIME = 0.12;

/** A small seeded random source for spread, so a recording would play back the same. */
let seed = 12345;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

/** Where a level ray from (ox, oz) along (dx, dz) at height y first meets a block, as a distance, or Infinity. */
function rayBlocks(ox: number, oz: number, dx: number, dz: number, y: number, max: number): number {
  let best = Infinity;
  for (const b of BLOCKS) {
    if (b.top <= y) continue;
    // Slab test in x and z.
    let t0 = 0;
    let t1 = max;
    for (const [o, d, lo, hi] of [
      [ox, dx, b.minX, b.maxX],
      [oz, dz, b.minZ, b.maxZ],
    ] as const) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) {
          t0 = Infinity;
          break;
        }
      } else {
        let a = (lo - o) / d;
        let c = (hi - o) / d;
        if (a > c) [a, c] = [c, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, c);
      }
    }
    if (t0 > t1 || t0 === Infinity) continue;
    if (b.ramp) {
      // A ramp stops the shot only where its surface is above the shot.
      const steps = 8;
      let tHit = Infinity;
      for (let i = 0; i <= steps; i++) {
        const t = t0 + ((t1 - t0) * i) / steps;
        if (rampHeight(b, ox + dx * t, oz + dz * t) > y) {
          tHit = t;
          break;
        }
      }
      if (tHit < best) best = tHit;
    } else if (t0 < best) best = t0;
  }
  return best;
}

/** Where a level ray first meets a standing target's cylinder: [distance, index], or [Infinity, -1]. */
function rayTargets(ox: number, oz: number, dx: number, dz: number, y: number, targets: Target[], max: number): [number, number] {
  let best = Infinity;
  let idx = -1;
  targets.forEach((t, i) => {
    if (t.downFor > 0) return;
    const s = t.state;
    if (y < s.y || y > s.y + HIT_HEIGHT) return;
    const fx = s.x - ox;
    const fz = s.z - oz;
    const along = fx * dx + fz * dz;
    if (along < 0) return;
    const side2 = fx * fx + fz * fz - along * along;
    const r2 = HIT_RADIUS * HIT_RADIUS;
    if (side2 > r2) return;
    const d = along - Math.sqrt(r2 - side2);
    if (d >= 0 && d < best && d <= max) {
      best = d;
      idx = i;
    }
  });
  return [best, idx];
}

export interface TriggerInput {
  /** The trigger is held this step. */
  held: boolean;
  /** The trigger went down since the last step (for guns that fire once per press). */
  pressed: boolean;
  reload: boolean;
  /** Direction of aim on the ground (the soldier faces it). */
  aimYaw: number;
}

/**
 * One fixed step of the player's gun. Shots go out level from the soldier at gun height, along the aim with
 * the current spread as a sideways angle, and are resolved at once (the sandbox has no network).
 */
export function stepWeapons(
  W: WeaponsState,
  me: MoverState,
  inp: TriggerInput,
  targets: Target[],
  dt: number,
  P: Store,
  events: ShotEvent[],
) {
  const gun = W.gun;
  const g = W.guns[gun];
  const v = (k: string) => gunValue(P, gun, k);
  const mag = Math.max(1, Math.round(v('Mag')));
  if (g.ammo > mag) g.ammo = mag;

  // Spread recovers toward its resting value.
  const base = v('SpreadHip');
  g.spread = Math.max(base, Math.min(v('SpreadMax'), g.spread - v('SpreadRecover') * dt));

  // Reload in progress.
  if (g.reloadLeft > 0) {
    g.reloadLeft -= dt;
    if (g.reloadLeft <= 0) {
      g.reloadLeft = 0;
      g.ammo = mag;
    }
  }

  // Sprint-to-fire: the gun is not ready while sprinting, and for a short delay after.
  if (me.sprinting) g.readyIn = v('SprintDelay');
  else g.readyIn = Math.max(0, g.readyIn - dt);

  g.cooldown -= dt;
  const canFire = g.reloadLeft <= 0 && g.readyIn <= 0;
  if (!GUN_KEYS[gun].auto) {
    // Only a press during the gap between shots waits; a press during a reload or a sprint is dropped.
    if (inp.pressed) W.queued = canFire;
    else if (!canFire) W.queued = false;
  }
  const wants = GUN_KEYS[gun].auto ? inp.held : W.queued;
  if (!wants || !canFire || g.ammo <= 0) g.cooldown = Math.max(0, g.cooldown);

  if (wants && canFire) {
    // The remainder of the interval carries over, so the rate holds at either step rate.
    let guard = 0;
    while (g.cooldown <= 1e-9 && g.ammo > 0 && guard++ < 16) {
      fireOne(W, me, inp.aimYaw, targets, P, events);
      g.cooldown += Math.max(0.01, v('Interval'));
      if (!GUN_KEYS[gun].auto) {
        W.queued = false;
        break;
      }
    }
  }

  // Reload on R, or by itself when the magazine runs dry.
  if (g.reloadLeft <= 0 && g.ammo < mag && (inp.reload || g.ammo <= 0)) startReload(g, v('Reload'));
}

export function startReload(g: GunState, seconds: number) {
  g.reloadTotal = Math.max(0.05, seconds);
  g.reloadLeft = g.reloadTotal;
}

function fireOne(W: WeaponsState, me: MoverState, aimYaw: number, targets: Target[], P: Store, events: ShotEvent[]) {
  const gun = W.gun;
  const g = W.guns[gun];
  const v = (k: string) => gunValue(P, gun, k);
  g.ammo--;
  const yaw = aimYaw + (rand() * 2 - 1) * g.spread;
  g.spread = Math.min(v('SpreadMax'), g.spread + v('SpreadPerShot'));
  const dx = Math.sin(yaw);
  const dz = Math.cos(yaw);
  const oy = me.y + SHOT_HEIGHT;
  const range = v('Range');
  const tb = rayBlocks(me.x, me.z, dx, dz, oy, range);
  const [tt, idx] = rayTargets(me.x, me.z, dx, dz, oy, targets, Math.min(range, tb));
  const hitDummy = idx >= 0;
  const t = hitDummy ? tt : Math.min(tb, range);
  let damage = 0;
  let killed = false;
  if (hitDummy) {
    damage = v('Damage');
    if (GUN_KEYS[gun].falloff) {
      const a = v('FalloffStart');
      const b = Math.max(a + 0.01, v('FalloffEnd'));
      const m = v('FalloffMin');
      const k = t <= a ? 1 : t >= b ? m : 1 + ((m - 1) * (t - a)) / (b - a);
      damage *= k;
    }
    const target = targets[idx];
    target.health -= damage;
    // A small shove along the shot: the target reacts.
    target.state.vx += dx * 1.2;
    target.state.vz += dz * 1.2;
    if (target.health <= 0) {
      killed = true;
      target.health = 0;
      target.downFor = P.num('dummyDownTime');
    }
  }
  events.push({
    gun,
    ox: me.x,
    oy,
    oz: me.z,
    ex: me.x + dx * t,
    ey: oy,
    ez: me.z + dz * t,
    hit: idx,
    hitBlock: !hitDummy && tb <= range,
    damage,
    killed,
  });
}
