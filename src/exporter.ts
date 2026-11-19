// The Export: every current value as JSON, with the date, the build it came from, units in the names, and the
// old game's own names beside them, so the numbers can be handed to the Advisor as they are.
import { GRID_COLOURS, GRID_LOOK } from './look';
import { ROOM_LAYOUT } from './metrics';
import { HORNET } from './hornet';
import { builtOpening, CAMERA_PRESETS, CAMERA_PROFILES, GROUPS, PARAMS, profileActive, type Store } from './params';

export const BUILD = { step: 'B', name: 'Hornet' };

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

const round = (n: number, digits = 4) => Number(n.toFixed(digits));

export function buildExport(store: Store): string {
  const now = new Date();
  const values: Record<string, Record<string, unknown>> = {};
  for (const g of GROUPS) {
    const out: Record<string, unknown> = {};
    for (const p of PARAMS.filter((q) => q.group === g.id)) {
      const v = store.get(p.key);
      if (p.kind === 'range') {
        out[p.exportKey] = v === null ? 'auto' : round(v as number, Math.max(p.digits, 3));
      } else if (p.kind === 'choice' && (p.key === 'tickRate' || p.key === 'gridStep')) {
        out[p.exportKey] = Number(v);
      } else {
        out[p.exportKey] = v;
      }
    }
    values[g.exportName] = out;
  }

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
    what: 'Shamble Testlines feel values',
    note: 'Sandbox values, not decisions. Start values are the old game\'s numbers unless the sandbox says otherwise.',
    build: `step ${BUILD.step} (${BUILD.name})`,
    camera_profile:
      [...CAMERA_PROFILES, ...CAMERA_PRESETS].find((p) => profileActive(p.values, store.values))?.name ?? 'custom',
    exported: localStamp(now),
    exported_utc: now.toISOString(),
    values,
    derived,
    constants: {
      metrics_room_layout: ROOM_LAYOUT,
      hornet: HORNET,
      grid_look: { ...GRID_LOOK, colours: GRID_COLOURS },
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
