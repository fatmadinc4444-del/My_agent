/**
 * Skeleton of the character in bind pose (standing A-pose, feet on y=0,
 * facing +Z, +X = character's left). Every bone has identity rest rotation,
 * so local rotations computed by the pose solver are expressed in these
 * world-aligned axes, which keeps IK and mirroring trivial.
 */

export type BoneName = string;

export interface BoneDef {
  name: BoneName;
  parent: BoneName | null;
  /** bind-pose world position */
  pos: [number, number, number];
}

export const HEAD_CENTER: [number, number, number] = [0, 1.54, 0.02];

const A = Math.atan2(1.1, 1); // arm angle below horizontal
export const ARM_DIR_L: [number, number, number] = [Math.cos(A), -Math.sin(A), 0];
export const UPPER_ARM_LEN = 0.265;
export const FORE_ARM_LEN = 0.245;
export const THIGH_LEN = 0.41;
export const SHIN_LEN = 0.395;

export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const;
export type FingerName = (typeof FINGERS)[number];

/** Finger layout in the hand frame: x along fingers, y = back of hand, z = toward thumb. */
export const FINGER_LAYOUT: Record<FingerName, { base: [number, number, number]; dir: [number, number, number]; lens: number[]; r: number }> = {
  thumb: { base: [0.022, -0.006, 0.022], dir: [0.62, -0.32, 0.72], lens: [0.031, 0.025, 0.022], r: 0.0092 },
  index: { base: [0.08, 0.0, 0.022], dir: [1, 0, 0.06], lens: [0.032, 0.021, 0.019], r: 0.0082 },
  middle: { base: [0.084, 0.0, 0.006], dir: [1, 0, 0], lens: [0.035, 0.023, 0.02], r: 0.0085 },
  ring: { base: [0.08, 0.0, -0.01], dir: [1, 0, -0.05], lens: [0.033, 0.021, 0.019], r: 0.008 },
  pinky: { base: [0.074, -0.002, -0.024], dir: [1, 0, -0.12], lens: [0.026, 0.017, 0.016], r: 0.0072 },
};

const add = (a: number[], b: number[], s = 1): [number, number, number] => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const norm = (v: number[]): [number, number, number] => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Hand frame axes (bind pose) for the LEFT hand. Right hand = mirror in X. */
export const HAND_X: [number, number, number] = ARM_DIR_L;
export const HAND_Y: [number, number, number] = [Math.sin(A), Math.cos(A), 0];
export const HAND_Z: [number, number, number] = [0, 0, 1];

export function handToBind(wrist: number[], local: number[]): [number, number, number] {
  return [
    wrist[0] + HAND_X[0] * local[0] + HAND_Y[0] * local[1] + HAND_Z[0] * local[2],
    wrist[1] + HAND_X[1] * local[0] + HAND_Y[1] * local[1] + HAND_Z[1] * local[2],
    wrist[2] + HAND_X[2] * local[0] + HAND_Y[2] * local[1] + HAND_Z[2] * local[2],
  ];
}

function buildDefs(): BoneDef[] {
  const defs: BoneDef[] = [
    { name: 'root', parent: null, pos: [0, 0, 0] },
    { name: 'hips', parent: 'root', pos: [0, 0.9, 0] },
    { name: 'spine', parent: 'hips', pos: [0, 1.0, -0.006] },
    { name: 'chest', parent: 'spine', pos: [0, 1.14, -0.012] },
    { name: 'neck', parent: 'chest', pos: [0, 1.355, -0.016] },
    { name: 'head', parent: 'neck', pos: [0, 1.435, -0.004] },
    { name: 'jaw', parent: 'head', pos: [0, 1.518, 0.016] },
  ];
  const side = (s: 'L' | 'R', sx: number) => {
    // Everything is computed for the left side and mirrored in X for the right.
    const m = (v: number[]): [number, number, number] => [v[0] * sx, v[1], v[2]];
    const push = (name: string, parent: string, p: number[]) => defs.push({ name: `${name}.${s}`, parent: parent === 'chest' || parent === 'hips' ? parent : `${parent}.${s}`, pos: m(p) });
    const upper = [0.148, 1.288, -0.022];
    const fore = add(upper, ARM_DIR_L, UPPER_ARM_LEN);
    const hand = add(fore, ARM_DIR_L, FORE_ARM_LEN);
    push('shoulder', 'chest', [0.032, 1.315, -0.02]);
    push('upperArm', 'shoulder', upper);
    push('foreArm', 'upperArm', fore);
    push('hand', 'foreArm', hand);
    for (const f of FINGERS) {
      const L = FINGER_LAYOUT[f];
      let p = handToBind(hand, L.base);
      const d = norm(handToBind([0, 0, 0], L.dir));
      let parent = 'hand';
      for (let j = 0; j < 3; j++) {
        const name = `${f}${j + 1}`;
        push(name, parent, p);
        parent = name;
        p = add(p, d, L.lens[j]);
      }
    }
    push('thigh', 'hips', [0.093, 0.88, 0]);
    push('shin', 'thigh', [0.093, 0.88 - THIGH_LEN, 0.006]);
    push('foot', 'shin', [0.093, 0.88 - THIGH_LEN - SHIN_LEN, -0.012]);
    push('toes', 'foot', [0.093, 0.022, 0.105]);
  };
  side('L', 1);
  side('R', -1);
  return defs;
}

export const BONE_DEFS: BoneDef[] = buildDefs();
export const BONE_INDEX: Record<string, number> = Object.fromEntries(BONE_DEFS.map((b, i) => [b.name, i]));
export const bonePos = (n: BoneName) => BONE_DEFS[BONE_INDEX[n]].pos;
