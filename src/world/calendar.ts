import { TIME } from '../data/config';

const millisecondsPerDay = 24 * 60 * 60 * 1000;
const epoch = Date.parse(`${TIME.startDate}T00:00:00Z`);

/** ISO calendar date from completed game days, independent of local timezone / DST. */
export function dateForDay(day: number): string {
  if (!Number.isSafeInteger(day) || day < 0)
    throw new RangeError('Invalid game day');
  return new Date(epoch + day * millisecondsPerDay).toISOString().slice(0, 10);
}
