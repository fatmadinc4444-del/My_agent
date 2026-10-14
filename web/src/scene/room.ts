import * as THREE from 'three';
import { StaticBatcher, tint } from './batcher';
import { L } from './layout';
import { bookSpineColors, laptopScreen, posterTexture, woodTexture } from './textures';
import { createCityView } from './sky';
import { Curtain } from './curtains';
import { rng } from '../math/noise';

/**
 * The bedroom. Static parts are batched per material (~10 draw calls);
 * dynamic parts (window sash, curtains, steam, props) are separate.
 */

const col = (hex: number, k = 1) => new THREE.Color(hex).multiplyScalar(k);
const M4 = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));

/** Analytic room AO: darkens wall/floor corners from world position (free). */
function patchRoomAO(m: THREE.MeshStandardMaterial) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;`)
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        {
          float dFloor = vWPos.y - ${L.floorY.toFixed(3)};
          float dBack = vWPos.z - (${L.backWallZ.toFixed(3)});
          float dLeft = vWPos.x - (${L.leftWallX.toFixed(3)});
          float dCeil = ${L.ceilingY.toFixed(3)} - vWPos.y;
          float ao = 1.0;
          ao *= mix(0.55, 1.0, smoothstep(0.0, 0.35, dFloor + 0.02));
          ao *= mix(0.6, 1.0, smoothstep(0.0, 0.4, dBack + 0.02));
          ao *= mix(0.6, 1.0, smoothstep(0.0, 0.4, dLeft + 0.02));
          ao *= mix(0.6, 1.0, smoothstep(0.0, 0.5, dCeil));
          // contact shadow under the desk & bed
          vec2 dk = abs(vWPos.xz - vec2(0.0, 0.015)) - vec2(0.86, 0.35);
          float under = smoothstep(0.25, -0.05, max(dk.x, dk.y)) * smoothstep(0.2, 0.0, dFloor);
          ao *= 1.0 - 0.45 * under;
          vec2 bd = abs(vWPos.xz - vec2(${((L.bed.x0 + L.bed.x1) / 2).toFixed(3)}, ${((L.bed.z0 + L.bed.z1) / 2).toFixed(3)})) - vec2(${((L.bed.x1 - L.bed.x0) / 2).toFixed(3)}, ${((L.bed.z1 - L.bed.z0) / 2).toFixed(3)});
          ao *= 1.0 - 0.5 * smoothstep(0.15, -0.05, max(bd.x, bd.y)) * smoothstep(0.15, 0.0, dFloor);
          reflectedLight.indirectDiffuse *= ao;
          reflectedLight.directDiffuse *= mix(1.0, ao, 0.5);
        }`,
      );
  };
}

export interface Room {
  group: THREE.Group;
  chair: THREE.Group;
  sash: THREE.Group;
  /** world position of the sash handle for a given opening (0..1) */
  handleAt(open: number, out?: THREE.Vector3): THREE.Vector3;
  setWindowOpen(open: number): void;
  windowOpen: number;
  curtains: Curtain[];
  city: THREE.Mesh;
  lampSpot: THREE.SpotLight;
  lampPoint: THREE.PointLight;
  moon: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  laptopGlow: THREE.PointLight;
  bulbGlow: THREE.Sprite;
  steamOrigin: THREE.Vector3;
  update(dt: number, time: number, wind: THREE.Vector3): void;
}

export const SASH_MAX = 1.05; // radians

/** Desk-lamp lighting: shadowed key spot, warm spill, additive bulb glow. */
export function createLampLights(group: THREE.Object3D, bulbPos: THREE.Vector3, shadeDir: THREE.Vector3) {
  const glowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,220,160,1)');
    gr.addColorStop(0.25, 'rgba(255,190,120,0.35)');
    gr.addColorStop(1, 'rgba(255,170,90,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const bulbGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
  bulbGlow.scale.setScalar(0.5);
  bulbGlow.position.copy(bulbPos).addScaledVector(shadeDir, 0.03);
  group.add(bulbGlow);

  const lampSpot = new THREE.SpotLight(0xffc98a, 6, 7, 1.05, 0.9, 1.6);
  lampSpot.position.copy(bulbPos);
  lampSpot.target.position.set(0.05, 0.85, -0.3);
  lampSpot.castShadow = true;
  lampSpot.shadow.mapSize.set(1024, 1024);
  lampSpot.shadow.camera.near = 0.05;
  lampSpot.shadow.camera.far = 5;
  lampSpot.shadow.bias = -0.0004;
  lampSpot.shadow.normalBias = 0.015;
  lampSpot.shadow.radius = 3;
  group.add(lampSpot, lampSpot.target);
  const lampPoint = new THREE.PointLight(0xffb070, 1.6, 6, 1.5);
  lampPoint.position.copy(bulbPos).add(new THREE.Vector3(0, 0.08, 0));
  group.add(lampPoint);

  return { lampSpot, lampPoint, bulbGlow };
}

/** Window moonlight, ambient and the cinematic face key. */
export function createGlobalLights(group: THREE.Object3D) {
  const moon = new THREE.DirectionalLight(0x8c78ff, 0.9);
  moon.position.set(1.2, 2.6, -3.2);
  moon.target.position.set(0.2, 0.9, 0);
  group.add(moon, moon.target);
  const hemi = new THREE.HemisphereLight(0x4a3a7a, 0x2a1a12, 0.55);
  group.add(hemi);
  // cinematic "face key": soft warm light motivated by the lamp, no shadows,
  // aimed at the character's head so the face always reads well
  const faceKey = new THREE.SpotLight(0xffc896, 2.2, 4, 0.55, 1.0, 1.2);
  faceKey.position.set(-0.6, 1.62, 0.55);
  faceKey.target.position.set(L.chair.x, 1.5, L.chair.z);
  group.add(faceKey, faceKey.target);
  return { moon, hemi, faceKey };
}

export function buildRoom(): Room {
  const group = new THREE.Group();
  group.name = 'room';
  const B = new StaticBatcher();

  // ---------- materials
  const paint = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.75 });
  patchRoomAO(paint);
  const wall = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.92 });
  patchRoomAO(wall);
  const woodTex = woodTexture();
  const floorTex = woodTex.clone();
  floorTex.repeat.set(3, 3);
  floorTex.needsUpdate = true;
  const floor = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55, color: 0xb08a6a });
  patchRoomAO(floor);
  const deskTex = woodTex.clone();
  deskTex.repeat.set(1, 0.6);
  deskTex.needsUpdate = true;
  const deskWood = new THREE.MeshStandardMaterial({ map: deskTex, roughness: 0.45, color: 0xd7b48e });
  const fabric = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.95 });
  patchRoomAO(fabric);
  const metal = new THREE.MeshStandardMaterial({ color: 0x2c2a33, roughness: 0.35, metalness: 0.7 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fa8ff, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.12, depthWrite: false });

  // ---------- floor, walls, ceiling
  const W = { x0: L.leftWallX, x1: L.rightWallX, z0: L.backWallZ, z1: 3.2 };
  {
    const g = new THREE.PlaneGeometry(W.x1 - W.x0, W.z1 - W.z0);
    g.rotateX(-Math.PI / 2);
    g.translate((W.x0 + W.x1) / 2, 0, (W.z0 + W.z1) / 2);
    const m = new THREE.Mesh(g, floor);
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    group.add(m);
  }
  const wallCol = col(0xc9a68a);
  const t = 0.12;
  const wz = L.backWallZ - t / 2;
  const win = L.window;
  const H = L.ceilingY;
  // back wall around the window opening
  B.box(win.x0 - W.x0, H, t, wall, (W.x0 + win.x0) / 2, H / 2, wz, 0, false, wallCol);
  B.box(W.x1 - win.x1, H, t, wall, (win.x1 + W.x1) / 2, H / 2, wz, 0, false, wallCol);
  B.box(win.x1 - win.x0, win.y0, t, wall, (win.x0 + win.x1) / 2, win.y0 / 2, wz, 0, false, wallCol);
  B.box(win.x1 - win.x0, H - win.y1, t, wall, (win.x0 + win.x1) / 2, (H + win.y1) / 2, wz, 0, false, wallCol);
  // left & right walls, ceiling
  B.box(t, H, W.z1 - W.z0, wall, W.x0 - t / 2, H / 2, (W.z0 + W.z1) / 2, 0, false, col(0xc29c80));
  B.box(t, H, W.z1 - W.z0, wall, W.x1 + t / 2, H / 2, (W.z0 + W.z1) / 2, 0, false, col(0xc29c80));
  B.box(W.x1 - W.x0, t, W.z1 - W.z0, wall, (W.x0 + W.x1) / 2, H + t / 2, (W.z0 + W.z1) / 2, 0, false, col(0x8a7a8a));
  // baseboards
  B.box(W.x1 - W.x0, 0.08, 0.02, paint, (W.x0 + W.x1) / 2, 0.04, L.backWallZ + 0.01, 0, false, col(0xe8dccb));
  B.box(0.02, 0.08, W.z1 - W.z0, paint, W.x0 + 0.01, 0.04, (W.z0 + W.z1) / 2, 0, false, col(0xe8dccb));

  // ---------- window frame + view
  const frameCol = col(0xeee6da);
  const fw = 0.06;
  const wx = (win.x0 + win.x1) / 2;
  const wy = (win.y0 + win.y1) / 2;
  const ww = win.x1 - win.x0;
  const wh = win.y1 - win.y0;
  // reveal (inside of the wall opening)
  B.box(ww + 0.02, 0.03, t + 0.08, paint, wx, win.y0 - 0.015, L.backWallZ + 0.0, 0, false, frameCol); // sill
  B.box(fw, wh, 0.06, paint, win.x0 + fw / 2, wy, L.backWallZ - 0.05, 0, false, frameCol);
  B.box(fw, wh, 0.06, paint, win.x1 - fw / 2, wy, L.backWallZ - 0.05, 0, false, frameCol);
  B.box(ww, fw, 0.06, paint, wx, win.y1 - fw / 2, L.backWallZ - 0.05, 0, false, frameCol);
  B.box(ww, fw, 0.06, paint, wx, win.y0 + fw / 2, L.backWallZ - 0.05, 0, false, frameCol);
  B.box(0.05, wh, 0.06, paint, wx, wy, L.backWallZ - 0.05, 0, false, frameCol); // mullion
  // fixed right pane glass
  {
    const g = new THREE.PlaneGeometry(ww / 2 - 0.08, wh - 0.12);
    const m = new THREE.Mesh(g, glassMat);
    m.position.set(wx + ww / 4, wy, L.backWallZ - 0.06);
    m.renderOrder = 2;
    group.add(m);
  }
  const city = createCityView(9, 5);
  city.position.set(wx, wy + 0.4, L.backWallZ - 2.6);
  group.add(city);

  // opening sash (left), hinged on the left jamb, swings into the room
  const sash = new THREE.Group();
  sash.position.set(win.x0 + fw, wy, L.backWallZ - 0.03);
  const sw = ww / 2 - fw - 0.025;
  const sh = wh - 2 * fw;
  const sashFrame = new THREE.MeshStandardMaterial({ color: 0xf2ece2, roughness: 0.6 });
  const sbars: [number, number, number, number][] = [
    [0.045, sh, 0.022, sh / 2],
    [0.045, sh, sw - 0.022, sh / 2],
    [sw, 0.045, sw / 2, sh - 0.022],
    [sw, 0.045, sw / 2, 0.022],
  ];
  for (const [bw, bh, bx, by] of sbars) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.045), sashFrame);
    m.position.set(bx, by - sh / 2, 0);
    m.castShadow = true;
    sash.add(m);
  }
  {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(sw - 0.08, sh - 0.08), glassMat);
    g.position.set(sw / 2, 0, 0.002);
    g.renderOrder = 2;
    sash.add(g);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.11, 0.025), metal);
    handle.position.set(sw - 0.04, -0.02, 0.04);
    sash.add(handle);
  }
  group.add(sash);
  let windowOpen = 0;
  const handleLocal = new THREE.Vector3(sw - 0.04, -0.02, 0.06);
  const handleAt = (open: number, out = new THREE.Vector3()) => {
    const a = open * SASH_MAX;
    // rotation about +Y by -a swings the free edge toward +Z (into the room)
    out.copy(handleLocal).applyAxisAngle(new THREE.Vector3(0, 1, 0), -a).add(sash.position);
    return out;
  };
  const setWindowOpen = (o: number) => {
    windowOpen = o;
    sash.rotation.y = -o * SASH_MAX;
  };

  // curtain rod + curtains
  const rodY = win.y1 + 0.12;
  {
    const rod = new THREE.CylinderGeometry(0.012, 0.012, ww + 0.8, 10);
    rod.rotateZ(Math.PI / 2);
    B.add(rod, metal, M4(wx, rodY, L.backWallZ + 0.1));
  }
  const curtainMat = new THREE.MeshStandardMaterial({ color: 0x6f5f93, roughness: 0.9, side: THREE.DoubleSide });
  curtainMat.onBeforeCompile = (s) => {
    // translucency: light from the window shining through the fabric
    s.fragmentShader = s.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
      reflectedLight.indirectDiffuse += vec3(0.32, 0.18, 0.5) * 0.18 * (1.0 - float(gl_FrontFacing) * 0.5);`,
    );
  };
  const curtains = [
    new Curtain(new THREE.Vector3(win.x0 - 0.36, rodY - 0.02, L.backWallZ + 0.09), 0.5, rodY - 0.12, L.backWallZ, curtainMat, 12, 22, 1),
    new Curtain(new THREE.Vector3(win.x1 - 0.12, rodY - 0.02, L.backWallZ + 0.09), 0.5, rodY - 0.12, L.backWallZ, curtainMat, 12, 22, 2),
  ];
  for (const c of curtains) group.add(c.mesh);

  // ---------- desk
  const d = L.desk;
  {
    const g = new THREE.BoxGeometry(d.x1 - d.x0, d.thick, d.z1 - d.z0);
    const m = new THREE.Mesh(g, deskWood);
    m.position.set((d.x0 + d.x1) / 2, d.top - d.thick / 2, (d.z0 + d.z1) / 2);
    m.castShadow = true;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    group.add(m);
  }
  const deskCol = col(0x8a6a50);
  for (const sx of [d.x0 + 0.03, d.x1 - 0.03])
    for (const sz of [d.z0 + 0.03, d.z1 - 0.03]) B.box(0.045, d.top - d.thick, 0.045, paint, sx, (d.top - d.thick) / 2, sz, 0, true, deskCol);
  // drawer unit on the right
  B.box(0.38, 0.5, d.z1 - d.z0 - 0.06, paint, d.x1 - 0.23, d.top - d.thick - 0.25, (d.z0 + d.z1) / 2, 0, true, col(0x9a7a5e));
  for (let i = 0; i < 3; i++) B.box(0.3, 0.13, 0.01, paint, d.x1 - 0.23, d.top - 0.11 - i * 0.16, d.z1 - 0.025, 0, false, col(0xae8e70));
  // modesty panel
  B.box(d.x1 - d.x0 - 0.5, 0.3, 0.015, paint, (d.x0 + d.x1) / 2 - 0.2, d.top - 0.2, d.z1 - 0.06, 0, true, deskCol);

  // ---------- chair (dynamic: slides back when he stands up)
  const chair = new THREE.Group();
  chair.name = 'chair';
  {
    const ch = L.chair;
    chair.position.set(ch.x, 0, ch.z);
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x3b3550, roughness: 0.9 });
    const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0) => {
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      chair.add(mesh);
    };
    add(new THREE.BoxGeometry(0.46, 0.06, 0.44), chairMat, 0, L.seatY - 0.03, 0);
    add(new THREE.BoxGeometry(0.44, 0.5, 0.06), chairMat, 0, L.seatY + 0.36, -0.25, -0.12);
    add(new THREE.CylinderGeometry(0.02, 0.02, L.seatY - 0.1, 8), metal, 0, (L.seatY - 0.1) / 2 + 0.05, 0);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      add(new THREE.BoxGeometry(0.3, 0.025, 0.04), metal, Math.cos(a) * 0.15, 0.06, Math.sin(a) * 0.15, 0, -a);
    }
  }
  group.add(chair);

  // ---------- lamp (articulated desk lamp)
  const lp = L.lamp;
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x2f3a4a, roughness: 0.4, metalness: 0.4 });
  B.add(new THREE.CylinderGeometry(0.075, 0.085, 0.025, 24), lampMat, M4(lp.x, lp.y + 0.012, lp.z), true);
  const j1 = new THREE.Vector3(lp.x, lp.y + 0.03, lp.z);
  const j2 = new THREE.Vector3(lp.x + 0.06, lp.y + 0.36, lp.z + 0.02);
  const j3 = new THREE.Vector3(lp.x + 0.24, lp.y + 0.47, lp.z + 0.06);
  const arm = (a: THREE.Vector3, b: THREE.Vector3) => {
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(0.009, 0.009, len, 8);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    B.add(g, lampMat, new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)), true);
    B.add(new THREE.SphereGeometry(0.016, 12, 8), lampMat, M4(b.x, b.y, b.z), true);
  };
  arm(j1, j2);
  arm(j2, j3);
  const shadeDir = new THREE.Vector3(0.55, -0.62, 0.2).normalize();
  {
    const g = new THREE.CylinderGeometry(0.035, 0.1, 0.13, 28, 1, true);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), shadeDir);
    const shadeMat = new THREE.MeshStandardMaterial({ color: 0x2f3a4a, roughness: 0.4, metalness: 0.4, side: THREE.DoubleSide });
    shadeMat.onBeforeCompile = (s) => {
      // the inside of the shade glows warm
      s.fragmentShader = s.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += gl_FrontFacing ? vec3(0.0) : vec3(1.6, 1.05, 0.55);',
      );
    };
    const m = new THREE.Mesh(g, shadeMat);
    m.position.copy(j3).addScaledVector(shadeDir, 0.06);
    m.quaternion.copy(q);
    m.castShadow = true;
    group.add(m);
  }
  const bulbPos = j3.clone().addScaledVector(shadeDir, 0.09);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.026, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3, 1.8) }));
  bulb.position.copy(bulbPos);
  group.add(bulb);
  const { lampSpot, lampPoint, bulbGlow } = createLampLights(group, bulbPos, shadeDir);

  // ---------- laptop
  const lt = L.laptop;
  const laptopMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc8, roughness: 0.35, metalness: 0.6 });
  const lap = new THREE.Group();
  lap.position.copy(lt);
  lap.rotation.y = 0.55; // screen faces the character (lid hinge on the far side)
  {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.015, 0.22), laptopMat);
    base.position.y = 0.0075;
    base.castShadow = true;
    lap.add(base);
    const kb = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.1), new THREE.MeshStandardMaterial({ color: 0x1d1e26, roughness: 0.8 }));
    kb.rotation.x = -Math.PI / 2;
    kb.position.set(0, 0.0152, -0.02);
    lap.add(kb);
    const lid = new THREE.Group();
    lid.position.set(0, 0.015, 0.11);
    lid.rotation.x = 0.3;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.21, 0.008), laptopMat);
    back.position.set(0, 0.105, 0.004);
    back.castShadow = true;
    lid.add(back);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.18), new THREE.MeshBasicMaterial({ map: laptopScreen(), color: new THREE.Color(1.15, 1.15, 1.25) }));
    scr.position.set(0, 0.105, -0.0005);
    scr.rotation.y = Math.PI;
    lid.add(scr);
    lap.add(lid);
  }
  group.add(lap);
  const laptopGlow = new THREE.PointLight(0x8a9cff, 0.35, 1.6, 2);
  laptopGlow.position.copy(lt).add(new THREE.Vector3(-0.02, 0.14, -0.12));
  group.add(laptopGlow);

  // ---------- mug + steam origin
  const mg = L.mug;
  const mugMat = new THREE.MeshStandardMaterial({ color: 0xe9e2d6, roughness: 0.3 });
  {
    const prof = [
      new THREE.Vector2(0.0, 0),
      new THREE.Vector2(0.036, 0),
      new THREE.Vector2(0.04, 0.005),
      new THREE.Vector2(0.041, 0.095),
      new THREE.Vector2(0.037, 0.095),
      new THREE.Vector2(0.036, 0.012),
    ];
    B.add(new THREE.LatheGeometry(prof, 28), mugMat, M4(mg.x, mg.y, mg.z), true);
    B.add(new THREE.TorusGeometry(0.024, 0.0065, 8, 16, Math.PI * 1.1), mugMat, M4(mg.x + 0.04, mg.y + 0.05, mg.z, 0, 0, -Math.PI * 0.55), true);
    const tea = new THREE.CircleGeometry(0.036, 24);
    tea.rotateX(-Math.PI / 2);
    B.add(tea, new THREE.MeshStandardMaterial({ color: 0x3a1d0f, roughness: 0.15 }), M4(mg.x, mg.y + 0.082, mg.z));
  }
  const steamOrigin = new THREE.Vector3(mg.x, mg.y + 0.09, mg.z);

  // ---------- desk clutter: notebooks, pens, papers, books, toys
  const nb = L.notebook;
  B.box(0.21, 0.012, 0.28, paint, nb.x, nb.y + 0.006, nb.z, 0.12, true, col(0xf2ede2));
  B.box(0.2, 0.003, 0.27, paint, nb.x + 0.003, nb.y + 0.0135, nb.z, 0.12, false, col(0xfbf8f1));
  B.box(0.24, 0.02, 0.17, paint, 0.5, d.top + 0.01, 0.12, -0.25, true, col(0x6a4a8c));
  B.box(0.23, 0.03, 0.16, paint, 0.51, d.top + 0.035, 0.12, -0.2, true, col(0x2f6a7c));
  B.box(0.2, 0.025, 0.15, paint, 0.62, d.top + 0.0125, -0.18, 0.4, true, col(0x9c3a3a));
  for (let i = 0; i < 4; i++) {
    const pen = new THREE.CylinderGeometry(0.0045, 0.0045, 0.14, 8);
    pen.rotateZ(Math.PI / 2);
    tint(pen, [col(0x2a4b8f), col(0x222222), col(0xc8433a), col(0x3f7f4f)][i]);
    B.add(pen, paint, M4(0.02 + i * 0.03, d.top + 0.005, 0.27 - i * 0.012, 0, 0.4 + i * 0.5, 0));
  }
  const papers = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.9, side: THREE.DoubleSide });
  for (let i = 0; i < 3; i++) {
    const p = new THREE.PlaneGeometry(0.15, 0.2);
    p.rotateX(-Math.PI / 2);
    B.add(p, papers, M4(0.3 + i * 0.07, d.top + 0.002 + i * 0.0005, 0.24 - i * 0.02, 0, 0.3 - i * 0.4, 0));
  }
  // small figures (toys)
  const toy = (x: number, y: number, z: number, body: number, head: number, s = 1) => {
    const b = new THREE.CapsuleGeometry(0.018 * s, 0.03 * s, 4, 10);
    tint(b, col(body));
    B.add(b, paint, M4(x, y + 0.035 * s, z), true);
    const h = new THREE.SphereGeometry(0.024 * s, 14, 10);
    tint(h, col(head));
    B.add(h, paint, M4(x, y + 0.085 * s, z), true);
  };
  toy(-0.55, d.top, 0.22, 0x3a7bd5, 0xf2c9a0);
  toy(-0.48, d.top, 0.26, 0xd55a3a, 0x5b3a2a, 0.9);
  // building blocks
  const R = rng(9);
  for (let i = 0; i < 5; i++) {
    const g = new THREE.BoxGeometry(0.022, 0.016, 0.022);
    tint(g, col([0xe24a4a, 0x4ab0e2, 0xf2c94c, 0x5ac25a, 0xaa66dd][i]));
    B.add(g, paint, M4(-0.7 + R() * 0.15, d.top + 0.008, 0.25 + R() * 0.07, 0, R() * 3, 0));
  }

  // ---------- shelves + books on the left wall
  const sx = L.leftWallX + 0.12;
  const spines = bookSpineColors(60);
  let si = 0;
  for (const [sy, z0, z1] of [
    [1.52, -1.2, -0.25],
    [1.86, -1.2, -0.25],
  ] as const) {
    B.box(0.24, 0.025, z1 - z0, paint, sx, sy, (z0 + z1) / 2, 0, true, col(0x9a7454));
    let z = z0 + 0.03;
    while (z < z1 - 0.2) {
      const h = 0.17 + R() * 0.07;
      const th = 0.022 + R() * 0.02;
      const lean = z > z1 - 0.32 ? 0.25 : 0;
      const g = new THREE.BoxGeometry(0.15, h, th);
      tint(g, spines[si++ % spines.length]);
      B.add(g, paint, M4(sx, sy + 0.0125 + h / 2, z + th / 2, lean, 0, 0), true);
      z += th + 0.003;
    }
    toy(sx, sy + 0.012, z1 - 0.1, 0x7b5ea7, 0xf0c090, 1.2);
  }
  // dresser + boxes (back left)
  B.box(0.75, 0.75, 0.42, paint, -1.35, 0.375, L.backWallZ + 0.22, 0, true, col(0xa07e60));
  for (let i = 0; i < 3; i++) B.box(0.68, 0.2, 0.01, paint, -1.35, 0.14 + i * 0.235, L.backWallZ + 0.435, 0, false, col(0xb48f6f));
  B.box(0.28, 0.18, 0.25, paint, -1.5, 0.84, L.backWallZ + 0.22, 0.1, true, col(0xd8cdb8));
  B.box(0.22, 0.12, 0.2, paint, -1.15, 0.81, L.backWallZ + 0.24, -0.15, true, col(0x7fa3b8));

  // ---------- posters
  const posterAt = (kind: number, x: number, y: number, z: number, ry: number, s = 1) => {
    const g = new THREE.PlaneGeometry(0.42 * s, 0.63 * s);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: posterTexture(kind), roughness: 0.7 }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.receiveShadow = true;
    group.add(m);
  };
  posterAt(0, -0.45, 1.65, L.backWallZ + 0.005, 0, 1.15);
  posterAt(2, -1.1, 1.72, L.backWallZ + 0.005, 0, 0.8);
  posterAt(1, L.leftWallX + 0.005, 1.55, 0.35, Math.PI / 2, 1.2);
  posterAt(3, 2.05, 1.6, L.backWallZ + 0.005, 0, 0.9);

  // ---------- bed
  const bd = L.bed;
  const bx = (bd.x0 + bd.x1) / 2;
  const bz = (bd.z0 + bd.z1) / 2;
  B.box(bd.x1 - bd.x0, 0.28, bd.z1 - bd.z0, paint, bx, 0.14, bz, 0, true, col(0x8a6a50));
  B.box(bd.x1 - bd.x0 - 0.04, 0.16, bd.z1 - bd.z0 - 0.04, fabric, bx, 0.36, bz, 0, true, col(0xece6e0));
  B.box(0.06, 0.75, bd.z1 - bd.z0, paint, bd.x1 + 0.03, 0.375, bz, 0, true, col(0x7a5a42));
  {
    // blanket: wrinkled, draped over the mattress edge
    const g = new THREE.PlaneGeometry(bd.x1 - bd.x0 - 0.35, bd.z1 - bd.z0 + 0.1, 40, 24);
    g.rotateX(-Math.PI / 2);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const hz = (bd.z1 - bd.z0) / 2;
      let y = 0.012 * Math.sin(x * 14 + z * 6) + 0.008 * Math.sin(x * 31 - z * 17) + 0.03 * Math.exp(-(((x + 0.1) / 0.15) ** 2)) * (0.5 + 0.5 * Math.sin(z * 9));
      let zz = z;
      if (Math.abs(z) > hz - 0.02) {
        const over = Math.abs(z) - (hz - 0.02);
        y -= over * 2.2;
        zz = Math.sign(z) * (hz - 0.02 + over * 0.15);
      }
      p.setXYZ(i, x, y, zz);
    }
    g.computeVertexNormals();
    tint(g, col(0x4e5d8f));
    B.add(g, fabric, M4(bx - 0.12, 0.455, bz), true);
    const pillow = new THREE.SphereGeometry(1, 20, 12);
    pillow.scale(0.16, 0.06, 0.32);
    tint(pillow, col(0xf3efe9));
    B.add(pillow, fabric, M4(bd.x1 - 0.2, 0.48, bz), true);
  }
  // rug
  {
    const g = new THREE.CircleGeometry(0.9, 48);
    g.rotateX(-Math.PI / 2);
    g.scale(1.3, 1, 0.8);
    tint(g, col(0x6b3f5c));
    B.add(g, fabric, M4(0.55, 0.004, 0.2));
    const g2 = new THREE.RingGeometry(0.72, 0.78, 48);
    g2.rotateX(-Math.PI / 2);
    g2.scale(1.3, 1, 0.8);
    tint(g2, col(0xd9a441));
    B.add(g2, fabric, M4(0.55, 0.005, 0.2));
  }

  B.flush(group);

  const { moon, hemi } = createGlobalLights(group);

  const update = (_dt: number, time: number, wind: THREE.Vector3) => {
    (city.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
    for (const c of curtains) c.update(_dt, wind, time);
  };

  return {
    group,
    chair,
    sash,
    handleAt,
    setWindowOpen,
    get windowOpen() {
      return windowOpen;
    },
    curtains,
    city,
    lampSpot,
    lampPoint,
    moon,
    hemi,
    laptopGlow,
    bulbGlow,
    steamOrigin,
    update,
  } as Room;
}
