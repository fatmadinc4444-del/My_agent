import * as THREE from 'three';

/**
 * Night city seen through the window: dusk gradient, twinkling stars, two
 * layers of hills and thousands of warm windows — all procedural in one
 * fragment shader on a single quad (no textures, constant cost).
 */
export function createCityView(width: number, height: number): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uTime;
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n1(float x) { float i = floor(x); float f = fract(x); float a = h21(vec2(i, 3.1)); float b = h21(vec2(i + 1.0, 3.1)); return mix(a, b, f * f * (3.0 - 2.0 * f)); }
      float ridge(float x, float s, float o) { return n1(x * s + o) * 0.6 + n1(x * s * 2.3 + o * 1.7) * 0.3 + n1(x * s * 5.1 + o) * 0.1; }
      void main() {
        vec2 uv = vUv;
        // sky: deep indigo -> violet -> warm haze at the horizon
        vec3 top = vec3(0.025, 0.02, 0.09);
        vec3 mid = vec3(0.16, 0.07, 0.3);
        vec3 hor = vec3(0.55, 0.22, 0.42);
        float y = uv.y;
        vec3 col = mix(hor, mid, smoothstep(0.18, 0.5, y));
        col = mix(col, top, smoothstep(0.5, 1.0, y));
        // stars
        vec2 g = uv * vec2(90.0, 60.0);
        vec2 id = floor(g);
        float st = h21(id);
        if (st > 0.965) {
          vec2 c = fract(g) - 0.5 - (vec2(h21(id + 1.3), h21(id + 7.7)) - 0.5) * 0.6;
          float tw = 0.6 + 0.4 * sin(uTime * (1.0 + st * 3.0) + st * 50.0);
          col += vec3(0.9, 0.9, 1.0) * smoothstep(0.08, 0.0, length(c)) * tw * smoothstep(0.35, 0.7, y);
        }
        // far hills
        float hFar = 0.36 + 0.07 * ridge(uv.x, 3.0, 2.0);
        if (y < hFar) col = mix(vec3(0.09, 0.05, 0.17), col, 0.25);
        // near hills with the town
        float hNear = 0.27 + 0.09 * ridge(uv.x, 2.0, 9.0);
        if (y < hNear) {
          col = vec3(0.04, 0.03, 0.08);
          // town lights: clustered toward the valley
          vec2 lg = uv * vec2(160.0, 110.0);
          vec2 lid = floor(lg);
          float lh = h21(lid);
          float density = smoothstep(hNear, hNear - 0.12, y) * 0.9 + 0.1;
          if (lh < 0.22 * density) {
            vec2 c = fract(lg) - 0.5;
            float warm = h21(lid + 3.0);
            vec3 lc = mix(vec3(1.0, 0.72, 0.38), vec3(1.0, 0.9, 0.7), warm);
            float flick = 0.85 + 0.15 * sin(uTime * (0.5 + warm * 2.0) + lh * 40.0);
            col += lc * smoothstep(0.32, 0.0, length(c)) * flick * 1.6;
            col += lc * 0.06 * smoothstep(0.9, 0.0, length(c));
          }
          // soft glow above the town
        }
        col += vec3(0.5, 0.25, 0.2) * 0.12 * smoothstep(0.45, 0.25, y);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    depthWrite: true,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  m.name = 'cityView';
  return m;
}
