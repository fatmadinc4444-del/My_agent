/**
 * Tiny signed-distance toolkit used to *sculpt* the stylised head in code.
 * The head surface is found by bisection along rays from an interior point,
 * so the mesh topology stays a clean polar grid (perfect for lips / morphs).
 */

export type V3 = [number, number, number];

export interface Ellipsoid {
  c: V3;
  r: V3;
  /** smooth-union radius with what came before */
  k: number;
  /** subtract instead of union */
  sub?: boolean;
  /** optional sweep vector: the ellipsoid is swept along c..c+ext (capsule-like) */
  ext?: V3;
}

/** Inigo Quilez' bound-preserving ellipsoid distance approximation. */
export function sdEllipsoid(px: number, py: number, pz: number, e: Ellipsoid): number {
  let x = px - e.c[0];
  let y = py - e.c[1];
  let z = pz - e.c[2];
  if (e.ext) {
    const ex = e.ext[0];
    const ey = e.ext[1];
    const ez = e.ext[2];
    let t = (x * ex + y * ey + z * ez) / (ex * ex + ey * ey + ez * ez);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    x -= ex * t;
    y -= ey * t;
    z -= ez * t;
  }
  const ax = x / e.r[0];
  const ay = y / e.r[1];
  const az = z / e.r[2];
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
  const bx = ax / e.r[0];
  const by = ay / e.r[1];
  const bz = az / e.r[2];
  const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  return (k0 * (k0 - 1)) / (k1 + 1e-9);
}

/** Polynomial smooth min (C1). */
export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

export function evalSdf(list: Ellipsoid[], x: number, y: number, z: number): number {
  let d = 1e9;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const di = sdEllipsoid(x, y, z, e);
    d = e.sub ? smax(d, -di, e.k) : smin(d, di, e.k);
  }
  return d;
}

/**
 * Distance along ray (o + t*d) to the zero level set, by bracketing + bisection.
 * The head is star-shaped w.r.t. the chosen origin, so a single crossing exists.
 */
export function rayToSurface(
  list: Ellipsoid[],
  o: V3,
  dx: number,
  dy: number,
  dz: number,
  tMax = 0.35,
  iters = 22,
): number {
  let lo = 0;
  let hi = tMax;
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) * 0.5;
    const d = evalSdf(list, o[0] + dx * mid, o[1] + dy * mid, o[2] + dz * mid);
    if (d < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) * 0.5;
}

/** Central-difference gradient (unnormalised surface normal). */
export function sdfNormal(list: Ellipsoid[], x: number, y: number, z: number, out: V3): V3 {
  const h = 0.0008;
  out[0] = evalSdf(list, x + h, y, z) - evalSdf(list, x - h, y, z);
  out[1] = evalSdf(list, x, y + h, z) - evalSdf(list, x, y - h, z);
  out[2] = evalSdf(list, x, y, z + h) - evalSdf(list, x, y, z - h);
  const l = Math.hypot(out[0], out[1], out[2]) + 1e-12;
  out[0] /= l;
  out[1] /= l;
  out[2] /= l;
  return out;
}
