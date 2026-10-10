import { Rng } from '../core/rng';
/** Shuffle without repeats inside a cycle or at cycle boundaries. */
export class Playlist {
  private remaining: string[] = [];
  private previous?: string;
  private readonly rng: Rng;
  constructor(
    private readonly tracks: readonly string[],
    seed: number,
  ) {
    if (!tracks.length || new Set(tracks).size !== tracks.length)
      throw new RangeError('Playlist must contain distinct tracks');
    this.rng = new Rng(seed);
  }
  next(): string {
    if (!this.remaining.length) {
      this.remaining = this.rng.shuffle(this.tracks);
      const last = this.remaining.length - 1;
      if (last > 0 && this.remaining[last] === this.previous)
        [this.remaining[0], this.remaining[last]] = [
          this.remaining[last]!,
          this.remaining[0]!,
        ];
    }
    return (this.previous = this.remaining.pop()!);
  }
}
