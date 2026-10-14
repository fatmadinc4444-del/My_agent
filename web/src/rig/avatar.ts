import type * as THREE from 'three';
import type { FaceRig } from './faceRig';
import type { SkeletonSpec } from './spec';

/** What the app needs from a character, procedural or artist-made. */
export interface Avatar extends FaceRig {
  readonly root: THREE.Object3D;
  /** canonical (virtual) bones the solver poses; props attach to these */
  readonly bones: Record<string, THREE.Bone>;
  readonly spec: SkeletonSpec;
  /** object used for tap hit-testing on the character */
  readonly hitTarget: THREE.Object3D;
  postUpdate(dt: number, time: number, wind: THREE.Vector3): void;
  setKeyLight?(pos: THREE.Vector3): void;
}
