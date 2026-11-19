// A damped spring solved exactly over a step (x'' = -k x - c x'), so it is stable at any step rate and swings the
// same at 30 or 60 steps a second: the grenade's camera kick and the Hornet's lean.

/** Advance a damped spring (x'' = -k x - c x') by dt exactly: stable at any step rate, and the same swing at 30 or 60. */
export function springStep(x: number, v: number, k: number, c: number, dt: number): [number, number] {
  const g = c / 2;
  const w2 = k - g * g;
  if (w2 > 1e-9) {
    const w = Math.sqrt(w2);
    const e = Math.exp(-g * dt);
    const cs = Math.cos(w * dt);
    const sn = Math.sin(w * dt);
    return [e * (x * cs + ((v + g * x) / w) * sn), e * (v * cs - ((g * v + k * x) / w) * sn)];
  }
  if (w2 < -1e-9) {
    const s = Math.sqrt(-w2);
    const r1 = -g + s;
    const r2 = -g - s;
    const a = (v - r2 * x) / (r1 - r2);
    const b = x - a;
    const e1 = Math.exp(r1 * dt);
    const e2 = Math.exp(r2 * dt);
    return [a * e1 + b * e2, r1 * a * e1 + r2 * b * e2];
  }
  const e = Math.exp(-g * dt);
  const q = v + g * x;
  return [(x + q * dt) * e, (v - g * q * dt) * e];
}
