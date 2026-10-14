import * as THREE from 'three';
import type { AnimContext } from './graph';

export type ConvoState = 'idle' | 'listening' | 'thinking' | 'speaking';
export type Emotion = 'neutral' | 'happy' | 'sad' | 'surprised' | 'thinking';

/** Everything behaviours may read. Mutated in place by the app each frame. */
export interface Ctx extends AnimContext {
  convo: ConvoState;
  emotion: Emotion;
  emotionAmt: number;
  /** speech loudness envelope 0..1 */
  speechEnv: number;
  /** increments on every stressed syllable / word onset while speaking */
  beat: number;
  micLevel: number;
  camera: THREE.Vector3;
  /** behaviours ask the graph for a soft transition */
  blend(halflife: number): void;
  rand(): number;
  /** world object positions behaviours care about */
  anchors: Record<string, THREE.Vector3>;
  /** set by behaviours: where the eyes/head should look (world), null = default */
  gazeHint: THREE.Vector3 | null;
  emit(event: string, data?: Record<string, unknown>): void;
  /** temporary expression requested by a behaviour (wins over ctx.emotion) */
  expr: { emotion: Emotion; amt: number } | null;
  /** extra mouth shape requested by a behaviour (yawn, "pss pss") */
  mouth: Record<string, number> | null;
  /** 0..1 eyes shut (stretch/yawn) */
  eyesShut: number;
  /** character is holding the phone (persists across behaviours) */
  phoneInHand: boolean;
}
