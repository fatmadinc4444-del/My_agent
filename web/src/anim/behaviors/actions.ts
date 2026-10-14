import * as THREE from 'three';
import type { Behavior } from '../graph';
import type { Ctx } from '../ctx';
import type { World } from '../world';
import { C, setV } from '../controls';
import { R, elbow, fingers, hand, look, relaxedFingers, seatedBase } from './common';
import { FloorPath, Gait, phoneCarryPose, standingBase, toRoot } from './locomotion';
import { L } from '../../scene/layout';
import { smootherstep as mj, smoothstep } from '../../math/spring';
import { phoneDeskTransform, phoneSocketL, guitarStandTransform } from '../../scene/props';

/**
 * One-shot actions. Each is a short script over time; reaches use
 * minimum-jerk profiles (Flash & Hogan 1985 — the quintic smootherstep), props
 * change parent exactly at contact so hand-offs never pop.
 */

const v = new THREE.Vector3();
const w = new THREE.Vector3();
const tmp = new THREE.Vector3();

function mixInto(out: Float32Array, k: keyof typeof C, x: number, y: number, z: number, a: number) {
  const o = C[k];
  out[o] += (x - out[o]) * a;
  out[o + 1] += (y - out[o + 1]) * a;
  out[o + 2] += (z - out[o + 2]) * a;
}

abstract class Scripted implements Behavior<Ctx> {
  abstract readonly name: string;
  protected t = 0;
  protected abstract dur: number;
  enter(_ctx: Ctx) {
    this.t = 0;
  }
  finished() {
    return this.t >= this.dur;
  }
  evaluate(ctx: Ctx, out: Float32Array) {
    this.t += ctx.dt;
    this.script(ctx, out, this.t);
  }
  protected abstract script(ctx: Ctx, out: Float32Array, t: number): void;
}

// ------------------------------------------------------------------ wave
export class Wave extends Scripted {
  readonly name = 'wave';
  protected dur = 2.8;
  protected script(ctx: Ctx, out: Float32Array, t: number) {
    seatedBase(out, ctx.camera);
    if (ctx.phoneInHand) phoneCarryPose(out, true, ctx.time);
    const k = mj(t / 0.45) * (1 - mj((t - 2.3) / 0.5));
    const wag = Math.sin((t - 0.4) * 11) * k;
    v.set(-0.27, 1.22, 0.24);
    const o = C.handR;
    const x = out[o] + (v.x - out[o]) * k;
    const y = out[o + 1] + (v.y - out[o + 1]) * k;
    const z = out[o + 2] + (v.z - out[o + 2]) * k;
    hand(out, 'R', { x: x + 0.025 * wag, y, z }, w.set(-0.15 + 0.5 * wag * k, 1, 0.15), { x: 0.1, y: 0, z: 1 });
    if (k > 0.3) fingers(out, 'R', 0.05, 0.05, 0.05, 0.08, 0.1, 0.4);
    mixInto(out, 'elbowR', -0.8, 0.9, 0.2, k);
    setV(out, 'spine', 0.12, -0.08 * k, -0.06 * k);
    ctx.expr = k > 0.1 ? { emotion: 'happy', amt: 0.9 } : null;
  }
}

// ------------------------------------------------------------------ stretch + yawn
export class Stretch extends Scripted {
  readonly name = 'stretch';
  protected dur = 4.4;
  protected script(ctx: Ctx, out: Float32Array, t: number) {
    seatedBase(out, ctx.camera);
    const k = mj(t / 0.9) * (1 - mj((t - 3.4) / 1.0));
    for (const [s, sx] of [
      ['L', 1],
      ['R', -1],
    ] as const) {
      const o = s === 'L' ? C.handL : C.handR;
      const x = out[o] + (0.05 * sx - out[o]) * k;
      const y = out[o + 1] + (1.68 - out[o + 1]) * k;
      const z = out[o + 2] + (0.02 - out[o + 2]) * k;
      hand(out, s, { x, y, z }, w.set(-sx * 0.5 * k, 1, 0.1), { x: 0, y: 0.6 * k, z: -1 + k });
      fingers(out, s, 0.1, 0.12, 0.12, 0.15, 0.18, 0.3 * k);
      mixInto(out, s === 'L' ? 'elbowL' : 'elbowR', 0.8 * sx, 1.8, -0.2, k);
    }
    setV(out, 'spine', 0.16 - 0.32 * k, 0, 0);
    setV(out, 'head', -0.25 * k, 0, 0.05 * k);
    setV(out, 'shrug', 0.25 * k, 0.25 * k);
    look(out, ctx.camera, 1 - 0.6 * k);
    const yawn = smoothstep(0.6, 1.4, t) * (1 - smoothstep(2.8, 3.6, t));
    ctx.mouth = yawn > 0.01 ? { jaw: 0.42 * yawn, funnel: 0.35 * yawn, lowerDown: 0.4 * yawn } : null;
    ctx.eyesShut = yawn * 0.95;
    ctx.expr = null;
  }
  exit(ctx: Ctx) {
    ctx.mouth = null;
    ctx.eyesShut = 0;
  }
}

// ------------------------------------------------------------------ phone pick / put
export class PickPhone extends Scripted {
  readonly name = 'pickPhone';
  protected dur = 1.7;
  private grabbed = false;
  constructor(private world: World) {
    super();
  }
  enter(ctx: Ctx) {
    super.enter(ctx);
    this.grabbed = this.world.phoneInHand;
  }
  protected script(ctx: Ctx, out: Float32Array, t: number) {
    seatedBase(out, ctx.camera);
    const ph = R(L.phoneRest.x, L.phoneRest.y, L.phoneRest.z);
    const grip = v.set(ph.x + 0.04, ph.y + 0.03, ph.z - 0.06);
    const reach = mj(t / 0.7);
    if (t < 0.75) {
      const o = C.handL;
      hand(out, 'L', { x: out[o] + (grip.x - out[o]) * reach, y: out[o + 1] + (grip.y - out[o + 1]) * reach + 0.04 * Math.sin(reach * Math.PI), z: out[o + 2] + (grip.z - out[o + 2]) * reach }, w.set(-0.6, -0.35, 1), { x: 0, y: -1, z: 0 });
      fingers(out, 'L', 0.3 + 0.2 * reach, 0.35, 0.4, 0.45, 0.5, 0.2);
      look(out, L.phoneRest, 1);
      ctx.gazeHint = L.phoneRest;
    } else {
      if (!this.grabbed) {
        const s = phoneSocketL();
        this.world.phone.attach(this.world.character.bones['hand.L'], s.pos, s.quat, 0.1);
        this.world.phoneInHand = ctx.phoneInHand = true;
        this.grabbed = true;
        ctx.blend(0.35);
      }
      phoneCarryPose(out, true, ctx.time);
      look(out, this.world.phone.obj.getWorldPosition(tmp), 1);
      ctx.gazeHint = tmp;
    }
  }
}

export class PutPhone extends Scripted {
  readonly name = 'putPhone';
  protected dur = 1.6;
  private released = false;
  constructor(private world: World) {
    super();
  }
  enter(ctx: Ctx) {
    super.enter(ctx);
    this.released = !this.world.phoneInHand;
  }
  protected script(ctx: Ctx, out: Float32Array, t: number) {
    seatedBase(out, ctx.camera);
    if (t < 0.85 && !this.released) {
      phoneCarryPose(out, true, ctx.time);
      const ph = R(L.phoneRest.x, L.phoneRest.y, L.phoneRest.z);
      const k = mj(t / 0.8);
      const o = C.handL;
      hand(out, 'L', { x: out[o] + (ph.x + 0.04 - out[o]) * k, y: out[o + 1] + (ph.y + 0.035 - out[o + 1]) * k, z: out[o + 2] + (ph.z - 0.06 - out[o + 2]) * k }, w.set(-0.6, -0.35 * k + 0.75 * (1 - k), 1), { x: 0, y: -1 * k + 0.5 * (1 - k), z: -(1 - k) });
      look(out, L.phoneRest, 1);
    } else if (!this.released) {
      const d = phoneDeskTransform();
      this.world.phone.attach(this.world.room.group, d.pos, d.quat, 0.08);
      this.world.phoneInHand = ctx.phoneInHand = false;
      this.released = true;
      ctx.blend(0.4);
    }
  }
}

// ------------------------------------------------------------------ guitar
/** Guitar body on the lap, in hips space. */
const LAP_POS = new THREE.Vector3(-0.115, 0.13, 0.2);
const LAP_QUAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, 0.18, -1.2, 'YXZ'));

/** World transform of the guitar when lying on the lap (hips socket). */
function lapWorld(world: World, pos: THREE.Vector3, quat: THREE.Quaternion) {
  const hips = world.character.bones['hips'];
  hips.updateWorldMatrix(true, false);
  pos.copy(LAP_POS).applyMatrix4(hips.matrixWorld);
  quat.copy(hips.getWorldQuaternion(new THREE.Quaternion())).multiply(LAP_QUAT);
}

/**
 * Moves the guitar between the stand and the lap. The GUITAR drives the
 * hand: its world transform follows a min-jerk interpolation (with an arc so
 * it never sweeps through the face/desk) and the right hand IK-tracks the neck.
 */
function guitarTransit(world: World, ctx: Ctx, out: Float32Array, k: number, toLap: boolean) {
  const st = guitarStandTransform();
  const lp = new THREE.Vector3();
  const lq = new THREE.Quaternion();
  lapWorld(world, lp, lq);
  const u = toLap ? k : 1 - k;
  const G = world.guitar.obj;
  if (G.parent !== world.room.group) world.room.group.attach(G);
  G.position.lerpVectors(st.pos, lp, u);
  G.position.y += 0.08 * Math.sin(Math.PI * u);
  G.position.z += 0.06 * Math.sin(Math.PI * u);
  G.quaternion.slerpQuaternions(st.quat, lq, u);
  G.updateMatrixWorld(true);
  const neck = new THREE.Vector3().copy(world.guitarAnchors.neckGrab).applyMatrix4(G.matrixWorld);
  const r = R(neck.x, neck.y, neck.z);
  hand(out, 'R', { x: r.x, y: r.y + 0.02, z: r.z - 0.02 }, w.set(0.3 * u, -0.3 + 0.2 * u, 1), { x: 1 - u, y: 0, z: -u * 0.6 });
  fingers(out, 'R', 0.7, 0.9, 0.95, 1, 1, 0);
  elbow(out, 'R', -0.9, 0.7, -0.2);
  setV(out, 'spine', 0.18 + 0.12 * (1 - u), 0.25 * (1 - u), 0.1 * (1 - u));
  look(out, neck, 1);
  ctx.gazeHint = neck;
}

export class GuitarTake extends Scripted {
  readonly name = 'guitarTake';
  protected dur = 2.2;
  private stage = 0;
  constructor(private world: World) {
    super();
  }
  enter(ctx: Ctx) {
    super.enter(ctx);
    this.stage = this.world.guitarOnLap ? 2 : 0;
  }
  protected script(ctx: Ctx, out: Float32Array, t: number) {
    seatedBase(out, ctx.camera);
    if (this.stage === 0) {
      // lean and reach for the neck on the stand
      const G = this.world.guitar.obj;
      G.updateWorldMatrix(true, false);
      const neck = tmp.copy(this.world.guitarAnchors.neckGrab).applyMatrix4(G.matrixWorld);
      const k = mj(t / 0.9);
      const r = R(neck.x, neck.y + 0.02, neck.z - 0.02);
      mixInto(out, 'handR', r.x, r.y, r.z, k);
      hand(out, 'R', { x: out[C.handR], y: out[C.handR + 1], z: out[C.handR + 2] }, w.set(0, -0.3, 1), { x: 1, y: 0, z: 0 });
      fingers(out, 'R', 0.3 + 0.4 * k, 0.4 + 0.5 * k, 0.45 + 0.5 * k, 0.5 + 0.5 * k, 0.55 + 0.45 * k, 0);
      mixInto(out, 'elbowR', -0.9, 0.7, -0.2, k);
      setV(out, 'spine', 0.16 + 0.14 * k, 0.25 * k, 0.1 * k);
      look(out, neck, 1);
      ctx.gazeHint = neck.clone();
      if (t >= 0.9) this.stage = 1;
    } else if (this.stage === 1) {
      guitarTransit(this.world, ctx, out, mj((t - 0.9) / 1.1), true);
      if (t >= 2.0) {
        this.world.guitar.attach(this.world.character.bones['hips'], LAP_POS, LAP_QUAT, 0.05);
        this.world.guitarOnLap = true;
        this.stage = 2;
        ctx.blend(0.3);
      }
    } else {
      GuitarPlay.pose(ctx, out, this.world, 0);
    }
  }
}

export class GuitarPlay implements Behavior<Ctx> {
  readonly name = 'guitar';
  private t = 0;
  constructor(private world: World) {}
  enter() {
    this.t = 0;
  }
  evaluate(ctx: Ctx, out: Float32Array) {
    this.t += ctx.dt;
    GuitarPlay.pose(ctx, out, this.world, this.t);
  }

  static pose(ctx: Ctx, out: Float32Array, world: World, t: number) {
    seatedBase(out, ctx.camera);
    const G = world.guitar.obj;
    G.updateWorldMatrix(true, false);
    const strum = tmp.copy(world.guitarAnchors.strum).applyMatrix4(G.matrixWorld);
    const fret = new THREE.Vector3().copy(world.guitarAnchors.fret).applyMatrix4(G.matrixWorld);
    // 92 bpm, pattern D - D U - U D U (classic campfire strum)
    const beat = (t * 92) / 60;
    const pattern = [1, 0, 1, -1, 0, -1, 1, -1];
    const idx = Math.floor(beat * 2) % 8;
    const f = beat * 2 - Math.floor(beat * 2);
    const dir = pattern[idx];
    const stroke = dir === 0 ? 0 : dir * (mj(f / 0.35) - 0.5) * 2;
    const rs = R(strum.x, strum.y, strum.z);
    hand(out, 'R', { x: rs.x - 0.02, y: rs.y + 0.05 * stroke + 0.04, z: rs.z + 0.03 }, w.set(0.35, -0.8, 0.25), { x: 0.2, y: -0.2, z: -1 });
    fingers(out, 'R', 0.55, 0.7, 0.8, 0.85, 0.9, 0);
    elbow(out, 'R', -0.5, 1.1, -0.6);
    const rf = R(fret.x, fret.y, fret.z);
    hand(out, 'L', { x: rf.x, y: rf.y - 0.02, z: rf.z - 0.025 }, w.set(-0.2, 0.25, 1), { x: -0.6, y: -0.6, z: -0.5 });
    // chord changes every two beats
    const chord = Math.floor(beat / 2) % 4;
    const shapes = [
      [0.5, 0.8, 0.95, 0.7, 0.5],
      [0.45, 0.6, 0.85, 1.0, 0.8],
      [0.5, 0.9, 0.7, 0.95, 0.6],
      [0.55, 0.75, 1.0, 0.85, 0.7],
    ];
    const s = shapes[chord];
    fingers(out, 'L', s[0], s[1], s[2], s[3], s[4], 0.3);
    elbow(out, 'L', 0.6, 0.7, -0.2);
    setV(out, 'spine', 0.2, -0.05, 0.05);
    // nod to the beat, glance at the fretboard now and then
    const nod = 0.04 * Math.pow(Math.abs(Math.sin(Math.PI * beat)), 3);
    setV(out, 'head', nod, 0, 0.06);
    const atFret = Math.sin(t * 0.35) > 0.55 && ctx.convo !== 'speaking';
    if (atFret) {
      look(out, fret, 0.6);
      ctx.gazeHint = fret;
    }
    ctx.expr = { emotion: 'happy', amt: 0.55 };
  }
}

export class GuitarReturn extends Scripted {
  readonly name = 'guitarReturn';
  protected dur = 1.9;
  private placed = false;
  constructor(private world: World) {
    super();
  }
  enter(ctx: Ctx) {
    super.enter(ctx);
    this.placed = !this.world.guitarOnLap;
    this.world.guitarOnLap = false;
    ctx.expr = null;
    if (!this.placed) ctx.blend(0.3);
  }
  protected script(ctx: Ctx, out: Float32Array, t: number) {
    seatedBase(out, ctx.camera);
    if (this.placed) return;
    guitarTransit(this.world, ctx, out, mj(t / 1.3), false);
    if (t >= 1.3) {
      const st = guitarStandTransform();
      this.world.guitar.attach(this.world.room.group, st.pos, st.quat, 0.05);
      this.placed = true;
      ctx.blend(0.45);
    }
  }
}

// ------------------------------------------------------------------ call the cat / pet it
export class CallCat extends Scripted {
  readonly name = 'callCat';
  protected dur = 3.2;
  constructor(private world: World) {
    super();
  }
  enter(ctx: Ctx) {
    super.enter(ctx);
    this.world.cat.call();
  }
  protected script(ctx: Ctx, out: Float32Array, t: number) {
    seatedBase(out, ctx.camera);
    if (ctx.phoneInHand) phoneCarryPose(out, true, ctx.time);
    const catPos = this.world.cat.root.getWorldPosition(tmp).add(v.set(0, 0.15, 0));
    const k = mj(t / 0.5) * (1 - mj((t - 2.7) / 0.5));
    look(out, catPos, k);
    ctx.gazeHint = k > 0.5 ? catPos.clone() : null;
    setV(out, 'spine', 0.12, 0.3 * k, 0);
    // pat the desk three times with the left hand
    if (!ctx.phoneInHand && t > 0.4 && t < 2.4) {
      const pat = Math.max(0, Math.sin((t - 0.4) * Math.PI * 3));
      out[C.handL + 1] += 0.06 * pat;
      out[C.handL] += 0.08;
    }
    // "pıs pıs pıs"
    const pss = t > 0.5 && t < 2.2 ? Math.max(0, Math.sin((t - 0.5) * 18)) : 0;
    ctx.mouth = pss > 0.05 ? { stretch: 0.45, upperUp: 0.3, lowerDown: 0.2, jaw: 0.03, pucker: 0.25 * pss } : null;
    ctx.expr = { emotion: 'happy', amt: 0.6 * k };
  }
  exit(ctx: Ctx) {
    ctx.mouth = null;
    ctx.expr = null;
  }
}

export class PetCat extends Scripted {
  readonly name = 'petCat';
  protected dur = 4.2;
  constructor(private world: World) {
    super();
  }
  protected script(ctx: Ctx, out: Float32Array, t: number) {
    seatedBase(out, ctx.camera);
    const cat = this.world.cat.root.getWorldPosition(tmp);
    const back = R(cat.x, cat.y + 0.2, cat.z);
    const k = mj(t / 0.8) * (1 - mj((t - 3.4) / 0.8));
    const stroke = 0.5 - 0.5 * Math.cos(Math.max(0, t - 0.8) * 2.4);
    const target = v.set(back.x + 0.02, back.y + 0.02 * Math.sin(stroke * Math.PI), back.z + 0.1 - 0.17 * stroke);
    mixInto(out, 'handL', target.x, target.y, target.z, k);
    hand(out, 'L', { x: out[C.handL], y: out[C.handL + 1], z: out[C.handL + 2] }, w.set(-0.3, -0.25, -1), { x: 0, y: -1, z: 0 });
    relaxedFingers(out, 'L', 0.6);
    setV(out, 'spine', 0.16 + 0.22 * k, 0.15 * k, -0.05 * k);
    look(out, cat.clone().add(v.set(0, 0.15, 0)), 1);
    ctx.gazeHint = cat.clone().add(w.set(0, 0.15, 0));
    ctx.expr = { emotion: 'happy', amt: 0.85 * k };
  }
  exit(ctx: Ctx) {
    ctx.expr = null;
  }
}

// ------------------------------------------------------------------ standing up, walking, window
const STAND_HIPS = 0.885;

function sitStandBlend(out: Float32Array, ctx: Ctx, k: number, phone: boolean) {
  // k = 0 seated .. 1 standing (feet pulled back first, lean forward, rise)
  const seated = new Float32Array(out.length);
  seatedBase(seated, ctx.camera);
  if (phone) phoneCarryPose(seated, true, ctx.time);
  const standing = new Float32Array(out.length);
  setV(standing, 'root', L.chair.x, L.chair.z, 0);
  standingBase(standing, ctx.camera);
  if (phone) phoneCarryPose(standing, false, ctx.time);
  const feet = mj(k / 0.35);
  const rise = mj((k - 0.25) / 0.75);
  for (let i = 0; i < out.length; i++) out[i] = seated[i] + (standing[i] - seated[i]) * rise;
  for (const key of ['footL', 'footR'] as const) {
    const o = C[key];
    out[o + 2] = seated[o + 2] + (standing[o + 2] - seated[o + 2]) * feet;
  }
  // lean forward in the middle of the movement (centre of mass over the feet)
  out[C.spine] += 0.45 * Math.sin(Math.PI * Math.min(1, k * 1.1));
  out[C.hipsPos + 1] = 0.565 + (STAND_HIPS - 0.565) * rise;
  out[C.hipsPos + 2] = -0.02 + 0.1 * Math.sin(Math.PI * rise);
}

export class WindowTrip extends Scripted {
  readonly name = 'window';
  protected dur = 1e9;
  private gait = new Gait();
  private pathTo = new FloorPath([
    [L.chair.x, L.chair.z],
    [0.38, -0.84],
    [0.72, -1.08],
    [L.windowStand.x, L.windowStand.z],
  ]);
  private pathBack = new FloorPath([
    [L.windowStand.x, L.windowStand.z],
    [0.72, -1.05],
    [0.38, -0.82],
    [L.chair.x, L.chair.z],
  ]);
  private s = 0;
  private speed = 0;
  private stage = 0;
  private stageT = 0;
  private startOpen = 0;
  private done = false;
  constructor(private world: World, private open: boolean) {
    super();
  }
  enter(ctx: Ctx) {
    super.enter(ctx);
    this.stage = 0;
    this.stageT = 0;
    this.s = 0;
    this.speed = 0;
    this.done = false;
    this.gait.reset(0);
    this.startOpen = this.world.room.windowOpen;
  }
  finished() {
    return this.done;
  }
  private next(ctx: Ctx, blend = 0) {
    this.stage++;
    this.stageT = 0;
    if (blend) ctx.blend(blend);
  }
  protected script(ctx: Ctx, out: Float32Array, _t: number) {
    const dt = ctx.dt;
    this.stageT += dt;
    const T = this.stageT;
    const chair = this.world.room.chair;
    const phone = ctx.phoneInHand;
    switch (this.stage) {
      case 0: {
        // stand up, chair rolls back
        const k = Math.min(1, T / 1.3);
        sitStandBlend(out, ctx, k, phone);
        chair.position.z = L.chair.z - 0.3 * mj((T - 0.2) / 0.8);
        if (T >= 1.3) this.next(ctx);
        break;
      }
      case 1:
      case 4: {
        const path = this.stage === 1 ? this.pathTo : this.pathBack;
        const remaining = path.length - this.s;
        const vmax = 0.72;
        const target = remaining < 0.02 ? 0 : Math.min(vmax, Math.sqrt(2 * 0.9 * remaining) + 0.05);
        this.speed += (target - this.speed) * Math.min(1, dt * 4);
        this.s = Math.min(path.length, this.s + this.speed * dt);
        const finalYaw = remaining < 0.25 ? (this.stage === 1 ? Math.PI - 0.3 : 0) : null;
        this.gait.write(out, path, this.s, this.speed, dt, ctx.camera, phone, ctx.time, finalYaw);
        const lookAt = this.stage === 1 ? tmp.set(0.7, 1.5, L.window.z) : tmp.set(0, 1.2, 0.5);
        look(out, lookAt, 0.8);
        if (remaining < 0.01 && this.speed < 0.08 && T > 0.5) this.next(ctx, 0.3);
        break;
      }
      case 2: {
        // reach the handle and swing the sash
        const p = this.pathTo.at(this.pathTo.length, v);
        const yaw = Math.PI - 0.3;
        setV(out, 'root', p.x, p.z, yaw);
        standingBase(out, ctx.camera);
        if (phone) phoneCarryPose(out, false, ctx.time);
        const reach = mj(T / 0.7);
        const op = this.open ? mj((T - 0.7) / 1.6) : 1 - mj((T - 0.7) / 1.4);
        const from = this.startOpen;
        const opening = this.open ? from + (1 - from) * op : from * op;
        if (T > 0.7) this.world.room.setWindowOpen(opening);
        const hw = this.world.room.handleAt(T > 0.7 ? opening : from, w);
        const hr = toRoot(hw, p.x, p.z, yaw, tmp);
        mixInto(out, 'handR', hr.x, hr.y, hr.z - 0.03, reach);
        hand(out, 'R', { x: out[C.handR], y: out[C.handR + 1], z: out[C.handR + 2] }, v.set(-0.1, 0.1, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0), { x: 0.9, y: 0, z: 0.2 });
        fingers(out, 'R', 0.5, 0.8 * reach, 0.85 * reach, 0.9 * reach, 0.9 * reach, 0);
        mixInto(out, 'elbowR', -0.6, 0.9, -0.4, reach);
        setV(out, 'spine', 0.12, -0.15, 0);
        look(out, hw, 1);
        ctx.gazeHint = hw.clone();
        if (T > (this.open ? 2.4 : 2.2)) this.next(ctx, 0.45);
        break;
      }
      case 3: {
        // enjoy the breeze for a moment (only when opening)
        const p = this.pathTo.at(this.pathTo.length, v);
        setV(out, 'root', p.x, p.z, Math.PI - 0.3);
        standingBase(out, ctx.camera);
        if (phone) phoneCarryPose(out, false, ctx.time);
        const view = tmp.set(0.9, 1.45, L.window.z - 3);
        look(out, view, 1);
        ctx.gazeHint = view.clone();
        setV(out, 'spine', -0.04, 0, 0);
        setV(out, 'shrug', 0.08, 0.08);
        if (!this.open || T > 2.6) {
          this.s = 0;
          this.speed = 0;
          this.gait.reset(Math.PI - 0.3);
          this.next(ctx, 0.35);
        }
        break;
      }
      case 5: {
        // sit down, chair rolls back in
        const k = 1 - Math.min(1, T / 1.4);
        sitStandBlend(out, ctx, k, phone);
        chair.position.z = L.chair.z - 0.3 * (1 - mj((T - 0.5) / 0.8));
        if (T >= 1.45) {
          chair.position.z = L.chair.z;
          this.done = true;
        }
        break;
      }
    }
    if (this.stage !== 3) ctx.expr = null;
  }
}

/** Stand up and walk a loop around the room (holding the phone if it is in hand). */
export class WalkAround extends Scripted {
  readonly name = 'walk';
  protected dur = 1e9;
  private gait = new Gait();
  private path = new FloorPath([
    [L.chair.x, L.chair.z],
    [0.55, -0.78],
    [1.05, -0.4],
    [1.12, 0.55],
    [0.35, 0.78],
    [-0.45, 0.78],
    [-1.12, 0.5],
    [-1.12, -0.45],
    [-0.55, -0.98],
    [-0.15, -0.8],
    [L.chair.x, L.chair.z],
  ]);
  private s = 0;
  private speed = 0;
  private stage = 0;
  private stageT = 0;
  private done = false;
  constructor(private world: World) {
    super();
  }
  enter(ctx: Ctx) {
    super.enter(ctx);
    this.stage = 0;
    this.stageT = 0;
    this.s = 0;
    this.speed = 0;
    this.done = false;
    this.gait.reset(0);
  }
  finished() {
    return this.done;
  }
  protected script(ctx: Ctx, out: Float32Array, _t: number) {
    this.stageT += ctx.dt;
    const T = this.stageT;
    const chair = this.world.room.chair;
    const phone = ctx.phoneInHand;
    if (this.stage === 0) {
      sitStandBlend(out, ctx, Math.min(1, T / 1.3), phone);
      chair.position.z = L.chair.z - 0.3 * mj((T - 0.2) / 0.8);
      if (T >= 1.3) {
        this.stage = 1;
        this.stageT = 0;
      }
    } else if (this.stage === 1) {
      const remaining = this.path.length - this.s;
      const target = remaining < 0.02 ? 0 : Math.min(0.62, Math.sqrt(2 * 0.8 * remaining) + 0.05);
      this.speed += (target - this.speed) * Math.min(1, ctx.dt * 3);
      this.s = Math.min(this.path.length, this.s + this.speed * ctx.dt);
      this.gait.write(out, this.path, this.s, this.speed, ctx.dt, ctx.camera, phone, ctx.time, remaining < 0.3 ? 0 : null);
      if (phone) {
        const pw = this.world.phone.obj.getWorldPosition(tmp);
        // mostly reading the phone, looking up at the user now and then
        const glance = Math.sin(ctx.time * 0.5) > 0.6;
        look(out, glance ? ctx.camera : pw, 1);
        ctx.gazeHint = glance ? null : pw.clone();
      } else {
        const ahead = this.path.at(Math.min(this.path.length, this.s + 0.8), v);
        ahead.y = 1.35;
        look(out, Math.sin(ctx.time * 0.4) > 0.3 ? ctx.camera : ahead, 0.9);
      }
      if (remaining < 0.01 && this.speed < 0.08) {
        this.stage = 2;
        this.stageT = 0;
        ctx.blend(0.3);
      }
    } else {
      const k = 1 - Math.min(1, T / 1.4);
      sitStandBlend(out, ctx, k, phone);
      chair.position.z = L.chair.z - 0.3 * (1 - mj((T - 0.5) / 0.8));
      if (T >= 1.45) {
        chair.position.z = L.chair.z;
        this.done = true;
      }
    }
  }
}
