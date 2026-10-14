import * as THREE from 'three';
import { BONE_DEFS, HEAD_CENTER, bonePos } from './skeletonDef';
import { buildHead, HEAD_MORPH_NAMES } from './head';
import { buildBody } from './body';
import { Eye, createEyeMaterials } from './eyes';
import { EYE_L_CENTER, EYE_R_CENTER } from './headShape';
import { buildBrow, buildEar, buildTeeth, buildTongue } from './faceParts';
import { buildHair, createHairMaterial, HairSim } from './hair';
import { createCharacterMaterials, type CharacterMaterials } from './materials';
import type { FaceFrame } from '../rig/faceRig';
import type { Avatar } from '../rig/avatar';
import { proceduralSpec } from '../rig/spec';

/**
 * Assembles the procedural character: skeleton, skinned body, head with
 * morph targets, eyes, mouth interior, brows, hair. Exposes the handles the
 * animation and face systems drive.
 */
export class Character implements Avatar {
  readonly spec = proceduralSpec();
  get hitTarget() {
    return this.headLocal;
  }
  setKeyLight(p: THREE.Vector3) {
    this.hairMat.userData.u.uKeyPos.value.copy(p);
  }
  readonly root = new THREE.Group();
  readonly bones: Record<string, THREE.Bone> = {};
  readonly boneList: THREE.Bone[] = [];
  readonly skeleton: THREE.Skeleton;
  readonly mats: CharacterMaterials;
  readonly head: THREE.SkinnedMesh;
  readonly headLocal = new THREE.Group();
  readonly jawLocal = new THREE.Group();
  readonly eyes: [Eye, Eye];
  readonly brows: [THREE.Mesh, THREE.Mesh];
  readonly tongue: THREE.Mesh;
  readonly hairSim: HairSim;
  readonly hairMat: THREE.MeshStandardMaterial;
  private morphIndex: Record<string, number> = {};
  get gazeFrame() {
    return this.headLocal;
  }
  readonly eyeOffset = new THREE.Vector3(0, 0.012, 0.09);
  private tmpM3 = new THREE.Matrix3();
  private tmpM4 = new THREE.Matrix4();

  constructor() {
    this.root.name = 'character';
    // ---- skeleton
    for (const d of BONE_DEFS) {
      const b = new THREE.Bone();
      b.name = d.name;
      const pp = d.parent ? bonePos(d.parent) : [0, 0, 0];
      b.position.set(d.pos[0] - pp[0], d.pos[1] - pp[1], d.pos[2] - pp[2]);
      this.bones[d.name] = b;
      this.boneList.push(b);
      if (d.parent) this.bones[d.parent].add(b);
    }
    const rootBone = this.bones['root'];
    this.root.add(rootBone);
    this.root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.boneList);
    // feature-animation proportions: a slightly larger head (scaled about the neck joint)
    this.bones['head'].scale.setScalar(1.13);

    this.mats = createCharacterMaterials();
    const m = this.mats;
    const skinned = (geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true) => {
      const s = new THREE.SkinnedMesh(geo, mat);
      s.bind(this.skeleton, new THREE.Matrix4());
      s.frustumCulled = false;
      s.castShadow = shadow;
      s.receiveShadow = true;
      this.root.add(s);
      return s;
    };

    // ---- body
    const body = buildBody();
    skinned(body.shirt, m.shirt);
    skinned(body.pants, m.pants);
    skinned(body.skin, m.skin);
    skinned(body.slippers, m.slippers, false);

    // ---- head
    const hb = buildHead();
    this.head = skinned(hb.geometry, m.skin);
    // hard lamp shadows of the nose/brows read as dirt on a stylised face;
    // the face gets its shading from the baked SDF occlusion instead
    this.head.receiveShadow = false;
    HEAD_MORPH_NAMES.forEach((n, i) => (this.morphIndex[n] = i));
    this.head.morphTargetInfluences = new Array(HEAD_MORPH_NAMES.length).fill(0);

    const hp = bonePos('head');
    const jp = bonePos('jaw');
    this.headLocal.position.set(HEAD_CENTER[0] - hp[0], HEAD_CENTER[1] - hp[1], HEAD_CENTER[2] - hp[2]);
    this.jawLocal.position.set(HEAD_CENTER[0] - jp[0], HEAD_CENTER[1] - jp[1], HEAD_CENTER[2] - jp[2]);
    this.bones['head'].add(this.headLocal);
    this.bones['jaw'].add(this.jawLocal);

    const em = createEyeMaterials(m.skin);
    this.eyes = [new Eye(EYE_L_CENTER, 1, em), new Eye(EYE_R_CENTER, -1, em)];
    for (const e of this.eyes) {
      this.headLocal.add(e.root);
      e.upper.castShadow = true;
    }

    const teeth = buildTeeth(hb.mouthCenter);
    this.headLocal.add(new THREE.Mesh(teeth.upper, m.teeth), new THREE.Mesh(teeth.gumsUpper, m.gums));
    this.jawLocal.add(new THREE.Mesh(teeth.lower, m.teeth), new THREE.Mesh(teeth.gumsLower, m.gums));
    this.tongue = new THREE.Mesh(buildTongue(hb.mouthCenter), m.tongue);
    this.tongue.morphTargetInfluences = [0, 0];
    this.jawLocal.add(this.tongue);

    for (const s of [1, -1] as const) {
      const ear = new THREE.Mesh(buildEar(s), m.skin);
      ear.castShadow = true;
      this.headLocal.add(ear);
    }
    this.brows = [new THREE.Mesh(buildBrow(1), m.brows), new THREE.Mesh(buildBrow(-1), m.brows)];
    for (const b of this.brows) {
      b.morphTargetInfluences = [0, 0, 0];
      this.headLocal.add(b);
    }

    // ---- hair
    const hair = buildHair();
    this.hairSim = new HairSim(hair);
    this.hairMat = createHairMaterial(hair.count, this.hairSim.tex);
    const clumps = new THREE.Mesh(hair.clumps, this.hairMat);
    clumps.castShadow = true;
    clumps.frustumCulled = false;
    const cap = new THREE.Mesh(hair.cap, this.hairMat);
    this.headLocal.add(cap, clumps);

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !(o as THREE.SkinnedMesh).isSkinnedMesh) o.receiveShadow = true;
    });
  }

  setMorph(name: string, w: number) {
    const i = this.morphIndex[name];
    if (i !== undefined) this.head.morphTargetInfluences![i] = w;
  }

  /** browUp, browInnerUp, browDown per side (0 = left). */
  setBrows(side: 0 | 1, up: number, innerUp: number, down: number) {
    const inf = this.brows[side].morphTargetInfluences!;
    inf[0] = up;
    inf[1] = innerUp;
    inf[2] = down;
  }

  setTongue(up: number, out: number) {
    const inf = this.tongue.morphTargetInfluences!;
    inf[0] = up;
    inf[1] = out;
  }

  applyFace(F: FaceFrame) {
    this.setMorph('mouthSmile', F.smile);
    this.setMorph('mouthFrown', F.frown);
    this.setMorph('mouthStretch', F.stretch);
    this.setMorph('mouthFunnel', F.funnel);
    this.setMorph('mouthPucker', F.pucker);
    this.setMorph('mouthUpperUp', F.upperUp);
    this.setMorph('mouthLowerDown', F.lowerDown);
    this.setMorph('mouthRollLower', F.rollLower);
    this.setMorph('mouthPress', F.press);
    this.bones['jaw'].rotation.x = F.jaw;
    this.setTongue(F.tongueUp, F.tongueOut);
    this.setBrows(0, F.browUp[0], F.browInner, F.browDown[0]);
    this.setBrows(1, F.browUp[1], F.browInner, F.browDown[1]);
    // lids: follow the gaze vertically, squint/wide/sad offsets, then blink
    const e0 = this.eyes[0];
    const pitch = F.gazePitch;
    const upperBase = e0.upperOpen + F.lidDown * 0.35 - F.wide * 0.25 + Math.max(0, -pitch) * 0.55 - Math.max(0, pitch) * 0.25 + F.squint * 0.1;
    const lowerBase = e0.lowerOpen - F.squint * 0.28 - F.cheek * 0.08 + Math.max(0, pitch) * 0.15;
    const closedU = (lowerBase + 1.9) / 2 + 0.05;
    const up = upperBase + (closedU - upperBase) * F.blink;
    const lo = lowerBase - (lowerBase - closedU) * F.blink * 0.25;
    for (const e of this.eyes) {
      e.setLids(up, lo);
      e.setGaze(F.gazeYaw, pitch);
    }
  }

  /** After bones are posed: hair dynamics + eye lid occlusion frames. */
  postUpdate(dt: number, time: number, wind: THREE.Vector3) {
    this.headLocal.updateWorldMatrix(true, false);
    this.hairSim.update(dt, this.headLocal.matrixWorld, wind, time);
    this.tmpM4.extractRotation(this.headLocal.matrixWorld).invert();
    this.tmpM3.setFromMatrix4(this.tmpM4);
    for (const e of this.eyes) e.setSocketFrame(this.tmpM3);
  }
}
