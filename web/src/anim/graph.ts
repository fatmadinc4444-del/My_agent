import { CONTROL_SIZE, fixQuats, newControls } from './controls';
import { decaySpringArray } from '../math/spring';

/**
 * Behaviour switching with inertialization (Bollo 2016; spring form from
 * Holden 2021 "Dead blending"/"Spring-It-On").
 *
 * Only ONE behaviour is ever evaluated. On a switch (or any discontinuity a
 * behaviour reports) the difference between the last output and the new
 * pose is stored as an offset with velocity, which then decays on a critically
 * damped spring. Result: C1 continuous, no visible blend, half the cost of a
 * crossfade.
 */

export interface AnimContext {
  time: number;
  dt: number;
  [k: string]: unknown;
}

export interface Behavior<Ctx extends AnimContext = AnimContext> {
  readonly name: string;
  enter(ctx: Ctx): void;
  /** Write the raw (target) control vector. */
  evaluate(ctx: Ctx, out: Float32Array): void;
  /** True once a one-shot behaviour finished. */
  finished?(ctx: Ctx): boolean;
  exit?(ctx: Ctx): void;
}

export class AnimGraph<Ctx extends AnimContext> {
  current: Behavior<Ctx> | null = null;
  readonly out = newControls();
  private raw = newControls();
  private prev = newControls();
  private vel = newControls();
  private off = newControls();
  private offVel = newControls();
  private halflife = 0.22;
  private pending: number | null = null;
  private first = true;

  switchTo(b: Behavior<Ctx>, ctx: Ctx, halflife = 0.3) {
    this.current?.exit?.(ctx);
    this.current = b;
    b.enter(ctx);
    this.requestBlend(halflife);
  }

  /** Called by behaviours when their own target jumps (e.g. new sub-pose). */
  requestBlend(halflife: number) {
    this.pending = this.pending === null ? halflife : Math.max(this.pending, halflife);
  }

  update(ctx: Ctx): Float32Array {
    const dt = Math.max(1e-4, ctx.dt);
    this.current?.evaluate(ctx, this.raw);
    fixQuats(this.raw, this.first ? undefined : this.prev);
    if (this.first) {
      this.out.set(this.raw);
      this.prev.set(this.raw);
      this.first = false;
      this.pending = null;
    }
    if (this.pending !== null) {
      // new offset = previous output - new raw pose; velocity carried over
      for (let i = 0; i < CONTROL_SIZE; i++) {
        this.off[i] = this.prev[i] - this.raw[i];
        this.offVel[i] = this.vel[i];
      }
      this.halflife = this.pending;
      this.pending = null;
    }
    decaySpringArray(this.off, this.offVel, this.halflife, dt);
    for (let i = 0; i < CONTROL_SIZE; i++) this.out[i] = this.raw[i] + this.off[i];
    fixQuats(this.out, this.prev);
    for (let i = 0; i < CONTROL_SIZE; i++) {
      // velocity of the raw signal is not available; track output velocity
      // but clamp it to avoid carrying spikes across transitions
      const v = (this.out[i] - this.prev[i]) / dt;
      this.vel[i] = v > 8 ? 8 : v < -8 ? -8 : v;
      this.prev[i] = this.out[i];
    }
    return this.out;
  }
}
