import * as THREE from 'three';
import { EYE_R } from './headShape';

/**
 * Feature-animation style eyes: a glossy eyeball with a procedural iris,
 * and true 3D eyelid shells (with a rounded lid margin and lash line) that
 * rotate around the eye's X axis. Lid edge angles are the only blink/expression
 * parameters, so blinks never intersect the eyeball and always look clean.
 */

const LID_R = EYE_R + 0.0042;
const RIM = 0.0019;

function irisTexture(): THREE.CanvasTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  // sclera: warm off-white with faint rosy edges
  const sg = g.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S * 0.5);
  sg.addColorStop(0, '#fbf7f2');
  sg.addColorStop(0.75, '#f3ece6');
  sg.addColorStop(1, '#e9cfc8');
  g.fillStyle = sg;
  g.fillRect(0, 0, S, S);
  const cx = S / 2;
  const cy = S / 2;
  const R = S * 0.29;
  // iris base
  const ig = g.createRadialGradient(cx, cy, R * 0.25, cx, cy, R);
  ig.addColorStop(0, '#c88a3c');
  ig.addColorStop(0.35, '#8a5326');
  ig.addColorStop(0.8, '#5b3417');
  ig.addColorStop(1, '#2a160a');
  g.fillStyle = ig;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fill();
  // radial fibres
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 520; i++) {
    const a = rnd() * Math.PI * 2;
    const r0 = R * (0.3 + rnd() * 0.15);
    const r1 = R * (0.75 + rnd() * 0.25);
    const light = rnd() > 0.55;
    g.strokeStyle = light ? `rgba(235,180,110,${0.08 + rnd() * 0.15})` : `rgba(40,20,8,${0.08 + rnd() * 0.18})`;
    g.lineWidth = 0.6 + rnd() * 1.6;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    const a2 = a + (rnd() - 0.5) * 0.08;
    g.lineTo(cx + Math.cos(a2) * r1, cy + Math.sin(a2) * r1);
    g.stroke();
  }
  // limbal ring
  const lg = g.createRadialGradient(cx, cy, R * 0.82, cx, cy, R * 1.04);
  lg.addColorStop(0, 'rgba(20,10,4,0)');
  lg.addColorStop(0.75, 'rgba(20,10,4,0.75)');
  lg.addColorStop(1, 'rgba(20,10,4,0)');
  g.fillStyle = lg;
  g.beginPath();
  g.arc(cx, cy, R * 1.05, 0, Math.PI * 2);
  g.fill();
  // pupil
  const pg = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.4);
  pg.addColorStop(0, '#050302');
  pg.addColorStop(0.85, '#070403');
  pg.addColorStop(1, 'rgba(7,4,3,0)');
  g.fillStyle = pg;
  g.beginPath();
  g.arc(cx, cy, R * 0.4, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  return tex;
}

/** Sphere with planar front UVs (iris centred on +Z). */
function eyeballGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(EYE_R, 40, 28);
  g.rotateX(Math.PI / 2); // pole -> +Z for nicer iris tessellation
  const p = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / EYE_R;
    const y = p.getY(i) / EYE_R;
    const z = p.getZ(i) / EYE_R;
    // azimuthal equidistant around +Z keeps the iris round on the curved surface
    const th = Math.acos(Math.max(-1, Math.min(1, z)));
    const r = th / Math.PI;
    const l = Math.hypot(x, y) || 1;
    uv.setXY(i, 0.5 + (x / l) * r * 1.2, 0.5 + (y / l) * r * 1.2);
  }
  // corneal bulge: gives the catch-light its characteristic shape
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i) / EYE_R;
    const th = Math.acos(Math.max(-1, Math.min(1, z)));
    if (th < 0.85) {
      const k = Math.cos((th / 0.85) * Math.PI * 0.5);
      const s = 1 + 0.045 * k * k;
      p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, p.getZ(i) * s);
    }
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Thick lid shell. beta: angle around X from +Y (0) to +Z (pi/2).
 * Upper lid spans [betaBack, 0] relative to its edge (we rotate the mesh),
 * i.e. geometry is built with its edge at beta = 0 for easy rotation.
 */
function lidGeometry(upper: boolean, psiMax = 1.35): THREE.BufferGeometry {
  const LR = upper ? LID_R : EYE_R + 0.0026;
  const RM = upper ? RIM : 0.0011;
  const cols = 34;
  const profile: [number, number][] = []; // [radius, beta]
  const span = upper ? 1.55 : 1.0;
  const n = 12;
  for (let i = 0; i <= n; i++) profile.push([LR, -span + (span * i) / n]);
  // rounded margin
  for (let i = 1; i <= 6; i++) {
    const g = (i / 6) * Math.PI;
    profile.push([LR - RM + RM * Math.cos(g), (RM * Math.sin(g)) / LR]);
  }
  profile.push([LR - 2 * RM, -0.18]);
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const sgn = upper ? 1 : -1;
  for (let j = 0; j <= cols; j++) {
    const psi = -psiMax + (2 * psiMax * j) / cols;
    // the edge dips slightly at the corners to read as an almond shape
    const edgeShift = 0.12 * Math.pow(Math.abs(psi / psiMax), 2.2);
    for (let i = 0; i < profile.length; i++) {
      const [r, b0] = profile[i];
      const b = b0 - edgeShift;
      // upper lid: beta measured from +Y toward +Z; lower lid mirrored around XZ
      const cy = Math.cos(b) * sgn;
      const cz = Math.sin(b);
      const x = r * Math.sin(psi);
      const rr = r * Math.cos(psi);
      pos.push(x, rr * cy, rr * cz);
      uv.push(j / cols, i / (profile.length - 1));
      nrm.push(0, 0, 1);
    }
  }
  const P = profile.length;
  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < P - 1; i++) {
      const a = j * P + i;
      const b = (j + 1) * P + i;
      if (upper) idx.push(a, b + 1, b, a, a + 1, b + 1);
      else idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function lashGeometry(psiMax = 1.25): THREE.BufferGeometry {
  // tapered fin along the upper lid edge, pointing out and up
  const cols = 30;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= cols; j++) {
    const t = j / cols;
    const psi = -psiMax + 2 * psiMax * t;
    const edgeShift = 0.12 * Math.pow(Math.abs(psi / 1.35), 2.2);
    const b = -edgeShift + 0.01;
    const outer = psi > 0 ? 1 : 0.55; // longer at outer corner (built for left eye: +x = outer)
    const len = 0.0024 * (0.35 + 0.65 * Math.sin(Math.PI * t)) * (0.7 + 0.5 * outer * Math.abs(psi / psiMax));
    const r0 = LID_R + 0.0001;
    const x0 = r0 * Math.sin(psi);
    const rr = r0 * Math.cos(psi);
    const y0 = rr * Math.cos(b);
    const z0 = rr * Math.sin(b);
    // direction: radial out + up
    const nx = Math.sin(psi);
    const ny = Math.cos(psi) * Math.cos(b) + 0.9;
    const nz = Math.cos(psi) * Math.sin(b);
    const nl = Math.hypot(nx, ny, nz);
    const th = 0.0006 * (0.5 + 0.5 * Math.sin(Math.PI * t));
    pos.push(x0, y0 - th, z0 + 0.0002);
    pos.push(x0, y0 + th * 0.6, z0 - 0.0004);
    pos.push(x0 + (nx / nl) * len, y0 + (ny / nl) * len, z0 + (nz / nl) * len);
  }
  for (let j = 0; j < cols; j++) {
    const a = j * 3;
    const b = (j + 1) * 3;
    idx.push(a, b, b + 2, a, b + 2, a + 2);
    idx.push(a + 1, a + 2, b + 2, a + 1, b + 2, b + 1);
    idx.push(a, a + 1, b + 1, a, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

let sharedIris: THREE.CanvasTexture | null = null;

/** One material per eye (each eye has its own lid uniforms). */
export function createEyeballMaterial(): THREE.MeshPhysicalMaterial {
  sharedIris ??= irisTexture();
  const m = new THREE.MeshPhysicalMaterial({
    map: sharedIris,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.035,
    envMapIntensity: 1.3,
  });
  const u = {
    uLid: { value: new THREE.Vector2(1.08, 2.12) },
    uSocket: { value: new THREE.Matrix3() },
  };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLid = u.uLid;
    sh.uniforms.uSocket = u.uSocket;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSock;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSock = mat3(modelMatrix) * position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSock;\nuniform vec2 uLid;\nuniform mat3 uSocket;')
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        {
          // occlusion from the lid shells, evaluated in socket (head) space
          vec3 q = normalize(uSocket * vSock);
          float beta = atan(q.z, q.y);
          float occ = smoothstep(uLid.x - 0.03, uLid.x + 0.34, beta) * smoothstep(uLid.y + 0.03, uLid.y - 0.24, beta);
          float corner = 1.0 - 0.4 * smoothstep(0.5, 0.95, abs(q.x));
          reflectedLight.indirectDiffuse *= mix(0.55, 1.0, occ) * corner;
          reflectedLight.directDiffuse *= mix(0.35, 1.0, occ) * corner;
          reflectedLight.directSpecular *= mix(0.2, 1.0, occ);
          reflectedLight.indirectSpecular *= mix(0.5, 1.0, occ);
          // feature-animation eyes carry a little self-illumination so they
          // always read, even in a dim room
          totalEmissiveRadiance += diffuseColor.rgb * 0.07 * occ;
        }`,
      );
  };
  return m;
}

export interface EyeMaterials {
  lid: THREE.Material;
  lash: THREE.Material;
}

export function createEyeMaterials(skin: THREE.Material): EyeMaterials {
  return { lid: skin, lash: new THREE.MeshStandardMaterial({ color: 0x1a0f0a, roughness: 0.8 }) };
}

export class Eye {
  readonly root = new THREE.Group();
  readonly ball: THREE.Mesh;
  readonly upper: THREE.Mesh;
  readonly lower: THREE.Mesh;
  readonly lash: THREE.Mesh;
  /** open angles (beta of lid edge): upper ~1.05 open, lower ~2.15 open */
  upperOpen = 1.08;
  lowerOpen = 2.06;

  constructor(center: [number, number, number], side: 1 | -1, mats: EyeMaterials) {
    this.root.position.set(center[0], center[1], center[2]);
    this.ball = new THREE.Mesh(eyeballGeometry(), createEyeballMaterial());
    this.root.add(this.ball);
    const ug = lidGeometry(true);
    const lg = lidGeometry(false);
    const lsg = lashGeometry();
    if (side < 0) {
      for (const g of [ug, lg, lsg]) {
        g.scale(-1, 1, 1);
        const ix = g.getIndex()!;
        for (let i = 0; i < ix.count; i += 3) {
          const t = ix.getX(i + 1);
          ix.setX(i + 1, ix.getX(i + 2));
          ix.setX(i + 2, t);
        }
        g.computeVertexNormals();
      }
    }
    this.upper = new THREE.Mesh(ug, mats.lid);
    this.lower = new THREE.Mesh(lg, mats.lid);
    this.lash = new THREE.Mesh(lsg, mats.lash);
    this.upper.add(this.lash);
    // the lower lid is the skin of the socket itself (reads cleaner than a shell)
    this.root.add(this.upper);
    // slight outer-corner tilt (stylised, friendly)
    this.root.rotation.z = side * 0.06;
    this.setLids(this.upperOpen, this.lowerOpen);
  }

  /** Lid edge angles in radians (beta). */
  setLids(upperBeta: number, lowerBeta: number) {
    // geometry edge sits at beta = 0 (upper) and beta = pi - 0 for lower (mirrored), rotate to targets
    this.upper.rotation.x = upperBeta;
    this.lower.rotation.x = -(Math.PI - lowerBeta);
    (this.ball.material as THREE.Material).userData.u.uLid.value.set(upperBeta, lowerBeta);
  }

  /** Inverse of the head's world rotation, so lid occlusion follows the socket. */
  setSocketFrame(m: THREE.Matrix3) {
    (this.ball.material as THREE.Material).userData.u.uSocket.value.copy(m);
  }

  setGaze(yaw: number, pitch: number) {
    this.ball.rotation.set(-pitch, yaw, 0, 'YXZ');
  }
}
