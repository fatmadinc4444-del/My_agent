import * as THREE from 'three';
import { HAND_X, HAND_Y, HAND_Z } from '../character/skeletonDef';

/**
 * Authoring helper: "hand with fingers pointing along F, palm facing P".
 * Returns the world rotation (relative to bind, which is identity) for the
 * left or right hand. Directions are given in the same space as the result.
 */
const bindL = new THREE.Matrix4().makeBasis(
  new THREE.Vector3(...HAND_X),
  new THREE.Vector3(...HAND_Y).negate(), // palm normal
  new THREE.Vector3(...HAND_Z),
);
const bindR = new THREE.Matrix4().makeBasis(
  new THREE.Vector3(-HAND_X[0], HAND_X[1], HAND_X[2]),
  new THREE.Vector3(-HAND_Y[0], HAND_Y[1], HAND_Y[2]).negate(),
  new THREE.Vector3(-HAND_Z[0], HAND_Z[1], HAND_Z[2]),
);
const bindLInv = bindL.clone().transpose();
const bindRInv = bindR.clone().transpose();
const m = new THREE.Matrix4();
const f = new THREE.Vector3();
const p = new THREE.Vector3();
const t = new THREE.Vector3();

export function handQuat(side: 'L' | 'R', fingers: THREE.Vector3Like, palm: THREE.Vector3Like, out = new THREE.Quaternion()): THREE.Quaternion {
  f.set(fingers.x, fingers.y, fingers.z).normalize();
  p.set(palm.x, palm.y, palm.z);
  p.addScaledVector(f, -p.dot(f)).normalize();
  // thumb direction with the same handedness as the bind basis:
  // left bind basis is (X, palm, palm x X), right is its mirror (X x palm)
  if (side === 'L') t.crossVectors(p, f);
  else t.crossVectors(f, p);
  m.makeBasis(f, p, t);
  m.multiply(side === 'L' ? bindLInv : bindRInv);
  return out.setFromRotationMatrix(m);
}
