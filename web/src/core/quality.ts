import type * as THREE from 'three';

export type Tier = 'low' | 'medium' | 'high';

const TIER = {
  low: { maxDpr: 1, shadow: 512, minScale: 0.6 },
  medium: { maxDpr: 1.5, shadow: 1024, minScale: 0.65 },
  high: { maxDpr: 2, shadow: 2048, minScale: 0.7 },
} as const;

/**
 * Dynamic resolution governor. Measures GPU-bound frame time (EMA) and
 * scales the render resolution in small steps with hysteresis, so the frame
 * rate holds without visible "pumping". Also guesses a starting tier.
 */
export class QualityGovernor {
  tier: Tier;
  auto = true;
  scale = 1;
  private ema = 16.7;
  private cooldown = 0;
  fps = 60;
  private fpsAcc = 0;
  private fpsN = 0;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private shadowLights: THREE.Light[],
    initial: Tier | 'auto' = 'auto',
  ) {
    this.tier = initial === 'auto' ? QualityGovernor.guessTier(renderer) : initial;
    this.auto = initial === 'auto';
    this.applyTier();
  }

  static guessTier(r: THREE.WebGLRenderer): Tier {
    const gl = r.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    const cores = navigator.hardwareConcurrency ?? 4;
    if (/SwiftShader|llvmpipe|Mali-[GT]?[4-7]\d\b|Adreno \(TM\) [3-5]\d\d/i.test(name) || cores <= 4) return 'low';
    if (/Apple|Adreno \(TM\) [67]\d\d|Mali-G7[1-9]|Mali-G[6-9]\d\d|Xclipse|NVIDIA|AMD|Radeon|Intel\(R\) (Iris|Arc)/i.test(name)) return 'high';
    return 'medium';
  }

  setTier(t: Tier | 'auto') {
    this.auto = t === 'auto';
    if (t !== 'auto') this.tier = t;
    this.scale = 1;
    this.applyTier();
  }

  private applyTier() {
    const T = TIER[this.tier];
    for (const l of this.shadowLights) {
      const s = (l as THREE.SpotLight).shadow;
      if (s && s.mapSize.x !== T.shadow) {
        s.mapSize.set(T.shadow, T.shadow);
        s.map?.dispose();
        s.map = null as unknown as THREE.WebGLRenderTarget;
      }
    }
    this.applyDpr();
  }

  private applyDpr() {
    const T = TIER[this.tier];
    const dpr = Math.min(devicePixelRatio || 1, T.maxDpr) * this.scale;
    if (Math.abs(this.renderer.getPixelRatio() - dpr) > 0.01) this.renderer.setPixelRatio(dpr);
  }

  /** frameMs: wall time between frames */
  sample(frameMs: number, targetMs: number) {
    this.ema += (frameMs - this.ema) * 0.05;
    this.fpsAcc += frameMs;
    this.fpsN++;
    if (this.fpsAcc > 1000) {
      this.fps = (1000 * this.fpsN) / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
    if (!this.auto) return;
    this.cooldown -= frameMs;
    if (this.cooldown > 0) return;
    const T = TIER[this.tier];
    if (this.ema > targetMs * 1.18 && this.scale > T.minScale) {
      this.scale = Math.max(T.minScale, this.scale - 0.08);
      this.applyDpr();
      this.cooldown = 1200;
    } else if (this.ema > targetMs * 1.18 && this.tier !== 'low') {
      this.tier = this.tier === 'high' ? 'medium' : 'low';
      this.scale = 1;
      this.applyTier();
      this.cooldown = 2500;
    } else if (this.ema < targetMs * 1.06 && this.scale < 1) {
      // vsync-locked and stable: probe a slightly higher resolution
      this.scale = Math.min(1, this.scale + 0.05);
      this.applyDpr();
      this.cooldown = 5000;
    }
  }
}
