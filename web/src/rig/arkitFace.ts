import * as THREE from 'three';
import type { FaceFrame } from './faceRig';

/**
 * Drives ARKit-52 blendshapes (the de-facto standard exported by Character
 * Creator, Daz/Genesis via plugins, Blender FaceIt, Polywink, MetaHuman
 * ports...) from a FaceFrame. Names are matched tolerantly
 * (mouthSmile_L / mouthSmileLeft / MouthSmileL / "blendShape1.mouthSmile_L").
 */
export class ArkitFace {
  private meshes: THREE.Mesh[] = [];
  private cache = new Map<string, [THREE.Mesh, number][]>();
  readonly hasJawOpen: boolean;
  readonly hasEyeLook: boolean;
  /** optional eye objects rotated directly (rigs without eye bones mapping) */
  eyes: { obj: THREE.Object3D; rest: THREE.Quaternion }[] = [];
  /** names of ARKit shapes that were found (for diagnostics) */
  readonly found: string[] = [];
  /** drive eyeLook* shapes (disable when the rig rotates eye bones) */
  useEyeLookShapes = true;

  constructor(root: THREE.Object3D) {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.morphTargetDictionary && Object.keys(m.morphTargetDictionary).length) this.meshes.push(m);
    });
    this.hasJawOpen = this.find('jawOpen').length > 0;
    this.hasEyeLook = this.find('eyeLookUpLeft').length > 0;
    for (const n of ARKIT) if (this.find(n).length) this.found.push(n);
  }

  find(name: string): [THREE.Mesh, number][] {
    const hit = this.cache.get(name);
    if (hit) return hit;
    const n = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const alts = new Set([n, n.replace(/left$/, 'l'), n.replace(/right$/, 'r')]);
    const out: [THREE.Mesh, number][] = [];
    for (const m of this.meshes) {
      for (const [k, i] of Object.entries(m.morphTargetDictionary!)) {
        let kk = k.toLowerCase();
        kk = kk.slice(kk.lastIndexOf('.') + 1).replace(/[^a-z0-9]/g, '');
        if (alts.has(kk)) out.push([m, i]);
      }
    }
    this.cache.set(name, out);
    return out;
  }

  set(name: string, w: number) {
    const v = w < 0 ? 0 : w > 1 ? 1 : w;
    for (const [m, i] of this.find(name)) m.morphTargetInfluences![i] = v;
  }

  setLR(base: string, l: number, r = l) {
    this.set(`${base}Left`, l);
    this.set(`${base}Right`, r);
  }

  /** @returns jaw rotation the caller should apply to a jaw bone (0 if a jawOpen shape exists) */
  apply(F: FaceFrame): number {
    const jawW = F.jaw / 0.32;
    let jawBone = F.jaw;
    if (this.hasJawOpen) {
      this.set('jawOpen', jawW);
      jawBone = 0;
    }
    this.setLR('mouthSmile', F.smile);
    this.setLR('mouthFrown', F.frown);
    this.setLR('mouthStretch', F.stretch);
    this.set('mouthFunnel', F.funnel);
    this.set('mouthPucker', F.pucker);
    this.setLR('mouthUpperUp', F.upperUp);
    this.setLR('mouthLowerDown', F.lowerDown);
    this.set('mouthRollLower', F.rollLower);
    this.setLR('mouthPress', F.press * (1 - Math.min(1, jawW)));
    // lips stay sealed for p/b/m even while the jaw drops a little
    this.set('mouthClose', Math.min(jawW, F.press));
    this.setLR('cheekSquint', F.cheek * 0.8);
    this.set('tongueOut', F.tongueOut);
    this.set('browInnerUp', Math.max(F.browInner, (F.browUp[0] + F.browUp[1]) * 0.25));
    this.set('browOuterUpLeft', F.browUp[0]);
    this.set('browOuterUpRight', F.browUp[1]);
    this.set('browDownLeft', F.browDown[0]);
    this.set('browDownRight', F.browDown[1]);
    const down = Math.max(0, -F.gazePitch);
    const lid = Math.max(F.blink, Math.min(1, F.lidDown * 0.45 + down * 0.35));
    this.setLR('eyeBlink', lid);
    this.setLR('eyeSquint', F.squint);
    this.setLR('eyeWide', F.wide * (1 - F.blink));
    const y = F.gazeYaw;
    const p = F.gazePitch;
    if (this.hasEyeLook && this.useEyeLookShapes && !this.eyes.length) {
      const k = 1 / 0.6;
      this.setLR('eyeLookUp', Math.max(0, p) * k);
      this.setLR('eyeLookDown', Math.max(0, -p) * k);
      // toward the character's left (+yaw): left eye looks out, right eye looks in
      this.set('eyeLookOutLeft', Math.max(0, y) * k);
      this.set('eyeLookInRight', Math.max(0, y) * k);
      this.set('eyeLookInLeft', Math.max(0, -y) * k);
      this.set('eyeLookOutRight', Math.max(0, -y) * k);
    }
    for (const e of this.eyes) {
      e.obj.quaternion.copy(e.rest).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-p, y, 0, 'YXZ')));
    }
    return jawBone;
  }
}

export const ARKIT = [
  'browInnerUp', 'browDownLeft', 'browDownRight', 'browOuterUpLeft', 'browOuterUpRight', 'eyeLookUpLeft', 'eyeLookUpRight', 'eyeLookDownLeft',
  'eyeLookDownRight', 'eyeLookInLeft', 'eyeLookInRight', 'eyeLookOutLeft', 'eyeLookOutRight', 'eyeBlinkLeft', 'eyeBlinkRight', 'eyeSquintLeft',
  'eyeSquintRight', 'eyeWideLeft', 'eyeWideRight', 'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight', 'noseSneerLeft', 'noseSneerRight', 'jawOpen',
  'jawForward', 'jawLeft', 'jawRight', 'mouthFunnel', 'mouthPucker', 'mouthLeft', 'mouthRight', 'mouthRollUpper', 'mouthRollLower', 'mouthShrugUpper',
  'mouthShrugLower', 'mouthClose', 'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthDimpleLeft', 'mouthDimpleRight',
  'mouthUpperUpLeft', 'mouthUpperUpRight', 'mouthLowerDownLeft', 'mouthLowerDownRight', 'mouthPressLeft', 'mouthPressRight', 'mouthStretchLeft',
  'mouthStretchRight', 'tongueOut',
];
