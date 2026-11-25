// The Export: every current value as JSON, with the date, the build it came from (step and commit), units in the
// names, the old game's own names beside them, and the values that differ from their start values, so the numbers
// can be handed to the Advisor and the game's builder as they are. Its format has a name and a version, and Import
// reads it back (readExport below).
import { GRID_COLOURS, GRID_LOOK } from './look';
import { ROOM_LAYOUT } from './metrics';
import { HORNET } from './hornet';
import { AIM_DEAD_ZONE, HEIGHT_GRACE, HIT_HEIGHT, HIT_RADIUS, SHOT_HEIGHT } from './weapons';
import { EXPLOSION_MAX_STRETCH, EXPLOSION_POOL, EXPLOSION_SHEET } from './explosion';
import { builtOpening, CAMERA_PRESETS, CAMERA_PROFILES, GROUPS, PARAMS, profileActive, type Param, type Store, type Value, type Values } from './params';

export const BUILD = { step: 'E', name: 'Export fit for the hand-over to the game' };
/** The Export's format: Import reads only this name and version. */
export const EXPORT_FORMAT = 'testlines-export';
export const EXPORT_FORMAT_VERSION = 1;
/** The commit the page was built from (vite.config.ts writes it in): a full id, "<id>-dirty", or "unknown". */
export const BUILD_COMMIT: string = __BUILD_COMMIT__;
/** The game's simulation steps this many times a second. */
export const GAME_STEP_RATE = 30;

/** Where each value sits in the Export: its group's export name and its own export name. */
const EXPORT_PATH = new Map<string, Param>();
for (const g of GROUPS) {
  for (const p of PARAMS.filter((q) => q.group === g.id)) {
    const path = `${g.exportName}.${p.exportKey}`;
    // Two values under one name would overwrite each other in the Export and on Import.
    if (EXPORT_PATH.has(path)) console.error(`Export: two values under ${path}`);
    EXPORT_PATH.set(path, p);
  }
}

/** One value as the Export writes it. */
function exportValue(p: Param, v: Value): unknown {
  if (p.kind === 'range') return v === null ? 'auto' : round(v as number, Math.max(p.digits, 3));
  if (p.kind === 'choice' && (p.key === 'tickRate' || p.key === 'gridStep')) return Number(v);
  return v;
}

/** The warning line when the step rate is not the game's, or null. */
export function stepRateWarning(store: Store): string | null {
  const rate = Number(store.get('tickRate'));
  return rate === GAME_STEP_RATE ? null : `The step rate is ${rate} steps a second: the game runs at ${GAME_STEP_RATE}.`;
}

/** Measured at the last frame (set by the main loop): the soldier's height and his size on screen. */
export const MEASURED = { soldierHeightM: 0, soldierOnScreenPx: 0, viewHeightPx: 0 };

function localStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const oh = pad(Math.floor(Math.abs(off) / 60));
  const om = pad(Math.abs(off) % 60);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} (UTC${sign}${oh}:${om})`
  );
}

function round(n: number, digits = 4): number {
  return Number(n.toFixed(digits));
}

export function buildExport(store: Store): string {
  const now = new Date();
  const values: Record<string, Record<string, unknown>> = {};
  for (const g of GROUPS) {
    const out: Record<string, unknown> = {};
    for (const p of PARAMS.filter((q) => q.group === g.id)) out[p.exportKey] = exportValue(p, store.get(p.key));
    values[g.exportName] = out;
  }
  // Every value that differs from its start value (as written in the Export), with both.
  const changedFromStart: { group: string; name: string; label: string; start: unknown; current: unknown }[] = [];
  for (const g of GROUPS) {
    for (const p of PARAMS.filter((q) => q.group === g.id)) {
      const start = exportValue(p, p.start);
      const current = exportValue(p, store.get(p.key));
      if (JSON.stringify(start) !== JSON.stringify(current)) changedFromStart.push({ group: g.exportName, name: p.exportKey, label: p.label, start, current });
    }
  }
  const warning = stepRateWarning(store);

  const n = (k: string) => store.num(k);
  const rise = Math.max(0.01, n('jumpReach') - n('stepUp'));
  const jumpV = Math.sqrt(2 * n('gravity') * rise);
  const derived = {
    sprint_speed_m_per_s: round(n('walkSpeed') * n('sprintMult'), 3),
    speed_up_rate_per_s: round(Math.log(10) / n('accelTime'), 3),
    stop_rate_per_s: round(Math.log(10) / n('stopTime'), 3),
    jump_rise_m: round(rise, 3),
    jump_takeoff_speed_m_per_s: round(jumpV, 3),
    jump_airtime_s: round((2 * jumpV) / n('gravity'), 3),
    camera_view_angle_at_rest_deg: round(n('camAngle'), 2),
    camera_angle_to_the_feet_deg: round((Math.atan2(n('camHeight'), Math.max(0.001, n('camBack'))) * 180) / Math.PI, 2),
    camera_straight_distance_m: round(Math.hypot(n('camHeight'), n('camBack')), 2),
    metrics_room_built: (() => {
      const d = builtOpening(store.values, 'door');
      const w = builtOpening(store.values, 'window');
      return {
        door_width_m: round(d.width, 3),
        door_height_m: round(d.height, 3),
        window_width_m: round(w.width, 3),
        window_sill_m: round(w.sill, 3),
        window_height_m: round(w.height, 3),
        stair_height_m: round(n('stairRise') * Math.round(n('stairSteps')), 3),
        stair_angle_deg: round((Math.atan2(n('stairRise'), n('stairTread')) * 180) / Math.PI, 1),
        note: 'The sizes as built: a slider asking for more than its wall allows is held back (see layout).',
      };
    })(),
  };

  // The old game's names, for the values that have one (radians where the old game used radians).
  const gameTerms: Record<string, number> = {
    'T.moveSpeed': round(n('walkSpeed'), 3),
    'UNIT_TYPES.conscript.sprintMult': round(n('sprintMult'), 4),
    'T.accel (speed-up)': derived.speed_up_rate_per_s,
    'T.accel (stop)': derived.stop_rate_per_s,
    'T.gravity': round(n('gravity'), 3),
    'T.jumpV': derived.jump_takeoff_speed_m_per_s,
    'T.stepUp': round(n('stepUp'), 3),
    EJUMP_REACH: round(n('jumpReach'), 4),
    'STAM.max': round(n('staminaTime'), 3),
    'STAM.regen': round(1 / n('staminaRefill'), 4),
    'STAM.lockUntil': round(n('staminaUnlock') / 100, 3),
    'T.camHeight': round(n('camHeight'), 3),
    'T.camBack': round(n('camBack'), 3),
    'T.fov': round(n('camLens'), 3),
    'T.camYawBase': round((n('camTurn') * Math.PI) / 180, 6),
    'T.camYawSens': round(n('mouseSens'), 5),
    'T.camYawLerp': round(n('turnRate'), 3),
    'T.camLerp': round(n('camFollow'), 3),
    'T.lookLerp': round(n('lookFollow'), 3),
    'T.camDeadX': round(n('deadX'), 3),
    'T.camDeadY': round(n('deadY'), 3),
    'T.camPushLerp': round(n('pushRate'), 3),
    'T.lookAheadBase': round(n('lookBase'), 3),
    'T.lookAheadFloor': round(n('lookMin'), 3),
    'T.lookAheadHip': round(n('lookMax'), 3),
    'T.lookFwdGain': round(n('lookGain'), 3),
    'T.lookFwdRange': round(n('lookFwdRange'), 3),
    'T.lookBackRange': round(n('lookBackRange'), 3),
    'T.lookSideMax': round(n('lookSideMax'), 3),
    'T.posFwdMax': round(n('posFwdMax'), 3),
    'T.posBackMax': round(n('posBackMax'), 3),
    'T.posSideMax': round(n('posSideMax'), 3),
  };

  // Every other value that has an old-game name (the guns, the dummies) goes in under that name.
  for (const p of PARAMS) {
    if (p.kind !== 'range' || !p.legacy || p.legacy in gameTerms) continue;
    const v = store.get(p.key);
    if (typeof v === 'number') gameTerms[p.legacy] = round(v, 5);
  }

  const doc = {
    format: EXPORT_FORMAT,
    format_version: EXPORT_FORMAT_VERSION,
    what: 'Shamble Testlines feel values',
    note: 'Sandbox values, not decisions. Start values are the old game\'s numbers unless the sandbox says otherwise.',
    build: `step ${BUILD.step} (${BUILD.name})`,
    build_commit: BUILD_COMMIT,
    camera_profile:
      [...CAMERA_PROFILES, ...CAMERA_PRESETS].find((p) => profileActive(p.values, store.values))?.name ?? 'custom',
    exported: localStamp(now),
    exported_utc: now.toISOString(),
    warnings: warning ? [warning] : [],
    values,
    changed_from_start: changedFromStart,
    derived,
    constants: {
      metrics_room_layout: ROOM_LAYOUT,
      hornet: HORNET,
      grid_look: { ...GRID_LOOK, colours: GRID_COLOURS },
      shot_geometry: {
        gun_height_m: SHOT_HEIGHT,
        hit_cylinder_radius_m: HIT_RADIUS,
        hit_cylinder_height_m: HIT_HEIGHT,
        level_shot_height_grace_m: HEIGHT_GRACE,
        aim_dead_zone_m: AIM_DEAD_ZONE,
        note: 'Shots leave from the gun height above the feet; a dummy is hit inside the upright cylinder from its feet. Level shots still count within the grace above its head or below its feet. Aiming at the point, an aim point closer than the dead zone (on the ground) keeps the aim the soldier had.',
      },
      explosion_sheet: {
        ...EXPLOSION_SHEET,
        drawn_at_once: EXPLOSION_POOL,
        max_stretch: EXPLOSION_MAX_STRETCH,
        note: "The owner's sheet, keyed at build time by tools/key-sheet.mjs: the key colour is the measured mean of the flat blue background; cover below the noise floor is clear. The anchor (ground line from the top, middle from the left, as shares of a frame) is measured on the sheet and sits on the burst point. Frames play in reading order, in even steps. The picture stands upright, turned toward the camera, stretched up by 1 / cos of the camera's height angle over it (at most max_stretch).",
      },
    },
    measured: {
      soldier_height_m: round(MEASURED.soldierHeightM, 3),
      soldier_on_screen_px: round(MEASURED.soldierOnScreenPx, 1),
      view_height_px: round(MEASURED.viewHeightPx, 0),
      soldier_share_of_view_height: round(MEASURED.viewHeightPx > 0 ? MEASURED.soldierOnScreenPx / MEASURED.viewHeightPx : 0, 4),
      note: 'At the camera in use when exported, from the steady camera (no shake); pixels are CSS pixels.',
    },
    old_game_terms: gameTerms,
  };
  return JSON.stringify(doc, null, 2);
}

/** One value as Import reads it back, or undefined when the slider cannot take it. */
function importValue(p: Param, raw: unknown): Value | undefined {
  if (p.kind === 'range') {
    if (raw === 'auto') return p.auto ? null : undefined;
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < p.min - 1e-9 || raw > p.max + 1e-9) return undefined;
    return Math.min(p.max, Math.max(p.min, raw));
  }
  if (p.kind === 'choice') {
    // (The step rate and the grid step are written as numbers.)
    const s = typeof raw === 'number' ? String(raw) : raw;
    return typeof s === 'string' && p.options.some((o) => o.value === s) ? s : undefined;
  }
  return typeof raw === 'boolean' ? raw : undefined;
}

export type ImportRead =
  | { ok: true; values: Values; build: string; commit: string; exported: string; missing: string[]; unknown: string[] }
  | { ok: false; reason: string };

/**
 * Read an Export back for Import. Only this format name and version are read; every value must be one its slider
 * takes, or nothing is taken. Values missing from the file are left as they are; names this page does not know
 * are passed over (both are listed).
 */
export function readExport(text: string): ImportRead {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'the file is not an Export (it is not JSON).' };
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { ok: false, reason: 'the file is not an Export.' };
  const d = doc as Record<string, unknown>;
  const short = (v: unknown) => {
    const t = JSON.stringify(v) ?? String(v);
    return t.length > 40 ? `${t.slice(0, 40)}...` : t;
  };
  if (d.format !== EXPORT_FORMAT || d.format_version !== EXPORT_FORMAT_VERSION) {
    const what = d.format === undefined ? 'no format name (an Export from before step E, or another file)' : `format ${short(d.format)} version ${short(d.format_version)}`;
    return { ok: false, reason: `the file has ${what}; this page reads "${EXPORT_FORMAT}" version ${EXPORT_FORMAT_VERSION}.` };
  }
  const groups = d.values;
  if (!groups || typeof groups !== 'object' || Array.isArray(groups)) return { ok: false, reason: 'the file has no values.' };
  const values: Values = {};
  const missing: string[] = [];
  const bad: string[] = [];
  for (const [path, p] of EXPORT_PATH) {
    const [g, k] = path.split('.');
    const gv = (groups as Record<string, unknown>)[g];
    if (gv === undefined || (gv && typeof gv === 'object' && !Array.isArray(gv) && !Object.prototype.hasOwnProperty.call(gv, k))) {
      missing.push(path);
      continue;
    }
    // A group that is there but holds no values (a word, a list, nothing) is not something this page can take.
    if (!gv || typeof gv !== 'object' || Array.isArray(gv)) {
      bad.push(`${g} = ${short(gv)}`);
      continue;
    }
    const raw = (gv as Record<string, unknown>)[k];
    const v = importValue(p, raw);
    if (v === undefined) bad.push(`${path} = ${short(raw)}`);
    else values[p.key] = v;
  }
  if (bad.length) {
    const list = [...new Set(bad)];
    return { ok: false, reason: `${list.length} value${list.length > 1 ? 's' : ''} this page cannot take: ${list.slice(0, 3).join(', ')}${list.length > 3 ? ', ...' : ''}.` };
  }
  if (!Object.keys(values).length) return { ok: false, reason: 'the file holds none of the values this page has.' };
  const unknown: string[] = [];
  for (const [g, gv] of Object.entries(groups as Record<string, unknown>)) {
    if (gv && typeof gv === 'object') for (const k of Object.keys(gv)) if (!EXPORT_PATH.has(`${g}.${k}`)) unknown.push(`${g}.${k}`);
  }
  return {
    ok: true,
    values,
    build: typeof d.build === 'string' ? d.build : 'an unnamed build',
    commit: typeof d.build_commit === 'string' ? d.build_commit : 'unknown',
    exported: typeof d.exported === 'string' ? d.exported : 'an unknown time',
    missing,
    unknown,
  };
}

/**
 * The values an Import puts in the panel. The Export rounds (to 3 decimals or the slider's own digits), so a value
 * whose rounded form is the current value's stays exactly as it is, and one whose rounded form is its start value's
 * becomes exactly the start value: an Import of an Export gives back the very values it was made from, and nudges
 * no value by rounding.
 */
export function settleImported(values: Values, store: Store): Values {
  const out: Values = {};
  for (const [k, v] of Object.entries(values)) {
    const p = PARAMS.find((q) => q.key === k);
    if (!p) continue;
    const shown = JSON.stringify(exportValue(p, v));
    if (shown === JSON.stringify(exportValue(p, store.get(k)))) out[k] = store.get(k);
    else if (shown === JSON.stringify(exportValue(p, p.start))) out[k] = p.start;
    else out[k] = v;
  }
  return out;
}

/** Copy to the clipboard; returns false when the browser refuses (the text box is shown either way). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the old way
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.userSelect = 'text';
    ta.style.setProperty('-webkit-user-select', 'text');
    document.body.appendChild(ta);
    ta.select();
    const selected = ta.selectionEnd - ta.selectionStart === text.length;
    const ok = selected && document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
