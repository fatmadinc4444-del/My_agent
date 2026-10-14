import { LipSync, mouthFromSpectrum } from './lipsync';
import { eventsToSegments, textToSegments } from './g2p';
import { AZURE_TO_VISEME, MC_SIZE } from './visemes';

export interface SpeakCommand {
  id: string;
  text: string;
  lang?: string;
  /** base64 audio (wav/mp3/ogg) or URL */
  audio?: string;
  /** Azure viseme events: t (ms) + v (id 0..21) */
  visemes?: { t: number; v: number }[];
  rate?: number;
}

type Mode = 'none' | 'text' | 'audio' | 'audioOnly';

/**
 * Drives lip sync from one of three sources, in order of accuracy:
 *  1. audio + TTS viseme events (Azure, Polly...)   -> exact
 *  2. audio + text: text timeline fitted to the voiced span of the audio,
 *     openness modulated by the live loudness envelope
 *  3. text only (native TTS playing outside the WebView): internal clock,
 *     re-synchronised by word-boundary callbacks (speechWord)
 * plus an audio-only spectral fallback.
 */
export class Speech {
  readonly lip = new LipSync();
  readonly mouth = new Float32Array(MC_SIZE);
  mode: Mode = 'none';
  id = '';
  /** loudness envelope 0..1 (smoothed) */
  env = 0;
  beats = 0;
  private t = 0;
  private rate = 1;
  private ctx: AudioContext | null = null;
  private src: AudioBufferSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private buf: Float32Array<ArrayBuffer> | null = null;
  private freq: Float32Array<ArrayBuffer> | null = null;
  private audioStart = 0;
  private holdUntilEnd = false;
  private peak = 0.05;
  private endTimer = 0;
  onEvent: (e: string, data: Record<string, unknown>) => void = () => {};

  get speaking() {
    return this.mode !== 'none';
  }

  async speak(cmd: SpeakCommand) {
    this.stop(false);
    this.id = cmd.id;
    this.beats = 0;
    if (cmd.audio) {
      try {
        await this.playAudio(cmd);
        return;
      } catch (e) {
        console.warn('audio playback failed, falling back to text timing', e);
      }
    }
    this.lip.load(textToSegments(cmd.text, { rate: cmd.rate ?? 1 }));
    this.t = 0;
    this.rate = 1;
    this.mode = 'text';
    this.holdUntilEnd = true; // native TTS tells us when it is done
    this.endTimer = 0;
    this.onEvent('speechStart', { id: this.id });
  }

  private async playAudio(cmd: SpeakCommand) {
    this.ctx ??= new AudioContext();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    let data: ArrayBuffer;
    if (/^https?:|^blob:|^\//.test(cmd.audio!)) data = await (await fetch(cmd.audio!)).arrayBuffer();
    else {
      const b64 = cmd.audio!.replace(/^data:[^,]+,/, '');
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      data = u8.buffer;
    }
    const audio = await this.ctx.decodeAudioData(data);
    // timeline
    if (cmd.visemes?.length) {
      this.lip.load(eventsToSegments(cmd.visemes.map((e) => ({ t: e.t, v: AZURE_TO_VISEME[e.v] ?? 'sil' })), audio.duration));
      this.mode = 'audio';
    } else if (cmd.text?.trim()) {
      const segs = textToSegments(cmd.text);
      // fit the text timeline to the voiced span of the audio
      const [on, off] = voicedSpan(audio);
      const dur = segs[segs.length - 1].end;
      const k = (off - on) / Math.max(0.1, dur - 0.3);
      for (const s of segs) {
        s.start = on + (s.start - 0.05) * k;
        s.end = on + (s.end - 0.05) * k;
      }
      this.lip.load(segs);
      this.mode = 'audio';
    } else {
      this.mode = 'audioOnly';
    }
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.buf = new Float32Array(this.analyser.fftSize);
    this.freq = new Float32Array(this.analyser.frequencyBinCount);
    this.src = this.ctx.createBufferSource();
    this.src.buffer = audio;
    this.src.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.audioStart = this.ctx.currentTime + 0.03;
    this.src.start(this.audioStart);
    this.src.onended = () => {
      if (this.mode === 'audio' || this.mode === 'audioOnly') this.stop(true);
    };
    this.holdUntilEnd = false;
    this.onEvent('speechStart', { id: this.id });
  }

  /** Native TTS word boundary: re-sync the internal clock smoothly. */
  wordBoundary(charStart: number) {
    if (this.mode !== 'text') return;
    const tc = this.lip.timeOfChar(charStart);
    if (tc === null) return;
    const err = tc - this.t;
    if (Math.abs(err) > 0.6) this.t = tc;
    else this.rate = Math.min(2, Math.max(0.5, 1 + err / 0.3));
  }

  /** Native TTS finished. */
  end() {
    if (this.mode === 'text') this.stop(true);
  }

  stop(emit = true) {
    if (this.src) {
      try {
        this.src.onended = null;
        this.src.stop();
      } catch {
        /* already stopped */
      }
      this.src.disconnect();
      this.src = null;
    }
    const was = this.mode !== 'none';
    this.mode = 'none';
    if (emit && was) this.onEvent('speechEnd', { id: this.id });
  }

  update(dt: number) {
    const prevT = this.t;
    if (this.mode === 'text') {
      this.t += dt * this.rate;
      this.rate += (1 - this.rate) * Math.min(1, dt * 2);
      const envT = this.lip.envAt(this.t);
      this.env += (envT - this.env) * Math.min(1, dt * 18);
      this.mouth.set(this.lip.evaluate(this.t, 0.9 + 0.25 * this.env));
      if (this.t > this.lip.duration) {
        // timeline finished before the TTS: keep the mouth resting, but stop
        // waiting after a while in case the end event never arrives
        this.endTimer += dt;
        if (!this.holdUntilEnd || this.endTimer > 4) this.stop(true);
      }
    } else if ((this.mode === 'audio' || this.mode === 'audioOnly') && this.ctx && this.analyser) {
      this.t = this.ctx.currentTime - this.audioStart;
      this.analyser.getFloatTimeDomainData(this.buf!);
      let s = 0;
      for (let i = 0; i < this.buf!.length; i++) s += this.buf![i] * this.buf![i];
      const rms = Math.sqrt(s / this.buf!.length);
      // automatic gain: normalise against a slowly decaying peak
      this.peak = Math.max(rms, this.peak * Math.exp(-dt * 0.3), 0.02);
      const e = Math.min(1, rms / this.peak);
      this.env += (e - this.env) * Math.min(1, dt * (e > this.env ? 30 : 12));
      if (this.mode === 'audio') {
        const gate = this.env < 0.08 ? 0.25 : 1;
        this.mouth.set(this.lip.evaluate(this.t, (0.45 + 0.75 * this.env) * gate));
      } else {
        this.analyser.getFloatFrequencyData(this.freq!);
        let num = 0;
        let den = 0;
        const hz = this.ctx.sampleRate / 2 / this.freq!.length;
        for (let i = 2; i < this.freq!.length; i++) {
          const m = Math.pow(10, this.freq![i] / 20);
          num += m * i * hz;
          den += m;
        }
        mouthFromSpectrum(this.env, den > 0 ? num / den : 0, this.mouth);
      }
    } else {
      this.env += (0 - this.env) * Math.min(1, dt * 10);
      this.mouth.fill(0);
    }
    if (this.mode === 'text' || this.mode === 'audio') this.beats += this.lip.beatsBetween(prevT, this.t);
  }
}

/** Onset/offset of the voiced part of an audio buffer (simple energy gate). */
function voicedSpan(b: AudioBuffer): [number, number] {
  const d = b.getChannelData(0);
  const win = Math.floor(b.sampleRate * 0.02);
  let max = 0;
  const e: number[] = [];
  for (let i = 0; i + win < d.length; i += win) {
    let s = 0;
    for (let j = 0; j < win; j++) s += d[i + j] * d[i + j];
    const r = Math.sqrt(s / win);
    e.push(r);
    max = Math.max(max, r);
  }
  const thr = max * 0.08;
  let on = 0;
  while (on < e.length && e[on] < thr) on++;
  let off = e.length - 1;
  while (off > on && e[off] < thr) off--;
  return [(on * win) / b.sampleRate, ((off + 1) * win) / b.sampleRate];
}
