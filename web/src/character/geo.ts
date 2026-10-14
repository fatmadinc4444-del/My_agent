import * as THREE from 'three';
import { BONE_INDEX } from './skeletonDef';

/**
 * Minimal mesh builder with skin-weight support. Procedural parts of the
 * character push rings/tubes here and get a single BufferGeometry back.
 */
export class GeoBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  si: number[] = [];
  sw: number[] = [];
  idx: number[] = [];
  hasNormals = true;

  get count() {
    return this.pos.length / 3;
  }

  vert(
    p: ArrayLike<number>,
    n: ArrayLike<number> | null,
    uv: [number, number] = [0, 0],
    weights: [string, number][] = [],
    color: [number, number, number] = [1, 1, 1],
  ): number {
    this.pos.push(p[0], p[1], p[2]);
    if (n) this.nrm.push(n[0], n[1], n[2]);
    else {
      this.nrm.push(0, 1, 0);
      this.hasNormals = false;
    }
    this.uv.push(uv[0], uv[1]);
    this.col.push(color[0], color[1], color[2]);
    const w = weights.slice().sort((a, b) => b[1] - a[1]).slice(0, 4);
    let sum = 0;
    for (const [, v] of w) sum += v;
    for (let i = 0; i < 4; i++) {
      if (i < w.length && sum > 0) {
        const bi = BONE_INDEX[w[i][0]];
        if (bi === undefined) throw new Error(`unknown bone ${w[i][0]}`);
        this.si.push(bi);
        this.sw.push(w[i][1] / sum);
      } else {
        this.si.push(0);
        this.sw.push(0);
      }
    }
    return this.count - 1;
  }

  tri(a: number, b: number, c: number) {
    this.idx.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number) {
    this.idx.push(a, b, c, a, c, d);
  }

  /** Connect consecutive rings of equal size `seg`, starting at vertex offsets. */
  bridgeRings(r0: number, r1: number, seg: number, closed = true) {
    const n = closed ? seg : seg - 1;
    for (let i = 0; i < n; i++) {
      const j = closed ? (i + 1) % seg : i + 1;
      this.quad(r0 + i, r0 + j, r1 + j, r1 + i);
    }
  }

  /** Append another builder (indices offset). */
  merge(o: GeoBuilder) {
    const off = this.count;
    this.pos.push(...o.pos);
    this.nrm.push(...o.nrm);
    this.uv.push(...o.uv);
    this.col.push(...o.col);
    this.si.push(...o.si);
    this.sw.push(...o.sw);
    for (const i of o.idx) this.idx.push(i + off);
    this.hasNormals = this.hasNormals && o.hasNormals;
  }

  /** Mirror in X (flip winding) — used to build right side parts from left ones. */
  mirrored(mapBone: (n: number) => number): GeoBuilder {
    const g = new GeoBuilder();
    g.pos = this.pos.map((v, i) => (i % 3 === 0 ? -v : v));
    g.nrm = this.nrm.map((v, i) => (i % 3 === 0 ? -v : v));
    g.uv = this.uv.slice();
    g.col = this.col.slice();
    g.si = this.si.map(mapBone);
    g.sw = this.sw.slice();
    for (let i = 0; i < this.idx.length; i += 3) g.idx.push(this.idx[i], this.idx[i + 2], this.idx[i + 1]);
    g.hasNormals = this.hasNormals;
    return g;
  }

  build(opts: { skin?: boolean; color?: boolean; computeNormals?: boolean } = {}): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (opts.color) geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (opts.skin) {
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    }
    geo.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    if (opts.computeNormals || !this.hasNormals) geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }
}

/** Mirror map for bone indices L<->R. */
export function mirrorBoneIndex(): (i: number) => number {
  const names = Object.keys(BONE_INDEX);
  const map = new Map<number, number>();
  for (const n of names) {
    const m = n.endsWith('.L') ? n.slice(0, -2) + '.R' : n.endsWith('.R') ? n.slice(0, -2) + '.L' : n;
    map.set(BONE_INDEX[n], BONE_INDEX[m] ?? BONE_INDEX[n]);
  }
  return (i) => map.get(i) ?? i;
}

/** Orthonormal frame from a tangent (rotation-minimising when `prevN` is given). */
export function frameFromTangent(t: THREE.Vector3, prevN: THREE.Vector3 | null, out: { n: THREE.Vector3; b: THREE.Vector3 }) {
  if (prevN) {
    out.n.copy(prevN).addScaledVector(t, -prevN.dot(t)).normalize();
  } else {
    const up = Math.abs(t.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    out.n.crossVectors(up, t).normalize();
  }
  out.b.crossVectors(t, out.n).normalize();
}

/**
 * Loft a tube along a polyline with per-sample radii (x: along n, y: along b),
 * calling `weights(s)` for each ring (s = arc length 0..1).
 */
export function loftTube(
  g: GeoBuilder,
  pts: THREE.Vector3[],
  radius: (s: number, angle: number) => [number, number],
  seg: number,
  weights: (s: number, p: THREE.Vector3) => [string, number][],
  opts: { capStart?: boolean; capEnd?: boolean; color?: (s: number, a: number) => [number, number, number]; uvScale?: number; refUp?: THREE.Vector3 } = {},
) {
  const n = pts.length;
  const lens = [0];
  for (let i = 1; i < n; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = lens[n - 1];
  const fr = { n: new THREE.Vector3(), b: new THREE.Vector3() };
  let prevN: THREE.Vector3 | null = opts.refUp ? opts.refUp.clone() : null;
  const t = new THREE.Vector3();
  const rings: number[] = [];
  const P = new THREE.Vector3();
  const N = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    if (i === 0) t.subVectors(pts[1], pts[0]).normalize();
    else if (i === n - 1) t.subVectors(pts[n - 1], pts[n - 2]).normalize();
    else t.subVectors(pts[i + 1], pts[i - 1]).normalize();
    frameFromTangent(t, prevN, fr);
    prevN = fr.n.clone();
    const s = lens[i] / total;
    const w = weights(s, pts[i]);
    rings.push(g.count);
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const [rx, ry] = radius(s, a);
      const c = Math.cos(a);
      const sn = Math.sin(a);
      P.copy(pts[i]).addScaledVector(fr.n, c * rx).addScaledVector(fr.b, sn * ry);
      // ellipse normal
      N.copy(fr.n).multiplyScalar(c / Math.max(rx, 1e-5)).addScaledVector(fr.b, sn / Math.max(ry, 1e-5)).normalize();
      g.vert(P.toArray(), N.toArray(), [k / seg, (lens[i] * (opts.uvScale ?? 1))], w, opts.color ? opts.color(s, a) : [1, 1, 1]);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < seg; k++) g.quad(rings[i] + k, rings[i] + k + 1, rings[i + 1] + k + 1, rings[i + 1] + k);
  }
  const cap = (ri: number, at: THREE.Vector3, dir: number, w: [string, number][]) => {
    const c = g.vert(at.toArray(), t.clone().multiplyScalar(dir).toArray(), [0.5, 0], w);
    for (let k = 0; k < seg; k++) {
      if (dir > 0) g.tri(rings[ri] + k, rings[ri] + k + 1, c);
      else g.tri(rings[ri] + k + 1, rings[ri] + k, c);
    }
  };
  if (opts.capStart) {
    t.subVectors(pts[1], pts[0]).normalize();
    cap(0, pts[0], -1, weights(0, pts[0]));
  }
  if (opts.capEnd) {
    t.subVectors(pts[n - 1], pts[n - 2]).normalize();
    cap(n - 1, pts[n - 1], 1, weights(1, pts[n - 1]));
  }
  return { rings, total };
}

/** Blend weights along a bone chain given joint arc positions (0..1) and a blend width. */
export function chainWeights(s: number, joints: number[], bones: string[], blend: number): [string, number][] {
  // joints[i] is where bones[i] begins; bones[i] covers [joints[i], joints[i+1])
  for (let i = 1; i < joints.length; i++) {
    const j = joints[i];
    if (Math.abs(s - j) < blend) {
      const t = (s - j) / blend; // -1..1
      const w = 0.5 + 0.5 * Math.sin((t * Math.PI) / 2);
      return [
        [bones[i - 1], 1 - w],
        [bones[i], w],
      ];
    }
  }
  let k = 0;
  for (let i = 0; i < joints.length; i++) if (s >= joints[i]) k = i;
  return [[bones[k], 1]];
}
