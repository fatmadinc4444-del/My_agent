/**
 * The control rig as a flat Float32Array ("control vector").
 *
 * Every behaviour writes a full control vector; the graph blends /
 * inertialises vectors generically, additive layers add to it, and the pose
 * solver turns it into bone rotations with IK. Because everything is just
 * floats, transitions between ANY two behaviours are free and seamless.
 *
 * Spaces: positions are in "root space" (the character's floor frame:
 * origin between the feet, +Z forward) except `look`, which is world space.
 */

const layout = {
  root: 3, // x, z, yaw (world)
  hipsPos: 3,
  hipsRot: 3, // pitch, yaw, roll
  spine: 3, // pitch (forward +), yaw, roll — distributed over spine/chest
  head: 3, // additive pitch, yaw, roll on top of look-at
  look: 4, // world target xyz + weight
  shrug: 2, // L, R (radians, + = up)
  handL: 3,
  handLq: 4, // world-relative-to-bind quaternion (x,y,z,w) in root space
  elbowL: 3, // pole (root space)
  handR: 3,
  handRq: 4,
  elbowR: 3,
  fingL: 6, // thumb, index, middle, ring, pinky curl (0..1), spread (-1..1)
  fingR: 6,
  footL: 3,
  footLr: 2, // yaw, pitch
  kneeL: 3,
  footR: 3,
  footRr: 2,
  kneeR: 3,
} as const;

export type ControlKey = keyof typeof layout;

export const C = {} as Record<ControlKey, number>;
let off = 0;
for (const k of Object.keys(layout) as ControlKey[]) {
  C[k] = off;
  off += layout[k];
}
export const CONTROL_SIZE = off;

/** Channel ranges that hold quaternions (re-normalised after blending). */
export const QUAT_CHANNELS = [C.handLq, C.handRq];

export function newControls(): Float32Array {
  return new Float32Array(CONTROL_SIZE);
}

export function setV(c: Float32Array, k: ControlKey, ...v: number[]) {
  c.set(v, C[k]);
}

/** Keep quaternions in the same hemisphere as a reference & normalised. */
export function fixQuats(c: Float32Array, ref?: Float32Array) {
  for (const o of QUAT_CHANNELS) {
    if (ref) {
      const d = c[o] * ref[o] + c[o + 1] * ref[o + 1] + c[o + 2] * ref[o + 2] + c[o + 3] * ref[o + 3];
      if (d < 0) for (let i = 0; i < 4; i++) c[o + i] = -c[o + i];
    }
    const l = Math.hypot(c[o], c[o + 1], c[o + 2], c[o + 3]) || 1;
    for (let i = 0; i < 4; i++) c[o + i] /= l;
  }
}
