import * as THREE from 'three';
import { SCALP_SDF } from './headShape';
import { evalSdf, rayToSurface, sdfNormal, type V3 } from './sdf';
import { rng } from '../math/noise';

/**
 * Stylised clump hair.
 *
 * Geometry: ~170 tapered ribbon clumps grown along a comb flow field away
 * from the crown, layered outward for volume, plus a scalp cap.
 * Dynamics: each clump is a 4-joint chain simulated with Dynamic
 * Follow-The-Leader (Müller et al. 2012: inextensible, unconditionally
 * stable) + shape matching toward the styled rest pose + wind. Joint
 * displacements are uploaded to a tiny float texture and the vertex shader
 * deforms all clumps in ONE draw call.
 */

export const HAIR_JOINTS = 4;
const SCALP_CENTER: V3 = [0, 0.02, -0.005];
const CROWN = new THREE.Vector3(0.01, 0.11, -0.085);
const PROXY = new THREE.Vector3(0, 0.0, -0.01);

function hairlineElev(az: number) {
  // az = 0 front (+Z), +-PI back
  const c = 0.5 + 0.5 * Math.cos(az);
  return -0.78 + 1.42 * Math.pow(c, 0.72);
}

function dirFromAzEl(az: number, el: number, out = new THREE.Vector3()) {
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

function scalpPoint(d: THREE.Vector3, out: THREE.Vector3, n?: THREE.Vector3) {
  const t = rayToSurface(SCALP_SDF, SCALP_CENTER, d.x, d.y, d.z, 0.3, 20);
  out.set(SCALP_CENTER[0] + d.x * t, SCALP_CENTER[1] + d.y * t, SCALP_CENTER[2] + d.z * t);
  if (n) {
    const v: V3 = [0, 0, 0];
    sdfNormal(SCALP_SDF, out.x, out.y, out.z, v);
    n.set(v[0], v[1], v[2]);
  }
  return out;
}

export interface HairBuild {
  clumps: THREE.BufferGeometry;
  cap: THREE.BufferGeometry;
  /** rest joint positions (head-local), clumps * HAIR_JOINTS * 3 */
  joints: Float32Array;
  count: number;
}

export function buildHair(): HairBuild {
  const R = rng(42);
  const roots: { az: number; el: number }[] = [];
  // Fibonacci sphere, filtered to the hair region
  const N = 420;
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N;
    const r = Math.sqrt(1 - y * y);
    const th = ga * i;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    const el = Math.asin(y);
    const az = Math.atan2(x, z);
    if (el < hairlineElev(az) + 0.02) continue;
    roots.push({ az: az + (R() - 0.5) * 0.05, el: el + (R() - 0.5) * 0.04 });
  }

  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const hair: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const joints = new Float32Array(roots.length * HAIR_JOINTS * 3);
  const STEPS = 12;
  const SEG = 7;
  const d = new THREE.Vector3();
  const S = new THREE.Vector3();
  const Nn = new THREE.Vector3();
  const tmp: V3 = [0, 0, 0];

  roots.forEach((rt, ci) => {
    dirFromAzEl(rt.az, rt.el, d);
    scalpPoint(d, S, Nn);
    const front = Math.max(0, Math.cos(rt.az)) * THREE.MathUtils.smoothstep(rt.el, 1.15, 0.55);
    const top = THREE.MathUtils.smoothstep(rt.el, 0.35, 1.2);
    const side = Math.abs(Math.sin(rt.az)) * (1 - top);
    const back = Math.max(0, -Math.cos(rt.az)) * (1 - top);
    // flow away from the crown, swept toward the character's right on top/front
    const flow = S.clone().sub(CROWN);
    flow.addScaledVector(Nn, -flow.dot(Nn)).normalize();
    flow.x -= 0.35 * (top + front);
    flow.y -= 0.25 * (side + back) + 0.25 * front;
    flow.addScaledVector(Nn, -flow.dot(Nn)).normalize();
    const lift = 0.15 + 0.55 * top + 0.3 * front;
    let dir = flow.clone().multiplyScalar(1).addScaledVector(Nn, 0.3 * lift).normalize();
    const len = (0.09 + 0.05 * top + 0.005 * front + 0.03 * back - 0.025 * side) * (0.85 + 0.3 * R());
    const width = (0.042 + 0.016 * top + 0.006 * front) * (0.85 + 0.3 * R());
    const thick = 0.008 + 0.004 * top;
    const wavePhase = R() * Math.PI * 2;
    const waveAmp = 0.2 + 0.25 * R();
    const shade = 0.8 + 0.25 * R();

    const pts: THREE.Vector3[] = [S.clone().addScaledVector(Nn, -0.004)];
    const nrms: THREE.Vector3[] = [Nn.clone()];
    const p = pts[0].clone();
    const step = len / STEPS;
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS;
      // bend toward gravity & curl, plus a soft wave
      const down = new THREE.Vector3(0, -1, 0);
      dir.addScaledVector(down, (0.1 + 0.18 * side + 0.12 * back + 0.25 * front) * t);
      const side3 = new THREE.Vector3().crossVectors(dir, nrms[i - 1]).normalize();
      dir.addScaledVector(side3, Math.sin(wavePhase + t * 5.5) * waveAmp * 0.18);
      dir.normalize();
      p.addScaledVector(dir, step);
      // keep outside the scalp with growing clearance (layering = volume)
      const minOff = 0.002 + (0.004 + 0.012 * lift) * Math.min(1, t * 1.6) * (0.6 + 0.4 * (1 - t));
      for (let k = 0; k < 4; k++) {
        const sd = evalSdf(SCALP_SDF, p.x, p.y, p.z);
        if (sd >= minOff) break;
        sdfNormal(SCALP_SDF, p.x, p.y, p.z, tmp);
        p.x += tmp[0] * (minOff - sd);
        p.y += tmp[1] * (minOff - sd);
        p.z += tmp[2] * (minOff - sd);
        // re-aim the direction along the surface
        const nn = new THREE.Vector3(tmp[0], tmp[1], tmp[2]);
        dir.addScaledVector(nn, -Math.min(0, dir.dot(nn)) * 1.0).normalize();
      }
      pts.push(p.clone());
      sdfNormal(SCALP_SDF, p.x, p.y, p.z, tmp);
      nrms.push(new THREE.Vector3(tmp[0], tmp[1], tmp[2]));
    }
    // joints at t = 0, 1/3, 2/3, 1
    for (let j = 0; j < HAIR_JOINTS; j++) {
      const q = pts[Math.round((j / (HAIR_JOINTS - 1)) * STEPS)];
      joints.set([q.x, q.y, q.z], (ci * HAIR_JOINTS + j) * 3);
    }
    // ribbon-tube along the curve
    const base = pos.length / 3;
    const tan = new THREE.Vector3();
    const wdir = new THREE.Vector3();
    const hdir = new THREE.Vector3();
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      tan.subVectors(pts[Math.min(i + 1, STEPS)], pts[Math.max(i - 1, 0)]).normalize();
      wdir.crossVectors(tan, nrms[i]).normalize();
      hdir.crossVectors(wdir, tan).normalize();
      const twist = Math.sin(wavePhase + t * 3) * 0.4 * t;
      const cw = Math.cos(twist);
      const sw = Math.sin(twist);
      // broad body, rounded (not needle) tip: big readable shapes
      // chunky lock tapering to a soft point
      const tipR = Math.pow(1 - t, 0.85);
      const ww = width * (0.75 + 0.25 * Math.sin(Math.min(1, t * 4 + 0.3) * Math.PI * 0.5)) * tipR + 0.0006;
      const hh = thick * (1 - 0.55 * t) * (0.2 + 0.8 * tipR) + 0.0004;
      for (let k = 0; k < SEG; k++) {
        const a = (k / SEG) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const ox = ca * ww * 0.5;
        const oy = sa * hh * 0.5;
        const wx = cw * ox - sw * oy;
        const wy = sw * ox + cw * oy;
        const q = pts[i].clone().addScaledVector(wdir, wx).addScaledVector(hdir, wy);
        pos.push(q.x, q.y, q.z);
        // normals mostly transferred from a proxy sphere: the hair shades as one
        // soft volume (feature-film trick), with a little per-lock roundness
        const proxy = q.clone().sub(PROXY).normalize();
        const own = hdir.clone().multiplyScalar(sa).addScaledVector(wdir, ca).normalize();
        const nn = proxy.multiplyScalar(0.72).addScaledVector(own, 0.28).normalize();
        nrm.push(nn.x, nn.y, nn.z);
        const c = (0.62 + 0.38 * t) * shade;
        col.push(c, c, c);
        hair.push(ci, t);
        uv.push(k / SEG, t);
      }
    }
    for (let i = 0; i < STEPS; i++)
      for (let k = 0; k < SEG; k++) {
        const a = base + i * SEG + k;
        const b = base + i * SEG + ((k + 1) % SEG);
        const c = a + SEG;
        const e = b + SEG;
        idx.push(a, c, e, a, e, b);
      }
  });

  const clumps = new THREE.BufferGeometry();
  clumps.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  clumps.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  clumps.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  clumps.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  clumps.setAttribute('aHair', new THREE.Float32BufferAttribute(hair, 2));
  clumps.setIndex(idx);
  clumps.computeBoundingSphere();
  clumps.boundingSphere!.radius += 0.06;

  // scalp cap
  const cap = new THREE.BufferGeometry();
  {
    const AZ = 72;
    const EL = 22;
    const cp: number[] = [];
    const cn: number[] = [];
    const cc: number[] = [];
    const ci: number[] = [];
    const P = new THREE.Vector3();
    const Nc = new THREE.Vector3();
    for (let a = 0; a <= AZ; a++) {
      const az = -Math.PI + (2 * Math.PI * a) / AZ;
      const e0 = hairlineElev(az) - 0.02;
      for (let e = 0; e <= EL; e++) {
        const el = e0 + (Math.PI / 2 - e0) * Math.pow(e / EL, 0.8);
        scalpPoint(dirFromAzEl(az, el, d), P, Nc);
        P.addScaledVector(Nc, -0.0015);
        cp.push(P.x, P.y, P.z);
        cn.push(Nc.x, Nc.y, Nc.z);
        const edge = THREE.MathUtils.smoothstep(e / EL, 0, 0.12);
        const c = 0.32 + 0.18 * edge;
        cc.push(c, c, c);
      }
    }
    for (let a = 0; a < AZ; a++)
      for (let e = 0; e < EL; e++) {
        const i0 = a * (EL + 1) + e;
        const i1 = (a + 1) * (EL + 1) + e;
        ci.push(i0, i1, i1 + 1, i0, i1 + 1, i0 + 1);
      }
    cap.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    cap.setAttribute('normal', new THREE.Float32BufferAttribute(cn, 3));
    cap.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
    const zeros = new Float32Array((cp.length / 3) * 2);
    cap.setAttribute('aHair', new THREE.BufferAttribute(zeros, 2));
    cap.setIndex(ci);
  }
  return { clumps, cap, joints, count: roots.length };
}

/** Hair material: standard PBR + Kajiya-Kay dual-lobe highlight + GPU clump deformation. */
export function createHairMaterial(count: number, tex: THREE.DataTexture) {
  const m = new THREE.MeshStandardMaterial({ color: 0x3f2414, roughness: 0.78, vertexColors: true, envMapIntensity: 0.35 });
  const u = {
    uHairTex: { value: tex },
    uHairSize: { value: new THREE.Vector2(HAIR_JOINTS, count) },
    uKeyPos: { value: new THREE.Vector3(-0.6, 1.4, 0.3) },
    uKeyCol: { value: new THREE.Color(1.0, 0.75, 0.5) },
    uRimCol: { value: new THREE.Color(0.5, 0.45, 1.0) },
    uRimDir: { value: new THREE.Vector3(0.6, 0.3, -0.7).normalize() },
  };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec2 aHair;
        uniform sampler2D uHairTex;
        uniform vec2 uHairSize;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float jt = aHair.y * (uHairSize.x - 1.0);
          float j0 = floor(jt);
          float f = jt - j0;
          float row = (aHair.x + 0.5) / uHairSize.y;
          vec3 d0 = texture2D(uHairTex, vec2((j0 + 0.5) / uHairSize.x, row)).xyz;
          vec3 d1 = texture2D(uHairTex, vec2((min(j0 + 1.0, uHairSize.x - 1.0) + 0.5) / uHairSize.x, row)).xyz;
          // smooth (Hermite) interpolation along the clump
          vec3 disp = mix(d0, d1, f * f * (3.0 - 2.0 * f));
          transformed += disp;
        }`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uKeyPos; uniform vec3 uKeyCol; uniform vec3 uRimCol; uniform vec3 uRimDir;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          // strands: fine stripes along the clump + darker clump edges (fake self-shadowing)
          float across = vHairUv.x;
          float edge = abs(sin(across * 3.14159));
          float n1 = fract(sin(floor(across * 28.0 + vHairUv.y * 1.3) * 91.7) * 4375.85);
          float stripes = 0.78 + 0.22 * sin(across * 6.2831 * 9.0 + n1 * 6.0);
          diffuseColor.rgb *= mix(0.78, 1.0, edge) * stripes;
        }`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        {
          // Kajiya-Kay with two shifted lobes (Scheuermann 2004)
          vec3 V = normalize(cameraPosition - vWorldPosHair);
          vec3 L = normalize(uKeyPos - vWorldPosHair);
          vec3 Nw = normalize(vWorldNormalHair);
          vec3 T = normalize(cross(Nw, normalize(cross(vec3(0.0,1.0,0.0), Nw) + 1e-4)));
          vec3 H = normalize(L + V);
          float jitter = fract(sin(dot(floor(vHairUv * vec2(9.0, 40.0)), vec2(12.9898, 78.233))) * 43758.5453);
          vec3 T1 = normalize(T + Nw * (0.12 + 0.1 * jitter));
          vec3 T2 = normalize(T - Nw * (0.18 + 0.1 * jitter));
          float th1 = dot(T1, H);
          float th2 = dot(T2, H);
          float s1 = pow(max(0.0, sqrt(1.0 - th1 * th1)), 90.0);
          float s2 = pow(max(0.0, sqrt(1.0 - th2 * th2)), 22.0) * (0.5 + 0.5 * jitter);
          float ndl = clamp(dot(Nw, L) * 0.5 + 0.5, 0.0, 1.0);
          vec3 spec = uKeyCol * (s1 * 0.26 + s2 * 0.12 * diffuseColor.rgb * 2.5) * ndl;
          // cool rim from the window
          float rim = pow(1.0 - max(dot(Nw, V), 0.0), 3.0) * max(dot(Nw, uRimDir), 0.0);
          reflectedLight.directSpecular += spec + uRimCol * rim * 0.12;
        }`,
      )
      .replace(
        'void main() {',
        `varying vec3 vWorldPosHair; varying vec3 vWorldNormalHair; varying vec2 vHairUv;
        void main() {`,
      );
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', 'varying vec3 vWorldPosHair; varying vec3 vWorldNormalHair; varying vec2 vHairUv;\nvoid main() {')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vWorldPosHair = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWorldNormalHair = normalize(mat3(modelMatrix) * objectNormal);
        vHairUv = vec2(uv.x, aHair.y + aHair.x * 0.37);`,
      );
  };
  return m;
}

/** CPU dynamics for the clump chains. Positions in world space. */
export class HairSim {
  readonly tex: THREE.DataTexture;
  private data: Float32Array;
  private p: Float32Array; // world positions
  private pp: Float32Array; // previous positions
  private restLen: Float32Array;
  private rest: Float32Array;
  private n: number;
  private first = true;
  stiffness = 18; // shape matching strength (1/s)
  damping = 2.2;

  constructor(readonly build: HairBuild) {
    this.n = build.count;
    const J = HAIR_JOINTS;
    this.rest = build.joints;
    this.p = new Float32Array(this.n * J * 3);
    this.pp = new Float32Array(this.n * J * 3);
    this.restLen = new Float32Array(this.n * J);
    for (let c = 0; c < this.n; c++)
      for (let j = 1; j < J; j++) {
        const a = (c * J + j - 1) * 3;
        const b = (c * J + j) * 3;
        this.restLen[c * J + j] = Math.hypot(this.rest[b] - this.rest[a], this.rest[b + 1] - this.rest[a + 1], this.rest[b + 2] - this.rest[a + 2]);
      }
    this.data = new Float32Array(J * this.n * 4);
    this.tex = new THREE.DataTexture(this.data, J, this.n, THREE.RGBAFormat, THREE.FloatType);
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.minFilter = THREE.NearestFilter;
    this.tex.needsUpdate = true;
  }

  private tmp = new THREE.Vector3();

  /**
   * @param headWorld head-local -> world matrix (mesh parent frame)
   * @param wind world-space wind acceleration (m/s^2)
   */
  update(dt: number, headWorld: THREE.Matrix4, wind: THREE.Vector3, time: number) {
    const J = HAIR_JOINTS;
    const inv = new THREE.Matrix4().copy(headWorld).invert();
    const v = this.tmp;
    const h = Math.min(dt, 1 / 30);
    const sub = h > 1 / 50 ? 2 : 1;
    const sdt = h / sub;
    const e = headWorld.elements;
    const toWorld = (i: number, out: THREE.Vector3) => out.set(this.rest[i], this.rest[i + 1], this.rest[i + 2]).applyMatrix4(headWorld);
    if (this.first) {
      for (let i = 0; i < this.n * J; i++) {
        toWorld(i * 3, v);
        this.p.set([v.x, v.y, v.z], i * 3);
        this.pp.set([v.x, v.y, v.z], i * 3);
      }
      this.first = false;
    }
    const hc = new THREE.Vector3(0, 0.02, -0.005).applyMatrix4(headWorld);
    const scale = Math.hypot(e[0], e[1], e[2]);
    const headR = 0.122 * scale;
    const kS = 1 - Math.exp(-this.stiffness * sdt);
    const damp = Math.exp(-this.damping * sdt);
    const tgt = new THREE.Vector3();
    for (let s = 0; s < sub; s++) {
      for (let c = 0; c < this.n; c++) {
        const gust = 0.6 + 0.4 * Math.sin(time * 2.3 + c * 0.7) * Math.sin(time * 0.9 + c * 0.31);
        // root follows the head rigidly
        const r0 = c * J * 3;
        toWorld(r0, v);
        this.p[r0] = this.pp[r0] = v.x;
        this.p[r0 + 1] = this.pp[r0 + 1] = v.y;
        this.p[r0 + 2] = this.pp[r0 + 2] = v.z;
        for (let j = 1; j < J; j++) {
          const i = (c * J + j) * 3;
          const t = j / (J - 1);
          // verlet with damping
          const vx = (this.p[i] - this.pp[i]) * damp;
          const vy = (this.p[i + 1] - this.pp[i + 1]) * damp;
          const vz = (this.p[i + 2] - this.pp[i + 2]) * damp;
          this.pp[i] = this.p[i];
          this.pp[i + 1] = this.p[i + 1];
          this.pp[i + 2] = this.p[i + 2];
          const ax = wind.x * gust * t;
          const ay = -2.5 * t + wind.y * gust * t;
          const az = wind.z * gust * t;
          this.p[i] += vx + ax * sdt * sdt;
          this.p[i + 1] += vy + ay * sdt * sdt;
          this.p[i + 2] += vz + az * sdt * sdt;
          // shape matching toward the styled pose
          toWorld(i, tgt);
          this.p[i] += (tgt.x - this.p[i]) * kS;
          this.p[i + 1] += (tgt.y - this.p[i + 1]) * kS;
          this.p[i + 2] += (tgt.z - this.p[i + 2]) * kS;
        }
        // follow-the-leader inextensibility + DFTL velocity correction
        for (let j = 1; j < J; j++) {
          const a = (c * J + j - 1) * 3;
          const i = (c * J + j) * 3;
          let dx = this.p[i] - this.p[a];
          let dy = this.p[i + 1] - this.p[a + 1];
          let dz = this.p[i + 2] - this.p[a + 2];
          const l = Math.hypot(dx, dy, dz) + 1e-9;
          const L = this.restLen[c * J + j] * scale;
          dx = (dx / l) * L;
          dy = (dy / l) * L;
          dz = (dz / l) * L;
          const nx = this.p[a] + dx;
          const ny = this.p[a + 1] + dy;
          const nz = this.p[a + 2] + dz;
          const cx = nx - this.p[i];
          const cy = ny - this.p[i + 1];
          const cz = nz - this.p[i + 2];
          this.p[i] = nx;
          this.p[i + 1] = ny;
          this.p[i + 2] = nz;
          // DFTL: feed correction of the child back into the parent's velocity
          if (j > 1) {
            this.pp[a] += cx * 0.9;
            this.pp[a + 1] += cy * 0.9;
            this.pp[a + 2] += cz * 0.9;
          }
          // collide with the skull
          const hx = this.p[i] - hc.x;
          const hy = this.p[i + 1] - hc.y;
          const hz = this.p[i + 2] - hc.z;
          const hl = Math.hypot(hx, hy, hz);
          if (hl < headR) {
            const k = headR / hl;
            this.p[i] = hc.x + hx * k;
            this.p[i + 1] = hc.y + hy * k;
            this.p[i + 2] = hc.z + hz * k;
          }
        }
      }
    }
    // displacement in head-local space
    for (let c = 0; c < this.n; c++)
      for (let j = 0; j < J; j++) {
        const i = (c * J + j) * 3;
        v.set(this.p[i], this.p[i + 1], this.p[i + 2]).applyMatrix4(inv);
        const o = (c * J + j) * 4;
        this.data[o] = v.x - this.rest[i];
        this.data[o + 1] = v.y - this.rest[i + 1];
        this.data[o + 2] = v.z - this.rest[i + 2];
      }
    this.tex.needsUpdate = true;
  }
}
