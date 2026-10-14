import * as THREE from 'three';
import type { Character } from '../character/character';
import type { ConvoState, Emotion } from '../anim/ctx';
import { MC, MC_SIZE } from './visemes';
import { Spring1, halflifeToDamping, fastNegExp } from '../math/spring';
import { logNormal } from '../math/noise';

/**
 * Face controller: lip-sync mouth + emotions + brows + blinks + gaze.
 *
 * Gaze follows the "Eyes Alive" model (Lee, Badler & Badler 2002):
 * saccade intervals are log-normal, amplitudes small around the target, and
 * when looking at a face (the camera = the user) the eyes alternate between
 * the user's eyes and mouth. Saccade speed follows the main sequence
 * (duration ≈ 21 ms + 2.2 ms/deg). Blinks are log-normal, more frequent while
 * speaking, and often triggered by large gaze shifts (gaze-evoked blinks).
 */

const EMO: Record<Emotion, Partial<Record<string, number>>> = {
  neutral: { smile: 0.12 },
  happy: { smile: 0.75, cheek: 1, browUp: 0.25, squint: 0.35, upperUp: 0.1 },
  sad: { frown: 0.55, browInner: 0.9, lidDown: 0.2, press: 0.2 },
  surprised: { browUp: 1, jaw: 0.12, lidWide: 0.25, funnel: 0.2 },
  thinking: { browDownL: 0.45, browUpR: 0.35, press: 0.3, frown: 0.15, smile: 0.05 },
};

const KEYS = ['smile', 'frown', 'cheek', 'browUp', 'browInner', 'browDownL', 'browUpR', 'squint', 'lidDown', 'lidWide', 'press', 'jaw', 'funnel', 'upperUp'];

export class FaceController {
  private mouth = new Float32Array(MC_SIZE);
  private mouthV = new Float32Array(MC_SIZE);
  private emo: Record<string, Spring1> = {};
  private blinkT = 0;
  private nextBlink = 2;
  private blink = 0; // 0 open .. 1 closed
  private blinkPhase = -1;
  private gaze = new THREE.Vector2();
  private gazeV = new THREE.Vector2();
  private gazeGoal = new THREE.Vector2();
  private gazeHL = 0.03;
  private nextSaccade = 0.5;
  private saccadeT = 0;
  private faceSpot = 0;
  private browPulse = new Spring1(0, 0.12);
  private lastBeat = 0;
  private tmp = new THREE.Vector3();
  private tmpM = new THREE.Matrix4();

  constructor(private ch: Character, private rand: () => number) {
    for (const k of KEYS) this.emo[k] = new Spring1(0, 0.25);
  }

  update(
    dt: number,
    o: {
      speechMouth: Float32Array;
      speaking: boolean;
      env: number;
      beat: number;
      emotion: Emotion;
      emotionAmt: number;
      convo: ConvoState;
      gazeTarget: THREE.Vector3;
      lookingAtUser: boolean;
      extraMouth?: Partial<Record<keyof typeof MC, number>> | null;
      eyesShut?: number;
    },
  ) {
    const ch = this.ch;
    // ---------- emotion springs
    const target = EMO[o.emotion] ?? EMO.neutral;
    const amt = o.emotion === 'neutral' ? 1 : o.emotionAmt;
    for (const k of KEYS) this.emo[k].update(((target[k] ?? 0) * amt) + (o.emotion !== 'neutral' ? 0 : 0), dt);
    const E = (k: string) => this.emo[k].x;

    // ---------- mouth: speech (critically damped, ~45 ms) + emotion layer
    const y = halflifeToDamping(0.045) / 2;
    const eydt = fastNegExp(y * dt);
    const goal = o.speechMouth;
    for (let k = 0; k < MC_SIZE; k++) {
      let g = goal[k];
      const extra = o.extraMouth?.[Object.keys(MC)[k] as keyof typeof MC];
      if (extra !== undefined) g = Math.max(g, extra);
      const j0 = this.mouth[k] - g;
      const j1 = this.mouthV[k] + j0 * y;
      this.mouth[k] = eydt * (j0 + j1 * dt) + g;
      this.mouthV[k] = eydt * (this.mouthV[k] - j1 * y * dt);
    }
    const m = this.mouth;
    const round = Math.min(1, m[MC.funnel] + m[MC.pucker]);
    const smile = E('smile') * (1 - 0.6 * round) * (o.speaking ? 0.7 : 1) + m[MC.smile];
    ch.setMorph('mouthSmile', smile);
    ch.setMorph('mouthFrown', E('frown') * (1 - 0.5 * round));
    ch.setMorph('mouthStretch', m[MC.stretch]);
    ch.setMorph('mouthFunnel', Math.min(1, m[MC.funnel] + E('funnel')));
    ch.setMorph('mouthPucker', m[MC.pucker]);
    ch.setMorph('mouthUpperUp', Math.min(1, m[MC.upperUp] + E('upperUp')));
    ch.setMorph('mouthLowerDown', m[MC.lowerDown]);
    ch.setMorph('mouthRollLower', m[MC.rollLower]);
    ch.setMorph('mouthPress', Math.min(1, m[MC.press] + E('press') * (o.speaking ? 0.2 : 1)));
    ch.bones['jaw'].rotation.x = Math.max(0, m[MC.jaw] + E('jaw'));
    ch.setTongue(m[MC.tongueUp], m[MC.tongueOut]);

    // ---------- brows: emotion + emphasis pulses on speech beats
    if (o.beat !== this.lastBeat) {
      this.lastBeat = o.beat;
      if (this.rand() < 0.35) this.browPulse.v += 6;
    }
    const pulse = Math.max(0, this.browPulse.update(0, dt));
    const listenLift = o.convo === 'listening' ? 0.15 : 0;
    ch.setBrows(0, E('browUp') + pulse + listenLift, E('browInner'), E('browDownL'));
    ch.setBrows(1, E('browUp') + pulse + listenLift + E('browUpR'), E('browInner'), 0);

    // ---------- blinks
    this.blinkT += dt;
    if (this.blinkPhase < 0 && this.blinkT > this.nextBlink) this.startBlink();
    if (this.blinkPhase >= 0) {
      this.blinkPhase += dt;
      const p = this.blinkPhase;
      // fast close (70 ms), short hold, slower open (150 ms)
      this.blink = p < 0.07 ? p / 0.07 : p < 0.1 ? 1 : Math.max(0, 1 - (p - 0.1) / 0.15);
      if (p > 0.25) {
        this.blinkPhase = -1;
        this.blink = 0;
      }
    }

    // ---------- gaze (in head space)
    this.updateGaze(dt, o.gazeTarget, o.lookingAtUser, o.speaking);
    const yaw = this.gaze.x;
    const pitch = this.gaze.y;
    // lid-follows-gaze, squint, sadness, surprise
    const e0 = ch.eyes[0];
    const upperBase = e0.upperOpen + E('lidDown') * 0.35 - E('lidWide') * 0.25 + Math.max(0, -pitch) * 0.55 - Math.max(0, pitch) * 0.25;
    const lowerBase = e0.lowerOpen - E('squint') * 0.28 - E('cheek') * 0.08 + Math.max(0, pitch) * 0.15;
    const closedU = (lowerBase + 1.9) / 2 + 0.05;
    const shut = Math.max(this.blink, o.eyesShut ?? 0);
    const up = upperBase + (closedU - upperBase) * shut;
    const lo = lowerBase - (lowerBase - closedU) * shut * 0.25;
    for (const e of ch.eyes) {
      e.setLids(up, lo);
      e.setGaze(yaw, pitch);
    }
  }

  private startBlink() {
    this.blinkPhase = 0;
    this.blinkT = 0;
    this.nextBlink = logNormal(this.rand, 3.2, 0.55);
  }

  private updateGaze(dt: number, target: THREE.Vector3, atUser: boolean, speaking: boolean) {
    // target direction in head (local) space; eyes are ~3cm in front of the head centre
    const hl = this.ch.headLocal;
    this.tmpM.copy(hl.matrixWorld).invert();
    const p = this.tmp.copy(target).applyMatrix4(this.tmpM);
    p.y -= 0.012;
    p.z -= 0.09;
    let yaw = Math.atan2(p.x, p.z);
    let pitch = Math.atan2(p.y, Math.hypot(p.x, p.z));
    // micro-saccades / face scanning
    this.saccadeT += dt;
    if (this.saccadeT > this.nextSaccade) {
      this.saccadeT = 0;
      this.nextSaccade = logNormal(this.rand, speaking ? 0.9 : 0.6, 0.5);
      if (atUser) this.faceSpot = this.rand() < 0.45 ? 0 : this.rand() < 0.5 ? 1 : 2;
      else this.faceSpot = 3;
    }
    const dist = Math.max(0.3, p.length());
    if (this.faceSpot === 0) yaw += 0.032 / dist;
    else if (this.faceSpot === 1) yaw -= 0.032 / dist;
    else if (this.faceSpot === 2) pitch -= 0.06 / dist;
    // eye rotation limits
    yaw = THREE.MathUtils.clamp(yaw, -0.6, 0.6);
    pitch = THREE.MathUtils.clamp(pitch, -0.45, 0.35);
    const jump = Math.hypot(yaw - this.gazeGoal.x, pitch - this.gazeGoal.y);
    if (jump > 0.004) {
      // main sequence: big saccades take longer
      const deg = THREE.MathUtils.radToDeg(jump);
      this.gazeHL = (0.021 + 0.0022 * deg) * 0.35;
      if (deg > 18 && this.blinkPhase < 0 && this.rand() < 0.45) this.startBlink();
    }
    this.gazeGoal.set(yaw, pitch);
    const y = halflifeToDamping(this.gazeHL) / 2;
    const eydt = fastNegExp(y * dt);
    for (const k of ['x', 'y'] as const) {
      const j0 = this.gaze[k] - this.gazeGoal[k];
      const j1 = this.gazeV[k] + j0 * y;
      this.gaze[k] = eydt * (j0 + j1 * dt) + this.gazeGoal[k];
      this.gazeV[k] = eydt * (this.gazeV[k] - j1 * y * dt);
    }
  }
}
