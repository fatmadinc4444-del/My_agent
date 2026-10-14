import * as THREE from 'three';
import { noise1 } from '../math/noise';

/**
 * Curtain cloth with XPBD (Macklin et al. 2016) using the "small steps"
 * scheme (Macklin 2019): many substeps, one constraint iteration each,
 * lambda reset per substep. Very stable and stiff fabric at low cost
 * (~250 particles per curtain, 8 substeps).
 */

interface Con {
  a: number;
  b: number;
  rest: number;
  compliance: number;
}

export class Curtain {
  readonly mesh: THREE.Mesh;
  private p: Float32Array;
  private prev: Float32Array;
  private v: Float32Array;
  private w: Float32Array; // inverse mass
  private pin: Float32Array;
  private cons: Con[] = [];
  private geo: THREE.BufferGeometry;
  private nrm: THREE.BufferAttribute;
  private seed: number;

  constructor(
    origin: THREE.Vector3,
    width: number,
    height: number,
    private wallZ: number,
    mat: THREE.Material,
    private cols = 12,
    private rows = 20,
    seed = 0,
  ) {
    this.seed = seed;
    const n = cols * rows;
    this.p = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.v = new Float32Array(n * 3);
    this.w = new Float32Array(n);
    this.pin = new Float32Array(cols * 3);
    const pleat = 0.028;
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        const x = origin.x + (i / (cols - 1)) * width;
        const y = origin.y - (j / (rows - 1)) * height;
        // pleats are gathered at the rod and relax toward the hem
        const z = origin.z + pleat * (0.5 + 0.5 * Math.cos(i * Math.PI)) * (1 - 0.4 * (j / rows));
        this.p.set([x, y, z], k * 3);
        this.prev.set([x, y, z], k * 3);
        this.w[k] = j === 0 ? 0 : 1;
        if (j === 0) this.pin.set([x, y, z], i * 3);
      }
    const dx = width / (cols - 1);
    const dy = height / (rows - 1);
    const add = (a: number, b: number, compliance: number) => {
      const ax = a * 3;
      const bx = b * 3;
      const rest = Math.hypot(this.p[ax] - this.p[bx], this.p[ax + 1] - this.p[bx + 1], this.p[ax + 2] - this.p[bx + 2]);
      this.cons.push({ a, b, rest: Math.max(rest, Math.min(dx, dy) * 0.5), compliance });
    };
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        if (i + 1 < cols) add(k, k + 1, 1e-7);
        if (j + 1 < rows) add(k, k + cols, 0);
        if (i + 1 < cols && j + 1 < rows) {
          add(k, k + cols + 1, 1e-5);
          add(k + 1, k + cols, 1e-5);
        }
        if (i + 2 < cols) add(k, k + 2, 4e-4);
        if (j + 2 < rows) add(k, k + 2 * cols, 2e-4);
      }
    // geometry
    const idx: number[] = [];
    const uv: number[] = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) uv.push(i / (cols - 1), 1 - j / (rows - 1));
    for (let j = 0; j < rows - 1; j++)
      for (let i = 0; i < cols - 1; i++) {
        const a = j * cols + i;
        idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
      }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    this.geo.setIndex(idx);
    this.geo.computeVertexNormals();
    this.nrm = this.geo.getAttribute('normal') as THREE.BufferAttribute;
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }

  update(dt: number, wind: THREE.Vector3, time: number) {
    if (dt < 1e-5) return;
    const h = Math.min(dt, 1 / 30);
    const SUB = 8;
    const sdt = h / SUB;
    const n = this.cols * this.rows;
    const damp = Math.exp(-1.6 * sdt);
    const ws = wind.length();
    for (let s = 0; s < SUB; s++) {
      // integrate
      for (let k = 0; k < n; k++) {
        if (this.w[k] === 0) continue;
        const i = k * 3;
        const j = Math.floor(k / this.cols);
        const tt = j / this.rows;
        // aerodynamic-ish load: stronger where the cloth faces the wind
        const nx = this.nrm.getX(k);
        const ny = this.nrm.getY(k);
        const nz = this.nrm.getZ(k);
        const facing = ws > 1e-4 ? Math.abs(nx * wind.x + ny * wind.y + nz * wind.z) / ws : 0;
        const turb = 0.6 + 0.8 * noise1(time * 1.7 + k * 0.13 + this.seed * 10);
        const f = (0.35 + 0.65 * facing) * turb * (0.4 + 0.6 * tt);
        this.v[i] = this.v[i] * damp + wind.x * f * sdt;
        this.v[i + 1] = this.v[i + 1] * damp + (-9.81 + wind.y * f) * sdt;
        this.v[i + 2] = this.v[i + 2] * damp + wind.z * f * sdt;
        this.prev[i] = this.p[i];
        this.prev[i + 1] = this.p[i + 1];
        this.prev[i + 2] = this.p[i + 2];
        this.p[i] += this.v[i] * sdt;
        this.p[i + 1] += this.v[i + 1] * sdt;
        this.p[i + 2] += this.v[i + 2] * sdt;
      }
      // constraints (lambda reset each substep: small-steps XPBD)
      const inv = 1 / (sdt * sdt);
      for (const c of this.cons) {
        const wa = this.w[c.a];
        const wb = this.w[c.b];
        const W = wa + wb;
        if (W === 0) continue;
        const a = c.a * 3;
        const b = c.b * 3;
        const dx = this.p[b] - this.p[a];
        const dy = this.p[b + 1] - this.p[a + 1];
        const dz = this.p[b + 2] - this.p[a + 2];
        const len = Math.hypot(dx, dy, dz) + 1e-9;
        const C = len - c.rest;
        const dl = -C / (W + c.compliance * inv);
        const gx = (dx / len) * dl;
        const gy = (dy / len) * dl;
        const gz = (dz / len) * dl;
        this.p[a] -= gx * wa;
        this.p[a + 1] -= gy * wa;
        this.p[a + 2] -= gz * wa;
        this.p[b] += gx * wb;
        this.p[b + 1] += gy * wb;
        this.p[b + 2] += gz * wb;
      }
      // collisions: stay in front of the wall
      for (let k = 0; k < n; k++) {
        const i = k * 3;
        if (this.p[i + 2] < this.wallZ + 0.012) this.p[i + 2] = this.wallZ + 0.012;
      }
      // velocities
      for (let k = 0; k < n; k++) {
        if (this.w[k] === 0) continue;
        const i = k * 3;
        this.v[i] = (this.p[i] - this.prev[i]) / sdt;
        this.v[i + 1] = (this.p[i + 1] - this.prev[i + 1]) / sdt;
        this.v[i + 2] = (this.p[i + 2] - this.prev[i + 2]) / sdt;
      }
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}
