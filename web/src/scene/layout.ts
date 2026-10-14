import * as THREE from 'three';

/** World layout of the room (metres). Camera looks toward -Z. */
export const L = {
  floorY: 0,
  backWallZ: -1.7,
  leftWallX: -2.0,
  rightWallX: 2.6,
  ceilingY: 2.55,
  desk: { x0: -0.86, x1: 0.86, z0: -0.33, z1: 0.36, top: 0.74, thick: 0.035 },
  chair: new THREE.Vector3(0, 0, -0.64),
  seatY: 0.46,
  window: { x0: 0.25, x1: 1.55, y0: 0.95, y1: 2.2, z: -1.7 },
  bed: { x0: 1.18, x1: 2.55, z0: -1.66, z1: -0.62, top: 0.52 },
  phoneRest: new THREE.Vector3(0.33, 0.745, 0.12),
  mug: new THREE.Vector3(-0.56, 0.74, 0.12),
  laptop: new THREE.Vector3(-0.34, 0.74, 0.04),
  notebook: new THREE.Vector3(0.12, 0.74, 0.14),
  lamp: new THREE.Vector3(-0.68, 0.74, -0.15),
  guitarStand: new THREE.Vector3(-0.66, 0, -0.62),
  catBed: new THREE.Vector3(1.85, 0.6, -1.2),
  catDesk: new THREE.Vector3(0.4, 0.74, -0.2),
  camera: new THREE.Vector3(0.12, 1.26, 2.05),
  cameraTarget: new THREE.Vector3(0.04, 1.06, -0.45),
  windowStand: new THREE.Vector3(0.93, 0, -1.2),
};

/** Character root (chair) frame helpers. */
const rootPos = L.chair;
export function worldToRoot(p: THREE.Vector3Like, out = new THREE.Vector3(), rootYaw = 0, root = rootPos) {
  out.set(p.x - root.x, p.y, p.z - root.z);
  if (rootYaw) out.applyAxisAngle(new THREE.Vector3(0, 1, 0), -rootYaw);
  return out;
}
