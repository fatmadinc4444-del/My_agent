import * as THREE from 'three';

/**
 * Character materials. All are MeshStandardMaterial (one BRDF, works on every
 * mobile GPU) patched with small, targeted shader edits:
 *  - skin: per-channel wrap lighting (cheap subsurface look), lips, mouth
 *    cavity darkening and cheek blush from the `aFace` vertex masks;
 *  - cloth: procedural tartan with analytic anti-aliasing + fabric sheen.
 */

const DIFFUSE_LINE = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';

function patchWrapDiffuse(shader: { fragmentShader: string }, wrap: string) {
  const chunk = THREE.ShaderChunk.lights_physical_pars_fragment;
  if (!chunk.includes(DIFFUSE_LINE)) return; // engine changed: fall back to Lambert
  const patched = chunk.replace(
    DIFFUSE_LINE,
    `{
      // per-channel wrap: light bleeds further in red (skin scattering)
      float nl = dot( geometryNormal, directLight.direction );
      vec3 w = ${wrap};
      vec3 wl = clamp( ( vec3( nl ) + w ) / ( 1.0 + w ), 0.0, 1.0 );
      wl *= mix( vec3( 1.0 ), wl, 0.35 );
      reflectedLight.directDiffuse += wl * directLight.color * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
    }`,
  );
  shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_pars_fragment>', patched);
}

export function createSkinMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xe0a07c, roughness: 0.56 });
  m.onBeforeCompile = (sh) => {
    patchWrapDiffuse(sh, 'vec3( 0.42, 0.2, 0.14 )');
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aFace;\nvarying vec4 vFace;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFace = aFace;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vFace;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.93, 0.45, 0.4 ), vFace.z * 0.22 );
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.72, 0.38, 0.33 ), vFace.x * 0.85 );
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.16, 0.035, 0.04 ), vFace.y );`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix( roughnessFactor, 0.36, vFace.x );
        roughnessFactor = mix( roughnessFactor, 0.9, vFace.y );`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        // baked SDF occlusion (head only; other skin meshes have no aFace -> w = 0 -> treat as 1)
        float bakedAO = vFace.w > 0.0 ? vFace.w : 1.0;
        reflectedLight.indirectDiffuse *= bakedAO;
        reflectedLight.directDiffuse *= mix(1.0, bakedAO, 0.6);
        reflectedLight.indirectSpecular *= bakedAO;
        // the mouth cavity is shadowed from everything but a little bounce
        reflectedLight.directDiffuse *= 1.0 - 0.85 * vFace.y;
        reflectedLight.directSpecular *= 1.0 - vFace.y;
        reflectedLight.indirectDiffuse *= 1.0 - 0.7 * vFace.y;
        reflectedLight.indirectSpecular *= 1.0 - vFace.y;`,
      );
  };
  m.customProgramCacheKey = () => 'skin-v1';
  return m;
}

const TARTAN = /* glsl */ `
  float tBand(float x, float a, float b, float aa) {
    return smoothstep(a - aa, a + aa, x) - smoothstep(b - aa, b + aa, x);
  }
  vec3 tAxis(float x, float aa, vec3 base, vec3 mid, vec3 light, vec3 dark) {
    float q = fract(x);
    vec3 c = base;
    c = mix(c, mid, tBand(q, 0.16, 0.44, aa));
    c = mix(c, dark, tBand(q, 0.255, 0.345, aa));
    c = mix(c, light, tBand(q, 0.62, 0.645, aa));
    c = mix(c, light * 0.8, tBand(q, 0.9, 0.915, aa));
    return c;
  }
  vec3 tartan(vec2 p, float scale) {
    vec2 s = p / scale;
    vec2 aa = fwidth(s) * 0.75 + 1e-4;
    // authored in sRGB, converted to linear
    vec3 base = pow(vec3(0.16, 0.19, 0.31), vec3(2.2));
    vec3 mid = pow(vec3(0.24, 0.28, 0.44), vec3(2.2));
    vec3 light = pow(vec3(0.42, 0.47, 0.64), vec3(2.2));
    vec3 dark = pow(vec3(0.07, 0.08, 0.13), vec3(2.2));
    vec3 warp = tAxis(s.x, aa.x, base, mid, light, dark);
    vec3 weft = tAxis(s.y, aa.y, base, mid, light, dark);
    // twill weave: diagonal 2/2 interlacing, faded out when threads get sub-pixel
    vec2 th = p / 0.0011;
    float tw = step(2.0, mod(floor(th.x) + floor(th.y), 4.0));
    float twVis = 1.0 - smoothstep(0.3, 0.9, max(fwidth(th.x), fwidth(th.y)));
    float m = mix(0.5, tw, 0.35 * twVis);
    return mix(warp, weft, m);
  }
`;

export function createClothMaterial(opts: { scale: number; vneck?: boolean; skinColor?: THREE.Color }): THREE.MeshStandardMaterial {
  // double sided: the cuffs and hems are open tubes
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, vertexColors: false, side: THREE.DoubleSide });
  const skin = opts.skinColor ?? new THREE.Color(0xe0a07c);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSkin = { value: skin };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vClothUv;\nvarying vec3 vBind;\nattribute vec3 color;\nvarying float vButton;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvClothUv = uv;\nvBind = position;\nvButton = color.g;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vClothUv;\nvarying vec3 vBind;\nvarying float vButton;\nuniform vec3 uSkin;\n${TARTAN}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 cloth = tartan(vClothUv, ${opts.scale.toFixed(4)});
        diffuseColor.rgb = mix(cloth, vec3(0.012, 0.014, 0.03), vButton);
        ${
          opts.vneck
            ? `{
          // V-neck evaluated in bind space: crisp edge independent of tessellation
          float vh = max(0.0, (vBind.y - 1.262) * 0.6);
          float e = fwidth(vBind.x) * 1.5 + 1e-4;
          float vmask = (1.0 - smoothstep(vh - e, vh + e, abs(vBind.x))) * step(0.0, vBind.z) * step(1.262, vBind.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, uSkin, vmask);
        }`
            : ''
        }`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        {
          // fabric sheen: soft grazing-angle brightening (velvet-ish cotton)
          float nv = saturate(dot(normal, normalize(vViewPosition)));
          float sheen = pow(1.0 - nv, 4.0);
          reflectedLight.indirectDiffuse += sheen * 0.35 * diffuseColor.rgb;
        }`,
      );
  };
  m.customProgramCacheKey = () => `cloth-${opts.scale}-${opts.vneck ? 1 : 0}`;
  return m;
}

export interface CharacterMaterials {
  skin: THREE.MeshStandardMaterial;
  shirt: THREE.MeshStandardMaterial;
  pants: THREE.MeshStandardMaterial;
  slippers: THREE.MeshStandardMaterial;
  teeth: THREE.MeshStandardMaterial;
  gums: THREE.MeshStandardMaterial;
  tongue: THREE.MeshStandardMaterial;
  brows: THREE.MeshStandardMaterial;
}

export function createCharacterMaterials(): CharacterMaterials {
  const skin = createSkinMaterial();
  return {
    skin,
    shirt: createClothMaterial({ scale: 0.085, vneck: true, skinColor: skin.color }),
    pants: createClothMaterial({ scale: 0.1 }),
    slippers: new THREE.MeshStandardMaterial({ color: 0x3a3f55, roughness: 0.95 }),
    teeth: new THREE.MeshStandardMaterial({ color: 0xf3ede2, roughness: 0.32, vertexColors: true }),
    gums: new THREE.MeshStandardMaterial({ color: 0xb85a58, roughness: 0.4 }),
    tongue: new THREE.MeshStandardMaterial({ color: 0xa8504e, roughness: 0.38 }),
    brows: new THREE.MeshStandardMaterial({ color: 0x2b1a10, roughness: 0.9 }),
  };
}
