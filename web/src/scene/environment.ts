import * as THREE from 'three';

/**
 * Tiny procedural environment for image-based lighting: warm lamp side,
 * violet window side, dark floor. Prefiltered once with PMREM (~5 ms).
 */
export function createEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vD;
        void main(){
          vec3 d = normalize(vD);
          vec3 warm = vec3(0.55, 0.36, 0.22);
          vec3 violet = vec3(0.22, 0.16, 0.42);
          vec3 c = mix(warm, violet, smoothstep(-0.6, 0.6, d.x));
          c *= mix(0.25, 1.0, smoothstep(-0.5, 0.3, d.y));
          gl_FragColor = vec4(c * 0.6, 1.0);
        }`,
    }),
  );
  scene.add(sky);
  // lamp hot spot and window panel
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.2, 2.4) }));
  lamp.position.set(-5, 3, 2);
  scene.add(lamp);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 0.4, 1.3), side: THREE.DoubleSide }));
  win.position.set(3, 2, -8);
  win.lookAt(0, 0, 0);
  scene.add(win);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.02);
  pm.dispose();
  return rt.texture;
}
