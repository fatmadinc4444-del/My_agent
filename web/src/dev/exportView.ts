import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { buildRoom } from '../scene/room';
import { L } from '../scene/layout';
import { Character } from '../character/character';
import { buildGuitar, buildPhone, guitarStandTransform, phoneDeskTransform } from '../scene/props';

/**
 * Exports the procedural room (with all named anchor empties) and the
 * stand-in character as GLB "blockouts" for the artist: exact dimensions,
 * positions and pivots to model over in Blender.
 */
export async function run() {
  const which = new URLSearchParams(location.search).get('what') ?? 'room';
  const root = new THREE.Scene();
  if (which === 'room') {
    const room = buildRoom();
    room.group.traverse((o) => {
      // only geometry the exporter understands; skip sprites/points/shader quads
      if ((o as THREE.Sprite).isSprite || (o as THREE.Points).isPoints || ((o as THREE.Mesh).material as THREE.Material)?.type === 'ShaderMaterial') o.visible = false;
    });
    root.add(room.group);
    const empty = (name: string, p: THREE.Vector3Like, parent: THREE.Object3D = root, scale?: [number, number, number]) => {
      const o = new THREE.Object3D();
      o.name = name;
      o.position.set(p.x, p.y, p.z);
      if (scale) o.scale.set(...scale);
      parent.add(o);
      parent.updateMatrixWorld(true);
      if (parent !== root) o.position.copy(parent.worldToLocal(new THREE.Vector3(p.x, p.y, p.z)));
      return o;
    };
    room.chair.name = 'chair';
    empty('desk_top', { x: 0, y: L.desk.top, z: (L.desk.z0 + L.desk.z1) / 2 });
    empty('phone_rest', L.phoneRest);
    empty('mug', L.mug);
    empty('laptop', L.laptop);
    empty('notebook', L.notebook);
    empty('lamp_bulb', room.lampSpot.position);
    empty('guitar_stand', L.guitarStand);
    room.sash.name = 'window_sash';
    const h = room.handleAt(0);
    empty('window_handle', h, room.sash);
    empty('window_stand', L.windowStand);
    for (const [i, c] of room.curtains.entries()) {
      const p = c.mesh.geometry.getAttribute('position');
      empty(i === 0 ? 'curtain_L' : 'curtain_R', { x: p.getX(0), y: p.getY(0), z: p.getZ(0) }, root, [0.5, L.window.y1 + 0.12 - 0.12, 1]);
      c.mesh.visible = false;
    }
    empty('cat_bed', L.catBed);
    empty('cat_desk', L.catDesk);
    empty('camera', L.camera);
    empty('camera_target', L.cameraTarget);
    const phone = buildPhone();
    const pd = phoneDeskTransform();
    phone.position.copy(pd.pos);
    phone.quaternion.copy(pd.quat);
    root.add(phone);
    const g = buildGuitar().group;
    const gs = guitarStandTransform();
    g.position.copy(gs.pos);
    g.quaternion.copy(gs.quat);
    root.add(g);
  } else {
    const ch = new Character();
    root.add(ch.root);
  }
  root.updateMatrixWorld(true);
  const glb = (await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true })) as ArrayBuffer;
  const u8 = new Uint8Array(glb);
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  (window as unknown as { __export: string }).__export = btoa(bin);
  (window as unknown as { __shotReady: boolean }).__shotReady = true;
}
