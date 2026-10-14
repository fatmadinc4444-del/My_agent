import type { Viseme } from './visemes';

/**
 * Text -> timed viseme segments.
 *
 * Turkish orthography is (almost) phonemic, so letter-to-sound is exact and
 * cheap. Durations come from a small segmental model (vowel/consonant class,
 * phrase-final lengthening, Turkish final-syllable stress). Numbers are
 * expanded to words so timing matches what the TTS actually says.
 */

export interface Segment {
  v: Viseme;
  start: number;
  end: number;
  /** index of the source character in the original text */
  char: number;
  /** 0..1 emphasis (stressed vowel) */
  stress: number;
  /** word onset (for gesture beats) */
  wordStart?: boolean;
}

const MAP: Record<string, Viseme | null> = {
  a: 'aa', e: 'E', ı: 'I', i: 'I', o: 'O', ö: 'O', u: 'U', ü: 'U', â: 'aa', î: 'I', û: 'U',
  b: 'PP', p: 'PP', m: 'PP',
  f: 'FF', v: 'FF',
  d: 'DD', t: 'DD', n: 'nn', l: 'nn',
  s: 'SS', z: 'SS',
  ş: 'CH', c: 'CH', ç: 'CH', j: 'CH',
  k: 'kk', g: 'kk', h: 'kk', q: 'kk', x: 'kk', w: 'U',
  r: 'RR', y: 'I',
  ğ: null,
};

const DUR: Record<string, number> = {
  vowel: 0.088,
  stop: 0.058,
  fric: 0.078,
  son: 0.062,
};

const cls = (ch: string) => {
  if ('aeıioöuüâîû'.includes(ch)) return 'vowel';
  if ('bpdtkgcç'.includes(ch)) return 'stop';
  if ('fvszşjh'.includes(ch)) return 'fric';
  return 'son';
};

const ONES = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];

export function numberToTurkish(n: number): string {
  if (n === 0) return 'sıfır';
  if (n < 0) return 'eksi ' + numberToTurkish(-n);
  const parts: string[] = [];
  const chunk = (x: number) => {
    const out: string[] = [];
    const h = Math.floor(x / 100);
    const t = Math.floor((x % 100) / 10);
    const o = x % 10;
    if (h) out.push(h === 1 ? 'yüz' : ONES[h] + ' yüz');
    if (t) out.push(TENS[t]);
    if (o) out.push(ONES[o]);
    return out.join(' ');
  };
  const scales = ['', 'bin', 'milyon', 'milyar'];
  let i = 0;
  while (n > 0 && i < scales.length) {
    const c = n % 1000;
    if (c) {
      if (i === 1 && c === 1) parts.unshift('bin');
      else parts.unshift((chunk(c) + (scales[i] ? ' ' + scales[i] : '')).trim());
    }
    n = Math.floor(n / 1000);
    i++;
  }
  return parts.join(' ');
}

/** Expand digits into words but remember the source char index of each output char. */
function normalise(text: string): { s: string; src: number[] } {
  let s = '';
  const src: number[] = [];
  const re = /\d+/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    for (let i = last; i < m.index; i++) {
      s += text[i];
      src.push(i);
    }
    const words = numberToTurkish(parseInt(m[0].slice(0, 12), 10));
    for (const ch of words) {
      s += ch;
      src.push(m.index);
    }
    last = m.index + m[0].length;
  }
  for (let i = last; i < text.length; i++) {
    s += text[i];
    src.push(i);
  }
  return { s: s.toLocaleLowerCase('tr-TR'), src };
}

export interface TimelineOptions {
  /** speaking rate multiplier (1 = natural) */
  rate?: number;
}

export function textToSegments(text: string, opts: TimelineOptions = {}): Segment[] {
  const rate = opts.rate ?? 1;
  const { s, src } = normalise(text);
  const segs: Segment[] = [];
  let t = 0.05;
  let wordStart = true;
  // find word boundaries to place stress on the last vowel of each word
  const lastVowelOfWord = new Set<number>();
  {
    let lastV = -1;
    for (let i = 0; i <= s.length; i++) {
      const ch = s[i] ?? ' ';
      if (/[\p{L}]/u.test(ch)) {
        if (cls(ch) === 'vowel') lastV = i;
      } else if (lastV >= 0) {
        lastVowelOfWord.add(lastV);
        lastV = -1;
      }
    }
  }
  let wordIndex = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === ',' || ch === ';' || ch === ':' || ch === '—' || ch === '-') {
      segs.push({ v: 'sil', start: t, end: t + 0.2 / rate, char: src[i], stress: 0 });
      t += 0.2 / rate;
      wordStart = true;
      continue;
    }
    if (ch === '.' || ch === '!' || ch === '?' || ch === '\n' || ch === '…') {
      segs.push({ v: 'sil', start: t, end: t + 0.36 / rate, char: src[i], stress: 0 });
      t += 0.36 / rate;
      wordStart = true;
      continue;
    }
    if (!/[\p{L}]/u.test(ch)) {
      if (!wordStart) {
        t += 0.015 / rate;
        wordStart = true;
      }
      continue;
    }
    const v = MAP[ch];
    if (v === undefined) continue;
    if (v === null) {
      // soft g lengthens the previous vowel
      const prev = segs[segs.length - 1];
      if (prev) {
        prev.end += 0.05 / rate;
        t = prev.end;
      }
      continue;
    }
    const c = cls(ch);
    let d = DUR[c];
    const stressed = c === 'vowel' && lastVowelOfWord.has(i);
    if (stressed) d *= 1.18;
    // geminate consonants: merge into one longer segment
    const prev = segs[segs.length - 1];
    if (prev && prev.v === v && s[i - 1] === ch && c !== 'vowel') {
      prev.end += (d * 0.7) / rate;
      t = prev.end;
      continue;
    }
    // phrase-final lengthening: next char is punctuation
    const next = s[i + 1] ?? '.';
    if ('.!?,'.includes(next)) d *= 1.3;
    const seg: Segment = { v, start: t, end: t + d / rate, char: src[i], stress: stressed ? 1 : c === 'vowel' ? 0.4 : 0 };
    if (wordStart) {
      seg.wordStart = true;
      wordIndex++;
      wordStart = false;
    }
    segs.push(seg);
    t = seg.end;
  }
  segs.push({ v: 'sil', start: t, end: t + 0.25, char: text.length, stress: 0 });
  return segs;
}

/** Azure-style viseme events (ms offset + viseme) -> segments. */
export function eventsToSegments(events: { t: number; v: Viseme }[], total?: number): Segment[] {
  const segs: Segment[] = [];
  for (let i = 0; i < events.length; i++) {
    const start = events[i].t / 1000;
    const end = i + 1 < events.length ? events[i + 1].t / 1000 : (total ?? start + 0.2);
    segs.push({ v: events[i].v, start, end: Math.max(end, start + 0.02), char: -1, stress: 0.5 });
  }
  return segs;
}
