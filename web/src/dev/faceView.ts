import * as THREE from 'three';
import { createGltfLoader } from '../rig/loader';
import { ArkitFace } from '../rig/arkitFace';
import { FaceController } from '../face/face';
import { Speech } from '../face/speech';
import { rng } from '../math/noise';
import type { Emotion } from '../anim/ctx';

/** Face test bench: any glTF head with ARKit shapes, driven by lip sync + face controller. */
export async function run() {
  const p = new URLSearchParams(location.search);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.getElementById('app')!.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x221a33);
  scene.add(new THREE.HemisphereLight(0xc8b8ff, 0x302020, 1.2));
  const key = new THREE.DirectionalLight(0xffd8b0, 2.5);
  key.position.set(-1, 1.5, 2);
  scene.add(key);
  const loader = createGltfLoader(renderer);
  const gltf = await loader.loadAsync(p.get('model') ?? 'dev-models/facecap.glb');
  const model = gltf.scene;
  scene.add(model);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.01, 100);
  cam.position.copy(center).add(new THREE.Vector3(0, 0, size.y * 2.2));
  cam.lookAt(center);
  const face = new ArkitFace(model);
  console.info(`[face] ARKit shapes found: ${face.found.length}/52`);
  for (const n of ['grp_eyeLeft', 'grp_eyeRight', 'eyeLeft', 'eyeRight', 'Eye_L', 'Eye_R']) {
    const o = model.getObjectByName(n);
    if (o) face.eyes.push({ obj: o, rest: o.quaternion.clone() });
  }
  const frame = new THREE.Object3D();
  frame.position.copy(center);
  scene.add(frame);
  const fc = new FaceController({ applyFace: (f) => void face.apply(f), gazeFrame: frame, eyeOffset: new THREE.Vector3(0, size.y * 0.1, size.z * 0.3) }, rng(5));
  const speech = new Speech();
  if (p.get('say')) speech.speak({ id: 'x', text: p.get('say')! });
  const steps = +(p.get('still') ?? 60);
  const dt = 1 / 30;
  let beat = 0;
  for (let i = 0; i < steps; i++) {
    speech.update(dt);
    beat = speech.beats;
    model.updateMatrixWorld(true);
    fc.update(dt, {
      speechMouth: speech.mouth,
      speaking: speech.speaking,
      env: speech.env,
      beat,
      emotion: (p.get('emotion') as Emotion) ?? 'neutral',
      emotionAmt: 1,
      convo: speech.speaking ? 'speaking' : 'idle',
      gazeTarget: cam.position,
      lookingAtUser: true,
    });
  }
  renderer.render(scene, cam);
  document.getElementById('fade')!.classList.add('done');
  (window as unknown as { __shotReady: boolean }).__shotReady = true;
}
