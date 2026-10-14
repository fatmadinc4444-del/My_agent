import { C } from './controls';
import { fbm1 } from '../math/noise';
import type { Ctx } from './ctx';

/**
 * Additive "being alive" layer applied after the graph: breathing with an
 * irregular rhythm, weight shifts, micro head motion, speech-driven nods.
 * Amplitudes are tiny on purpose — it should never be noticed, only missed.
 */
export class LifeLayer {
  private breathPhase = 0;
  private nod = 0;
  private nodV = 0;
  private lastBeat = 0;

  apply(ctx: Ctx, c: Float32Array, seated: boolean) {
    const t = ctx.time;
    // breathing: ~15/min at rest, faster/shallower when speaking
    const rate = ctx.convo === 'speaking' ? 0.32 : 0.24 + 0.03 * fbm1(t * 0.05);
    this.breathPhase += ctx.dt * rate * Math.PI * 2;
    const b = Math.sin(this.breathPhase) * 0.5 + 0.5;
    const breath = b * b * (3 - 2 * b); // inhale/exhale ease
    c[C.spine] += -0.012 * breath;
    c[C.shrug] += 0.012 * breath;
    c[C.shrug + 1] += 0.012 * breath;
    c[C.hipsPos + 1] += 0.0015 * breath;

    // slow weight shifts & sway
    const amt = seated ? 1 : 0.5;
    c[C.spine + 1] += 0.035 * fbm1(t * 0.11 + 3) * amt;
    c[C.spine + 2] += 0.02 * fbm1(t * 0.09 + 11) * amt;
    c[C.head] += 0.02 * fbm1(t * 0.23 + 5);
    c[C.head + 1] += 0.03 * fbm1(t * 0.17 + 7);
    c[C.head + 2] += 0.025 * fbm1(t * 0.13 + 9);

    // nods: impulse on speech beats (or listener back-channel on mic peaks)
    if (ctx.beat !== this.lastBeat) {
      this.lastBeat = ctx.beat;
      if (ctx.convo === 'speaking') this.nodV += 0.6 + 0.6 * ctx.rand();
    }
    if (ctx.convo === 'listening' && ctx.micLevel > 0.55 && ctx.rand() < ctx.dt * 0.8) this.nodV += 1.2;
    // damped oscillator: a nod is down-up
    const k = 120;
    const d = 14;
    this.nodV += (-k * this.nod - d * this.nodV) * ctx.dt;
    this.nod += this.nodV * ctx.dt;
    c[C.head] += this.nod * 0.06;
  }
}
