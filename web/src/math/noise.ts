/**
 * Cheap deterministic noise used for procedural "life": fidgets, breathing
 * irregularity, wind gusts, hair jitter. 1D gradient noise + fBm.
 */

const PERM = new Uint8Array(512);
const GRAD = new Float32Array(256);
(() => {
  let s = 1337;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
  for (let i = 0; i < 256; i++) GRAD[i] = rnd() * 2 - 1;
})();

/** 1D gradient (Perlin) noise in [-1, 1] approx. */
export function noise1(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = GRAD[PERM[i & 255]] * f;
  const b = GRAD[PERM[(i + 1) & 255]] * (f - 1);
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  return 2 * (a + (b - a) * u);
}

/** fBm with `oct` octaves. */
export function fbm1(x: number, oct = 3): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += noise1(x) * amp;
    norm += amp;
    amp *= 0.5;
    x = x * 2.03 + 17.17;
  }
  return sum / norm;
}

/** Seeded PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Log-normal sample: natural for blink / saccade / fidget intervals. */
export function logNormal(r: () => number, median: number, sigma: number): number {
  const u1 = Math.max(1e-6, r());
  const u2 = r();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return median * Math.exp(sigma * z);
}
