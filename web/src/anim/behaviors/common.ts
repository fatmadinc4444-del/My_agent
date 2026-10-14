import * as THREE from 'three';
import { C, setV } from '../controls';
import { handQuat } from '../handFrame';
import { L, worldToRoot } from '../../scene/layout';

const q = new THREE.Quaternion();
const f = new THREE.Vector3();
const p = new THREE.Vector3();

export function hand(out: Float32Array, side: 'L' | 'R', pos: THREE.Vector3Like, fingers: THREE.Vector3Like, palm: THREE.Vector3Like) {
  handQuat(side, fingers, palm, q);
  if (side === 'L') {
    setV(out, 'handL', pos.x, pos.y, pos.z);
    setV(out, 'handLq', q.x, q.y, q.z, q.w);
  } else {
    setV(out, 'handR', pos.x, pos.y, pos.z);
    setV(out, 'handRq', q.x, q.y, q.z, q.w);
  }
}

export function fingers(out: Float32Array, side: 'L' | 'R', thumb: number, index: number, middle: number, ring: number, pinky: number, spread = 0) {
  setV(out, side === 'L' ? 'fingL' : 'fingR', thumb, index, middle, ring, pinky, spread);
}

export function relaxedFingers(out: Float32Array, side: 'L' | 'R', k = 1) {
  fingers(out, side, 0.25 * k, 0.28 * k, 0.36 * k, 0.42 * k, 0.48 * k, 0.1);
}

export function elbow(out: Float32Array, side: 'L' | 'R', x: number, y: number, z: number) {
  setV(out, side === 'L' ? 'elbowL' : 'elbowR', x, y, z);
}

export function look(out: Float32Array, target: THREE.Vector3Like, w = 1) {
  setV(out, 'look', target.x, target.y, target.z, w);
}

/** World point -> root space of the seated character. */
export function R(x: number, y: number, z: number): THREE.Vector3 {
  return worldToRoot(p.set(x, y, z), new THREE.Vector3());
}

/** Default seated pose (relaxed, both hands on the desk). */
export function seatedBase(out: Float32Array, camera: THREE.Vector3) {
  setV(out, 'root', L.chair.x, L.chair.z, 0);
  setV(out, 'hipsPos', 0, 0.565, -0.02);
  setV(out, 'hipsRot', -0.06, 0, 0);
  setV(out, 'spine', 0.16, 0, 0);
  setV(out, 'head', 0, 0, 0);
  look(out, camera, 1);
  setV(out, 'shrug', 0, 0);
  // feet flat under the desk
  setV(out, 'footL', 0.13, 0.08, 0.47);
  setV(out, 'footLr', 0.12, 0);
  setV(out, 'kneeL', 0.2, 0.6, 1.6);
  setV(out, 'footR', -0.13, 0.08, 0.45);
  setV(out, 'footRr', -0.1, 0);
  setV(out, 'kneeR', -0.2, 0.6, 1.6);
  // left hand resting on the notebook, right forearm on the desk
  hand(out, 'L', { x: 0.19, y: 0.768, z: 0.42 }, f.set(-0.45, -0.12, 1), { x: 0.1, y: -1, z: 0 });
  relaxedFingers(out, 'L');
  elbow(out, 'L', 0.7, 0.75, -0.4);
  hand(out, 'R', { x: -0.17, y: 0.766, z: 0.4 }, f.set(0.55, -0.1, 1), { x: -0.15, y: -1, z: 0 });
  relaxedFingers(out, 'R', 1.15);
  elbow(out, 'R', -0.7, 0.75, -0.4);
}

export function lerpInto(out: Float32Array, k: keyof typeof C, x: number, y: number, z: number, t: number) {
  const o = C[k];
  out[o] += (x - out[o]) * t;
  out[o + 1] += (y - out[o + 1]) * t;
  out[o + 2] += (z - out[o + 2]) * t;
}
