import { PerspectiveCamera, Vector3 } from 'three';
import { clamp } from '../core/math';
import { CAMERA } from '../data/rendering';
import type { Vec2 } from '../core/math';

export interface ScreenAnchor {
  x: number;
  y: number;
}
export interface CameraBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
export interface CameraState {
  x: number;
  z: number;
  distance: number;
  azimuth: number;
  elevation: number;
}
export interface CameraOptions {
  bounds: CameraBounds;
  heightAt: (x: number, z: number) => number;
  initial?: Partial<CameraState>;
}
const radians = Math.PI / 180;
const wrap = (angle: number): number =>
  Math.atan2(Math.sin(angle), Math.cos(angle));

/** Orbit camera with terrain clearance, frame-independent damping and anchored zoom. */
export class RtsCamera {
  private readonly current: CameraState;
  private readonly target: CameraState;
  private readonly flightStart: CameraState;
  private flightTime: number | null = null;
  private anchored = false;
  private trackedHeight: number | null = null;
  private focusLift = 0;
  private readonly anchor = new Vector3();
  private readonly screenAnchor = { x: 0, y: 0 };
  private readonly direction = new Vector3();
  private readonly focus = new Vector3();
  private readonly residual = { x: 0, z: 0 };
  private readonly bounds: CameraBounds;

  /** Angles are radians; the terrain sampler must return finite heights, including at map edges. */
  constructor(
    readonly camera: PerspectiveCamera,
    private readonly options: CameraOptions,
  ) {
    this.bounds = { ...options.bounds };
    const b = this.bounds;
    if (
      ![b.minX, b.maxX, b.minZ, b.maxZ].every(Number.isFinite) ||
      b.minX >= b.maxX ||
      b.minZ >= b.maxZ
    )
      throw new RangeError('Invalid camera bounds');
    this.current = {
      x: 0,
      z: 0,
      distance: CAMERA.initialDistanceM,
      azimuth: CAMERA.initialAzimuthDegrees * radians,
      elevation: CAMERA.initialElevationDegrees * radians,
      ...options.initial,
    };
    if (!Object.values(this.current).every(Number.isFinite))
      throw new RangeError('Invalid camera state');
    this.limit(this.current);
    this.target = { ...this.current };
    this.flightStart = { ...this.current };
    camera.fov = CAMERA.fovDegrees;
    camera.updateProjectionMatrix();
    this.applyPose();
  }
  private height(x: number, z: number): number {
    const value = this.options.heightAt(
      clamp(x, this.bounds.minX, this.bounds.maxX),
      clamp(z, this.bounds.minZ, this.bounds.maxZ),
    );
    if (!Number.isFinite(value))
      throw new RangeError('Terrain height must be finite');
    return value;
  }
  private maxElevation(distance: number): number {
    const ratio =
      (distance - CAMERA.minDistanceM) /
      (CAMERA.maxDistanceM - CAMERA.minDistanceM);
    return (
      (CAMERA.nearMaxElevationDegrees +
        ratio * (CAMERA.maxElevationDegrees - CAMERA.nearMaxElevationDegrees)) *
      radians
    );
  }
  private limit(state: CameraState): void {
    state.x = clamp(state.x, this.bounds.minX, this.bounds.maxX);
    state.z = clamp(state.z, this.bounds.minZ, this.bounds.maxZ);
    state.distance = clamp(
      state.distance,
      CAMERA.minDistanceM,
      CAMERA.maxDistanceM,
    );
    state.azimuth = wrap(state.azimuth);
    state.elevation = clamp(
      state.elevation,
      CAMERA.minElevationDegrees * radians,
      this.maxElevation(state.distance),
    );
  }
  private applyPose(): void {
    const s = this.current,
      horizontal = s.distance * Math.cos(s.elevation);
    this.focus.set(s.x, this.height(s.x, s.z) + this.focusLift, s.z);
    this.camera.position.set(
      s.x + horizontal * Math.sin(s.azimuth),
      this.focus.y + s.distance * Math.sin(s.elevation),
      s.z + horizontal * Math.cos(s.azimuth),
    );
    this.camera.position.y = Math.max(
      this.camera.position.y,
      this.height(this.camera.position.x, this.camera.position.z) +
        CAMERA.terrainClearanceM,
    );
    this.camera.lookAt(this.focus);
    this.camera.updateMatrixWorld();
  }
  private ray(ndc: Readonly<ScreenAnchor>): void {
    this.direction
      .set(ndc.x, ndc.y, 0.5)
      .unproject(this.camera)
      .sub(this.camera.position)
      .normalize();
  }
  /** Find the first terrain hit under NDC coordinates (x right, y up), writing to out. */
  groundAt(ndc: Readonly<ScreenAnchor>, out: Vector3): boolean {
    if (!Number.isFinite(ndc.x) || !Number.isFinite(ndc.y))
      throw new RangeError('Invalid screen anchor');
    this.ray(ndc);
    if (this.direction.y >= 0) return false;
    let previous = 0;
    for (
      let length: number = CAMERA.rayStepM;
      length <= this.camera.far;
      length += CAMERA.rayStepM
    ) {
      out.copy(this.direction).multiplyScalar(length).add(this.camera.position);
      if (out.y <= this.height(out.x, out.z)) {
        let lo = previous,
          hi = length;
        for (let i = 0; i < CAMERA.rayIterations; i++) {
          const mid = (lo + hi) / 2;
          out
            .copy(this.direction)
            .multiplyScalar(mid)
            .add(this.camera.position);
          if (out.y > this.height(out.x, out.z)) lo = mid;
          else hi = mid;
        }
        out
          .copy(this.direction)
          .multiplyScalar((lo + hi) / 2)
          .add(this.camera.position);
        return true;
      }
      previous = length;
    }
    return false;
  }
  private cancel(): void {
    this.anchored = false;
    if (this.flightTime !== null || this.trackedHeight !== null) {
      this.trackedHeight = null;
      Object.assign(this.target, this.current);
      this.flightTime = null;
    }
  }
  get isTracking(): boolean {
    return this.trackedHeight !== null;
  }
  /** Set a moving rendered pose without restarting a flight or allocating per frame. */
  track(pos: Readonly<Vec2 & { y: number }>): void {
    if (
      !Number.isFinite(pos.x) ||
      !Number.isFinite(pos.y) ||
      !Number.isFinite(pos.z)
    )
      throw new RangeError('Invalid tracking position');
    this.anchored = false;
    this.flightTime = null;
    this.trackedHeight = pos.y;
    this.target.x = pos.x;
    this.target.z = pos.z;
    this.target.distance = CAMERA.followDistanceM;
    this.limit(this.target);
  }
  stopTracking(): void {
    if (this.isTracking) this.cancel();
  }
  /** Pan in world metres; input speed scaling by distance belongs to the input adapter. */
  pan(dx: number, dz: number): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dz))
      throw new RangeError('Invalid pan');
    this.cancel();
    this.target.x += dx;
    this.target.z += dz;
    this.limit(this.target);
  }
  /** Rotate around the focus in radians using the shortest interpolation arc. */
  rotate(delta: number): void {
    if (!Number.isFinite(delta)) throw new RangeError('Invalid rotation');
    this.cancel();
    this.target.azimuth = wrap(this.target.azimuth + delta);
  }
  /** Change elevation in radians, respecting the distance-dependent upper limit. */
  tilt(delta: number): void {
    if (!Number.isFinite(delta)) throw new RangeError('Invalid tilt');
    this.cancel();
    this.target.elevation += delta;
    this.limit(this.target);
  }
  /** Multiply distance; factor < 1 zooms in. Optional anchor is normalized device coordinates. */
  zoom(factor: number, screenAnchor?: Readonly<ScreenAnchor>): void {
    if (!Number.isFinite(factor) || factor <= 0)
      throw new RangeError('Invalid zoom factor');
    this.cancel();
    if (screenAnchor) {
      this.anchored = this.groundAt(screenAnchor, this.anchor);
      this.screenAnchor.x = screenAnchor.x;
      this.screenAnchor.y = screenAnchor.y;
    }
    this.target.distance = clamp(
      this.target.distance * factor,
      CAMERA.minDistanceM,
      CAMERA.maxDistanceM,
    );
    this.limit(this.target);
  }
  /** Reach a clamped ground focus and distance in one second, replacing any active flight. */
  flyTo(pos: Readonly<Vec2>, distance: number): void {
    if (
      !Number.isFinite(pos.x) ||
      !Number.isFinite(pos.z) ||
      !Number.isFinite(distance)
    )
      throw new RangeError('Invalid flight');
    this.cancel();
    Object.assign(this.flightStart, this.current);
    Object.assign(this.target, this.current, { x: pos.x, z: pos.z, distance });
    this.limit(this.target);
    this.flightTime = 0;
  }
  // Solve horizontal focus coordinates so the world anchor stays on the same ray.
  // Finite-difference Newton handles sloped terrain and collision-adjusted camera poses.
  private anchorResidual(): void {
    this.applyPose();
    this.ray(this.screenAnchor);
    const length = (this.anchor.y - this.camera.position.y) / this.direction.y;
    this.residual.x =
      this.camera.position.x + this.direction.x * length - this.anchor.x;
    this.residual.z =
      this.camera.position.z + this.direction.z * length - this.anchor.z;
  }
  private correctAnchor(): void {
    const originalX = this.current.x,
      originalZ = this.current.z;
    for (let i = 0; i < CAMERA.anchorIterations; i++) {
      this.anchorResidual();
      const rx = this.residual.x,
        rz = this.residual.z;
      if (
        !Number.isFinite(rx) ||
        !Number.isFinite(rz) ||
        Math.hypot(rx, rz) < CAMERA.anchorToleranceM
      )
        break;
      const x = this.current.x,
        z = this.current.z,
        step = CAMERA.derivativeStepM;
      this.current.x = x + step;
      this.anchorResidual();
      const a = (this.residual.x - rx) / step,
        c = (this.residual.z - rz) / step;
      this.current.x = x;
      this.current.z = z + step;
      this.anchorResidual();
      const b = (this.residual.x - rx) / step,
        d = (this.residual.z - rz) / step;
      this.current.z = z;
      const determinant = a * d - b * c;
      if (Math.abs(determinant) < CAMERA.derivativeEpsilon) break;
      this.current.x = x - (d * rx - b * rz) / determinant;
      this.current.z = z - (-c * rx + a * rz) / determinant;
      this.limit(this.current);
    }
    this.target.x += this.current.x - originalX;
    this.target.z += this.current.z - originalZ;
    this.limit(this.target);
    this.applyPose();
  }
  /** Advance using elapsed seconds; zero time refreshes terrain clearance without movement. */
  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
      throw new RangeError('Invalid camera time');
    if (this.flightTime !== null) {
      this.flightTime = Math.min(
        CAMERA.flySeconds,
        this.flightTime + deltaSeconds,
      );
      const t = this.flightTime / CAMERA.flySeconds,
        eased = t * t * (3 - 2 * t);
      this.current.x =
        this.flightStart.x + (this.target.x - this.flightStart.x) * eased;
      this.current.z =
        this.flightStart.z + (this.target.z - this.flightStart.z) * eased;
      this.current.distance =
        this.flightStart.distance +
        (this.target.distance - this.flightStart.distance) * eased;
      this.current.elevation =
        this.flightStart.elevation +
        (this.target.elevation - this.flightStart.elevation) * eased;
      if (t === 1) this.flightTime = null;
    } else {
      const alpha =
        1 - Math.pow(1 - CAMERA.damping, deltaSeconds * CAMERA.referenceFps);
      this.current.x += (this.target.x - this.current.x) * alpha;
      this.current.z += (this.target.z - this.current.z) * alpha;
      this.current.distance +=
        (this.target.distance - this.current.distance) * alpha;
      this.current.azimuth +=
        wrap(this.target.azimuth - this.current.azimuth) * alpha;
      this.current.elevation +=
        (this.target.elevation - this.current.elevation) * alpha;
    }
    this.limit(this.current);
    const lift =
      this.trackedHeight === null
        ? 0
        : Math.max(
            0,
            this.trackedHeight - this.height(this.current.x, this.current.z),
          );
    this.focusLift +=
      (lift - this.focusLift) *
      (1 - Math.pow(1 - CAMERA.damping, deltaSeconds * CAMERA.referenceFps));
    this.applyPose();
    if (this.anchored) this.correctAnchor();
  }
  /** Copy the current focus into a reusable vector for lighting. */
  copyFocus(out: Vector3): Vector3 {
    return out.copy(this.focus);
  }
  /** Copy state into caller-owned storage without allocating in the input loop. */
  copyState(out: CameraState): void {
    Object.assign(out, this.current);
  }
  /** Read zoom distance without allocating a snapshot in the render loop. */
  get distance(): number {
    return this.current.distance;
  }
  /** Return a detached snapshot for UI/debug consumers; avoid calling every frame. */
  readState(): CameraState {
    return { ...this.current };
  }
  /** Refresh projection and cancel the old screen anchor after viewport changes. */
  resize(aspect: number): void {
    if (!Number.isFinite(aspect) || aspect <= 0)
      throw new RangeError('Invalid camera aspect');
    this.anchored = false;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
