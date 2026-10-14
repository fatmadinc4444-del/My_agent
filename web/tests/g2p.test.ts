import { test, expect } from 'vitest';
import { numberToTurkish, textToSegments } from '../src/face/g2p';
import { LipSync } from '../src/face/lipsync';
import { MC } from '../src/face/visemes';

test('numbers are read in Turkish', () => {
  expect(numberToTurkish(0)).toBe('sıfır');
  expect(numberToTurkish(1000)).toBe('bin');
  expect(numberToTurkish(1453)).toBe('bin dört yüz elli üç');
  expect(numberToTurkish(2026)).toBe('iki bin yirmi altı');
});

test('Turkish letters map to visemes, b/p/m close the lips', () => {
  const segs = textToSegments('Merhaba, bugün nasılsın?');
  const vs = segs.map((s) => s.v);
  expect(vs[0]).toBe('PP'); // m
  expect(vs).toContain('aa');
  expect(vs).toContain('U'); // ü
  expect(vs.filter((v) => v === 'sil').length).toBeGreaterThanOrEqual(2); // comma + end
  // monotonic, non-overlapping timeline
  for (let i = 1; i < segs.length; i++) expect(segs[i].start).toBeGreaterThanOrEqual(segs[i - 1].start);
});

test('coarticulation: lips closed during "m", open during "a"', () => {
  const segs = textToSegments('ama');
  const ls = new LipSync();
  ls.load(segs);
  const m = segs.find((s) => s.v === 'PP')!;
  const a = segs.find((s) => s.v === 'aa')!;
  const atM = ls.evaluate((m.start + m.end) / 2)[MC.press];
  const jawA = ls.evaluate((a.start + a.end) / 2)[MC.jaw];
  expect(atM).toBeGreaterThan(0.5);
  expect(jawA).toBeGreaterThan(0.12);
});

test('char index lookup for word resync', () => {
  const ls = new LipSync();
  ls.load(textToSegments('selam dünya'));
  const t0 = ls.timeOfChar(0)!;
  const t6 = ls.timeOfChar(6)!;
  expect(t6).toBeGreaterThan(t0);
});
