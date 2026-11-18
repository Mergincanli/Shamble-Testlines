// The one table of everything tuned in the sandbox. It drives the panel, each reset, the saved values and the
// Export. Start values are the old game's numbers (docs/LEGACY_TUNING.md and the old code's described
// behaviour) unless the source line says otherwise. None of them is a decision.

export type GroupId =
  | 'sim'
  | 'soldier'
  | 'move'
  | 'jump'
  | 'stamina'
  | 'push'
  | 'smg'
  | 'rifle'
  | 'camera'
  | 'framing'
  | 'mouse';

export const GROUPS: { id: GroupId; title: string; open: boolean; exportName: string }[] = [
  { id: 'sim', title: 'Simulation', open: true, exportName: 'simulation' },
  { id: 'soldier', title: 'Soldier', open: true, exportName: 'soldier' },
  { id: 'move', title: 'Movement', open: true, exportName: 'movement' },
  { id: 'jump', title: 'Jump', open: true, exportName: 'jump' },
  { id: 'stamina', title: 'Sprint stamina', open: false, exportName: 'stamina' },
  { id: 'push', title: 'Dummies and soft pushing', open: true, exportName: 'pushing' },
  { id: 'smg', title: 'SMG (key 1)', open: true, exportName: 'smg' },
  { id: 'rifle', title: 'Rifle (key 2)', open: false, exportName: 'rifle' },
  { id: 'camera', title: 'Camera', open: true, exportName: 'camera' },
  { id: 'framing', title: 'Camera framing (dead zone, look-ahead, smoothing)', open: false, exportName: 'camera_framing' },
  { id: 'mouse', title: 'Mouse', open: true, exportName: 'mouse' },
];

interface Base {
  key: string;
  group: GroupId;
  label: string;
  /** Name in the Export, with its unit. */
  exportKey: string;
  /** Where the start value comes from. */
  source: string;
  /** The old game's name for this value, if it has one. */
  legacy?: string;
}

export interface RangeParam extends Base {
  kind: 'range';
  unit: string;
  min: number;
  max: number;
  step: number;
  /** null means "auto" (the value follows other sliders); only for params with `auto`. */
  start: number | null;
  digits: number;
  /** Shown after the value, computed from the current values (e.g. a derived speed). */
  note?: (v: Values) => string;
  /** When the value is null: what auto currently means. */
  auto?: (v: Values) => number;
}

export interface ChoiceParam extends Base {
  kind: 'choice';
  options: { value: string; label: string }[];
  start: string;
}

export interface ToggleParam extends Base {
  kind: 'toggle';
  start: boolean;
}

export type Param = RangeParam | ChoiceParam | ToggleParam;
export type Value = number | string | boolean | null;
export type Values = Record<string, Value>;

const LN10 = Math.log(10);

/** The camera's angle above the ground at rest: toward the look point, which sits ahead of and above the feet. */
export function restViewAngle(v: Values): number {
  const ahead = Math.min(v.lookMax as number, Math.max(v.lookMin as number, v.lookBase as number));
  const h = (v.camHeight as number) - 1.2;
  return (Math.atan2(Math.max(0.001, h), Math.max(0.001, (v.camBack as number) + ahead)) * 180) / Math.PI;
}

/** The old game's smoothing rate T.accel = 14 per second, as a time to cover 90 % of the change. */
const LEGACY_SMOOTH_TIME = LN10 / 14;


// The guns: start values from the old game's WEAPONS table (the SMG is WEAPONS.shabzon, the rifle WEAPONS.amk).
interface GunStart {
  name: string;
  legacy: string;
  interval: number;
  damage: number;
  mag: number;
  reload: number;
  recoil: number;
  spreadHip: number;
  spreadPerShot: number;
  spreadMax: number;
  spreadRecover: number;
  range: number;
  sprintDelay: number;
}

function gunParams(id: 'smg' | 'rifle', g: GunStart): Param[] {
  const deg = (rad: number) => ((rad * 180) / Math.PI).toFixed(2);
  const k = (s: string) => id + s;
  const out: Param[] = [
    {
      kind: 'range', key: k('Interval'), group: id, label: 'Time between shots', exportKey: 'fire_interval_s', unit: 's',
      min: 0.03, max: 1.5, step: 0.001, start: g.interval, digits: 3,
      note: (v) => `= ${Math.round(60 / (v[k('Interval')] as number))} rounds a minute`,
      source: `Old game ${g.legacy}.fireInterval.`, legacy: `${g.legacy}.fireInterval`,
    },
    {
      kind: 'range', key: k('Damage'), group: id, label: 'Damage per hit', exportKey: 'damage', unit: '',
      min: 1, max: 150, step: 1, start: g.damage, digits: 0,
      note: (v) => `${Math.ceil((v.dummyHealth as number) / (v[k('Damage')] as number))} hits to drop a dummy (up close)`,
      source: `Old game ${g.legacy}.damage.`, legacy: `${g.legacy}.damage`,
    },
    {
      kind: 'range', key: k('Mag'), group: id, label: 'Magazine', exportKey: 'magazine', unit: 'rounds',
      min: 1, max: 100, step: 1, start: g.mag, digits: 0,
      source: `Old game ${g.legacy}.mag.`, legacy: `${g.legacy}.mag`,
    },
    {
      kind: 'range', key: k('Reload'), group: id, label: 'Reload time', exportKey: 'reload_time_s', unit: 's',
      min: 0.2, max: 8, step: 0.05, start: g.reload, digits: 2,
      source: `Old game ${g.legacy}.reload. R reloads; an empty magazine reloads by itself. A second tap of R during the reload is the active reload.`, legacy: `${g.legacy}.reload`,
    },
    {
      kind: 'range', key: k('Recoil'), group: id, label: 'Recoil (view kick)', exportKey: 'recoil_view_kick', unit: '',
      min: 0, max: 6, step: 0.05, start: g.recoil, digits: 2,
      source: `Old game ${g.legacy}.recoil. As in the old game it kicks the view: a camera shake and a small zoom punch per shot. Accuracy is the spread below.`,
      legacy: `${g.legacy}.recoil`,
    },
    {
      kind: 'range', key: k('SpreadHip'), group: id, label: 'Spread at rest', exportKey: 'spread_rest_rad', unit: 'rad',
      min: 0, max: 0.3, step: 0.001, start: g.spreadHip, digits: 3,
      note: (v) => `±${deg(v[k('SpreadHip')] as number)}° to each side`,
      source: `Old game ${g.legacy}.spreadHip: each shot leaves up to this angle to either side of the aim.`, legacy: `${g.legacy}.spreadHip`,
    },
    {
      kind: 'range', key: k('SpreadPerShot'), group: id, label: 'Spread added per shot', exportKey: 'spread_per_shot_rad', unit: 'rad',
      min: 0, max: 0.2, step: 0.0005, start: g.spreadPerShot, digits: 4,
      note: (v) => {
        const add = v[k('SpreadPerShot')] as number;
        const back = (v[k('SpreadRecover')] as number) * (v[k('Interval')] as number);
        return add > back
          ? `builds up in sustained fire (+${add.toFixed(4)} a shot, ${back.toFixed(4)} recovered between shots)`
          : `does not build up: the recovery takes back ${back.toFixed(4)} between shots`;
      },
      source: `Old game ${g.legacy}.spreadPerShot. The spread only builds up if this is more than the recovery takes back between two shots.`,
      legacy: `${g.legacy}.spreadPerShot`,
    },
    {
      kind: 'range', key: k('SpreadMax'), group: id, label: 'Spread at most', exportKey: 'spread_max_rad', unit: 'rad',
      min: 0, max: 0.4, step: 0.005, start: g.spreadMax, digits: 3,
      note: (v) => `±${deg(v[k('SpreadMax')] as number)}°`,
      source: `Old game ${g.legacy}.spreadMax.`, legacy: `${g.legacy}.spreadMax`,
    },
    {
      kind: 'range', key: k('SpreadRecover'), group: id, label: 'Spread recovery', exportKey: 'spread_recovery_rad_per_s', unit: 'rad/s',
      min: 0, max: 5, step: 0.05, start: g.spreadRecover, digits: 2,
      source: `Old game ${g.legacy}.spreadDecay: the spread falls back toward rest by this much each second.`, legacy: `${g.legacy}.spreadDecay`,
    },
    {
      kind: 'range', key: k('ActiveStart'), group: id, label: 'Active reload: window starts at', exportKey: 'active_reload_window_start_pct', unit: '%',
      min: 0, max: 95, step: 1, start: 40, digits: 0,
      note: (v) => {
        const t = v[k('Reload')] as number;
        const a = (v[k('ActiveStart')] as number) / 100;
        const b = Math.min(1, a + (v[k('ActiveWidth')] as number) / 100);
        return `tap R between ${(a * t).toFixed(2)} s and ${(b * t).toFixed(2)} s into the reload`;
      },
      source:
        'No old number. LOOP_V2 7 (simplified for Slice 1): tap R during a reload; inside the window the reload ends at once, a miss is a normal reload, one try per reload. A share of the reload time.',
    },
    {
      kind: 'range', key: k('ActiveWidth'), group: id, label: 'Active reload: window width', exportKey: 'active_reload_window_width_pct', unit: '%',
      min: 1, max: 100, step: 1, start: 20, digits: 0,
      note: (v) => {
        const t = v[k('Reload')] as number;
        const a = (v[k('ActiveStart')] as number) / 100;
        const w = Math.min(1, a + (v[k('ActiveWidth')] as number) / 100) - a;
        const step = 1 / Number(v.tickRate) / t;
        const warn =
          a > 1 - step
            ? ' · starts in the last step of the reload: no tap can score'
            : w < step
              ? ` · narrower than one step at ${v.tickRate} steps/s (${(step * 100).toFixed(1)} %): a tap may never score`
              : '';
        return `${(w * t).toFixed(2)} s wide${warn}`;
      },
      source: 'No old number. LOOP_V2 7 asks for a gentle active reload, so it starts wide. A share of the reload time.',
    },
    {
      kind: 'range', key: k('Range'), group: id, label: 'Range', exportKey: 'range_m', unit: 'm',
      min: 5, max: 300, step: 1, start: g.range, digits: 0,
      source: `Old game ${g.legacy}.range.`, legacy: `${g.legacy}.range`,
    },
    {
      kind: 'range', key: k('SprintDelay'), group: id, label: 'Sprint-to-fire delay', exportKey: 'sprint_to_fire_delay_s', unit: 's',
      min: 0, max: 1, step: 0.01, start: g.sprintDelay, digits: 2,
      source: 'No old number. LOOP_V2 §7: every gun gets a short sprint-to-fire delay, longer for heavy guns. Firing stops the sprint; the first shot waits this long after it ends.',
    },
  ];
  return out;
}

export const GUN_PARAMS: Param[] = [
  ...gunParams('smg', {
    name: 'SMG', legacy: 'WEAPONS.shabzon', interval: 0.072, damage: 8, mag: 36, reload: 1.9, recoil: 0.3,
    spreadHip: 0.075, spreadPerShot: 0.005, spreadMax: 0.16, spreadRecover: 0.7, range: 55, sprintDelay: 0.15,
  }),
  { kind: 'range', key: 'smgFalloffStart', group: 'smg', label: 'Damage falls off from', exportKey: 'falloff_start_m', unit: 'm', min: 0, max: 150, step: 1, start: 15, digits: 0, source: 'Old game WEAPONS.shabzon.falloffStart.', legacy: 'WEAPONS.shabzon.falloffStart' },
  { kind: 'range', key: 'smgFalloffEnd', group: 'smg', label: 'Damage falls off to', exportKey: 'falloff_end_m', unit: 'm', min: 1, max: 300, step: 1, start: 35, digits: 0, source: 'Old game WEAPONS.shabzon.falloffEnd.', legacy: 'WEAPONS.shabzon.falloffEnd' },
  { kind: 'range', key: 'smgFalloffMin', group: 'smg', label: 'Damage left at the far end', exportKey: 'falloff_min_share', unit: '×', min: 0, max: 1, step: 0.01, start: 0.2, digits: 2, source: 'Old game WEAPONS.shabzon.falloffMin.', legacy: 'WEAPONS.shabzon.falloffMin' },
  ...gunParams('rifle', {
    name: 'Rifle', legacy: 'WEAPONS.amk', interval: 0.2, damage: 34, mag: 1, reload: 3.5, recoil: 2,
    spreadHip: 0.022, spreadPerShot: 0, spreadMax: 0.05, spreadRecover: 0.3, range: 300, sprintDelay: 0.25,
  }),
];

export const PARAMS: Param[] = [
  // Simulation
  {
    kind: 'choice',
    key: 'tickRate',
    group: 'sim',
    label: 'Steps per second',
    exportKey: 'step_rate_hz',
    options: [
      { value: '30', label: '30 (the game)' },
      { value: '60', label: '60' },
    ],
    start: '30',
    source: "The game's simulation steps 30 times a second; the picture is smoothed between steps.",
  },

  // Soldier
  {
    kind: 'choice',
    key: 'faction',
    group: 'soldier',
    label: 'Faction',
    exportKey: 'faction',
    options: [
      { value: 'soviets', label: 'Soviets' },
      { value: 'allies', label: 'Allies' },
      { value: 'empire', label: 'Empire' },
    ],
    start: 'soviets',
    source: 'Colours from the Art brief (appendix A4).',
  },
  {
    kind: 'choice',
    key: 'gun',
    group: 'soldier',
    label: 'Gun (keys 1 and 2)',
    exportKey: 'gun',
    options: [
      { value: 'smg', label: 'SMG' },
      { value: 'rifle', label: 'Rifle' },
    ],
    start: 'smg',
    source: 'The SMG is judged first (build plan, FIRST-SOLDIER).',
  },

  // Movement
  {
    kind: 'range',
    key: 'walkSpeed',
    group: 'move',
    label: 'Walk speed',
    exportKey: 'walk_speed_m_per_s',
    unit: 'm/s',
    min: 1,
    max: 15,
    step: 0.1,
    start: 6.3,
    digits: 1,
    source: 'Old game T.moveSpeed.',
    legacy: 'T.moveSpeed',
  },
  {
    kind: 'range',
    key: 'sprintMult',
    group: 'move',
    label: 'Sprint',
    exportKey: 'sprint_multiplier',
    unit: '×',
    min: 1,
    max: 2.5,
    step: 0.005,
    start: 1.214,
    digits: 3,
    note: (v) => `= ${((v.walkSpeed as number) * (v.sprintMult as number)).toFixed(2)} m/s`,
    source: "Old game UNIT_TYPES.conscript.sprintMult (the Conscript's).",
    legacy: 'UNIT_TYPES.conscript.sprintMult',
  },
  {
    kind: 'range',
    key: 'accelTime',
    group: 'move',
    label: 'Speed-up time (to 90 %)',
    exportKey: 'speed_up_time_to_90pct_s',
    unit: 's',
    min: 0.02,
    max: 1.5,
    step: 0.005,
    start: LEGACY_SMOOTH_TIME,
    digits: 3,
    note: (v) => `rate ${(LN10 / (v.accelTime as number)).toFixed(1)}/s`,
    source: 'Old game T.accel = 14/s: speed eases toward the target, 90 % of the way in 0.164 s.',
    legacy: 'T.accel (speed-up)',
  },
  {
    kind: 'range',
    key: 'stopTime',
    group: 'move',
    label: 'Stop time (to under 10 %)',
    exportKey: 'stop_time_to_10pct_s',
    unit: 's',
    min: 0.02,
    max: 1.5,
    step: 0.005,
    start: LEGACY_SMOOTH_TIME,
    digits: 3,
    note: (v) => `rate ${(LN10 / (v.stopTime as number)).toFixed(1)}/s`,
    source: 'Old game: the same T.accel = 14/s eases the stop.',
    legacy: 'T.accel (stop)',
  },
  {
    kind: 'range',
    key: 'airControl',
    group: 'move',
    label: 'Air control',
    exportKey: 'air_control_pct',
    unit: '%',
    min: 0,
    max: 100,
    step: 1,
    start: 100,
    digits: 0,
    source: 'Old game: the same easing applied in the air, so full control. 0 % keeps the take-off speed.',
  },
  {
    kind: 'range',
    key: 'bodyRadius',
    group: 'move',
    label: 'Body radius (walls and ledges)',
    exportKey: 'body_radius_m',
    unit: 'm',
    min: 0.15,
    max: 1,
    step: 0.01,
    start: 0.4,
    digits: 2,
    source:
      "Half the stand-in's width over the hands (0.73 m, appendix A4), rounded up. The old game used 0.7 m against obstacles.",
  },

  // Jump
  {
    kind: 'range',
    key: 'jumpReach',
    group: 'jump',
    label: 'Jump reach (highest ledge)',
    exportKey: 'jump_reach_m',
    unit: 'm',
    min: 0.6,
    max: 6,
    step: 0.01,
    start: (11 * 11) / (2 * 24) + 0.55,
    digits: 2,
    note: (v) => {
      const rise = Math.max(0.01, (v.jumpReach as number) - (v.stepUp as number));
      return `rise ${rise.toFixed(2)} m, take-off ${Math.sqrt(2 * (v.gravity as number) * rise).toFixed(2)} m/s`;
    },
    source:
      'The formula value, 3.07 m (START-RULES): rise jumpV²/2g = 2.52 m plus the 0.55 m step-up. The slider sets the reach; the rise is reach minus step-up.',
    legacy: 'EJUMP_REACH',
  },
  {
    kind: 'range',
    key: 'gravity',
    group: 'jump',
    label: 'Gravity',
    exportKey: 'gravity_m_per_s2',
    unit: 'm/s²',
    min: 5,
    max: 60,
    step: 0.5,
    start: 24,
    digits: 1,
    note: (v) => {
      const rise = Math.max(0.01, (v.jumpReach as number) - (v.stepUp as number));
      return `airtime ${(2 * Math.sqrt((2 * rise) / (v.gravity as number))).toFixed(2)} s`;
    },
    source: 'Old game T.gravity.',
    legacy: 'T.gravity',
  },
  {
    kind: 'range',
    key: 'stepUp',
    group: 'jump',
    label: 'Step-up (walk onto without jumping)',
    exportKey: 'step_up_m',
    unit: 'm',
    min: 0,
    max: 1.2,
    step: 0.01,
    start: 0.55,
    digits: 2,
    source: 'Old game T.stepUp.',
    legacy: 'T.stepUp',
  },

  // Stamina
  {
    kind: 'toggle',
    key: 'staminaOn',
    group: 'stamina',
    label: 'Stamina on',
    exportKey: 'stamina_on',
    start: true,
    source: 'Old game: sprint drains stamina.',
  },
  {
    kind: 'range',
    key: 'staminaTime',
    group: 'stamina',
    label: 'Sprint time from full',
    exportKey: 'sprint_time_from_full_s',
    unit: 's',
    min: 1,
    max: 30,
    step: 0.5,
    start: 7,
    digits: 1,
    source: 'Old game STAM.max.',
    legacy: 'STAM.max',
  },
  {
    kind: 'range',
    key: 'staminaRefill',
    group: 'stamina',
    label: 'Refill time from empty',
    exportKey: 'refill_time_from_empty_s',
    unit: 's',
    min: 0.5,
    max: 30,
    step: 0.5,
    start: 5,
    digits: 1,
    source: 'Old game STAM.regen = 0.2 per second, so 5 s from empty to full.',
    legacy: 'STAM.regen',
  },
  {
    kind: 'range',
    key: 'staminaUnlock',
    group: 'stamina',
    label: 'Sprint returns at (after running dry)',
    exportKey: 'sprint_returns_at_pct',
    unit: '%',
    min: 0,
    max: 100,
    step: 1,
    start: 30,
    digits: 0,
    source: 'Old game STAM.lockUntil = 0.3.',
    legacy: 'STAM.lockUntil',
  },

  // Dummies and soft pushing
  {
    kind: 'toggle',
    key: 'dummiesWalk',
    group: 'push',
    label: 'Dummies walk their loops',
    exportKey: 'dummies_walk',
    start: true,
    source: 'Off: the eleven dummies stand still (handy for pushing and, later, shooting).',
  },
  {
    kind: 'range',
    key: 'pushStrength',
    group: 'push',
    label: 'Push strength',
    exportKey: 'push_strength_per_s',
    unit: '/s',
    min: 0,
    max: 40,
    step: 0.5,
    start: 8,
    digits: 1,
    note: (v) => `${(100 * (1 - Math.exp(-(v.pushStrength as number) / Number(v.tickRate)))).toFixed(0)} % of the overlap undone per step`,
    source:
      'No old number: the old game let soldiers pass through each other. START-RULES: "they push each other softly and never block". Each step the push moves soldiers apart by a share of their overlap; higher is stiffer. Head-on it turns partly sideways, so soldiers slide round each other, and it never undoes more than half of a walking soldier\'s step, so a walking soldier is never stopped.',
  },
  {
    kind: 'range',
    key: 'pushRadius',
    group: 'push',
    label: 'Body size for pushing (radius)',
    exportKey: 'push_radius_m',
    unit: 'm',
    min: 0.15,
    max: 1,
    step: 0.01,
    start: 0.4,
    digits: 2,
    source: 'Starts at the body radius used for walls (half the stand-in\'s width over the hands, rounded up).',
  },

  {
    kind: 'range',
    key: 'dummyHealth',
    group: 'push',
    label: 'Dummy health',
    exportKey: 'dummy_health',
    unit: '',
    min: 1,
    max: 500,
    step: 1,
    start: 100,
    digits: 0,
    source: "Old game UNIT_TYPES.conscript.maxHealth (the Conscript's).",
    legacy: 'UNIT_TYPES.conscript.maxHealth',
  },
  {
    kind: 'range',
    key: 'dummyDownTime',
    group: 'push',
    label: 'A dropped dummy stands again after',
    exportKey: 'dummy_down_time_s',
    unit: 's',
    min: 0.5,
    max: 20,
    step: 0.5,
    start: 4,
    digits: 1,
    source: 'Old game T.enemyRespawn.',
    legacy: 'T.enemyRespawn',
  },

  // The guns
  ...GUN_PARAMS,

  // Camera
  {
    kind: 'range',
    key: 'camHeight',
    group: 'camera',
    label: 'Height',
    exportKey: 'height_m',
    unit: 'm',
    min: 2,
    max: 120,
    step: 0.1,
    start: 40,
    digits: 1,
    source: 'Old game T.camHeight (the Iso preset).',
    legacy: 'T.camHeight',
  },
  {
    kind: 'range',
    key: 'camBack',
    group: 'camera',
    label: 'Distance (behind, along the ground)',
    exportKey: 'distance_m',
    unit: 'm',
    min: 0,
    max: 150,
    step: 0.1,
    start: 56.6,
    digits: 1,
    source: 'Old game T.camBack, the "boom".',
    legacy: 'T.camBack',
  },
  {
    kind: 'range',
    key: 'camAngle',
    group: 'camera',
    label: 'Angle above the ground',
    exportKey: 'angle_override_deg',
    unit: '°',
    min: 10,
    max: 89,
    step: 0.5,
    start: null,
    digits: 1,
    auto: (v) => restViewAngle(v),
    note: (v) =>
      `to the feet: ${((Math.atan2(v.camHeight as number, Math.max(0.001, v.camBack as number)) * 180) / Math.PI).toFixed(1)}° (height and distance alone)`,
    source:
      "Auto: the view's real angle at rest, which follows height, distance and the look-ahead (the camera looks at a point ahead of the soldier and 1.2 m up, so the view is a little flatter than the angle to the feet). Moving it is the old panel's pitch override: it moves the point the camera looks at, not the camera, and the forward look-ahead then has no effect. Reset returns to auto.",
  },
  {
    kind: 'range',
    key: 'camTurn',
    group: 'camera',
    label: 'Turn',
    exportKey: 'turn_deg',
    unit: '°',
    min: -180,
    max: 180,
    step: 1,
    start: 45,
    digits: 0,
    source: 'Old game T.camYawBase = 45°.',
    legacy: 'T.camYawBase',
  },
  {
    kind: 'range',
    key: 'camLens',
    group: 'camera',
    label: 'Lens (vertical field of view)',
    exportKey: 'lens_vertical_fov_deg',
    unit: '°',
    min: 5,
    max: 90,
    step: 0.5,
    start: 15,
    digits: 1,
    source: 'Old game T.fov.',
    legacy: 'T.fov',
  },

  // Camera framing (old game's dead zone and look-ahead)
  { kind: 'range', key: 'camFollow', group: 'framing', label: 'Camera follow rate', exportKey: 'camera_follow_rate_per_s', unit: '/s', min: 0.5, max: 40, step: 0.5, start: 7, digits: 1, source: 'Old game T.camLerp.', legacy: 'T.camLerp' },
  { kind: 'range', key: 'lookFollow', group: 'framing', label: 'Look point follow rate', exportKey: 'look_follow_rate_per_s', unit: '/s', min: 0.5, max: 40, step: 0.5, start: 9, digits: 1, source: 'Old game T.lookLerp.', legacy: 'T.lookLerp' },
  { kind: 'range', key: 'deadX', group: 'framing', label: 'Dead zone width (share of half-screen)', exportKey: 'dead_zone_x', unit: '', min: 0, max: 0.95, step: 0.01, start: 0.6, digits: 2, source: 'Old game T.camDeadX: inside the zone the cursor does not move the camera.', legacy: 'T.camDeadX' },
  { kind: 'range', key: 'deadY', group: 'framing', label: 'Dead zone height (share of half-screen)', exportKey: 'dead_zone_y', unit: '', min: 0, max: 0.95, step: 0.01, start: 0.52, digits: 2, source: 'Old game T.camDeadY.', legacy: 'T.camDeadY' },
  { kind: 'range', key: 'pushRate', group: 'framing', label: 'Edge push ease rate', exportKey: 'edge_push_rate_per_s', unit: '/s', min: 0.5, max: 40, step: 0.5, start: 9, digits: 1, source: 'Old game T.camPushLerp.', legacy: 'T.camPushLerp' },
  { kind: 'range', key: 'lookBase', group: 'framing', label: 'Look-ahead at rest', exportKey: 'look_ahead_base_m', unit: 'm', min: 0, max: 20, step: 0.1, start: 5.5, digits: 1, source: 'Old game T.lookAheadBase.', legacy: 'T.lookAheadBase' },
  { kind: 'range', key: 'lookMin', group: 'framing', label: 'Look-ahead minimum', exportKey: 'look_ahead_min_m', unit: 'm', min: -10, max: 20, step: 0.1, start: 3.5, digits: 1, source: 'Old game T.lookAheadFloor.', legacy: 'T.lookAheadFloor' },
  { kind: 'range', key: 'lookMax', group: 'framing', label: 'Look-ahead maximum', exportKey: 'look_ahead_max_m', unit: 'm', min: 0, max: 30, step: 0.1, start: 8, digits: 1, source: 'Old game T.lookAheadHip.', legacy: 'T.lookAheadHip' },
  { kind: 'range', key: 'lookGain', group: 'framing', label: 'Look-ahead gain', exportKey: 'look_ahead_gain', unit: '', min: 0, max: 2, step: 0.01, start: 0.55, digits: 2, source: 'Old game T.lookFwdGain.', legacy: 'T.lookFwdGain' },
  { kind: 'range', key: 'lookFwdRange', group: 'framing', label: 'Forward reach at the screen edge', exportKey: 'look_forward_range_m', unit: 'm', min: 0, max: 60, step: 0.5, start: 26, digits: 1, source: 'Old game T.lookFwdRange.', legacy: 'T.lookFwdRange' },
  { kind: 'range', key: 'lookBackRange', group: 'framing', label: 'Backward reach at the screen edge', exportKey: 'look_back_range_m', unit: 'm', min: 0, max: 60, step: 0.5, start: 16, digits: 1, source: 'Old game T.lookBackRange.', legacy: 'T.lookBackRange' },
  { kind: 'range', key: 'lookSideMax', group: 'framing', label: 'Sideways look', exportKey: 'look_side_max_m', unit: 'm', min: 0, max: 20, step: 0.1, start: 6, digits: 1, source: 'Old game T.lookSideMax.', legacy: 'T.lookSideMax' },
  { kind: 'range', key: 'posFwdMax', group: 'framing', label: 'Camera shift forward', exportKey: 'camera_shift_forward_m', unit: 'm', min: 0, max: 10, step: 0.1, start: 3.2, digits: 1, source: 'Old game T.posFwdMax.', legacy: 'T.posFwdMax' },
  { kind: 'range', key: 'posBackMax', group: 'framing', label: 'Camera shift back', exportKey: 'camera_shift_back_m', unit: 'm', min: 0, max: 10, step: 0.1, start: 2.2, digits: 1, source: 'Old game T.posBackMax.', legacy: 'T.posBackMax' },
  { kind: 'range', key: 'posSideMax', group: 'framing', label: 'Camera shift sideways', exportKey: 'camera_shift_side_m', unit: 'm', min: 0, max: 10, step: 0.1, start: 2, digits: 1, source: 'Old game T.posSideMax.', legacy: 'T.posSideMax' },
  { kind: 'range', key: 'turnRate', group: 'framing', label: 'Turn smoothing rate', exportKey: 'turn_follow_rate_per_s', unit: '/s', min: 1, max: 60, step: 1, start: 14, digits: 0, source: 'Old game T.camYawLerp.', legacy: 'T.camYawLerp' },

  // Mouse
  {
    kind: 'range',
    key: 'mouseSens',
    group: 'mouse',
    label: 'Sensitivity (camera turn, hold middle button)',
    exportKey: 'camera_turn_rad_per_px',
    unit: 'rad/px',
    min: 0.0005,
    max: 0.03,
    step: 0.0005,
    start: 0.006,
    digits: 4,
    note: (v) => `${(((v.mouseSens as number) * 180) / Math.PI).toFixed(2)}°/px`,
    source:
      'Old game T.camYawSens. The old game aimed with the system cursor, so this camera turn was its only mouse sensitivity.',
    legacy: 'T.camYawSens',
  },
];

export const PARAM_BY_KEY: Record<string, Param> = Object.fromEntries(PARAMS.map((p) => [p.key, p]));

// ---------------------------------------------------------------------------------------------------------
// Camera profiles. Each sets the whole camera: height, distance, lens, turn, angle (auto) and the framing.

/** The old game's look-ahead and camera shift (T.lookAhead*, T.look*Range, T.lookSideMax, T.pos*Max). */
const OLD_FRAMING = {
  lookBase: 5.5,
  lookMin: 3.5,
  lookMax: 8,
  lookFwdRange: 26,
  lookBackRange: 16,
  lookSideMax: 6,
  posFwdMax: 3.2,
  posBackMax: 2.2,
  posSideMax: 2,
};

function framingScaled(k: number): Values {
  const out: Values = {};
  for (const [key, v] of Object.entries(OLD_FRAMING)) out[key] = Math.round(v * k * 10) / 10;
  return out;
}

/**
 * "Original": the old game's camera as the owner's screenshot shows it. Fitted to the screenshot's path tiles
 * (about 2 px off): the old Iso camera, 40 m up and 56.6 m back, lens 15°, but turned 64° to the grid, with
 * the old soldier 2.94 m tall on screen. Scaled by 1.80 / 2.94 so the 1.80 m stand-in fills the screen as the
 * old soldier did; the look-ahead and camera shift scale with it.
 */
const ORIGINAL_K = 1.8 / 2.94;
export const ORIGINAL_PROFILE: Values = {
  camHeight: Math.round(40 * ORIGINAL_K * 10) / 10,
  camBack: Math.round(56.6 * ORIGINAL_K * 10) / 10,
  camLens: 15,
  camTurn: 64,
  camAngle: null,
  ...framingScaled(ORIGINAL_K),
};

/**
 * "Indie": the camera of the owner's indie game of last year, judged by eye from one screenshot (no shapes in
 * it to measure): about 50° above the feet, a 35° lens, straight behind, and the character about a tenth of
 * the screen's height. The framing scales with the much closer camera.
 */
const INDIE_DIST = 17.6;
export const INDIE_PROFILE: Values = {
  camHeight: Math.round(INDIE_DIST * Math.sin((50 * Math.PI) / 180) * 10) / 10,
  camBack: Math.round(INDIE_DIST * Math.cos((50 * Math.PI) / 180) * 10) / 10,
  camLens: 35,
  camTurn: 0,
  camAngle: null,
  ...framingScaled(INDIE_DIST / Math.hypot(40, 56.6)),
};

/** The two profiles, the first being the default. */
export const CAMERA_PROFILES: { name: string; title: string; values: Values }[] = [
  {
    name: 'Original',
    title:
      "The old game's camera as your screenshot shows it (the Iso camera turned 64° to the grid), scaled to the 1.80 m stand-in. The default.",
    values: ORIGINAL_PROFILE,
  },
  {
    name: 'Indie',
    title: 'Your indie game of last year, judged by eye from its screenshot: 50° above the feet, 35° lens, straight behind.',
    values: INDIE_PROFILE,
  },
];

/** The old game's five camera presets (CAM_STYLES), with its own framing, at its own soldier scale. */
export const CAMERA_PRESETS: { name: string; values: Values }[] = [
  { name: 'Classic', values: { camHeight: 24, camBack: 16, camLens: 52, camTurn: 0, camAngle: null, ...OLD_FRAMING } },
  { name: 'Tactical', values: { camHeight: 15.5, camBack: 10.5, camLens: 52, camTurn: 0, camAngle: null, ...OLD_FRAMING } },
  { name: 'Iso', values: { camHeight: 40, camBack: 56.6, camLens: 15, camTurn: 45, camAngle: null, ...OLD_FRAMING } },
  { name: 'Iso+', values: { camHeight: 41.5, camBack: 65.5, camLens: 12, camTurn: 45, camAngle: null, ...OLD_FRAMING } },
  { name: 'Foxhole', values: { camHeight: 52, camBack: 42, camLens: 18, camTurn: 45, camAngle: null, ...OLD_FRAMING } },
];

// The camera starts on the Original profile: its values become the start values (and so the resets).
for (const [key, v] of Object.entries(ORIGINAL_PROFILE)) {
  const p = PARAM_BY_KEY[key];
  if (p.kind !== 'range' || v === null || p.start === v) continue;
  p.source = `Starts on the Original camera profile (${v}${p.unit ? ' ' + p.unit : ''}). ${p.source}`;
  p.start = v as number;
}

/** True if every value of a profile or preset is what the panel holds now. */
export function profileActive(values: Values, current: Values): boolean {
  return Object.entries(values).every(([k, v]) => {
    const c = current[k];
    return v === null || c === null ? v === c : Math.abs((c as number) - (v as number)) < 1e-6;
  });
}

export function startValues(): Values {
  const v: Values = {};
  for (const p of PARAMS) v[p.key] = p.start;
  return v;
}

/** Bring a stored or typed value into range; anything unusable falls back to the start value. */
export function sanitize(p: Param, raw: unknown): Value {
  if (p.kind === 'range') {
    if (raw === null && p.auto) return null;
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseFloat(raw) : NaN;
    if (!Number.isFinite(n)) return p.start;
    return Math.min(p.max, Math.max(p.min, n));
  }
  if (p.kind === 'choice') {
    return typeof raw === 'string' && p.options.some((o) => o.value === raw) ? raw : p.start;
  }
  return typeof raw === 'boolean' ? raw : p.start;
}

const STORE_KEY = 'shamble-testlines.values.v2';
/** The first builds saved every value under this key. */
const OLD_STORE_KEY = 'shamble-testlines.values.v1';
/** Camera start values of those builds: a saved value equal to one of these was never moved by hand. */
const OLD_CAMERA_STARTS: Record<string, number> = { camHeight: 40, camBack: 56.6, camTurn: 45, ...OLD_FRAMING };

function same(a: Value, b: Value): boolean {
  return typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : a === b;
}

/** The live values, kept in the browser between visits when the browser allows it (only what was changed). */
export class Store {
  values: Values;
  private listeners: ((key: string | null) => void)[] = [];

  constructor() {
    this.values = startValues();
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, unknown>;
        for (const p of PARAMS) if (p.key in saved) this.values[p.key] = sanitize(p, saved[p.key]);
      } else {
        const old = window.localStorage.getItem(OLD_STORE_KEY);
        if (old) {
          const saved = JSON.parse(old) as Record<string, unknown>;
          for (const p of PARAMS) {
            if (!(p.key in saved)) continue;
            if (p.key in OLD_CAMERA_STARTS && same(saved[p.key] as Value, OLD_CAMERA_STARTS[p.key])) continue;
            this.values[p.key] = sanitize(p, saved[p.key]);
          }
          this.save();
          window.localStorage.removeItem(OLD_STORE_KEY);
        }
      }
    } catch {
      // Storage blocked or unreadable: start from the start values.
    }
  }

  num(key: string): number {
    const p = PARAM_BY_KEY[key];
    const v = this.values[key];
    if (v === null && p.kind === 'range' && p.auto) return p.auto(this.values);
    return v as number;
  }

  get(key: string): Value {
    return this.values[key];
  }

  set(key: string, raw: unknown) {
    const p = PARAM_BY_KEY[key];
    if (!p) return;
    this.values[key] = sanitize(p, raw);
    this.save();
    this.emit(key);
  }

  setMany(vals: Values) {
    for (const [k, raw] of Object.entries(vals)) {
      const p = PARAM_BY_KEY[k];
      if (p) this.values[k] = sanitize(p, raw);
    }
    this.save();
    this.emit(null);
  }

  reset(key: string) {
    this.set(key, PARAM_BY_KEY[key].start);
  }

  resetAll() {
    this.values = startValues();
    try {
      window.localStorage.removeItem(STORE_KEY);
      window.localStorage.removeItem(OLD_STORE_KEY);
    } catch {
      // ignore
    }
    this.emit(null);
  }

  onChange(fn: (key: string | null) => void) {
    this.listeners.push(fn);
  }

  private emit(key: string | null) {
    for (const fn of this.listeners) fn(key);
  }

  private save() {
    try {
      // Only what differs from the start values, so a later change of a start value reaches untouched sliders.
      const changed: Values = {};
      for (const p of PARAMS) if (!same(this.values[p.key], p.start)) changed[p.key] = this.values[p.key];
      window.localStorage.setItem(STORE_KEY, JSON.stringify(changed));
    } catch {
      // Storage blocked: values live until the page closes.
    }
  }
}
