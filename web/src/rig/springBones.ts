import * as THREE from 'three';

/**
 * Generic spring bones for artist rigs (hair locks, fringe, ears, hoodie
 * strings): any bone whose name contains hair / spring / bang / lock / tail
 * / ponytail / jiggle becomes a dynamic chain. Same model as VRM spring
 * bones: verlet tail particles with stiffness toward the animated rest
 * direction, gravity, drag, wind, a length constraint and collision with a
 * head sphere — then each bone is aimed at its simulated tail.
 */

const RX = /hair|spring|bang|lock|tail|pony|jiggle|fringe|strand/i;

interface Joint {
  bone: THREE.Object3D;
  restLocalQ: THREE.Quaternion;
  /** child offset in bone-local space (bind) */
  tailLocal: THREE.Vector3;
  len: number;
  tail: THREE.Vector3;
  prev: THREE.Vector3;
  depth: number;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();

export class SpringBones {
  private joints: Joint[] = [];
  stiffness = 0.75;
  drag = 0.35;
  gravity = 0.4;
  private head: THREE.Object3D | null = null;
  private headR = 0.1;
  private first = true;

  constructor(root: THREE.Object3D) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (/^(mixamorig)?head$/i.test(o.name.replace(/[^a-z]/gi, '')) || /head$/i.test(o.name)) this.head ??= o;
      if (!((o as THREE.Bone).isBone && RX.test(o.name))) return;
      const child = o.children.find((c) => (c as THREE.Bone).isBone);
      const tailLocal = child ? child.position.clone() : o.position.clone().normalize().multiplyScalar(0.03);
      let depth = 0;
      let p = o.parent;
      while (p && RX.test(p.name)) {
        depth++;
        p = p.parent;
      }
      const tail = o.localToWorld(tailLocal.clone());
      this.joints.push({ bone: o, restLocalQ: o.quaternion.clone(), tailLocal, len: tail.distanceTo(o.getWorldPosition(new THREE.Vector3())), tail, prev: tail.clone(), depth });
    });
    // parents first
    this.joints.sort((a, b) => a.depth - b.depth);
    if (this.head) {
      const box = new THREE.Box3();
      this.headR = 0.1 * this.head.getWorldScale(_v).x;
      void box;
    }
  }

  get count() {
    return this.joints.length;
  }

  update(dt: number, time: number, wind: THREE.Vector3) {
    if (!this.joints.length) return;
    const h = Math.min(dt, 1 / 30);
    const hc = this.head ? this.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.08, 0)) : null;
    for (const j of this.joints) {
      // rest pose for this frame (animated parent)
      j.bone.quaternion.copy(j.restLocalQ);
      j.bone.updateMatrixWorld(true);
      const head = j.bone.getWorldPosition(_v2);
      const restTail = j.bone.localToWorld(_v.copy(j.tailLocal));
      if (this.first) {
        j.tail.copy(restTail);
        j.prev.copy(restTail);
      }
      const gust = 0.6 + 0.4 * Math.sin(time * 2.1 + j.depth + j.len * 50);
      const vel = j.tail.clone().sub(j.prev).multiplyScalar(1 - this.drag);
      const next = j.tail
        .clone()
        .add(vel)
        .add(restTail.clone().sub(j.tail).multiplyScalar(this.stiffness * h * 10))
        .add(new THREE.Vector3(wind.x * gust, wind.y * gust - this.gravity * 9.81, wind.z * gust).multiplyScalar(h * h));
      // length constraint
      next.sub(head).setLength(j.len).add(head);
      if (hc) {
        const d = next.clone().sub(hc);
        if (d.length() < this.headR) next.copy(hc).add(d.setLength(this.headR));
      }
      j.prev.copy(j.tail);
      j.tail.copy(next);
      // aim the bone: rotate rest direction onto simulated direction (world), back to local
      const from = restTail.sub(head).normalize();
      const to = next.clone().sub(head).normalize();
      _q.setFromUnitVectors(from, to);
      j.bone.getWorldQuaternion(_q2);
      _q.multiply(_q2);
      j.bone.parent!.getWorldQuaternion(_q2);
      j.bone.quaternion.copy(_q2.invert().multiply(_q));
      j.bone.updateMatrixWorld(true);
    }
    this.first = false;
    void _m;
  }
}
