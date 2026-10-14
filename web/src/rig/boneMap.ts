/**
 * Maps the bones of an arbitrary humanoid rig onto the canonical skeleton.
 * Supports our own names, Mixamo, Character Creator (CC3/CC4), VRM / Unity
 * humanoid and common Blender (Rigify DEF-, plain) conventions. A
 * `<model>.map.json` next to the model can override anything.
 */

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/^armature[|_.]?/, '')
    .replace(/^mixamorig\d*[:_]?/, '')
    .replace(/^cc_base_/, '')
    .replace(/^def[-_.]/, '')
    .replace(/^j_bip_c_|^j_bip_l_|^j_bip_r_/, (m) => (m.includes('_l_') ? 'left' : m.includes('_r_') ? 'right' : ''))
    .replace(/[^a-z0-9]/g, '');

type Side = 'L' | 'R';

function sideVariants(base: string[], s: Side): string[] {
  const out: string[] = [];
  const word = s === 'L' ? 'left' : 'right';
  const ch = s === 'L' ? 'l' : 'r';
  for (const b of base) out.push(`${word}${b}`, `${b}${word}`, `${b}${ch}`, `${ch}${b}`);
  return out;
}

const CENTRAL: Record<string, string[]> = {
  hips: ['hips', 'hip', 'pelvis', 'root_hips'],
  spine: ['spine', 'spine01', 'spine1', 'waist'],
  chest: ['spine2', 'spine02', 'chest', 'upperchest', 'spine03', 'spine1'],
  neck: ['neck', 'neck01', 'necktwist01'],
  head: ['head'],
  jaw: ['jaw', 'jawroot', 'facialjaw', 'lowerjaw'],
};

const SIDED: Record<string, string[]> = {
  shoulder: ['shoulder', 'clavicle'],
  upperArm: ['arm', 'upperarm'],
  foreArm: ['forearm', 'lowerarm', 'elbow'],
  hand: ['hand', 'wrist'],
  thigh: ['upleg', 'thigh', 'upperleg'],
  shin: ['leg', 'calf', 'lowerleg', 'shin', 'knee'],
  foot: ['foot', 'ankle'],
  toes: ['toebase', 'toe', 'toes', 'ball'],
  eye: ['eye'],
};

const FINGER_NAMES: Record<string, string[]> = {
  thumb: ['thumb'],
  index: ['index', 'indexfinger'],
  middle: ['middle', 'mid', 'middlefinger'],
  ring: ['ring', 'ringfinger'],
  pinky: ['pinky', 'little', 'littlefinger', 'pinkie'],
};
const VRM_FINGER_SEG = [['metacarpal', 'proximal'], ['intermediate', 'proximal'], ['distal', 'intermediate']];

export function mapBones(names: string[], override: Record<string, string> = {}): Record<string, string> {
  const byNorm = new Map<string, string>();
  for (const n of names) if (!byNorm.has(norm(n))) byNorm.set(norm(n), n);
  const out: Record<string, string> = {};
  const pick = (cands: string[]) => {
    for (const c of cands) {
      const hit = byNorm.get(c);
      if (hit) return hit;
    }
    return undefined;
  };
  for (const [k, c] of Object.entries(CENTRAL)) {
    const hit = pick([k.toLowerCase(), ...c]);
    if (hit) out[k] = hit;
  }
  // our spine/chest must differ
  if (out.spine && out.chest === out.spine) delete out.chest;
  for (const s of ['L', 'R'] as Side[]) {
    for (const [k, c] of Object.entries(SIDED)) {
      const hit = pick([`${k.toLowerCase()}${s.toLowerCase()}`, ...sideVariants(c, s)]);
      if (hit) out[`${k}.${s}`] = hit;
    }
    for (const [f, fn] of Object.entries(FINGER_NAMES)) {
      for (let j = 1; j <= 3; j++) {
        const cands: string[] = [`${f}${j}${s.toLowerCase()}`];
        for (const b of fn) {
          cands.push(...sideVariants([`hand${b}${j}`, `${b}${j}`, `${b}0${j}`, `finger${b}${j}`], s));
          // VRM: LeftThumbProximal / LeftIndexIntermediate ...
          for (const seg of VRM_FINGER_SEG[j - 1]) cands.push(...sideVariants([`${b}${seg}`], s));
        }
        const hit = pick(cands);
        if (hit) out[`${f}${j}.${s}`] = hit;
      }
    }
  }
  return { ...out, ...override };
}

export const REQUIRED_BONES = ['hips', 'spine', 'neck', 'head', 'upperArm.L', 'foreArm.L', 'hand.L', 'upperArm.R', 'foreArm.R', 'hand.R', 'thigh.L', 'shin.L', 'foot.L', 'thigh.R', 'shin.R', 'foot.R'];
