import * as THREE from 'three';
import { C } from './controls';
export interface Posable {
  bones: Record<string, THREE.Bone>;
}
import { FINGERS } from '../character/skeletonDef';
import { getSpec } from '../rig/spec';

/**
 * Control vector -> skeleton.
 *  - spine / neck / head: distributed FK + clamped look-at
 *  - arms & legs: analytic two-bone IK with pole vectors, frame alignment
 *    (no drift, exact reach), half of the hand roll moved into the forearm
 *    (swing-twist) to avoid candy-wrapper wrists
 *  - fingers: curl/spread FK
 * Allocation free per frame.
 */

const bindPos = (n: string) => getSpec().pos[n].clone();

interface Limb {
  a: THREE.Bone;
  b: THREE.Bone;
  c: THREE.Bone;
  L1: number;
  L2: number;
  restX: THREE.Vector3; // bind direction of the chain
  restF: THREE.Vector3; // bind fold direction (where the 2nd segment folds to)
  restFrame: THREE.Matrix4; // inverse of bind frame
}

function makeLimb(ch: Posable, a: string, b: string, c: string, fold: THREE.Vector3): Limb {
  const pa = bindPos(a);
  const pb = bindPos(b);
  const pc = bindPos(c);
  const restX = pb.clone().sub(pa).normalize();
  const restF = fold.clone().addScaledVector(restX, -fold.dot(restX)).normalize();
  const z = new THREE.Vector3().crossVectors(restX, restF);
  const restFrame = new THREE.Matrix4().makeBasis(restX, restF, z).transpose();
  return { a: ch.bones[a], b: ch.bones[b], c: ch.bones[c], L1: pa.distanceTo(pb), L2: pb.distanceTo(pc), restX, restF, restFrame };
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _pa = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _bend = new THREE.Vector3();
const _n = new THREE.Vector3();
const _x = new THREE.Vector3();
const _f = new THREE.Vector3();
const _z = new THREE.Vector3();
const _elbow = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _qTw = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _s = new THREE.Vector3();

function worldQuat(o: THREE.Object3D, out: THREE.Quaternion) {
  o.matrixWorld.decompose(_v3, out, _s);
  return out;
}

/** Set a bone's world rotation (parent matrices must be current). */
function setWorldQuat(bone: THREE.Bone, q: THREE.Quaternion) {
  worldQuat(bone.parent!, _qp);
  bone.quaternion.copy(_qp.invert().multiply(q));
  bone.updateMatrixWorld(false);
}

export class PoseSolver {
  private armL: Limb;
  private armR: Limb;
  private legL: Limb;
  private legR: Limb;
  private fingerAxes: Record<string, { flex: THREE.Vector3; spread: THREE.Vector3 }> = {};
  private rootM = new THREE.Matrix4();
  private rootQ = new THREE.Quaternion();
  /** world-space positions of the hands, for props/IK users */
  readonly handWorld = { L: new THREE.Vector3(), R: new THREE.Vector3() };
  /** optional stylisation: shorten the neck (metres, negative = shorter) */
  neckOffset = 0;
  private neckRestY: number;

  constructor(private ch: Posable) {
    this.neckRestY = ch.bones['neck'].position.y;
    this.armL = makeLimb(ch, 'upperArm.L', 'foreArm.L', 'hand.L', new THREE.Vector3(0, 0, 1));
    this.armR = makeLimb(ch, 'upperArm.R', 'foreArm.R', 'hand.R', new THREE.Vector3(0, 0, 1));
    this.legL = makeLimb(ch, 'thigh.L', 'shin.L', 'foot.L', new THREE.Vector3(0, 0, -1));
    this.legR = makeLimb(ch, 'thigh.R', 'shin.R', 'foot.R', new THREE.Vector3(0, 0, -1));
    for (const s of ['L', 'R'] as const) {
      const m = s === 'L' ? 1 : -1;
      const S = getSpec();
      const hz = new THREE.Vector3(S.handZ.x * m, S.handZ.y, S.handZ.z);
      const hy = new THREE.Vector3(S.handY.x * m, S.handY.y, S.handY.z);
      for (const f of FINGERS) {
        if (f === 'thumb') {
          const td = new THREE.Vector3(S.thumbDir.x * m, S.thumbDir.y, S.thumbDir.z);
          // thumb flexes across the palm
          const flex = new THREE.Vector3().crossVectors(td, hy.clone().negate()).normalize().multiplyScalar(-m);
          this.fingerAxes[`thumb.${s}`] = { flex, spread: hy.clone().multiplyScalar(m) };
        } else {
          // left: flexion = rotation about hand Z by -angle; mirrored for the right
          this.fingerAxes[`${f}.${s}`] = { flex: hz.clone().multiplyScalar(-m), spread: hy.clone().multiplyScalar(m) };
        }
      }
    }
  }

  apply(c: Float32Array) {
    const B = this.ch.bones;
    // ---- root
    const root = B['root'];
    root.position.set(c[C.root], 0, c[C.root + 1]);
    root.quaternion.setFromAxisAngle(_v1.set(0, 1, 0), c[C.root + 2]);
    // ---- hips & spine
    B['hips'].position.set(c[C.hipsPos], c[C.hipsPos + 1], c[C.hipsPos + 2]);
    _e.set(c[C.hipsRot], c[C.hipsRot + 1], c[C.hipsRot + 2]);
    B['hips'].quaternion.setFromEuler(_e);
    _e.set(c[C.spine] * 0.45, c[C.spine + 1] * 0.45, c[C.spine + 2] * 0.45);
    B['spine'].quaternion.setFromEuler(_e);
    _e.set(c[C.spine] * 0.55, c[C.spine + 1] * 0.55, c[C.spine + 2] * 0.55);
    B['chest'].quaternion.setFromEuler(_e);
    // shoulders (shrug = rotate up about the forward axis)
    B['shoulder.L'].quaternion.setFromAxisAngle(_v1.set(0, 0, 1), c[C.shrug]);
    B['shoulder.R'].quaternion.setFromAxisAngle(_v1.set(0, 0, 1), -c[C.shrug + 1]);
    B['neck'].quaternion.identity();
    if (this.neckOffset) B['neck'].position.y = this.neckRestY + this.neckOffset;
    B['head'].quaternion.identity();
    root.updateMatrixWorld(true);
    this.rootM.copy(root.matrixWorld);
    worldQuat(root, this.rootQ);

    // ---- look-at (world target), clamped, distributed neck 40% / head 60%
    const w = c[C.look + 3];
    let yaw = 0;
    let pitch = 0;
    if (w > 0.001) {
      const neck = B['neck'];
      _v1.set(c[C.look], c[C.look + 1], c[C.look + 2]);
      neck.getWorldPosition(_v2);
      _v2.y += 0.1;
      _v1.sub(_v2);
      // into chest space
      worldQuat(B['chest'], _q).invert();
      _v1.applyQuaternion(_q);
      yaw = Math.atan2(_v1.x, _v1.z);
      pitch = -Math.atan2(_v1.y, Math.hypot(_v1.x, _v1.z));
      yaw = THREE.MathUtils.clamp(yaw, -1.25, 1.25) * w;
      pitch = THREE.MathUtils.clamp(pitch, -0.55, 0.7) * w;
    }
    const hp = c[C.head];
    const hy = c[C.head + 1];
    const hr = c[C.head + 2];
    _e.set((pitch + hp) * 0.4, (yaw + hy) * 0.4, hr * 0.4);
    B['neck'].quaternion.setFromEuler(_e);
    _e.set((pitch + hp) * 0.6, (yaw + hy) * 0.6, hr * 0.6);
    B['head'].quaternion.setFromEuler(_e);
    B['neck'].updateMatrixWorld(true);

    // ---- limbs
    this.limb(this.armL, c, C.handL, C.handLq, C.elbowL, true);
    this.limb(this.armR, c, C.handR, C.handRq, C.elbowR, true);
    this.limb(this.legL, c, C.footL, -1, C.kneeL, false, C.footLr);
    this.limb(this.legR, c, C.footR, -1, C.kneeR, false, C.footRr);
    B['hand.L'].getWorldPosition(this.handWorld.L);
    B['hand.R'].getWorldPosition(this.handWorld.R);

    // ---- fingers
    this.fingers('L', c, C.fingL);
    this.fingers('R', c, C.fingR);
  }

  private limb(L: Limb, c: Float32Array, pos: number, quat: number, pole: number, twist: boolean, footRot = -1) {
    // targets: root space -> world
    const target = _v1.set(c[pos], c[pos + 1], c[pos + 2]).applyMatrix4(this.rootM);
    const poleW = _v2.set(c[pole], c[pole + 1], c[pole + 2]).applyMatrix4(this.rootM);
    L.a.parent!.updateMatrixWorld(false);
    L.a.getWorldPosition(_pa);
    _dir.subVectors(target, _pa);
    let dist = _dir.length();
    _dir.divideScalar(dist + 1e-9);
    dist = THREE.MathUtils.clamp(dist, Math.abs(L.L1 - L.L2) + 1e-3, L.L1 + L.L2 - 1e-4);
    _bend.subVectors(poleW, _pa);
    _bend.addScaledVector(_dir, -_bend.dot(_dir));
    if (_bend.lengthSq() < 1e-10) _bend.set(0, 0, 1).addScaledVector(_dir, -_dir.z);
    _bend.normalize();
    const cosA = (L.L1 * L.L1 + dist * dist - L.L2 * L.L2) / (2 * L.L1 * dist);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    _elbow.copy(_pa).addScaledVector(_dir, L.L1 * cosA).addScaledVector(_bend, L.L1 * sinA);
    _n.crossVectors(_dir, _bend).normalize();
    // upper segment
    _x.subVectors(_elbow, _pa).normalize();
    _f.crossVectors(_x, _n).normalize();
    _z.crossVectors(_x, _f);
    _m.makeBasis(_x, _f, _z).multiply(L.restFrame);
    _qw.setFromRotationMatrix(_m);
    setWorldQuat(L.a, _qw);
    // lower segment
    const reach = _v3.copy(_pa).addScaledVector(_dir, dist);
    _x.subVectors(reach, _elbow).normalize();
    _f.crossVectors(_x, _n).normalize();
    _z.crossVectors(_x, _f);
    _m.makeBasis(_x, _f, _z).multiply(L.restFrame);
    _qw.setFromRotationMatrix(_m);
    setWorldQuat(L.b, _qw);
    // end effector rotation (root space -> world)
    if (quat >= 0) {
      _q.set(c[quat], c[quat + 1], c[quat + 2], c[quat + 3]);
      _q2.copy(this.rootQ).multiply(_q);
    } else {
      _e.set(c[footRot + 1], c[footRot], 0);
      _q.setFromEuler(_e);
      _q2.copy(this.rootQ).multiply(_q);
    }
    if (twist) {
      // move half of the twist around the forearm axis from the hand into the forearm
      worldQuat(L.b, _q);
      const local = _qp.copy(_q).invert().multiply(_q2); // hand local
      const ax = L.restX; // forearm axis in its local (bind-aligned) frame
      const d = local.x * ax.x + local.y * ax.y + local.z * ax.z;
      _qTw.set(ax.x * d, ax.y * d, ax.z * d, local.w).normalize();
      _qTw.slerp(_q.identity(), 0.5);
      L.b.quaternion.multiply(_qTw);
      L.b.updateMatrixWorld(false);
    }
    setWorldQuat(L.c, _q2);
  }

  private fingers(side: 'L' | 'R', c: Float32Array, o: number) {
    const B = this.ch.bones;
    const spread = c[o + 5];
    for (let i = 0; i < 5; i++) {
      const f = FINGERS[i];
      const curl = c[o + i];
      const ax = this.fingerAxes[`${f}.${side}`];
      const sp = f === 'thumb' ? spread * 0.25 : f === 'index' ? -spread * 0.18 : f === 'middle' ? 0 : f === 'ring' ? spread * 0.12 : spread * 0.26;
      const k = f === 'thumb' ? [0.55, 0.6, 0.8] : [1.15, 1.5, 0.95];
      for (let j = 0; j < 3; j++) {
        const bone = B[`${f}${j + 1}.${side}`];
        bone.quaternion.setFromAxisAngle(ax.flex, curl * k[j]);
        if (j === 0) bone.quaternion.premultiply(_q.setFromAxisAngle(ax.spread, sp));
      }
    }
  }
}
