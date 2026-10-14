/**
 * Rig-independent face state produced by the FaceController each frame.
 * Values are normalised 0..1 unless stated otherwise.
 */
export interface FaceFrame {
  /** jaw opening in radians (0..~0.35) */
  jaw: number;
  smile: number;
  frown: number;
  stretch: number;
  funnel: number;
  pucker: number;
  upperUp: number;
  lowerDown: number;
  rollLower: number;
  press: number;
  cheek: number;
  tongueUp: number;
  tongueOut: number;
  /** per side: [left, right] */
  browUp: [number, number];
  browInner: number;
  browDown: [number, number];
  /** eyelid closure 0 open .. 1 closed (blink + expression) */
  blink: number;
  squint: number;
  wide: number;
  /** additional upper-lid lowering (sad/sleepy) */
  lidDown: number;
  /** gaze in head space, radians */
  gazeYaw: number;
  gazePitch: number;
}

export function emptyFaceFrame(): FaceFrame {
  return {
    jaw: 0, smile: 0, frown: 0, stretch: 0, funnel: 0, pucker: 0, upperUp: 0, lowerDown: 0, rollLower: 0, press: 0, cheek: 0,
    tongueUp: 0, tongueOut: 0, browUp: [0, 0], browInner: 0, browDown: [0, 0], blink: 0, squint: 0, wide: 0, lidDown: 0, gazeYaw: 0, gazePitch: 0,
  };
}

export interface FaceRig {
  applyFace(f: FaceFrame): void;
  /** head-local frame used for gaze computations (eyes ~ at its origin + offset) */
  readonly gazeFrame: import('three').Object3D;
  /** eye centre in gazeFrame coordinates */
  readonly eyeOffset: import('three').Vector3;
}
