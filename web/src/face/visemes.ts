/**
 * Viseme inventory (Oculus/Meta 15-set, the de-facto standard) and the
 * mouth pose each one maps to on our rig.
 */

export const VISEMES = ['sil', 'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR', 'aa', 'E', 'I', 'O', 'U'] as const;
export type Viseme = (typeof VISEMES)[number];

/** Mouth control vector layout. */
export const MC = {
  jaw: 0,
  stretch: 1,
  smile: 2,
  funnel: 3,
  pucker: 4,
  upperUp: 5,
  lowerDown: 6,
  rollLower: 7,
  press: 8,
  tongueUp: 9,
  tongueOut: 10,
} as const;
export const MC_SIZE = 11;

const pose = (p: Partial<Record<keyof typeof MC, number>>) => {
  const a = new Float32Array(MC_SIZE);
  for (const [k, v] of Object.entries(p)) a[MC[k as keyof typeof MC]] = v as number;
  return a;
};

export const VISEME_POSE: Record<Viseme, Float32Array> = {
  sil: pose({ press: 0.08 }),
  PP: pose({ jaw: 0.015, press: 1 }),
  FF: pose({ jaw: 0.05, rollLower: 0.95, upperUp: 0.3 }),
  TH: pose({ jaw: 0.07, tongueOut: 0.85, tongueUp: 0.25, upperUp: 0.15 }),
  DD: pose({ jaw: 0.07, tongueUp: 0.9, stretch: 0.2, upperUp: 0.1 }),
  kk: pose({ jaw: 0.09, stretch: 0.25, lowerDown: 0.1 }),
  CH: pose({ jaw: 0.07, funnel: 0.6, pucker: 0.2, upperUp: 0.35, lowerDown: 0.25 }),
  SS: pose({ jaw: 0.045, stretch: 0.45, upperUp: 0.3, lowerDown: 0.25 }),
  nn: pose({ jaw: 0.08, tongueUp: 0.75, stretch: 0.1 }),
  RR: pose({ jaw: 0.07, funnel: 0.35, pucker: 0.25, tongueUp: 0.35 }),
  aa: pose({ jaw: 0.21, lowerDown: 0.35, stretch: 0.1, upperUp: 0.1 }),
  E: pose({ jaw: 0.13, stretch: 0.5, upperUp: 0.2, lowerDown: 0.3 }),
  I: pose({ jaw: 0.08, stretch: 0.7, smile: 0.2, upperUp: 0.15, lowerDown: 0.15 }),
  O: pose({ jaw: 0.16, funnel: 0.85, lowerDown: 0.1 }),
  U: pose({ jaw: 0.08, pucker: 0.95 }),
};

/**
 * Dominance (how strongly a segment imposes its shape on neighbours) and
 * "deformability" per viseme for the Cohen-Massaro coarticulation model.
 * Bilabials and labiodentals must reach their target; tongue-only
 * consonants borrow the lip shape of surrounding vowels.
 */
export const DOMINANCE: Record<Viseme, { a: number; th: number }> = {
  sil: { a: 0.6, th: 14 },
  PP: { a: 3.2, th: 42 },
  FF: { a: 2.6, th: 38 },
  TH: { a: 0.6, th: 18 },
  DD: { a: 0.35, th: 16 },
  kk: { a: 0.3, th: 16 },
  CH: { a: 1.2, th: 18 },
  SS: { a: 0.55, th: 18 },
  nn: { a: 0.35, th: 16 },
  RR: { a: 0.45, th: 16 },
  aa: { a: 0.75, th: 12 },
  E: { a: 0.7, th: 12 },
  I: { a: 0.7, th: 12 },
  O: { a: 0.85, th: 10 },
  U: { a: 0.9, th: 9 },
};

/** Microsoft Azure TTS viseme id (0..21) -> our viseme. */
export const AZURE_TO_VISEME: Viseme[] = ['sil', 'aa', 'aa', 'O', 'E', 'RR', 'I', 'U', 'O', 'aa', 'O', 'aa', 'kk', 'RR', 'nn', 'SS', 'CH', 'TH', 'FF', 'DD', 'kk', 'PP'];

export const isVowel = (v: Viseme) => v === 'aa' || v === 'E' || v === 'I' || v === 'O' || v === 'U';
