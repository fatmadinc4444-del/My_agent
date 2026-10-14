import * as THREE from 'three';
import { L } from './layout';
import { phoneScreen } from './textures';
import { getSpec } from '../rig/spec';
import { damper } from '../math/spring';

/**
 * A prop that can be handed between parents (desk, hand, lap) without pops:
 * attach() keeps the world transform, then the local offset glides to the
 * socket transform with frame-rate independent damping.
 */
export class Prop {
  readonly obj: THREE.Object3D;
  private goalPos = new THREE.Vector3();
  private goalQuat = new THREE.Quaternion();
  private halflife = 0.12;
  constructor(obj: THREE.Object3D) {
    this.obj = obj;
  }
  attach(parent: THREE.Object3D, pos: THREE.Vector3, quat: THREE.Quaternion, halflife = 0.12) {
    parent.updateWorldMatrix(true, false);
    parent.attach(this.obj);
    this.goalPos.copy(pos);
    this.goalQuat.copy(quat);
    this.halflife = halflife;
  }
  snap() {
    this.obj.position.copy(this.goalPos);
    this.obj.quaternion.copy(this.goalQuat);
  }
  update(dt: number) {
    const k = damper(this.halflife, dt);
    this.obj.position.lerp(this.goalPos, k);
    this.obj.quaternion.slerp(this.goalQuat, k);
  }
}

/** Socket rotation for a phone held in the LEFT palm, screen facing away from the palm. */
export function phoneSocketL(): { pos: THREE.Vector3; quat: THREE.Quaternion } {
  const S = getSpec();
  const X = S.handX.clone();
  const Y = S.handY.clone();
  const Z = S.handZ.clone();
  const m = new THREE.Matrix4().makeBasis(Z.clone().negate(), X.clone(), Y.clone().negate());
  const quat = new THREE.Quaternion().setFromRotationMatrix(m);
  const pos = X.clone().multiplyScalar(0.075).addScaledVector(Y, -0.026).addScaledVector(Z, -0.004);
  return { pos, quat };
}

export function buildPhone(): THREE.Mesh {
  const body = new THREE.Mesh(roundedSlab(0.072, 0.15, 0.0085, 0.009), new THREE.MeshStandardMaterial({ color: 0x1b1b24, roughness: 0.3, metalness: 0.5 }));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.064, 0.138), new THREE.MeshBasicMaterial({ map: phoneScreen(), color: new THREE.Color(1.2, 1.2, 1.3) }));
  screen.position.z = 0.0044;
  body.add(screen);
  body.castShadow = true;
  body.name = 'phone';
  return body;
}

/** Phone resting on the desk: screen up, slightly rotated. */
export function phoneDeskTransform(): { pos: THREE.Vector3; quat: THREE.Quaternion } {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0.5));
  return { pos: L.phoneRest.clone().add(new THREE.Vector3(0, 0.0045, 0)), quat: q };
}

function roundedSlab(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 0.002, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.001, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -(d - 0.002) / 2);
  return g;
}

/**
 * Acoustic guitar. Local frame: origin at the body centre, neck along +Y,
 * soundboard facing +Z. Exposes anchor points for the hands.
 */
export function buildGuitar(): { group: THREE.Group; strum: THREE.Vector3; fret: THREE.Vector3; neckGrab: THREE.Vector3; strings: THREE.Mesh } {
  const g = new THREE.Group();
  g.name = 'guitar';
  const outline = new THREE.Shape();
  // figure-eight body outline (lower bout r=0.19, upper bout r=0.145, waist)
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const y = sn > 0 ? sn * 0.25 : sn * 0.21;
    const bout = y < 0 ? 0.19 : 0.15;
    const waist = 1 - 0.18 * Math.exp(-(((y - 0.03) / 0.06) ** 2));
    pts.push(new THREE.Vector2(c * bout * waist, y - 0.02));
  }
  outline.setFromPoints(pts);
  const hole = new THREE.Path();
  hole.absarc(0, 0.05, 0.045, 0, Math.PI * 2, true);
  outline.holes.push(hole);
  const wood = new THREE.MeshStandardMaterial({ color: 0xc9853f, roughness: 0.32 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a2214, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth: 0.085, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 3, curveSegments: 48 }), wood);
  body.position.z = -0.0425;
  body.castShadow = true;
  g.add(body);
  // dark inside of the sound hole
  const holeIn = new THREE.Mesh(new THREE.CircleGeometry(0.045, 32), new THREE.MeshBasicMaterial({ color: 0x0d0805 }));
  holeIn.position.set(0, 0.05, 0.02);
  g.add(holeIn);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.048, 0.056, 40), dark);
  ring.position.set(0, 0.05, 0.0491);
  g.add(ring);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.018, 0.008), dark);
  bridge.position.set(0, -0.11, 0.05);
  g.add(bridge);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.46, 0.022), dark);
  neck.position.set(0, 0.45, 0.03);
  neck.castShadow = true;
  g.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.018), dark);
  head.position.set(0, 0.74, 0.025);
  head.rotation.x = -0.25;
  g.add(head);
  // frets
  const fretMat = new THREE.MeshStandardMaterial({ color: 0xd8d3c8, roughness: 0.3, metalness: 0.8 });
  for (let i = 0; i < 12; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.002, 0.003), fretMat);
    f.position.set(0, 0.67 - 0.42 * (1 - Math.pow(2, -i / 12)) * 1.6, 0.042);
    g.add(f);
  }
  // strings (one merged mesh of thin boxes)
  const sg: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const b = new THREE.BoxGeometry(0.0012, 0.78, 0.0012);
    b.translate(-0.0175 + i * 0.007, 0.28, 0.046);
    sg.push(b);
  }
  const strings = new THREE.Mesh(mergeSimple(sg), new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.25, metalness: 0.9 }));
  g.add(strings);
  return {
    group: g,
    strum: new THREE.Vector3(0, 0.02, 0.09),
    fret: new THREE.Vector3(0, 0.55, 0.04),
    neckGrab: new THREE.Vector3(0, 0.5, 0.03),
    strings,
  };
}

function mergeSimple(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  let off = 0;
  for (const g of list) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nrm.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    const ix = g.getIndex()!;
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + off);
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setIndex(idx);
  return out;
}

/** Guitar standing on its stand next to the chair. */
export function guitarStandTransform(): { pos: THREE.Vector3; quat: THREE.Quaternion } {
  const pos = L.guitarStand.clone().add(new THREE.Vector3(0, 0.3, 0));
  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.18, 0.5, 0.05));
  return { pos, quat };
}

/** Steam rising from the mug: a dozen soft billboards, wind-bent. */
export class Steam {
  readonly points: THREE.Points;
  private n = 14;
  private age: Float32Array;
  private life: Float32Array;
  private pos: Float32Array;
  private seed: Float32Array;
  constructor(private origin: THREE.Vector3) {
    this.age = new Float32Array(this.n);
    this.life = new Float32Array(this.n);
    this.pos = new Float32Array(this.n * 3);
    this.seed = new Float32Array(this.n);
    const alpha = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      this.life[i] = 2.2 + Math.random() * 1.2;
      this.age[i] = Math.random() * this.life[i];
      this.seed[i] = Math.random() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uScale: { value: 300 } },
      vertexShader: `attribute float aAlpha; varying float vA; uniform float uScale;
        void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = uScale * (0.03 + 0.05 * (1.0 - aAlpha)) / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); float a = smoothstep(0.5, 0.0, d) * vA * 0.16; gl_FragColor = vec4(vec3(0.95, 0.9, 0.85), a); }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }
  update(dt: number, time: number, wind: THREE.Vector3, pixelScale: number) {
    const a = this.points.geometry.getAttribute('aAlpha') as THREE.BufferAttribute;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] > this.life[i]) this.age[i] = 0;
      const t = this.age[i];
      const k = t / this.life[i];
      const s = this.seed[i];
      const curl = 0.012 * Math.sin(t * 2.3 + s) * (1 + k * 2);
      this.pos[i * 3] = this.origin.x + curl + wind.x * 0.05 * t * t;
      this.pos[i * 3 + 1] = this.origin.y + t * 0.06;
      this.pos[i * 3 + 2] = this.origin.z + 0.012 * Math.cos(t * 1.9 + s) * (1 + k * 2) + wind.z * 0.05 * t * t;
      a.setX(i, Math.sin(Math.min(1, k * 4) * Math.PI * 0.5) * (1 - k));
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    a.needsUpdate = true;
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = pixelScale;
    void time;
  }
}
