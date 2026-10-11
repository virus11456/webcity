export interface TimingSummary {
  count: number;
  meanMs: number;
  p95Ms: number;
  maxMs: number;
}
/** Fixed memory ring: recording does not allocate; sorting only happens on inspection. */
export class TimingWindow {
  private readonly values: Float64Array;
  private readonly sorted: Float64Array;
  private cursor = 0;
  private count = 0;
  constructor(capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity < 1)
      throw new RangeError('Invalid timing capacity');
    this.values = new Float64Array(capacity);
    this.sorted = new Float64Array(capacity);
  }
  record(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.values[this.cursor] = ms;
    this.cursor = (this.cursor + 1) % this.values.length;
    this.count = Math.min(this.count + 1, this.values.length);
  }
  read(): TimingSummary {
    if (!this.count) return { count: 0, meanMs: 0, p95Ms: 0, maxMs: 0 };
    this.sorted.fill(Infinity);
    let total = 0;
    for (let i = 0; i < this.count; i++) {
      this.sorted[i] = this.values[i]!;
      total += this.values[i]!;
    }
    this.sorted.sort();
    return {
      count: this.count,
      meanMs: total / this.count,
      p95Ms: this.sorted[Math.ceil(this.count * 0.95) - 1]!,
      maxMs: this.sorted[this.count - 1]!,
    };
  }
}
