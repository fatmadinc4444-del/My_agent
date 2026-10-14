import type * as THREE from 'three';
import type { Room } from '../scene/room';
import type { Prop } from '../scene/props';
import type { Cat } from '../cat/cat';
import type { Avatar } from '../rig/avatar';

/** Scene handles the action behaviours manipulate. */
export interface World {
  room: Room;
  character: Avatar;
  phone: Prop;
  guitar: Prop;
  guitarAnchors: { strum: THREE.Vector3; fret: THREE.Vector3; neckGrab: THREE.Vector3 };
  cat: Cat;
  phoneInHand: boolean;
  guitarOnLap: boolean;
}
