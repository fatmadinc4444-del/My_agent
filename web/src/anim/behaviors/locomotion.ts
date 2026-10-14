import * as THREE from 'three';
import { C, setV } from '../controls';
import { hand, look, relaxedFingers, elbow } from './common';
import { smoothstep } from '../../math/spring';

/** Arc-length parameterised polyline path on the floor (Catmull-Rom smoothed). */
export class FloorPath {
  readonly curve: THREE.CatmullRomCurve3;
  readonly length: number;
  constructor(points: [number, number][]) {
    this.curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal', 0.5);
    this.length = this.curve.getLength();
  }
  at(s: number, out = new THREE.Vector3()) {
    return this.curve.getPointAt(THREE.MathUtils.clamp(s / this.length, 0, 1), out);
  }
  tangent(s: number, out = new THREE.Vector3()) {
    return this.curve.getTangentAt(THREE.MathUtils.clamp(s / this.length, 0, 1), out);
  }
}

const p = new THREE.Vector3();
const t = new THREE.Vector3();
const n = new THREE.Vector3();

/** world -> root space for an arbitrary root placement */
export function toRoot(w: THREE.Vector3Like, rx: number, rz: number, yaw: number, out = new THREE.Vector3()) {
  out.set(w.x - rx, w.y, w.z - rz);
  const c = Math.cos(-yaw);
  const s = Math.sin(-yaw);
  const x = out.x * c + out.z * s;
  const z = -out.x * s + out.z * c;
  out.x = x;
  out.z = z;
  return out;
}

export function standingBase(out: Float32Array, camera: THREE.Vector3) {
  setV(out, 'hipsPos', 0, 0.885, 0.0);
  setV(out, 'hipsRot', 0, 0, 0);
  setV(out, 'spine', 0.03, 0, 0);
  setV(out, 'head', 0, 0, 0);
  look(out, camera, 1);
  setV(out, 'shrug', 0, 0);
  setV(out, 'footL', 0.1, 0.075, 0.01);
  setV(out, 'footLr', 0.1, 0);
  setV(out, 'kneeL', 0.12, 0.5, 1.5);
  setV(out, 'footR', -0.1, 0.075, 0.01);
  setV(out, 'footRr', -0.1, 0);
  setV(out, 'kneeR', -0.12, 0.5, 1.5);
  hand(out, 'L', { x: 0.2, y: 0.84, z: 0.03 }, { x: 0.05, y: -1, z: 0.12 }, { x: -1, y: 0, z: 0.1 });
  hand(out, 'R', { x: -0.2, y: 0.84, z: 0.03 }, { x: -0.05, y: -1, z: 0.12 }, { x: 1, y: 0, z: 0.1 });
  relaxedFingers(out, 'L', 1.2);
  relaxedFingers(out, 'R', 1.2);
  elbow(out, 'L', 0.45, 1.0, -0.6);
  elbow(out, 'R', -0.45, 1.0, -0.6);
}

/** Phone held in front of the face while standing / walking (root space). */
export function phoneCarryPose(out: Float32Array, seated: boolean, time: number) {
  const y = seated ? 0.98 : 1.24;
  const z = seated ? 0.3 : 0.27;
  hand(out, 'L', { x: 0.07, y, z }, { x: -0.3, y: 0.75, z: 0.45 }, { x: -0.15, y: 0.5, z: -1 });
  const tap = 0.25 + 0.25 * Math.max(0, Math.sin(time * 7)) * Math.max(0, Math.sin(time * 1.1));
  setV(out, 'fingL', 0.45 + tap, 0.75, 0.8, 0.85, 0.9, 0);
  elbow(out, 'L', 0.5, seated ? 0.5 : 0.8, -0.2);
}

/**
 * Procedural walk along a FloorPath. Foot plants are fixed in WORLD space
 * during stance (converted to the moving root frame each frame), swing feet
 * follow an arc; hips bob at mid-stance, arms counter-swing.
 */
export class Gait {
  stepLen = 0.36;
  private yaw = 0;
  private yawV = 0;

  /** returns the root yaw used */
  write(out: Float32Array, path: FloorPath, s: number, speed: number, dt: number, camera: THREE.Vector3, carryPhone: boolean, time: number, finalYaw: number | null) {
    const stride = this.stepLen * 2;
    path.at(s, p);
    path.tangent(s, t);
    let goalYaw = Math.atan2(t.x, t.z);
    if (finalYaw !== null) goalYaw = finalYaw;
    // critically damped turn
    let d = goalYaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const goal = this.yaw + d;
    const y = 9;
    const j0 = this.yaw - goal;
    const j1 = this.yawV + j0 * y;
    const e = Math.exp(-y * dt);
    this.yaw = e * (j0 + j1 * dt) + goal;
    this.yawV = e * (this.yawV - j1 * y * dt);
    const yaw = this.yaw;
    setV(out, 'root', p.x, p.z, yaw);
    standingBase(out, camera);
    const moving = smoothstep(0.02, 0.25, speed);
    const ph = s / stride;
    // feet
    for (const [side, o, sign] of [
      ['L', 0, 1],
      ['R', 0.5, -1],
    ] as const) {
      const u = ph + o;
      const k = Math.floor(u);
      const f = u - k;
      const plantS = (nn: number) => (nn + 0.3 - o) * stride;
      let fs: number;
      let lift = 0;
      if (f < 0.6) fs = plantS(k);
      else {
        const tt = smoothstep(0, 1, (f - 0.6) / 0.4);
        fs = plantS(k) + (plantS(k + 1) - plantS(k)) * tt;
        lift = Math.sin(Math.PI * tt) * 0.075;
      }
      path.at(Math.max(0, fs), n);
      path.tangent(Math.max(0, fs), t);
      // lateral offset
      n.x += t.z * 0.095 * sign;
      n.z += -t.x * 0.095 * sign;
      n.y = 0.075 + lift * moving;
      const r = toRoot(n, p.x, p.z, yaw);
      // when standing still keep the default stance
      const o3 = side === 'L' ? C.footL : C.footR;
      out[o3] += (r.x - out[o3]) * moving;
      out[o3 + 1] += (r.y - out[o3 + 1]) * moving;
      out[o3 + 2] += (r.z - out[o3 + 2]) * moving;
      // toe-off pitch during swing
      if (f >= 0.6) out[(side === 'L' ? C.footLr : C.footRr) + 1] = -0.3 * Math.sin(Math.PI * (f - 0.6) / 0.4) * moving;
    }
    // hips & spine
    const bob = 0.014 * Math.cos(2 * Math.PI * 2 * (ph - 0.3));
    out[C.hipsPos + 1] += (bob - 0.01) * moving;
    out[C.hipsRot + 1] += 0.09 * Math.sin(2 * Math.PI * (ph - 0.3)) * moving;
    out[C.hipsRot + 2] += 0.035 * Math.sin(2 * Math.PI * (ph - 0.05)) * moving;
    out[C.spine] += 0.05 * moving;
    out[C.spine + 1] -= 0.1 * Math.sin(2 * Math.PI * (ph - 0.3)) * moving;
    // arm swing, opposite to the legs
    const sw = Math.sin(2 * Math.PI * (ph - 0.3)) * moving;
    out[C.handR + 2] += 0.12 * sw;
    out[C.handR + 1] += 0.02 * Math.abs(sw);
    if (carryPhone) phoneCarryPose(out, false, time);
    else {
      out[C.handL + 2] -= 0.12 * sw;
      out[C.handL + 1] += 0.02 * Math.abs(sw);
    }
    return yaw;
  }

  reset(yaw: number) {
    this.yaw = yaw;
    this.yawV = 0;
  }
}
