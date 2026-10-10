import type { RtsCamera } from './camera';
export interface FollowPosition {
  x: number;
  y: number;
  z: number;
}
/** Tracks a stable physical agent id; disappearing agents never switch to another resident. */
export class FollowCamera {
  private target: number | null = null;
  private readonly position: FollowPosition = { x: 0, y: 0, z: 0 };
  constructor(
    private camera: RtsCamera,
    private sample: (id: number, out: FollowPosition) => boolean,
    private changed: (id: number | null) => void,
  ) {}
  get id() {
    return this.target;
  }
  start(id: number): boolean {
    if (!this.sample(id, this.position)) {
      this.cancel();
      return false;
    }
    this.target = id;
    this.camera.track(this.position);
    this.changed(id);
    return true;
  }
  update() {
    if (this.target === null) return;
    if (!this.camera.isTracking || !this.sample(this.target, this.position)) {
      this.cancel();
      return;
    }
    this.camera.track(this.position);
  }
  cancel() {
    if (this.target === null) return;
    this.target = null;
    this.camera.stopTracking();
    this.changed(null);
  }
}
