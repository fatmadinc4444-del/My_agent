import * as THREE from 'three';
import { getSpec, onSpecChange } from '../rig/spec';

/**
 * Authoring helper: "hand with fingers pointing along F, palm facing P".
 * Returns the world rotation (relative to bind, which is identity) for the
 * left or right hand. Directions are given in the same space as the result.
 */
const bindL = new THREE.Matrix4();
const bindR = new THREE.Matrix4();
const bindLInv = new THREE.Matrix4();
const bindRInv = new THREE.Matrix4();
function rebuild() {
  const S = getSpec();
  const mir = (v: THREE.Vector3) => new THREE.Vector3(-v.x, v.y, v.z);
  bindL.makeBasis(S.handX, S.handY.clone().negate(), S.handZ);
  bindR.makeBasis(mir(S.handX), mir(S.handY).negate(), mir(S.handZ));
  bindLInv.copy(bindL).transpose();
  bindRInv.copy(bindR).transpose();
}
rebuild();
onSpecChange(rebuild);
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
