// The sounds: a short click per shot of yours, and (below) the dummies' footsteps and the shooter's shots. Made in the browser (a burst of noise through a high-pass filter); the
// audio starts on the first click or key press, as browsers require.

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
/** Clicks actually sent to the speakers (for the scripted checks). */
export let clicksPlayed = 0;

function ensure(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const len = Math.floor(ctx.sampleRate * 0.03);
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Call from a user gesture so the browser lets the audio start. */
export function unlockAudio() {
  ensure();
}

/** The audio's state, for the scripted checks: 'running', 'suspended', or 'none'. */
export function audioState(): string {
  return ctx ? ctx.state : 'none';
}

export function click(volume = CLICK_VOLUME) {
  const c = ensure();
  if (!c || !noise || c.state !== 'running') return;
  try {
    const src = c.createBufferSource();
    src.buffer = noise;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const g = c.createGain();
    g.gain.value = volume;
    src.connect(hp).connect(g).connect(c.destination);
    src.start();
    clicksPlayed++;
  } catch {
    // No sound is better than a stopped page.
  }
}

// The dummies' sounds (the owner's ask, 26 November): footsteps and the shooter's shots, heard from your soldier.
// Their volume follows the distance as Unreal's attenuation settings do: full inside the inner radius, nothing
// beyond the outer one, and a chosen falloff between. They are counted apart from your own shots' clicks.

export type FalloffCurve = 'linear' | 'log' | 'inverse';
/** The falloff shapes between the inner (u = 0) and the outer radius (u = 1), for the Export. */
export const FALLOFF_FORMULAS = {
  linear: '1 - u',
  log: '1 - log10(1 + 9 u)',
  inverse: '(1 - u) / (1 + 9 u)',
  u: '(distance - inner) / (outer - inner); 1 inside the inner radius, 0 beyond the outer',
};

/** How loud a sound is at a distance, from 1 (inside the inner radius) to 0 (beyond the outer). */
export function attenuation(distance: number, inner: number, outer: number, curve: FalloffCurve): number {
  if (distance <= inner) return 1;
  if (distance >= outer || outer <= inner) return 0;
  const u = (distance - inner) / (outer - inner);
  if (curve === 'log') return Math.max(0, 1 - Math.log10(1 + 9 * u));
  if (curve === 'inverse') return (1 - u) / (1 + 9 * u);
  return 1 - u;
}

/** Your own shot's click volume: the dummies' sound volumes are shares of it. */
export const CLICK_VOLUME = 0.25;
/** The dummies' sounds that were loud enough to be heard (sent to the speakers when the audio runs), by kind. */
export const worldSounds = { step: 0, gun: 0, last: { kind: '', gain: 0, pan: 0, distance: 0 } };

/** A dummy's sound at a gain (already attenuated) and a pan (-1 left to 1 right). */
export function worldSound(kind: 'step' | 'gun', gain: number, pan: number, distance: number) {
  if (gain <= 0) return;
  worldSounds[kind]++;
  worldSounds.last = { kind, gain, pan, distance };
  const c = ensure();
  if (!c || !noise || c.state !== 'running') return;
  try {
    const src = c.createBufferSource();
    src.buffer = noise;
    const f = c.createBiquadFilter();
    // A footstep is a dull thud, a shot the same bright click as yours.
    f.type = kind === 'step' ? 'lowpass' : 'highpass';
    f.frequency.value = kind === 'step' ? 650 : 1800;
    const g = c.createGain();
    g.gain.value = Math.min(1, gain);
    let out: AudioNode = src.connect(f).connect(g);
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      out = out.connect(p);
    }
    out.connect(c.destination);
    src.start();
  } catch {
    // No sound is better than a stopped page.
  }
}
