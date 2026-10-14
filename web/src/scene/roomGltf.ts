import * as THREE from 'three';
import { createGltfLoader } from '../rig/loader';
import { L } from './layout';
import { SASH_MAX, createGlobalLights, createLampLights, type Room } from './room';
import { createCityView } from './sky';
import { Curtain } from './curtains';

/**
 * Artist-made room (room.glb). Interactive points are Empties with agreed
 * names (see docs/MODEL_SPEC.md); they overwrite the default layout so every
 * behaviour (sitting, reaching for the phone, opening the window, the cat's
 * path...) adapts to the new room automatically.
 */
export async function loadRoomGltf(url: string, renderer: THREE.WebGLRenderer): Promise<Room> {
  const gltf = await createGltfLoader(renderer).loadAsync(url);
  const group = new THREE.Group();
  group.name = 'room';
  const scene = gltf.scene;
  group.add(scene);
  scene.updateMatrixWorld(true);
  const W = (name: string) => {
    const o = scene.getObjectByName(name);
    return o ? o.getWorldPosition(new THREE.Vector3()) : null;
  };
  const need = (name: string) => {
    const o = scene.getObjectByName(name);
    if (!o) throw new Error(`room.glb: missing empty "${name}"`);
    return o;
  };
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  // ---- layout from anchors
  const set = (v: THREE.Vector3, name: string) => {
    const p = W(name);
    if (p) v.copy(p);
  };
  const chairObj = need('chair');
  L.chair.copy(chairObj.getWorldPosition(new THREE.Vector3())).setY(0);
  set(L.phoneRest, 'phone_rest');
  set(L.mug, 'mug');
  set(L.laptop, 'laptop');
  set(L.notebook, 'notebook');
  set(L.guitarStand, 'guitar_stand');
  set(L.catBed, 'cat_bed');
  set(L.catDesk, 'cat_desk');
  set(L.windowStand, 'window_stand');
  set(L.camera, 'camera');
  set(L.cameraTarget, 'camera_target');
  const desk = W('desk_top');
  if (desk) L.desk.top = desk.y;

  // chair moves in world space: re-parent it to the room root
  group.attach(chairObj);
  const chair = new THREE.Group();
  chair.position.copy(L.chair);
  group.add(chair);
  chair.attach(chairObj);

  // ---- window
  const sash = need('window_sash');
  const handle = need('window_handle');
  const sashRest = sash.quaternion.clone();
  const handleLocal = handle.position.clone();
  let windowOpen = 0;
  const axisY = new THREE.Vector3(0, 1, 0);
  const setWindowOpen = (o: number) => {
    windowOpen = o;
    sash.quaternion.copy(sashRest).multiply(new THREE.Quaternion().setFromAxisAngle(axisY, -o * SASH_MAX));
  };
  const handleAt = (open: number, out = new THREE.Vector3()) => {
    const q = sashRest.clone().multiply(new THREE.Quaternion().setFromAxisAngle(axisY, -open * SASH_MAX));
    out.copy(handleLocal).multiply(sash.scale).applyQuaternion(q).add(sash.position);
    return sash.parent!.localToWorld(out);
  };
  const sashW = sash.getWorldPosition(new THREE.Vector3());
  L.window.z = sashW.z;

  // ---- curtains (cloth), from empties: position = top-left, scale = width/height
  const curtainMat = new THREE.MeshStandardMaterial({ color: 0x6f5f93, roughness: 0.9, side: THREE.DoubleSide });
  const curtains: Curtain[] = [];
  for (const [i, n] of ['curtain_L', 'curtain_R'].entries()) {
    const o = scene.getObjectByName(n);
    if (!o) continue;
    const p = o.getWorldPosition(new THREE.Vector3());
    const s = o.getWorldScale(new THREE.Vector3());
    const c = new Curtain(p, s.x, s.y, p.z - 0.09, curtainMat, 12, 22, i + 1);
    curtains.push(c);
    group.add(c.mesh);
  }

  // ---- outside view unless the artist modelled one
  let city = scene.getObjectByName('window_view') as THREE.Mesh | undefined;
  if (!city) {
    city = createCityView(9, 5);
    city.position.set(sashW.x + 0.3, sashW.y + 0.4, sashW.z - 2.6);
    group.add(city);
  }

  // ---- lights
  const bulb = W('lamp_bulb') ?? new THREE.Vector3(-0.6, 1.15, -0.1);
  const { lampSpot, lampPoint, bulbGlow } = createLampLights(group, bulb, new THREE.Vector3(0.5, -0.7, 0.2).normalize());
  const { moon, hemi } = createGlobalLights(group);
  const laptopGlow = new THREE.PointLight(0x8a9cff, 0.35, 1.6, 2);
  laptopGlow.position.copy(L.laptop).add(new THREE.Vector3(0, 0.14, -0.12));
  group.add(laptopGlow);

  const steamOrigin = L.mug.clone().add(new THREE.Vector3(0, 0.09, 0));
  const update = (dt: number, time: number, wind: THREE.Vector3) => {
    const u = (city!.material as THREE.ShaderMaterial).uniforms;
    if (u?.uTime) u.uTime.value = time;
    for (const c of curtains) c.update(dt, wind, time);
  };
  return {
    group,
    chair,
    sash: sash as THREE.Group,
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
