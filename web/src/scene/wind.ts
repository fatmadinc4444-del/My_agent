import * as THREE from 'three';
import { fbm1 } from '../math/noise';
import { Spring1 } from '../math/spring';

/**
 * Global wind field. Strength follows how far the window is open, with
 * fractal gusts; direction blows from the window into the room.
 */
export class Wind {
  readonly vec = new THREE.Vector3();
  /** 0..1 smoothed opening */
  private open = new Spring1(0, 0.6);
  gust = 0;
  strength = 0;

  update(dt: number, time: number, windowOpen: number) {
    const o = this.open.update(windowOpen, dt);
    this.gust = 0.55 + 0.45 * fbm1(time * 0.35, 3) + 0.35 * Math.max(0, fbm1(time * 1.1 + 40, 2));
    this.strength = o * this.gust;
    // from the window (back right) toward the camera, slightly to the left
    this.vec.set(-0.35 + 0.15 * fbm1(time * 0.2 + 7), 0.08 * fbm1(time * 0.5 + 3), 1).normalize().multiplyScalar(this.strength * 3.2);
  }
}
