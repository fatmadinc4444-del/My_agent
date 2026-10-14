import * as THREE from 'three';
import type { Behavior } from '../graph';
import type { Ctx } from '../ctx';
import { C, setV } from '../controls';
import { R, elbow, fingers, hand, look, relaxedFingers, seatedBase } from './common';
import { phoneCarryPose } from './locomotion';
import { L } from '../../scene/layout';
import { logNormal } from '../../math/noise';

/**
 * Default activity: sitting at the desk. Picks idle "moments" (type on the
 * laptop, glance outside, chin on hand, tap fingers, rub neck) with
 * log-normally distributed durations, and reacts to the conversation state
 * (listening lean-in, thinking pose, speaking beat gestures).
 */

type Sub = 'rest' | 'type' | 'glanceWindow' | 'chin' | 'tap' | 'neck' | 'listen' | 'think' | 'speak' | 'clasp';

const v = new THREE.Vector3();
const w = new THREE.Vector3();

export class Seated implements Behavior<Ctx> {
  readonly name = 'seated';
  private sub: Sub = 'rest';
  private subT = 0;
  private subDur = 4;
  private lastConvo = '';
  private gestureSide: 'L' | 'R' = 'R';
  private gestureT = 0;
  private gestureAmp = 0;
  private lastBeat = 0;
  private gestureShape = 0;

  enter(ctx: Ctx) {
    this.pick(ctx, true);
  }

  private set(ctx: Ctx, s: Sub, dur: number, blend = 0.38) {
    if (s !== this.sub) ctx.blend(blend);
    this.sub = s;
    this.subT = 0;
    this.subDur = dur;
  }

  private pick(ctx: Ctx, force = false) {
    switch (ctx.convo) {
      case 'listening':
        return this.set(ctx, ctx.rand() < 0.5 ? 'listen' : 'clasp', 1e9, 0.45);
      case 'thinking':
        return this.set(ctx, 'think', 1e9, 0.5);
      case 'speaking':
        return this.set(ctx, 'speak', 1e9, 0.4);
    }
    const r = ctx.rand();
    const dur = logNormal(ctx.rand, 5, 0.35);
    if (force || this.sub !== 'rest') return this.set(ctx, 'rest', logNormal(ctx.rand, 6, 0.4), 0.55);
    if (r < 0.28) this.set(ctx, 'type', dur + 2, 0.5);
    else if (r < 0.45) this.set(ctx, 'glanceWindow', 2.5 + ctx.rand() * 2, 0.6);
    else if (r < 0.62) this.set(ctx, 'chin', dur, 0.55);
    else if (r < 0.8) this.set(ctx, 'tap', 3 + ctx.rand() * 2, 0.45);
    else this.set(ctx, 'neck', 2.8, 0.6);
  }

  evaluate(ctx: Ctx, out: Float32Array) {
    if (ctx.convo !== this.lastConvo) {
      this.lastConvo = ctx.convo;
      this.pick(ctx, true);
    }
    this.subT += ctx.dt;
    if (this.subT > this.subDur) this.pick(ctx);
    seatedBase(out, ctx.camera);
    const t = ctx.time;
    const s = this.subT;
    ctx.gazeHint = null;
    switch (this.sub) {
      case 'rest':
        break;
      case 'type': {
        // hands on the laptop keyboard, fingers pecking, eyes on the screen
        const kb = R(L.laptop.x, L.laptop.y, L.laptop.z + 0.12);
        hand(out, 'L', v.set(kb.x + 0.1, 0.79, kb.z - 0.04), w.set(-0.25, -0.35, 1), { x: 0, y: -1, z: 0.25 });
        hand(out, 'R', v.set(kb.x - 0.08, 0.79, kb.z - 0.04), w.set(0.3, -0.35, 1), { x: 0, y: -1, z: 0.25 });
        for (const side of ['L', 'R'] as const) {
          const ph = side === 'L' ? 0 : 1.7;
          const k = (i: number) => 0.32 + 0.22 * Math.max(0, Math.sin(t * 11 + ph + i * 2.1)) * Math.max(0, Math.sin(t * 1.3 + i));
          fingers(out, side, 0.2, k(0), k(1), k(2), k(3), 0.15);
        }
        elbow(out, 'L', 0.6, 0.6, -0.3);
        elbow(out, 'R', -0.6, 0.6, -0.3);
        const scr = L.laptop.clone().add(v.set(0, 0.16, -0.08));
        look(out, scr, 1);
        ctx.gazeHint = scr;
        setV(out, 'spine', 0.24, -0.1, 0);
        break;
      }
      case 'glanceWindow': {
        const tgt = v.set((L.window.x0 + L.window.x1) / 2, 1.5, L.window.z);
        look(out, tgt, 1);
        ctx.gazeHint = tgt.clone();
        setV(out, 'spine', 0.1, 0.18, 0);
        break;
      }
      case 'chin': {
        // right elbow on the desk, chin resting on the knuckles
        hand(out, 'R', v.set(-0.03, 1.02 + 0.004 * Math.sin(t * 0.7), 0.3), w.set(0.15, 1, 0.1), { x: 0.2, y: 0.1, z: -1 });
        fingers(out, 'R', 0.6, 0.85, 0.95, 1.0, 1.05, 0);
        elbow(out, 'R', -0.3, 0.2, 0.6);
        setV(out, 'spine', 0.3, 0.05, -0.05);
        setV(out, 'head', 0.05, 0, -0.12);
        break;
      }
      case 'tap': {
        const tap = (i: number) => 0.15 + 0.35 * Math.pow(Math.max(0, Math.sin(t * 9 - i * 0.9)), 6);
        fingers(out, 'L', 0.2, tap(0), tap(1), tap(2), tap(3), 0.2);
        break;
      }
      case 'neck': {
        const k = Math.sin(Math.min(1, s / 2.8) * Math.PI);
        hand(out, 'R', v.set(-0.08, 1.38, -0.12), w.set(1, 0.2, 0), { x: 0, y: 0, z: 1 });
        relaxedFingers(out, 'R', 0.6);
        elbow(out, 'R', -0.6, 1.5, 0.3);
        setV(out, 'head', -0.12 * k, 0.1 * k, 0.25 * k);
        break;
      }
      case 'listen': {
        setV(out, 'spine', 0.26, 0, 0);
        setV(out, 'head', 0.06 * Math.sin(t * 0.8) * ctx.micLevel, 0, -0.1);
        break;
      }
      case 'clasp': {
        // hands loosely together in front, attentive
        hand(out, 'L', v.set(0.06, 0.8, 0.43), w.set(-1, -0.15, 0.5), { x: 0, y: -0.6, z: -0.7 });
        hand(out, 'R', v.set(-0.06, 0.8, 0.43), w.set(1, -0.15, 0.5), { x: 0, y: -0.6, z: -0.7 });
        fingers(out, 'L', 0.4, 0.7, 0.8, 0.85, 0.9, 0);
        fingers(out, 'R', 0.4, 0.7, 0.8, 0.85, 0.9, 0);
        elbow(out, 'L', 0.6, 0.7, -0.3);
        elbow(out, 'R', -0.6, 0.7, -0.3);
        setV(out, 'spine', 0.28, 0, 0);
        setV(out, 'head', 0, 0, 0.08);
        break;
      }
      case 'think': {
        hand(out, 'L', v.set(0.04, 1.04, 0.3), w.set(-0.2, 1, 0.15), { x: -0.3, y: 0, z: -1 });
        fingers(out, 'L', 0.3, 0.2, 0.75, 0.9, 1.0, 0);
        elbow(out, 'L', 0.3, 0.2, 0.6);
        setV(out, 'spine', 0.22, -0.05, 0.04);
        const up = v.set(-0.6, 1.9, 0.6);
        look(out, up, 1);
        ctx.gazeHint = up.clone();
        setV(out, 'head', -0.05, 0, 0.1);
        break;
      }
      case 'speak':
        this.speak(ctx, out);
        break;
    }
    if (ctx.phoneInHand) {
      // the left hand keeps the phone; glance at it when nobody is talking
      phoneCarryPose(out, true, t);
      if (ctx.convo === 'idle' && Math.sin(t * 0.37) > -0.2) {
        const ph = ctx.anchors.phone;
        if (ph) {
          look(out, ph, 1);
          ctx.gazeHint = ph;
        }
      }
    }
  }

  /** Beat gestures: the hand lifts on stressed syllables and settles back. */
  private speak(ctx: Ctx, out: Float32Array) {
    if (ctx.beat !== this.lastBeat) {
      this.lastBeat = ctx.beat;
      if (this.gestureT > 0.9 || this.gestureAmp < 0.05) {
        if (ctx.rand() < 0.6) {
          this.gestureSide = ctx.rand() < 0.65 ? 'R' : 'L';
          this.gestureShape = ctx.rand();
          this.gestureAmp = 0.5 + 0.5 * ctx.rand();
          this.gestureT = 0;
        }
      }
    }
    this.gestureT += ctx.dt;
    const k = this.gestureAmp * Math.sin(Math.min(1, this.gestureT / 1.1) * Math.PI);
    setV(out, 'spine', 0.2 + 0.03 * ctx.speechEnv, 0.03 * Math.sin(ctx.time * 0.6), 0);
    if (k > 0.001) {
      const s = this.gestureSide;
      const sx = s === 'L' ? 1 : -1;
      const o = s === 'L' ? C.handL : C.handR;
      // palm-up open hand rising in front of the chest
      const x = out[o] + (0.06 * sx - out[o]) * k * 0.6;
      const y = out[o + 1] + 0.16 * k * (0.7 + 0.3 * this.gestureShape);
      const z = out[o + 2] - 0.02 * k;
      hand(out, s, v.set(x, y, z), w.set(-sx * 0.6, 0.15 * k, 1), { x: -sx * 0.3 * k, y: -1 + 1.6 * k, z: 0.4 * k });
      fingers(out, s, 0.2, 0.2 + 0.2 * (1 - k), 0.26 + 0.2 * (1 - k), 0.32 + 0.2 * (1 - k), 0.38 + 0.2 * (1 - k), 0.12 * k);
    }
    if (ctx.beat % 5 === 0) setV(out, 'head', 0.025 * ctx.speechEnv, 0, 0);
  }
}
