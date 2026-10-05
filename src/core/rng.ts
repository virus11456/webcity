const UINT32_RANGE = 0x1_0000_0000;

/** Deterministic mulberry32 stream; seeds wrap to unsigned 32-bit integers. */
export class Rng {
  private state: number;

  /** Create an independent stream from a finite integer seed. */
  constructor(seed: number) {
    if (!Number.isSafeInteger(seed))
      throw new RangeError('Seed must be a safe integer');
    this.state = seed >>> 0;
  }

  /** Return a reproducible float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
  }

  /** Return a float in [min, max); equal bounds return that bound. */
  float(min = 0, max = 1): number {
    if (
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      !Number.isFinite(max - min) ||
      max < min
    )
      throw new RangeError('Invalid float interval');
    const value = min + (max - min) * this.next();
    // Rounding may reach max for adjacent representable bounds. Keep it exclusive.
    return value === max && min !== max ? min : value;
  }

  /** Return an unbiased integer in inclusive [min, max], at most 2^32 values. */
  int(min: number, max: number): number {
    const span = max - min + 1;
    if (
      !Number.isSafeInteger(min) ||
      !Number.isSafeInteger(max) ||
      span < 1 ||
      span > UINT32_RANGE
    )
      throw new RangeError('Invalid integer interval');
    // Reject the incomplete final bin instead of biasing small values with modulo.
    const limit = UINT32_RANGE - (UINT32_RANGE % span);
    let value: number;
    do {
      value = this.next() * UINT32_RANGE;
    } while (value >= limit);
    return min + (value % span);
  }

  /** Pick an item; an empty collection is an error. */
  pick<T>(values: readonly T[]): T {
    if (values.length === 0)
      throw new RangeError('Cannot pick from an empty array');
    return values[this.int(0, values.length - 1)]!;
  }

  /** Return a Fisher–Yates permutation without modifying the input. */
  shuffle<T>(values: readonly T[]): T[] {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [result[i], result[j]] = [result[j]!, result[i]!];
    }
    return result;
  }
}
