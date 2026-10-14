/**
 * Critically damped springs (Daniel Holden, "Spring-It-On", 2021).
 * Exact closed-form integration: stable at any dt, frame-rate independent,
 * and never overshoots. All animation smoothing in the project goes through here.
 */

const LN2 = 0.69314718056;

/** halflife (s) -> damping coefficient y = 2*ln2/halflife ... divided by 2 for the critical case. */
export function halflifeToDamping(halflife: number): number {
  return (4 * LN2) / (halflife + 1e-5);
}

/** Fast, accurate approximation of exp(-x) for x >= 0 (Holden). */
export function fastNegExp(x: number): number {
  return 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
}

/** Frame-rate independent exponential smoothing factor. */
export function damper(halflife: number, dt: number): number {
  return 1 - fastNegExp((LN2 * dt) / (halflife + 1e-5));
}

/** Scalar critically damped spring towards `goal`, state stored in `s` (x, v). */
export class Spring1 {
  x: number;
  v = 0;
  constructor(x = 0, public halflife = 0.12) {
    this.x = x;
  }
  update(goal: number, dt: number): number {
    const y = halflifeToDamping(this.halflife) / 2;
    const j0 = this.x - goal;
    const j1 = this.v + j0 * y;
    const eydt = fastNegExp(y * dt);
    this.x = eydt * (j0 + j1 * dt) + goal;
    this.v = eydt * (this.v - j1 * y * dt);
    return this.x;
  }
  /** Jump to a value without velocity (hard reset). */
  reset(x: number) {
    this.x = x;
    this.v = 0;
  }
}

/**
 * Integrates a critically damped spring for every element of `x` towards `goal`.
 * Operates on flat typed arrays so a whole control rig (hundreds of channels)
 * is smoothed without allocations.
 */
export function springArray(
  x: Float32Array,
  v: Float32Array,
  goal: Float32Array,
  halflife: Float32Array | number,
  dt: number,
  start = 0,
  end = x.length,
) {
  const scalarY = typeof halflife === 'number' ? halflifeToDamping(halflife) / 2 : 0;
  for (let i = start; i < end; i++) {
    const y = typeof halflife === 'number' ? scalarY : halflifeToDamping(halflife[i]) / 2;
    const j0 = x[i] - goal[i];
    const j1 = v[i] + j0 * y;
    const eydt = fastNegExp(y * dt);
    x[i] = eydt * (j0 + j1 * dt) + goal[i];
    v[i] = eydt * (v[i] - j1 * y * dt);
  }
}

/**
 * Decay an offset and its velocity to zero (inertialization core).
 * Used by the animation graph: on every transition the difference between the
 * old and new pose is stored as an offset that decays here. The result is a
 * C1-continuous transition with no blending of two full graphs (cheaper and
 * visually invisible compared to a crossfade).
 */
export function decaySpringArray(
  off: Float32Array,
  vel: Float32Array,
  halflife: number,
  dt: number,
) {
  const y = halflifeToDamping(halflife) / 2;
  const eydt = fastNegExp(y * dt);
  for (let i = 0; i < off.length; i++) {
    const j1 = vel[i] + off[i] * y;
    off[i] = eydt * (off[i] + j1 * dt);
    vel[i] = eydt * (vel[i] - j1 * y * dt);
  }
}

export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Quintic smootherstep: zero 1st and 2nd derivative at both ends. */
export const smootherstep = (t: number) => {
  t = clamp(t, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const easeInOutSine = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
