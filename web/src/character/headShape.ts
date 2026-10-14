import type { Ellipsoid, V3 } from './sdf';

/**
 * Art direction for the stylised (feature-animation style) teenage boy head.
 * All values are in head-local metres: origin = head centre, +Y up,
 * +Z forward (nose direction), +X = the character's left.
 */

export const EYE_R = 0.026;
export const EYE_L_CENTER: V3 = [0.043, 0.012, 0.0985];
export const EYE_R_CENTER: V3 = [-0.043, 0.012, 0.0985];
export const RAY_ORIGIN: V3 = [0, -0.012, 0.0];
export const MOUTH_TARGET: V3 = [0, -0.061, 0.118];
export const JAW_PIVOT: V3 = [0, -0.022, -0.004];
export const EAR_L: V3 = [0.114, -0.006, -0.008];

const mirror = (e: Ellipsoid): Ellipsoid => ({ ...e, c: [-e.c[0], e.c[1], e.c[2]], ext: e.ext ? [-e.ext[0], e.ext[1], e.ext[2]] : undefined });

const cheekL: Ellipsoid = { c: [0.047, -0.028, 0.072], r: [0.033, 0.03, 0.034], k: 0.032 };
const alaL: Ellipsoid = { c: [0.0155, -0.0295, 0.116], r: [0.0115, 0.0095, 0.011], k: 0.01 };
const jawCornerL: Ellipsoid = { c: [0.062, -0.066, 0.0], r: [0.028, 0.038, 0.048], k: 0.04 };
const socketL: Ellipsoid = {
  c: [EYE_L_CENTER[0], EYE_L_CENTER[1] + 0.001, EYE_L_CENTER[2] - 0.001],
  r: [0.0266, 0.0262, 0.0266],
  k: 0.008,
  sub: true,
  // swept outwards so the socket opens to the outside: keeps the head
  // star-shaped from RAY_ORIGIN (single surface crossing per ray, no jaggies)
  ext: [0.043 * 0.6, 0.024 * 0.6, 0.0985 * 0.6],
};

export const HEAD_SDF: Ellipsoid[] = [
  { c: [0, 0.03, -0.014], r: [0.115, 0.121, 0.127], k: 0 }, // cranium
  { c: [0, -0.018, 0.024], r: [0.09, 0.09, 0.094], k: 0.045 }, // mid face
  { c: [0, -0.068, 0.03], r: [0.058, 0.054, 0.076], k: 0.045 }, // jaw mass
  jawCornerL,
  mirror(jawCornerL),
  { c: [0, -0.104, 0.074], r: [0.027, 0.026, 0.03], k: 0.028 }, // chin
  cheekL,
  mirror(cheekL),
  { c: [0, -0.056, 0.088], r: [0.042, 0.034, 0.04], k: 0.03 }, // muzzle
  { c: [0, 0.047, 0.082], r: [0.086, 0.021, 0.04], k: 0.03 }, // brow ridge
  { c: [0, 0.004, 0.11], r: [0.0115, 0.03, 0.016], k: 0.02 }, // nose bridge
  { c: [0, -0.021, 0.126], r: [0.0185, 0.0165, 0.0165], k: 0.016 }, // nose tip
  alaL,
  mirror(alaL),
  socketL,
  mirror(socketL),
];

/** Scalp region for the hair cap, a slightly inflated cranium. */
export const SCALP_SDF: Ellipsoid[] = [
  { c: [0, 0.034, -0.016], r: [0.121, 0.127, 0.133], k: 0 },
  { c: [0, 0.05, 0.04], r: [0.104, 0.088, 0.09], k: 0.04 },
];
