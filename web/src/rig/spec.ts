import * as THREE from 'three';
import { BONE_DEFS, FINGER_LAYOUT, HAND_X, HAND_Y, HAND_Z } from '../character/skeletonDef';

/**
 * Bind-pose description of the canonical ("virtual") skeleton the animation
 * system works on. It is either the procedural character's own skeleton or
 * one measured from an imported glTF (any rig: Mixamo, CC4, Rigify, VRM...).
 * All positions are in the character root frame: feet on y=0, facing +Z,
 * +X = character's left.
 */
export interface SkeletonSpec {
  names: string[];
  parent: Record<string, string | null>;
  pos: Record<string, THREE.Vector3>;
  /** left hand bind frame: x = toward fingers, y = back of hand, z = toward thumb */
  handX: THREE.Vector3;
  handY: THREE.Vector3;
  handZ: THREE.Vector3;
  /** left thumb direction (bind, world) */
  thumbDir: THREE.Vector3;
}

export function proceduralSpec(): SkeletonSpec {
  const pos: Record<string, THREE.Vector3> = {};
  const parent: Record<string, string | null> = {};
  for (const b of BONE_DEFS) {
    pos[b.name] = new THREE.Vector3(...b.pos);
    parent[b.name] = b.parent;
  }
  const hx = new THREE.Vector3(...HAND_X);
  const hy = new THREE.Vector3(...HAND_Y);
  const hz = new THREE.Vector3(...HAND_Z);
  const d = FINGER_LAYOUT.thumb.dir;
  const thumbDir = hx.clone().multiplyScalar(d[0]).addScaledVector(hy, d[1]).addScaledVector(hz, d[2]).normalize();
  return { names: BONE_DEFS.map((b) => b.name), parent, pos, handX: hx, handY: hy, handZ: hz, thumbDir };
}

let active: SkeletonSpec = proceduralSpec();
const listeners: (() => void)[] = [];

export function getSpec() {
  return active;
}

export function setSpec(s: SkeletonSpec) {
  active = s;
  for (const l of listeners) l();
}

export function onSpecChange(f: () => void) {
  listeners.push(f);
}
