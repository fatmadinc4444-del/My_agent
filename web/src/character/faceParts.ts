import * as THREE from 'three';
import { EAR_L } from './headShape';
import { headSurface } from './head';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Rounded box from a sphere: exact rounded edges with smooth normals. */
function roundedBox(w: number, h: number, d: number, r: number, ws = 8, hs = 6): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, ws, hs);
  const p = g.getAttribute('position');
  const hx = Math.max(0, w / 2 - r);
  const hy = Math.max(0, h / 2 - r);
  const hz = Math.max(0, d / 2 - r);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    p.setXYZ(i, x + Math.sign(x) * hx, y + Math.sign(y) * hy, z + Math.sign(z) * hz);
  }
  g.deleteAttribute('uv');
  return g;
}

const TOOTH_W = [0.0046, 0.0036, 0.0038, 0.0036, 0.0037, 0.0042];

export interface TeethBuild {
  upper: THREE.BufferGeometry;
  lower: THREE.BufferGeometry;
  gumsUpper: THREE.BufferGeometry;
  gumsLower: THREE.BufferGeometry;
}

/** Dental arches in head-local space, `mc` = mouth centre on the skin. */
export function buildTeeth(mc: THREE.Vector3): TeethBuild {
  const make = (upper: boolean) => {
    const zFront = mc.z - (upper ? 0.0052 : 0.0085);
    const k = upper ? 30 : 36;
    const yEdge = mc.y + (upper ? -0.0022 : -0.0016);
    const parts: THREE.BufferGeometry[] = [];
    const gumPts: THREE.Vector3[] = [];
    for (const side of [1, -1]) {
      let s = 0;
      for (let i = 0; i < TOOTH_W.length; i++) {
        const w = TOOTH_W[i] * (upper ? 1 : i < 2 ? 0.78 : 0.92);
        // walk along the parabola by arc length
        const target = s + w / 2 + 0.0002;
        let x = 0;
        let acc = 0;
        while (acc < target && x < 0.04) {
          const dx = 0.0002;
          acc += Math.hypot(dx, 2 * k * x * dx);
          x += dx;
        }
        s += w + 0.0003;
        const z = zFront - k * x * x;
        const slope = Math.atan(2 * k * x);
        const front = i < 3;
        const h = (upper ? (front ? 0.0098 : 0.0085) : front ? 0.0078 : 0.007) * (i === 2 ? 1.06 : 1);
        const d = front ? 0.0042 : 0.0072;
        const t = roundedBox(w, h, d, Math.min(w, d) * 0.32);
        // incisors are slightly thinner at the edge
        if (front) {
          const p = t.getAttribute('position');
          for (let j = 0; j < p.count; j++) {
            const yy = p.getY(j) / (h / 2);
            const edge = upper ? -yy : yy;
            const thin = 1 - 0.35 * Math.max(0, edge);
            p.setZ(j, p.getZ(j) * thin);
          }
        }
        t.computeVertexNormals();
        t.translate(0, upper ? h / 2 : -h / 2, -d / 2 + 0.001);
        t.rotateY(side * slope);
        t.translate(side * x, yEdge, z);
        // depth darkening baked into vertex colour (mouth AO)
        const p = t.getAttribute('position');
        const col = new Float32Array(p.count * 3);
        for (let j = 0; j < p.count; j++) {
          const ao = 0.25 + 0.75 * THREE.MathUtils.smoothstep(p.getZ(j), zFront - 0.02, zFront);
          const edgeAo = upper ? 0.75 + 0.25 * THREE.MathUtils.smoothstep(p.getY(j), yEdge + 0.009, yEdge + 0.003) : 1;
          col[j * 3] = col[j * 3 + 1] = col[j * 3 + 2] = ao * edgeAo;
        }
        t.setAttribute('color', new THREE.BufferAttribute(col, 3));
        parts.push(t);
        if (side > 0) gumPts.push(new THREE.Vector3(x, yEdge + (upper ? h - 0.0018 : -h + 0.0018), z - 0.0012));
      }
    }
    const teeth = mergeGeometries(parts)!;
    // gum strip
    const pts = [...gumPts.slice().reverse().map((p) => new THREE.Vector3(-p.x, p.y, p.z)), ...gumPts];
    const curve = new THREE.CatmullRomCurve3(pts);
    const gum = new THREE.TubeGeometry(curve, 40, 0.0034, 8, false);
    return { teeth, gum };
  };
  const u = make(true);
  const l = make(false);
  return { upper: u.teeth, lower: l.teeth, gumsUpper: u.gum, gumsLower: l.gum };
}

/** Tongue with `tongueUp` and `tongueOut` morph targets (head-local). */
export function buildTongue(mc: THREE.Vector3): THREE.BufferGeometry {
  const len = 0.046;
  const gen = (up: number, out: number) => {
    const pos: number[] = [];
    const rows = 16;
    const seg = 18;
    for (let r = 0; r <= rows; r++) {
      const t = r / rows; // 0 = root, 1 = tip
      let z = mc.z - 0.05 + len * t + out * 0.013 * t;
      let y = mc.y - 0.0125 + 0.004 * Math.sin(t * Math.PI * 0.9);
      // tip curl up for L/T/D/N
      const bend = up * Math.max(0, (t - 0.45) / 0.55);
      y += bend * bend * 0.012;
      z -= bend * bend * 0.003;
      const tipRound = Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, (t - 0.82) / 0.18), 2)));
      const w = (0.0175 + 0.004 * Math.sin(t * Math.PI * 0.8)) * (t < 0.82 ? 1 : 0.25 + 0.75 * tipRound) * (1 - out * 0.12);
      const th = 0.0058 * (t < 0.82 ? 1 : 0.3 + 0.7 * tipRound) * (1 - 0.3 * out);
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * Math.PI * 2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        // central groove on top
        const groove = s > 0 ? 1 - 0.25 * Math.exp(-((c / 0.25) ** 2)) : 1;
        pos.push(c * w, y + s * th * groove, z);
      }
    }
    return { pos, rows, seg };
  };
  const base = gen(0, 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(base.pos, 3));
  const idx: number[] = [];
  for (let r = 0; r < base.rows; r++)
    for (let k = 0; k < base.seg; k++) {
      const a = r * (base.seg + 1) + k;
      const b = a + base.seg + 1;
      idx.push(a, a + 1, b + 1, a, b + 1, b);
    }
  g.setIndex(idx);
  g.computeVertexNormals();
  const baseN = g.getAttribute('normal').array as Float32Array;
  const morphs: THREE.BufferAttribute[] = [];
  const mn: THREE.BufferAttribute[] = [];
  for (const [name, up, out] of [
    ['tongueUp', 1, 0],
    ['tongueOut', 0.3, 1],
  ] as const) {
    const m = gen(up, out);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
    tg.setIndex(idx);
    tg.computeVertexNormals();
    const tn = tg.getAttribute('normal').array as Float32Array;
    const d = new Float32Array(m.pos.length);
    const dn = new Float32Array(m.pos.length);
    for (let i = 0; i < d.length; i++) {
      d[i] = m.pos[i] - base.pos[i];
      dn[i] = tn[i] - baseN[i];
    }
    const a = new THREE.BufferAttribute(d, 3);
    a.name = name;
    morphs.push(a);
    const b = new THREE.BufferAttribute(dn, 3);
    b.name = name;
    mn.push(b);
  }
  g.morphAttributes.position = morphs;
  g.morphAttributes.normal = mn;
  g.morphTargetsRelative = true;
  return g;
}

/** Stylised ear (left), head-local. */
export function buildEar(side: 1 | -1): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 20, 16);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    // outward-facing side (x>0) gets a concave bowl (concha) with a rim (helix)
    const rr = Math.hypot(y, z);
    if (x > 0) x = x * 0.55 - 0.45 * Math.max(0, 1 - rr * 1.25) ** 1.5 + 0.18 * Math.exp(-(((rr - 0.92) / 0.12) ** 2));
    // tear-drop: wider at top, lobe at the bottom
    const s = y > 0 ? 1.0 : 0.82 - 0.1 * y;
    z *= s;
    y *= 1;
    p.setXYZ(i, x * 0.0085, y * 0.03, z * 0.02);
  }
  g.computeVertexNormals();
  g.rotateY(-0.38); // face slightly forward
  g.rotateZ(-0.12);
  g.translate(EAR_L[0], EAR_L[1], EAR_L[2]);
  if (side < 0) {
    g.scale(-1, 1, 1);
    const ix = g.getIndex()!;
    for (let i = 0; i < ix.count; i += 3) {
      const t = ix.getX(i + 1);
      ix.setX(i + 1, ix.getX(i + 2));
      ix.setX(i + 2, t);
    }
    g.computeVertexNormals();
  }
  g.deleteAttribute('uv');
  return g;
}

/**
 * Eyebrow (left, mirrored for right), projected onto the skull surface.
 * Morphs: browUp (both raise), browInnerUp (worried), browDown (frown).
 */
export function buildBrow(side: 1 | -1): THREE.BufferGeometry {
  const ctrl = (lift: number, inner: number, down: number) => {
    const pts: THREE.Vector3[] = [];
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = 0.013 + 0.061 * t;
      const arch = Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.75) * 0.0075;
      let y = 0.0405 + arch - 0.004 * t * t;
      y += lift * 0.0075 * (0.8 + 0.2 * t);
      y += inner * 0.008 * Math.pow(1 - t, 1.6);
      y -= down * 0.0055 * (1 - 0.5 * t);
      const xx = x - down * 0.003 * (1 - t);
      // project from the ray origin through (x,y, front)
      const dir = new THREE.Vector3(xx, y + 0.012, 0.11);
      const P = new THREE.Vector3();
      const N = new THREE.Vector3();
      headSurface(dir.x, dir.y, dir.z, P, N);
      P.addScaledVector(N, 0.0016);
      pts.push(P);
    }
    return pts;
  };
  const build = (lift: number, inner: number, down: number) => {
    const pts = ctrl(lift, inner, down);
    const pos: number[] = [];
    const seg = 10;
    for (let i = 0; i < pts.length; i++) {
      const t = i / (pts.length - 1);
      const p = pts[i];
      const tan = pts[Math.min(i + 1, pts.length - 1)].clone().sub(pts[Math.max(i - 1, 0)]).normalize();
      const nrm = p.clone().normalize();
      const bin = new THREE.Vector3().crossVectors(tan, nrm).normalize();
      const up = new THREE.Vector3().crossVectors(nrm, tan).normalize();
      void bin;
      const height = 0.0085 * (1 - 0.55 * t * t) * (0.7 + 0.3 * Math.sin(Math.min(1, t * 3) * Math.PI * 0.5));
      const thick = 0.0032 * (1 - 0.45 * t);
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * Math.PI * 2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const q = p.clone().addScaledVector(up, s * height * 0.5).addScaledVector(nrm, c * thick * 0.5 + thick * 0.2);
        // tip & root caps: squash ends
        pos.push(q.x, q.y, q.z);
      }
    }
    return { pos, n: pts.length, seg };
  };
  const base = build(0, 0, 0);
  const idx: number[] = [];
  for (let i = 0; i < base.n - 1; i++)
    for (let k = 0; k < base.seg; k++) {
      const a = i * (base.seg + 1) + k;
      const b = a + base.seg + 1;
      idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(base.pos, 3));
  g.setIndex(idx);
  const morphs: THREE.BufferAttribute[] = [];
  for (const [name, a, b, c] of [
    ['browUp', 1, 0, 0],
    ['browInnerUp', 0, 1, 0],
    ['browDown', 0, 0, 1],
  ] as const) {
    const m = build(a, b, c);
    const d = new Float32Array(m.pos.length);
    for (let i = 0; i < d.length; i++) d[i] = m.pos[i] - base.pos[i];
    const at = new THREE.BufferAttribute(d, 3);
    at.name = name;
    morphs.push(at);
  }
  g.morphAttributes.position = morphs;
  g.morphTargetsRelative = true;
  if (side < 0) {
    g.scale(-1, 1, 1);
    for (const m of morphs) for (let i = 0; i < m.count; i++) m.setX(i, -m.getX(i));
    const ix = g.getIndex()!;
    for (let i = 0; i < ix.count; i += 3) {
      const t = ix.getX(i + 1);
      ix.setX(i + 1, ix.getX(i + 2));
      ix.setX(i + 2, t);
    }
  }
  g.computeVertexNormals();
  return g;
}
