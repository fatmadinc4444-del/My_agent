import { DOMINANCE, MC, MC_SIZE, VISEME_POSE, isVowel } from './visemes';
import type { Segment } from './g2p';

/**
 * Coarticulation with the Cohen–Massaro dominance model (1993), plateau
 * variant: every segment pulls the mouth toward its target with a weight
 * that is flat inside the segment and decays exponentially outside it, so
 * neighbouring sounds blend the way real speech does (anticipation of
 * rounding, lip closure always reached for b/p/m, etc.).
 */
export class LipSync {
  private segs: Segment[] = [];
  private cursor = 0;
  readonly out = new Float32Array(MC_SIZE);

  load(segs: Segment[]) {
    this.segs = segs;
    this.cursor = 0;
  }

  get duration() {
    return this.segs.length ? this.segs[this.segs.length - 1].end : 0;
  }

  /** time of the first segment whose source char >= c */
  timeOfChar(c: number): number | null {
    for (const s of this.segs) if (s.char >= c && s.v !== 'sil') return s.start;
    return null;
  }

  /** Evaluate the mouth at time t. `amp` scales openness (audio envelope / emphasis). */
  evaluate(t: number, amp = 1): Float32Array {
    const out = this.out;
    out.fill(0);
    const S = this.segs;
    if (!S.length) return out;
    while (this.cursor > 0 && S[this.cursor].start > t) this.cursor--;
    while (this.cursor < S.length - 1 && S[this.cursor].end < t - 0.4) this.cursor++;
    let wsum = 0;
    for (let i = this.cursor; i < S.length; i++) {
      const s = S[i];
      if (s.start > t + 0.4) break;
      const D = DOMINANCE[s.v];
      const dt = t < s.start ? s.start - t : t > s.end ? t - s.end : 0;
      // anticipation (before the segment) is slightly wider than carry-over
      const th = t < s.start ? D.th * 0.85 : D.th;
      const w = D.a * Math.exp(-th * dt);
      if (w < 1e-4) continue;
      const P = VISEME_POSE[s.v];
      const emph = isVowel(s.v) ? 1 + 0.25 * s.stress : 1;
      for (let k = 0; k < MC_SIZE; k++) out[k] += P[k] * w * (k === MC.jaw || k === MC.lowerDown ? emph : 1);
      wsum += w;
    }
    // silence before the first / after the last segment
    const first = S[0];
    const last = S[S.length - 1];
    let silW = 0;
    if (t < first.start) silW = Math.exp(-12 * (first.start - t)) < 1 ? 1 - Math.exp(-12 * (first.start - t)) : 0;
    if (t > last.end) silW = 1;
    wsum += silW * 0.6;
    if (wsum > 0) for (let k = 0; k < MC_SIZE; k++) out[k] /= wsum;
    out[MC.jaw] *= amp;
    out[MC.lowerDown] *= Math.min(1.2, amp);
    return out;
  }

  /** Word onsets passed between t0 and t1 (gesture beats). */
  beatsBetween(t0: number, t1: number): number {
    let n = 0;
    for (const s of this.segs) {
      if (s.start >= t1) break;
      if (s.start >= t0 && s.wordStart) n++;
    }
    return n;
  }

  /** synthetic loudness for text-only playback */
  envAt(t: number): number {
    for (const s of this.segs) {
      if (t >= s.start && t < s.end) return s.v === 'sil' ? 0 : isVowel(s.v) ? 0.7 + 0.3 * s.stress : 0.35;
    }
    return 0;
  }
}

/**
 * Audio-only fallback (no text, no visemes): estimate the mouth from
 * loudness and spectral centroid. Low centroid + loud -> open/round vowels,
 * high centroid + quiet -> sibilants.
 */
export function mouthFromSpectrum(rms: number, centroid: number, out: Float32Array) {
  out.fill(0);
  const open = Math.min(1, rms * 1.6);
  const c = Math.min(1, Math.max(0, (centroid - 600) / 3400));
  out[MC.jaw] = 0.3 * open * (1 - 0.6 * c);
  out[MC.funnel] = 0.6 * open * Math.max(0, 0.45 - c) * 2;
  out[MC.stretch] = 0.6 * c;
  out[MC.upperUp] = 0.3 * c;
  out[MC.lowerDown] = 0.35 * open;
  out[MC.press] = open < 0.05 ? 0.3 : 0;
  return out;
}
