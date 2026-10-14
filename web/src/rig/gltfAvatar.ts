import * as THREE from 'three';
import { createGltfLoader } from './loader';
import { mapBones, REQUIRED_BONES } from './boneMap';
import type { SkeletonSpec } from './spec';
import type { FaceFrame } from './faceRig';
import type { Avatar } from './avatar';
import { SpringBones } from './springBones';
import { ArkitFace } from './arkitFace';

/**
 * Artist-made character (glTF/GLB) driven by the same animation system.
 *
 * The animation system poses a *virtual* skeleton (canonical bone names,
 * identity bind rotations, bind positions measured from the model). Every
 * frame each mapped real bone receives:   world = delta(virtual) * bindWorld
 * i.e. the virtual skeleton's rotation relative to bind, applied on top of
 * the real bone's own bind orientation. Works for any rest pose (T, A) and
 * any bone roll convention, with no per-rig tuning.
 */

const CANON: [string, string | null][] = [
  ['root', null],
  ['hips', 'root'],
  ['spine', 'hips'],
  ['chest', 'spine'],
  ['neck', 'chest'],
  ['head', 'neck'],
  ['jaw', 'head'],
];
const FING = ['thumb', 'index', 'middle', 'ring', 'pinky'];
for (const s of ['L', 'R']) {
  CANON.push([`shoulder.${s}`, 'chest'], [`upperArm.${s}`, `shoulder.${s}`], [`foreArm.${s}`, `upperArm.${s}`], [`hand.${s}`, `foreArm.${s}`]);
  for (const f of FING) {
    CANON.push([`${f}1.${s}`, `hand.${s}`], [`${f}2.${s}`, `${f}1.${s}`], [`${f}3.${s}`, `${f}2.${s}`]);
  }
  CANON.push([`thigh.${s}`, 'hips'], [`shin.${s}`, `thigh.${s}`], [`foot.${s}`, `shin.${s}`], [`toes.${s}`, `foot.${s}`]);
  CANON.push([`eye.${s}`, 'head']);
}

export interface AvatarOptions {
  /** extra yaw (radians) if the model does not face +Z */
  yaw?: number;
  /** explicit bone mapping canonical -> model bone name */
  bones?: Record<string, string>;
  /** target hips height in metres (animation data is tuned for 0.9) */
  hipsHeight?: number;
}

function restPose(sm: THREE.SkinnedMesh) {
  const sk = sm.skeleton;
  const world = new Map<THREE.Object3D, THREE.Matrix4>();
  sk.bones.forEach((b, i) => world.set(b, sm.bindMatrix.clone().multiply(sk.boneInverses[i].clone().invert())));
  const depth = (o: THREE.Object3D) => {
    let d = 0;
    for (let p = o.parent; p; p = p.parent) d++;
    return d;
  };
  const sorted = sk.bones.slice().sort((a, b) => depth(a) - depth(b));
  for (const b of sorted) {
    b.parent!.updateWorldMatrix(true, false);
    const local = b.parent!.matrixWorld.clone().invert().multiply(world.get(b)!);
    local.decompose(b.position, b.quaternion, b.scale);
    b.updateMatrixWorld(true);
  }
}

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();

export class GltfAvatar implements Avatar {
  get hitTarget() {
    return this.model;
  }
  readonly root = new THREE.Group();
  readonly model: THREE.Object3D;
  /** virtual skeleton driven by the solver (props attach here) */
  readonly bones: Record<string, THREE.Bone> = {};
  readonly spec: SkeletonSpec;
  readonly eyeOffset = new THREE.Vector3(0, 0.06, 0.08);
  private real: Record<string, THREE.Object3D> = {};
  private bindWorldQ: Record<string, THREE.Quaternion> = {};
  private order: string[] = [];
  readonly face: ArkitFace;
  private springs: SpringBones;
  readonly missing: string[] = [];

  get gazeFrame() {
    return this.bones['head'];
  }

  static async load(url: string, renderer: THREE.WebGLRenderer, opts: AvatarOptions = {}): Promise<GltfAvatar> {
    const loader = createGltfLoader(renderer);
    const gltf = await loader.loadAsync(url);
    let mapOverride: AvatarOptions = {};
    try {
      const r = await fetch(url.replace(/\.(glb|gltf)$/i, '.map.json'));
      if (r.ok) mapOverride = await r.json();
    } catch {
      /* optional */
    }
    return new GltfAvatar(gltf.scene, { ...mapOverride, ...opts, bones: { ...mapOverride.bones, ...opts.bones } });
  }

  constructor(scene: THREE.Object3D, opts: AvatarOptions) {
    this.model = scene;
    // ---- normalise orientation & scale (bind pose)
    scene.rotation.y += opts.yaw ?? 0;
    scene.updateMatrixWorld(true);
    const names: string[] = [];
    scene.traverse((o) => {
      if ((o as THREE.Bone).isBone || o.type === 'Object3D' || o.type === 'Group') names.push(o.name);
    });
    const map = mapBones(names, opts.bones ?? {});
    for (const r of REQUIRED_BONES) if (!map[r]) this.missing.push(r);
    if (this.missing.length) throw new Error(`Character rig is missing bones: ${this.missing.join(', ')} (add a .map.json)`);
    for (const [k, n] of Object.entries(map)) this.real[k] = scene.getObjectByName(n)!;
    // put the rig in its bind pose (some exports keep an animated pose).
    // glTF inverse-bind matrices are relative to the mesh, so the bind world
    // transform is meshBindMatrix * inverse(IBM) — Skeleton.pose() would
    // ignore the mesh/armature transform (e.g. Mixamo's 0.01 armature scale).
    scene.traverse((o) => {
      const sm = o as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh) restPose(sm);
    });
    scene.traverse((o) => {
      const sm = o as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh) {
        sm.frustumCulled = false;
        sm.castShadow = true;
        sm.receiveShadow = true;
      }
    });
    scene.updateMatrixWorld(true);
    const hipsY = this.real['hips'].getWorldPosition(_v).y;
    const s = (opts.hipsHeight ?? 0.9) / Math.max(1e-3, hipsY);
    scene.scale.multiplyScalar(s);
    scene.updateMatrixWorld(true);
    // centre between the feet
    const fl = this.real['foot.L'].getWorldPosition(new THREE.Vector3());
    const fr = this.real['foot.R'].getWorldPosition(new THREE.Vector3());
    scene.position.x -= (fl.x + fr.x) / 2;
    scene.position.z -= (fl.z + fr.z) / 2;
    const minY = Math.min(fl.y, fr.y);
    scene.position.y -= minY - 0.075;
    scene.updateMatrixWorld(true);
    this.root.add(scene);

    // ---- measure the spec (bind world positions in canonical naming)
    const pos: Record<string, THREE.Vector3> = {};
    const parent: Record<string, string | null> = {};
    const P = (k: string) => (this.real[k] ? this.real[k].getWorldPosition(new THREE.Vector3()) : null);
    for (const [k, p] of CANON) {
      parent[k] = p;
      const w = P(k);
      if (w) pos[k] = w;
    }
    pos['root'] = new THREE.Vector3(0, 0, 0);
    // synthesise the bones the rig does not have
    if (!pos['chest']) pos['chest'] = pos['spine'].clone().lerp(pos['neck'], 0.5);
    if (!pos['jaw']) pos['jaw'] = pos['head'].clone().add(new THREE.Vector3(0, 0.06, 0.02));
    for (const s2 of ['L', 'R']) {
      if (!pos[`shoulder.${s2}`]) pos[`shoulder.${s2}`] = pos['chest'].clone().lerp(pos[`upperArm.${s2}`], 0.25);
      if (!pos[`toes.${s2}`]) pos[`toes.${s2}`] = pos[`foot.${s2}`].clone().add(new THREE.Vector3(0, -0.05, 0.11));
      if (!pos[`eye.${s2}`]) pos[`eye.${s2}`] = pos['head'].clone().add(new THREE.Vector3(s2 === 'L' ? 0.032 : -0.032, 0.07, 0.08));
      const hand = pos[`hand.${s2}`];
      const fwd = pos[`hand.${s2}`].clone().sub(pos[`foreArm.${s2}`]).normalize();
      for (const f of FING) {
        for (let j = 1; j <= 3; j++) {
          const k = `${f}${j}.${s2}`;
          if (!pos[k]) {
            const prev = j === 1 ? hand : pos[`${f}${j - 1}.${s2}`];
            pos[k] = prev.clone().addScaledVector(fwd, j === 1 ? 0.08 : 0.025);
          }
        }
      }
    }
    // left hand frame from the finger bases
    const hx = pos['middle1.L'].clone().sub(pos['hand.L']).normalize();
    let hz = pos['index1.L'].clone().sub(pos['pinky1.L']);
    if (hz.lengthSq() < 1e-8) hz = new THREE.Vector3(0, 0, 1);
    hz.addScaledVector(hx, -hz.dot(hx)).normalize();
    const hy = new THREE.Vector3().crossVectors(hz, hx).normalize();
    const thumbDir = pos['thumb2.L'].clone().sub(pos['thumb1.L']).normalize();
    this.spec = { names: CANON.map((c) => c[0]), parent, pos, handX: hx, handY: hy, handZ: hz, thumbDir };

    // ---- virtual skeleton
    for (const [k, p] of CANON) {
      const b = new THREE.Bone();
      b.name = `v:${k}`;
      const pp = p ? pos[p] : new THREE.Vector3();
      b.position.copy(pos[k]).sub(pp);
      this.bones[k] = b;
      if (p) this.bones[p].add(b);
    }
    this.root.add(this.bones['root']);
    this.root.updateMatrixWorld(true);

    // ---- bind world rotations of the real bones, update order (parents first)
    for (const k of Object.keys(this.real)) this.bindWorldQ[k] = this.real[k].getWorldQuaternion(new THREE.Quaternion());
    const depth = (o: THREE.Object3D) => {
      let d = 0;
      while (o.parent) {
        d++;
        o = o.parent;
      }
      return d;
    };
    this.order = Object.keys(this.real).sort((a, b) => depth(this.real[a]) - depth(this.real[b]));
    this.eyeOffset.copy(pos['eye.L']).add(pos['eye.R']).multiplyScalar(0.5).sub(pos['head']);

    // ---- face
    this.face = new ArkitFace(scene);
    this.face.useEyeLookShapes = !(this.real['eye.L'] && this.real['eye.R']);
    console.info(`[avatar] ARKit shapes: ${this.face.found.length}/52`);

    // ---- spring bones (hair, ears, accessories)
    this.springs = new SpringBones(scene);
  }

  applyFace(F: FaceFrame) {
    this.bones['jaw'].rotation.x = this.face.apply(F);
    if (this.real['eye.L'] && this.real['eye.R']) for (const s of ['L', 'R']) this.bones[`eye.${s}`].rotation.set(-F.gazePitch, F.gazeYaw, 0, 'YXZ');
  }

  /** Copy the virtual pose onto the real rig, then run spring bones. */
  postUpdate(dt: number, time: number, wind: THREE.Vector3) {
    this.bones['root'].updateWorldMatrix(true, true);
    for (const k of this.order) {
      const r = this.real[k];
      const vb = this.bones[k];
      if (!vb) continue;
      // delta = virtual world rotation (virtual bind = identity)
      vb.getWorldQuaternion(_q);
      _q.multiply(this.bindWorldQ[k]);
      r.parent!.updateWorldMatrix(true, false);
      r.parent!.getWorldQuaternion(_q2);
      r.quaternion.copy(_q2.invert().multiply(_q));
      if (k === 'hips') {
        vb.getWorldPosition(_v);
        _m.copy(r.parent!.matrixWorld).invert();
        r.position.copy(_v.applyMatrix4(_m));
      }
      r.updateMatrixWorld(true);
    }
    this.springs.update(dt, time, wind);
  }
}
