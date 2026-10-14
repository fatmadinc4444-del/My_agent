import * as THREE from 'three';
import { L } from '../scene/layout';
import { Spring1, damper } from '../math/spring';
import { fbm1, logNormal } from '../math/noise';

/**
 * Procedural cat. No clips: a finite-state machine (sleep -> wake -> walk ->
 * jump -> sit/loaf -> return) drives a few pose parameters on springs, legs
 * are placed with analytic two-bone IK on a diagonal trot gait (feet are
 * planted during stance, so there is no foot sliding), jumps are ballistic
 * arcs, and the tail is a damped spring chain.
 */

type State = 'sleep' | 'wake' | 'walk' | 'jump' | 'sit' | 'loaf';

interface Leg {
  hip: THREE.Vector3; // body-local
  upper: THREE.Mesh;
  lower: THREE.Mesh;
  paw: THREE.Mesh;
  foot: THREE.Vector3; // world
  plant: THREE.Vector3; // world
  phase: number;
  front: boolean;
  side: number;
  len1: number;
  len2: number;
}

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

function capsule(r: number, len: number, mat: THREE.Material) {
  const g = new THREE.CapsuleGeometry(r, len, 4, 10);
  g.translate(0, -len / 2, 0); // pivot at the top
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

export class Cat {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private torso: THREE.Mesh;
  private head = new THREE.Group();
  private tail: THREE.Mesh[] = [];
  private tailAng: Spring1[] = [];
  private legs: Leg[] = [];
  private earL: THREE.Mesh;
  private earR: THREE.Mesh;
  private eyeL: THREE.Mesh;
  private eyeR: THREE.Mesh;
  state: State = 'sleep';
  private stateT = 0;
  private path: { p: THREE.Vector3; jump?: boolean }[] = [];
  private pathI = 0;
  private yaw = new Spring1(0, 0.25);
  private height = new Spring1(0.06, 0.2);
  private pitch = new Spring1(0, 0.2);
  private headYaw = new Spring1(0, 0.15);
  private headPitch = new Spring1(0.5, 0.2);
  private eyesOpen = new Spring1(0, 0.08);
  private jumpFrom = new THREE.Vector3();
  private jumpTo = new THREE.Vector3();
  private gaitS = 0;
  private nextTwitch = 2;
  private returnAt = 0;
  lookTarget: THREE.Vector3 | null = null;
  onArrive: (() => void) | null = null;

  constructor() {
    const fur = new THREE.MeshStandardMaterial({ color: 0xd98a46, roughness: 0.85 });
    const cream = new THREE.MeshStandardMaterial({ color: 0xf1dcc0, roughness: 0.9 });
    const pink = new THREE.MeshStandardMaterial({ color: 0xe59a9a, roughness: 0.6 });
    const eyeMat = new THREE.MeshPhysicalMaterial({ color: 0x9fc23a, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
    // tabby stripes via a cheap shader tweak
    fur.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
        .replace('#include <color_fragment>', '#include <color_fragment>\nfloat st = smoothstep(0.55, 0.85, sin(vObj.z * 120.0 + sin(vObj.x * 60.0) * 1.5) * 0.5 + 0.5);\ndiffuseColor.rgb *= 1.0 - 0.32 * st;');
    };
    this.root.add(this.body);
    this.torso = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), fur);
    this.torso.scale.set(0.075, 0.075, 0.16);
    this.torso.castShadow = true;
    this.body.add(this.torso);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), cream);
    chest.position.set(0, -0.012, 0.1);
    chest.scale.set(1, 1.05, 0.9);
    this.body.add(chest);
    // head
    this.head.position.set(0, 0.06, 0.16);
    this.body.add(this.head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.058, 20, 14), fur);
    skull.scale.set(1.08, 0.92, 0.95);
    skull.castShadow = true;
    this.head.add(skull);
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), cream);
    muzzle.position.set(0, -0.016, 0.045);
    muzzle.scale.set(1.2, 0.75, 0.8);
    this.head.add(muzzle);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 6), pink);
    nose.position.set(0, -0.005, 0.068);
    this.head.add(nose);
    const earGeo = new THREE.ConeGeometry(0.022, 0.045, 4);
    this.earL = new THREE.Mesh(earGeo, fur);
    this.earL.position.set(0.032, 0.05, -0.005);
    this.earL.rotation.set(-0.1, 0.4, -0.3);
    this.earR = new THREE.Mesh(earGeo, fur);
    this.earR.position.set(-0.032, 0.05, -0.005);
    this.earR.rotation.set(-0.1, -0.4, 0.3);
    this.head.add(this.earL, this.earR);
    const eg = new THREE.SphereGeometry(0.0115, 14, 10);
    this.eyeL = new THREE.Mesh(eg, eyeMat);
    this.eyeL.position.set(0.024, 0.008, 0.045);
    this.eyeR = new THREE.Mesh(eg, eyeMat);
    this.eyeR.position.set(-0.024, 0.008, 0.045);
    const pupil = new THREE.MeshBasicMaterial({ color: 0x050505 });
    for (const e of [this.eyeL, this.eyeR]) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), pupil);
      p.scale.set(0.45, 1.3, 0.5);
      p.position.z = 0.0085;
      e.add(p);
      this.head.add(e);
    }
    // tail chain
    let parent: THREE.Object3D = this.body;
    for (let i = 0; i < 8; i++) {
      const seg = capsule(0.016 - i * 0.0012, 0.036, fur);
      seg.position.set(0, i === 0 ? 0.02 : -0.036, i === 0 ? -0.15 : 0);
      parent.add(seg);
      this.tail.push(seg);
      this.tailAng.push(new Spring1(0, 0.08 + i * 0.015));
      parent = seg;
    }
    // legs
    const legDefs: [number, number, boolean][] = [
      [0.042, 0.1, true],
      [-0.042, 0.1, true],
      [0.045, -0.1, false],
      [-0.045, -0.1, false],
    ];
    for (const [x, z, front] of legDefs) {
      const len1 = front ? 0.1 : 0.11;
      const len2 = front ? 0.1 : 0.1;
      const upper = capsule(front ? 0.019 : 0.024, len1, fur);
      const lower = capsule(0.014, len2, fur);
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), cream);
      paw.scale.set(1, 0.65, 1.3);
      paw.castShadow = true;
      this.root.add(upper, lower, paw);
      this.legs.push({
        hip: new THREE.Vector3(x, -0.01, z),
        upper,
        lower,
        paw,
        foot: new THREE.Vector3(),
        plant: new THREE.Vector3(),
        phase: (x > 0) === front ? 0 : 0.5,
        front,
        side: Math.sign(x),
        len1,
        len2,
      });
    }
    // start asleep on the bed
    this.root.position.copy(L.catBed);
    this.yaw.reset(-2.2);
    this.root.rotation.y = -2.2;
    for (const l of this.legs) {
      this.bodyToWorld(l.hip, l.foot);
      l.foot.y = this.root.position.y;
      l.plant.copy(l.foot);
    }
  }

  private bodyToWorld(p: THREE.Vector3, out: THREE.Vector3) {
    this.body.updateWorldMatrix(true, false);
    return out.copy(p).applyMatrix4(this.body.matrixWorld);
  }

  /** Call the cat over to the desk. */
  call() {
    if (this.state === 'walk' || this.state === 'jump' || this.state === 'sit' || this.state === 'loaf') {
      this.lookTarget = L.camera;
      return;
    }
    this.state = 'wake';
    this.stateT = 0;
    this.path = [
      { p: new THREE.Vector3(1.0, 0, -0.75), jump: true },
      { p: new THREE.Vector3(1.08, 0, -0.1) },
      { p: L.catDesk.clone(), jump: true },
    ];
    this.pathI = 0;
  }

  /** Go back to sleep on the bed. */
  goToBed() {
    this.state = 'walk';
    this.path = [
      { p: new THREE.Vector3(1.08, 0, -0.1), jump: true },
      { p: new THREE.Vector3(1.0, 0, -0.75) },
      { p: L.catBed.clone(), jump: true },
    ];
    this.pathI = 0;
  }

  update(dt: number, time: number, wind: THREE.Vector3) {
    this.stateT += dt;
    const pos = this.root.position;
    let speed = 0;
    switch (this.state) {
      case 'sleep':
        this.height.update(0.055, dt);
        this.pitch.update(0, dt);
        this.headPitch.update(0.55, dt);
        this.headYaw.update(0.4, dt);
        this.eyesOpen.update(0, dt);
        break;
      case 'wake':
        // stretch: front down, rear up, then stand
        this.eyesOpen.update(1, dt);
        if (this.stateT < 1.2) {
          this.height.update(0.13, dt);
          this.pitch.update(0.35, dt);
          this.headPitch.update(-0.2, dt);
        } else {
          this.height.update(0.19, dt);
          this.pitch.update(0, dt);
        }
        if (this.stateT > 1.8) {
          this.state = 'walk';
          this.stateT = 0;
        }
        break;
      case 'walk': {
        this.eyesOpen.update(1, dt);
        const goal = this.path[this.pathI];
        if (!goal) {
          this.state = pos.y > 0.6 && pos.distanceTo(L.catBed) < 0.3 ? 'sleep' : 'sit';
          this.stateT = 0;
          if (this.state === 'sit') this.onArrive?.();
          break;
        }
        tmp.subVectors(goal.p, pos);
        tmp.y = 0;
        const d = tmp.length();
        const targetYaw = Math.atan2(tmp.x, tmp.z);
        let dy = targetYaw - this.yaw.x;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        this.yaw.update(this.yaw.x + dy, dt);
        if (goal.jump && d < 0.45) {
          this.startJump(goal.p);
          break;
        }
        const facing = Math.cos(dy);
        speed = Math.max(0, facing) * Math.min(0.45, d * 1.5 + 0.1);
        pos.addScaledVector(tmp.normalize(), speed * dt);
        this.height.update(0.19, dt);
        this.pitch.update(0, dt);
        this.headPitch.update(0.05, dt);
        if (d < 0.04) this.pathI++;
        break;
      }
      case 'jump': {
        // crouch (0.25 s) -> ballistic flight (0.45 s) -> land
        const T = this.stateT;
        if (T < 0.25) {
          this.height.update(0.1, dt);
          this.pitch.update(-0.15, dt);
        } else {
          const u = Math.min(1, (T - 0.25) / 0.45);
          const apex = Math.max(this.jumpFrom.y, this.jumpTo.y) + 0.22;
          pos.lerpVectors(this.jumpFrom, this.jumpTo, u);
          // quadratic through apex
          const a = this.jumpFrom.y;
          const b = this.jumpTo.y;
          pos.y = (1 - u) * (1 - u) * a + 2 * u * (1 - u) * (2 * apex - (a + b) / 2) + u * u * b;
          this.pitch.update(u < 0.5 ? -0.5 : 0.35, dt);
          this.height.update(0.17, dt);
          if (u >= 1) {
            this.state = 'walk';
            this.stateT = 0;
            this.pathI++;
            for (const l of this.legs) {
              this.bodyToWorld(l.hip, l.plant);
              l.plant.y = pos.y;
              l.foot.copy(l.plant);
            }
          }
        }
        break;
      }
      case 'sit':
        this.height.update(0.13, dt);
        this.pitch.update(-0.55, dt);
        this.headPitch.update(0.45, dt);
        this.eyesOpen.update(1, dt);
        if (this.stateT > 25) {
          this.state = 'loaf';
          this.stateT = 0;
          this.returnAt = logNormal(Math.random, 40, 0.3);
        }
        break;
      case 'loaf':
        this.height.update(0.065, dt);
        this.pitch.update(0, dt);
        this.headPitch.update(0.1, dt);
        this.eyesOpen.update(0.35 + 0.1 * Math.sin(time * 0.3), dt);
        if (this.stateT > this.returnAt) this.goToBed();
        break;
    }
    this.root.rotation.y = this.yaw.x;
    this.body.position.y = this.height.x;
    this.body.rotation.x = -this.pitch.x;
    if (this.state === 'sleep') this.torso.scale.y = 0.075 * (1 + 0.04 * Math.sin(time * 1.7));

    // head look
    let hy = this.headYaw.x;
    let hp = this.headPitch.x;
    if (this.lookTarget && this.state !== 'sleep' && this.state !== 'jump') {
      this.head.updateWorldMatrix(true, false);
      const lp = this.head.worldToLocal(tmp.copy(this.lookTarget));
      hy = THREE.MathUtils.clamp(Math.atan2(lp.x, lp.z) + this.head.rotation.y, -1.0, 1.0);
      hp = THREE.MathUtils.clamp(-Math.atan2(lp.y, Math.hypot(lp.x, lp.z)) + this.head.rotation.x, -0.6, 0.6);
    }
    this.headYaw.update(hy, dt);
    this.headPitch.update(hp, dt);
    this.head.rotation.set(this.headPitch.x + this.pitch.x, this.headYaw.x, 0.08 * fbm1(time * 0.4));
    // ears & eyes
    this.nextTwitch -= dt;
    const tw = this.nextTwitch < 0 ? Math.max(0, 1 + this.nextTwitch * 6) : 0;
    if (this.nextTwitch < -0.2) this.nextTwitch = logNormal(Math.random, 3, 0.6);
    this.earL.rotation.z = -0.3 - 0.4 * tw;
    this.earR.rotation.z = 0.3 + 0.15 * fbm1(time * 0.9) + wind.length() * 0.05;
    const eo = this.eyesOpen.x;
    this.eyeL.scale.y = this.eyeR.scale.y = 0.12 + 0.88 * eo;

    // tail: base angle from mood, chain on springs (lags = whip)
    const sw = this.state === 'sit' || this.state === 'loaf' ? 0.5 : this.state === 'walk' ? 0.25 : 0.1;
    for (let i = 0; i < this.tail.length; i++) {
      const target = Math.sin(time * 1.6 - i * 0.45) * sw * (i / this.tail.length) + (this.state === 'sleep' ? 0.38 : 0.12);
      const a = this.tailAng[i].update(target, dt);
      const seg = this.tail[i];
      if (i === 0) seg.rotation.set(this.state === 'walk' ? -2.3 : this.state === 'sleep' ? -1.75 : -1.9, 0, a);
      else seg.rotation.set(this.state === 'walk' ? 0.12 : 0.05, a * 0.9, this.state === 'sleep' ? 0.35 : 0.08);
    }

    // legs
    this.updateLegs(dt, speed);
  }

  private startJump(to: THREE.Vector3) {
    this.state = 'jump';
    this.stateT = 0;
    this.jumpFrom.copy(this.root.position);
    this.jumpTo.copy(to);
  }

  private updateLegs(dt: number, speed: number) {
    const stride = 0.17;
    this.gaitS += speed * dt;
    const pos = this.root.position;
    const tucked = this.state === 'sleep' || this.state === 'loaf' || this.state === 'jump';
    for (const l of this.legs) {
      const hipW = this.bodyToWorld(l.hip, tmp2.set(0, 0, 0)).clone();
      let target: THREE.Vector3;
      if (tucked) {
        target = this.bodyToWorld(tmp.set(l.hip.x * 0.8, -this.height.x + 0.015, l.hip.z * (l.front ? 0.6 : 0.8)), new THREE.Vector3());
        if (this.state !== 'jump') target.y = Math.max(target.y, pos.y + 0.012);
        l.foot.lerp(target, damper(0.06, dt));
        l.plant.copy(l.foot);
      } else if (this.state === 'sit' && !l.front) {
        target = this.bodyToWorld(tmp.set(l.hip.x * 1.2, 0, l.hip.z + 0.07), new THREE.Vector3());
        target.y = pos.y + 0.012;
        l.foot.lerp(target, damper(0.08, dt));
        l.plant.copy(l.foot);
      } else if (speed > 0.01) {
        // diagonal trot: stance 60%, swing 40% with a lift arc
        const u = this.gaitS / stride + l.phase;
        const f = u - Math.floor(u);
        const under = this.bodyToWorld(tmp.set(l.hip.x, 0, l.hip.z), new THREE.Vector3());
        const fwd = new THREE.Vector3(Math.sin(this.yaw.x), 0, Math.cos(this.yaw.x));
        if (f >= 0.6) {
          const t = (f - 0.6) / 0.4;
          const next = under.clone().addScaledVector(fwd, stride * 0.5);
          next.y = pos.y;
          l.plant.lerp(next, Math.min(1, t * 1.2));
          l.foot.copy(l.plant);
          l.foot.y = pos.y + Math.sin(t * Math.PI) * 0.04;
          this.solveLeg(l, hipW);
          continue;
        }
        l.foot.copy(l.plant);
        l.foot.y = pos.y;
      } else {
        target = this.bodyToWorld(tmp.set(l.hip.x, 0, l.hip.z), new THREE.Vector3());
        target.y = pos.y;
        l.foot.lerp(target, damper(0.1, dt));
        l.plant.copy(l.foot);
      }
      this.solveLeg(l, hipW);
    }
  }

  private solveLeg(l: Leg, hipW: THREE.Vector3) {
    const foot = l.foot.clone();
    foot.y += 0.012;
    const d = foot.clone().sub(hipW);
    let dist = d.length();
    const dir = d.clone().divideScalar(dist || 1);
    dist = Math.min(dist, l.len1 + l.len2 - 1e-3);
    const fwd = new THREE.Vector3(Math.sin(this.yaw.x), 0, Math.cos(this.yaw.x));
    const pole = fwd.clone().negate(); // elbows and hocks point backwards
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const cosA = (l.len1 * l.len1 + dist * dist - l.len2 * l.len2) / (2 * l.len1 * dist);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const knee = hipW.clone().addScaledVector(dir, l.len1 * cosA).addScaledVector(pole, l.len1 * sinA);
    const reach = hipW.clone().addScaledVector(dir, dist);
    l.upper.position.copy(hipW);
    l.upper.quaternion.setFromUnitVectors(tmp.set(0, -1, 0), knee.clone().sub(hipW).normalize());
    l.lower.position.copy(knee);
    l.lower.quaternion.setFromUnitVectors(tmp.set(0, -1, 0), reach.clone().sub(knee).normalize());
    l.paw.position.copy(reach).add(tmp.set(0, -0.006, 0));
    l.paw.rotation.y = this.yaw.x;
  }
}
