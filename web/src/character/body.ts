import * as THREE from 'three';
import { GeoBuilder, loftTube, mirrorBoneIndex } from './geo';
import { ARM_DIR_L, BONE_DEFS, BONE_INDEX, FINGER_LAYOUT, FINGERS, FORE_ARM_LEN, HAND_X, HAND_Y, HAND_Z, UPPER_ARM_LEN, bonePos, handToBind } from './skeletonDef';
import { smoothstep } from '../math/spring';

/**
 * Procedural body: pyjama shirt, sleeves, trousers, neck, hands, slippers.
 * Built for the left side and mirrored, all skinned with smooth falloffs.
 */

const v3 = (a: ArrayLike<number>) => new THREE.Vector3(a[0], a[1], a[2]);

type W = [string, number][];

function torsoWeights(x: number, y: number): W {
  const ax = Math.abs(x);
  const side = x >= 0 ? 'L' : 'R';
  const wSpine = smoothstep(0.9, 0.98, y) * (1 - smoothstep(1.06, 1.15, y));
  const wChest = smoothstep(1.06, 1.15, y);
  const wHips = 1 - smoothstep(0.9, 0.98, y);
  const sh = smoothstep(0.085, 0.16, ax) * smoothstep(1.19, 1.29, y);
  const neck = smoothstep(1.345, 1.375, y) * (1 - smoothstep(0.05, 0.08, ax));
  const w: W = [
    ['hips', wHips],
    ['spine', wSpine],
    ['chest', wChest * (1 - sh * 0.75) * (1 - neck)],
  ];
  if (sh > 0) w.push([`shoulder.${side}`, sh * 0.55], [`upperArm.${side}`, sh * 0.2 * smoothstep(0.14, 0.18, ax)]);
  if (neck > 0) w.push(['neck', neck * 0.6]);
  return w;
}

// cross sections: y, half-width a, half-depth b, z centre
const TORSO: [number, number, number, number][] = [
  [0.835, 0.146, 0.104, 0.0],
  [0.9, 0.142, 0.1, 0.0],
  [0.98, 0.137, 0.096, 0.0],
  [1.06, 0.142, 0.1, 0.004],
  [1.14, 0.152, 0.106, 0.006],
  [1.2, 0.156, 0.104, 0.003],
  [1.25, 0.16, 0.098, -0.003],
  [1.29, 0.163, 0.09, -0.009],
  [1.32, 0.155, 0.083, -0.013],
  [1.342, 0.128, 0.073, -0.015],
  [1.358, 0.095, 0.063, -0.014],
  [1.372, 0.064, 0.054, -0.012],
];

function superEllipse(a: number, b: number, t: number, n = 2.5): [number, number] {
  const c = Math.cos(t);
  const s = Math.sin(t);
  const x = a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
  const z = b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
  return [x, z];
}

function sample(table: [number, number, number, number][], y: number) {
  for (let i = 0; i < table.length - 1; i++) {
    const [y0, a0, b0, z0] = table[i];
    const [y1, a1, b1, z1] = table[i + 1];
    if (y <= y1) {
      const t = (y - y0) / (y1 - y0);
      const s = t * t * (3 - 2 * t);
      return [a0 + (a1 - a0) * s, b0 + (b1 - b0) * s, z0 + (z1 - z0) * s];
    }
  }
  const l = table[table.length - 1];
  return [l[1], l[2], l[3]];
}

/** Shirt torso. Vertex colour R = "skin showing" mask for the V-neck. */
function buildShirtTorso(g: GeoBuilder) {
  const SEG = 72;
  const ROWS = 40;
  const y0 = TORSO[0][0];
  const y1 = TORSO[TORSO.length - 1][0];
  const rows: number[] = [];
  for (let r = 0; r <= ROWS; r++) {
    const y = y0 + ((y1 - y0) * r) / ROWS;
    const [a, b, zc] = sample(TORSO, y);
    rows.push(g.count);
    for (let k = 0; k <= SEG; k++) {
      // t = 0 at the front centre (+Z) going around toward +X
      const t = Math.PI / 2 - (k / SEG) * Math.PI * 2;
      const [x, z0] = superEllipse(a, b, t);
      // chest: slightly flatter back, rounder front
      const z = z0 * (z0 > 0 ? 1 : 0.93) + zc;
      const n = new THREE.Vector3(x / (a * a), 0, (z - zc) / (b * b)).normalize();
      g.vert([x, y, z], n.toArray(), [(k / SEG) * 0.84, y], torsoWeights(x, y), [0, 0, 0]);
    }
  }
  for (let r = 0; r < ROWS; r++) for (let k = 0; k < SEG; k++) g.quad(rows[r] + k, rows[r] + k + 1, rows[r + 1] + k + 1, rows[r + 1] + k);
}

/** Sleeve / arm tube for the left arm. */
function buildSleeveL(g: GeoBuilder) {
  const up = v3(bonePos('upperArm.L'));
  const dir = v3(ARM_DIR_L);
  const start = up.clone().addScaledVector(dir, -0.035).add(new THREE.Vector3(-0.012, 0.012, 0));
  const elbowS = 0.035 + UPPER_ARM_LEN;
  const wristS = elbowS + FORE_ARM_LEN;
  const endS = wristS - 0.012;
  const N = 26;
  const pts: THREE.Vector3[] = [];
  const sv: number[] = [];
  for (let i = 0; i <= N; i++) {
    const s = (endS * i) / N;
    sv.push(s);
    pts.push(start.clone().addScaledVector(dir, s));
  }
  const rad = (sNorm: number): [number, number] => {
    const s = sNorm * endS;
    let r: number;
    if (s < elbowS) r = 0.045 - 0.007 * (s / elbowS);
    else r = 0.039 - 0.004 * ((s - elbowS) / FORE_ARM_LEN);
    // cuff flare
    r += 0.003 * smoothstep(endS - 0.03, endS, s);
    return [r, r * 0.96];
  };
  loftTube(
    g,
    pts,
    (s) => rad(s),
    24,
    (sn) => {
      const s = sn * endS;
      if (s < 0.06) {
        const t = smoothstep(0, 0.06, s);
        return [
          ['shoulder.L', 0.55 * (1 - t)],
          ['chest', 0.15 * (1 - t)],
          ['upperArm.L', 0.3 + 0.7 * t],
        ];
      }
      const e = smoothstep(elbowS - 0.045, elbowS + 0.045, s);
      if (s < wristS - 0.08) return [['upperArm.L', 1 - e], ['foreArm.L', e]];
      return [['foreArm.L', 1]];
    },
    { refUp: new THREE.Vector3(0, 0, 1), uvScale: 1, capEnd: false, color: () => [0, 0, 0] },
  );
}

function buildHandL(g: GeoBuilder) {
  const wrist = bonePos('hand.L');
  const H = (x: number, y: number, z: number) => v3(handToBind(wrist, [x, y, z]));
  // wrist/forearm skin: from inside the cuff to the palm
  {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 6; i++) pts.push(H(-0.06 + (0.07 * i) / 6, 0.001, 0.0));
    loftTube(
      g,
      pts,
      (s) => {
        const r = 0.024 + 0.003 * s;
        return [r * 1.0, r * 0.78];
      },
      16,
      (s) => {
        const t = smoothstep(0.5, 1.0, s);
        return [
          ['foreArm.L', 1 - t],
          ['hand.L', t],
        ];
      },
      { refUp: new THREE.Vector3(...HAND_Z) },
    );
  }
  // palm: lofted rounded rectangle along hand X
  {
    const rows = 9;
    const seg = 20;
    const ring: number[] = [];
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      const x = 0.004 + 0.08 * t;
      const w = 0.026 + 0.012 * Math.sin(Math.min(1, t * 1.4) * Math.PI * 0.5); // half width (z)
      const th = 0.0125 - 0.003 * t; // half thickness (y)
      const zc = 0.003 - 0.004 * t;
      ring.push(g.count);
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * Math.PI * 2;
        const [cz, cy] = superEllipse(w, th, a, 3.2);
        // palm pad bulge (palm side is -y)
        const pad = cy < 0 ? 1 + 0.25 * Math.sin(t * Math.PI) : 1;
        const p = H(x, cy * pad, cz + zc);
        const nn = new THREE.Vector3()
          .addScaledVector(v3(HAND_Z), cz / (w * w))
          .addScaledVector(v3(HAND_Y), cy / (th * th))
          .normalize();
        const tw = smoothstep(0.75, 1.0, t);
        const fw: W = [['hand.L', 1 - tw * 0.5]];
        if (tw > 0) {
          // knuckle region: blend to the nearest finger base
          const f = cz > 0.016 ? 'index' : cz > 0.002 ? 'middle' : cz > -0.013 ? 'ring' : 'pinky';
          fw.push([`${f}1.L`, tw * 0.5]);
        }
        g.vert(p.toArray(), nn.toArray(), [k / seg, t], fw);
      }
    }
    for (let r = 0; r < rows; r++) for (let k = 0; k < seg; k++) g.quad(ring[r] + k, ring[r] + k + 1, ring[r + 1] + k + 1, ring[r + 1] + k);
    // close the wrist end (hidden in the wrist tube) & leave knuckle end open (fingers cover)
  }
  // fingers
  for (const f of FINGERS) {
    const L = FINGER_LAYOUT[f];
    const dir = new THREE.Vector3(...L.dir).normalize();
    const total = L.lens[0] + L.lens[1] + L.lens[2];
    const start = new THREE.Vector3(...L.base).addScaledVector(dir, f === 'thumb' ? -0.01 : -0.012);
    const startS = f === 'thumb' ? -0.01 : -0.012;
    const N = 18;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) {
      const s = startS + ((total - startS - 0.002) * i) / N;
      const lp = new THREE.Vector3(...L.base).addScaledVector(dir, s);
      pts.push(H(lp.x, lp.y, lp.z));
    }
    void start;
    const j1 = L.lens[0];
    const j2 = L.lens[0] + L.lens[1];
    loftTube(
      g,
      pts,
      (sn) => {
        const s = startS + sn * (total - startS - 0.002);
        let r = L.r * (1 - 0.22 * (s / total));
        // knuckle bulges
        r *= 1 + 0.06 * Math.exp(-(((s - j1) / 0.006) ** 2)) + 0.05 * Math.exp(-(((s - j2) / 0.005) ** 2));
        // rounded tip
        const tipS = total - 0.002;
        const d = tipS - s;
        const rt = r * 1.0;
        if (d < rt) r = Math.sqrt(Math.max(0, rt * rt - (rt - d) * (rt - d))) * 1.0 + 0.0004;
        return [r, r * 0.86];
      },
      12,
      (sn) => {
        const s = startS + sn * (total - startS - 0.002);
        const b = 0.0045;
        const e0 = smoothstep(-b, b, s);
        const e1 = smoothstep(j1 - b, j1 + b, s);
        const e2 = smoothstep(j2 - b, j2 + b, s);
        return [
          ['hand.L', 1 - e0],
          [`${f}1.L`, e0 * (1 - e1)],
          [`${f}2.L`, e1 * (1 - e2)],
          [`${f}3.L`, e2],
        ];
      },
      { refUp: new THREE.Vector3(...HAND_Y), capEnd: true },
    );
  }
}

function buildNeck(g: GeoBuilder) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(new THREE.Vector3(0, 1.3 + 0.22 * t, -0.016 + 0.012 * t));
  }
  loftTube(
    g,
    pts,
    (s) => {
      const r = 0.05 - 0.005 * Math.sin(s * Math.PI) + 0.004 * smoothstep(0.75, 1, s);
      return [r, r * 0.92];
    },
    24,
    (s) => {
      const y = 1.3 + 0.22 * s;
      const a = smoothstep(1.33, 1.38, y);
      const b = smoothstep(1.43, 1.49, y);
      return [
        ['chest', 1 - a],
        ['neck', a * (1 - b)],
        ['head', b],
      ];
    },
    { refUp: new THREE.Vector3(0, 0, 1) },
  );
}

function buildPants(g: GeoBuilder) {
  // pelvis
  const SEG = 64;
  const PELVIS: [number, number, number, number][] = [
    [0.79, 0.15, 0.105, 0.004],
    [0.86, 0.156, 0.108, 0.0],
    [0.92, 0.142, 0.098, 0.0],
    [0.99, 0.134, 0.092, 0.0],
  ];
  const rows: number[] = [];
  const R = 10;
  for (let r = 0; r <= R; r++) {
    const y = 0.79 + (0.2 * r) / R;
    const [a, b, zc] = sample(PELVIS, y);
    rows.push(g.count);
    let arc = 0;
    let px = 0;
    let pz = 0;
    for (let k = 0; k <= SEG; k++) {
      const t = Math.PI / 2 - (k / SEG) * Math.PI * 2;
      const [x, z0] = superEllipse(a, b, t);
      const z = z0 + zc;
      if (k > 0) arc += Math.hypot(x - px, z - pz);
      px = x;
      pz = z;
      const side = x >= 0 ? 'L' : 'R';
      const th = (1 - smoothstep(0.8, 0.9, y)) * smoothstep(0.02, 0.09, Math.abs(x)) * 0.7;
      const n = new THREE.Vector3(x / (a * a), 0, z0 / (b * b)).normalize();
      g.vert([x, y, z], n.toArray(), [arc, y], [
        ['hips', 1 - th],
        [`thigh.${side}`, th],
      ]);
    }
  }
  for (let r = 0; r < R; r++) for (let k = 0; k < SEG; k++) g.quad(rows[r] + k, rows[r] + k + 1, rows[r + 1] + k + 1, rows[r + 1] + k);
  // crotch cap
  const c = g.vert([0, 0.79, 0.0], [0, -1, 0], [0, 0], [['hips', 1]]);
  for (let k = 0; k < SEG; k++) g.tri(rows[0] + k + 1, rows[0] + k, c);
}

function buildLegL(g: GeoBuilder) {
  const hip = v3(bonePos('thigh.L'));
  const knee = v3(bonePos('shin.L'));
  const ankle = v3(bonePos('foot.L'));
  const pts: THREE.Vector3[] = [];
  const N = 22;
  const start = hip.clone().add(new THREE.Vector3(-0.012, 0.03, 0));
  const total = start.distanceTo(knee) + knee.distanceTo(ankle);
  const kS = start.distanceTo(knee) / total;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push(t < kS ? start.clone().lerp(knee, t / kS) : knee.clone().lerp(ankle, (t - kS) / (1 - kS)));
  }
  pts[N] = ankle.clone().add(new THREE.Vector3(0, 0.025, 0));
  loftTube(
    g,
    pts,
    (s) => {
      const r = s < kS ? 0.078 - 0.02 * (s / kS) : 0.058 - 0.008 * ((s - kS) / (1 - kS));
      return [r, r * 0.95];
    },
    22,
    (s) => {
      const e = smoothstep(kS - 0.06, kS + 0.06, s);
      const top = 1 - smoothstep(0, 0.1, s);
      return [
        ['hips', top * 0.35],
        ['thigh.L', (1 - e) * (1 - top * 0.35)],
        ['shin.L', e],
      ];
    },
    { refUp: new THREE.Vector3(0, 0, 1) },
  );
}

function buildSlipperL(g: GeoBuilder) {
  const ankle = v3(bonePos('foot.L'));
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(new THREE.Vector3(ankle.x + 0.004 * t, 0.032 + 0.006 * Math.sin(t * Math.PI), ankle.z - 0.055 + 0.2 * t));
  }
  loftTube(
    g,
    pts,
    (s) => {
      const end = Math.sin(Math.min(1, Math.min(s, 1 - s) * 6) * Math.PI * 0.5);
      const w = (0.037 + 0.008 * s) * (0.35 + 0.65 * end);
      return [w * 0.75, w * 1.05];
    },
    16,
    (s) => {
      const t = smoothstep(0.55, 0.8, s);
      return [
        ['foot.L', 1 - t],
        ['toes.L', t],
      ];
    },
    { refUp: new THREE.Vector3(0, 1, 0), capStart: true, capEnd: true },
  );
}

/** Front surface of the shirt torso at (x, y): returns z and the outward normal. */
function torsoFront(x: number, y: number): { z: number; n: THREE.Vector3 } {
  const [a, b, zc] = sample(TORSO, y);
  const u = Math.min(0.999, Math.abs(x) / a);
  const n = 2.5;
  const z = zc + b * Math.pow(1 - Math.pow(u, n), 1 / n);
  const dzdx = (-b * Math.pow(1 - Math.pow(u, n), 1 / n - 1) * Math.pow(u, n - 1)) / a * Math.sign(x);
  const nn = new THREE.Vector3(-dzdx, 0.25, 1).normalize();
  return { z, n: nn };
}

/**
 * Pyjama collar: a lapel band running up the V, around the back of the neck
 * (as a short stand) and down the other side.
 */
function buildCollar(g: GeoBuilder) {
  const pts: { c: THREE.Vector3; o: THREE.Vector3; n: THREE.Vector3; w: number }[] = [];
  const yV = 1.262;
  const yTop = 1.372;
  const N1 = 14;
  // left lapel, bottom -> top
  for (let i = 0; i <= N1; i++) {
    const t = i / N1;
    const y = yV + (yTop - yV) * t;
    const x = (y - yV) * 0.6 + 0.004;
    const f = torsoFront(x, y);
    const c = new THREE.Vector3(x, y, f.z);
    const o = new THREE.Vector3(1, -0.55, 0).addScaledVector(f.n, -0.1).normalize();
    pts.push({ c, o, n: f.n, w: 0.026 + 0.022 * t });
  }
  // around the back of the neck
  const N2 = 18;
  const a0 = Math.atan2(0.068, 0.05);
  for (let i = 1; i < N2; i++) {
    const a = a0 + ((Math.PI * 2 - 2 * a0) * i) / N2;
    const x = Math.sin(a) * 0.072;
    const z = Math.cos(a) * 0.064 - 0.014;
    const c = new THREE.Vector3(x, yTop + 0.006, z);
    const radial = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    // folded collar: band goes up then out/down over the shoulders
    const o = radial.clone().multiplyScalar(0.8).add(new THREE.Vector3(0, -0.6, 0)).normalize();
    const n = radial.clone().multiplyScalar(0.5).add(new THREE.Vector3(0, 0.85, 0)).normalize();
    pts.push({ c, o, n, w: 0.044 });
  }
  // right lapel, top -> bottom (mirror of the left)
  for (let i = N1; i >= 0; i--) {
    const p = pts[i];
    pts.push({ c: new THREE.Vector3(-p.c.x, p.c.y, p.c.z), o: new THREE.Vector3(-p.o.x, p.o.y, p.o.z), n: new THREE.Vector3(-p.n.x, p.n.y, p.n.z), w: p.w });
  }
  const SEG = 8;
  let len = 0;
  const rings: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const { c, o, n, w } = pts[i];
    if (i > 0) len += c.distanceTo(pts[i - 1].c);
    rings.push(g.count);
    const th = 0.0042;
    for (let k = 0; k <= SEG; k++) {
      const a = (k / SEG) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const p = c
        .clone()
        .addScaledVector(o, w * 0.5 * (1 + ca * 0.95))
        .addScaledVector(n, 0.004 + th * sa + 0.006 * (1 - (1 + ca) * 0.5) * 0.4);
      const nn = n.clone().multiplyScalar(sa).addScaledVector(o, ca * 0.3).normalize();
      const wts = torsoWeights(p.x, Math.min(p.y, 1.34));
      if (p.y > 1.36) wts.push(['neck', 0.35]);
      g.vert(p.toArray(), nn.toArray(), [len, (k / SEG) * 0.05], wts, [0, 0, 0]);
    }
  }
  for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < SEG; k++) g.quad(rings[i] + k, rings[i] + k + 1, rings[i + 1] + k + 1, rings[i + 1] + k);
  // buttons down the placket
  for (let b = 0; b < 4; b++) {
    const y = 1.215 - b * 0.085;
    const f = torsoFront(0.0, y);
    const c = new THREE.Vector3(0.0, y, f.z + 0.003);
    const base = g.count;
    const R = 0.0065;
    const ring: number[] = [];
    for (let k = 0; k <= 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const p = c.clone().add(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0));
      ring.push(g.vert(p.toArray(), [0, 0, 1], [0, 0], torsoWeights(0, y), [0.0, 1, 0]));
    }
    const ctr = g.vert(c.clone().add(new THREE.Vector3(0, 0, 0.002)).toArray(), [0, 0, 1], [0, 0], torsoWeights(0, y), [0, 1, 0]);
    for (let k = 0; k < 12; k++) g.tri(ring[k], ring[k + 1], ctr);
    void base;
  }
}

export interface BodyGeometries {
  shirt: THREE.BufferGeometry;
  pants: THREE.BufferGeometry;
  skin: THREE.BufferGeometry;
  slippers: THREE.BufferGeometry;
}

export function buildBody(): BodyGeometries {
  const mb = mirrorBoneIndex();
  const shirt = new GeoBuilder();
  buildShirtTorso(shirt);
  const sl = new GeoBuilder();
  buildSleeveL(sl);
  shirt.merge(sl);
  shirt.merge(sl.mirrored(mb));
  buildCollar(shirt);

  const pants = new GeoBuilder();
  buildPants(pants);
  const leg = new GeoBuilder();
  buildLegL(leg);
  pants.merge(leg);
  pants.merge(leg.mirrored(mb));

  const skin = new GeoBuilder();
  buildNeck(skin);
  const hand = new GeoBuilder();
  buildHandL(hand);
  skin.merge(hand);
  skin.merge(hand.mirrored(mb));

  const sl2 = new GeoBuilder();
  buildSlipperL(sl2);
  const slippers = new GeoBuilder();
  slippers.merge(sl2);
  slippers.merge(sl2.mirrored(mb));

  return {
    shirt: shirt.build({ skin: true, color: true }),
    pants: pants.build({ skin: true }),
    skin: skin.build({ skin: true }),
    slippers: slippers.build({ skin: true }),
  };
}

export { BONE_DEFS, BONE_INDEX, HAND_X };
