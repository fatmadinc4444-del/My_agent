import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Collects static meshes and merges them per material -> a handful of draw
 * calls for the whole room. Transforms are baked, matrices frozen.
 */
export class StaticBatcher {
  private groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private opts = new Map<THREE.Material, { cast: boolean; receive: boolean }>();

  add(geo: THREE.BufferGeometry, mat: THREE.Material, m?: THREE.Matrix4, cast = false, receive = true) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m) g.applyMatrix4(m);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    if (!g.getAttribute('color')) {
      const c = new Float32Array(g.getAttribute('position').count * 3).fill(1);
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    g.morphAttributes = {};
    const list = this.groups.get(mat) ?? [];
    list.push(g);
    this.groups.set(mat, list);
    const o = this.opts.get(mat) ?? { cast: false, receive: false };
    this.opts.set(mat, { cast: o.cast || cast, receive: o.receive || receive });
  }

  /** Convenience: box with position / rotation. */
  box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0, cast = false, color?: THREE.Color) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (color) tint(g, color);
    this.add(g, mat, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1)), cast);
  }

  flush(parent: THREE.Object3D) {
    for (const [mat, list] of this.groups) {
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      const o = this.opts.get(mat)!;
      mesh.castShadow = o.cast;
      mesh.receiveShadow = o.receive;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
    }
    this.groups.clear();
  }
}

export function tint(g: THREE.BufferGeometry, c: THREE.Color) {
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
