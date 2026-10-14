import * as THREE from 'three';
import { buildHead } from '../character/head';
import { HEAD_CENTER } from '../character/skeletonDef';
import { Eye, createEyeMaterials } from '../character/eyes';
import { EYE_L_CENTER, EYE_R_CENTER } from '../character/headShape';

export async function run() {
  const t0 = performance.now();
  const head = buildHead();
  const t1 = performance.now();
  console.log(`head build ${(t1 - t0).toFixed(1)}ms verts=${head.geometry.getAttribute('position').count}`);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  document.getElementById('app')!.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x30304a);
  const p = new URLSearchParams(location.search);
  const morph = p.get('morph');
  const yaw = +(p.get('yaw') ?? 0.5);
  const mat = new THREE.MeshStandardMaterial({ color: 0xe8b08a, roughness: 0.6 });
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aFace; varying vec4 vFace;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFace = aFace;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vFace;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75,0.36,0.33), vFace.x);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12,0.02,0.03), vFace.y);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95,0.5,0.45), vFace.z*0.25);');
  };
  const mesh = new THREE.Mesh(head.geometry, mat);
  mesh.position.set(-HEAD_CENTER[0], -HEAD_CENTER[1], -HEAD_CENTER[2]);
  if (morph) {
    const names = head.geometry.morphAttributes.position!.map((a) => a.name);
    mesh.morphTargetInfluences = names.map((n) => (n === morph ? 1 : 0));
  }
  const g = new THREE.Group();
  g.add(mesh);
  const em = createEyeMaterials(mat);
  const eyes = [new Eye(EYE_L_CENTER, 1, em), new Eye(EYE_R_CENTER, -1, em)];
  const blink = +(p.get('blink') ?? 0);
  for (const e of eyes) {
    g.add(e.root);
    e.setLids(1.08 + blink * 0.75, 2.12 - blink * 0.2);
    e.setGaze(+(p.get('gx') ?? 0), +(p.get('gy') ?? 0));
  }
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new (await import('three/examples/jsm/environments/RoomEnvironment.js')).RoomEnvironment(), 0.04).texture;
  g.rotation.y = yaw;
  scene.add(g);
  const cam = new THREE.PerspectiveCamera(22, innerWidth / innerHeight, 0.01, 10);
  cam.position.set(0, 0.0, +(p.get('dist') ?? 0.75));
  cam.lookAt(0, -0.01, 0);
  scene.add(new THREE.HemisphereLight(0xbfc8ff, 0x402820, 1.0));
  const key = new THREE.DirectionalLight(0xffe2c0, 2.4);
  key.position.set(-1, 1, 1.5);
  scene.add(key);
  if (p.get('wire')) mat.wireframe = true;
  renderer.render(scene, cam);
  document.getElementById('fade')!.classList.add('done');
  (window as any).__shotReady = true;
}
