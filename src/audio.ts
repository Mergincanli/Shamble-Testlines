// The one sound: a short click per shot. Made in the browser (a burst of noise through a high-pass filter); the
// audio starts on the first click or key press, as browsers require.

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

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

export function click(volume = 0.25) {
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
  } catch {
    // No sound is better than a stopped page.
  }
}
