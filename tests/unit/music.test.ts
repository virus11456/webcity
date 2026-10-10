import { expect, test } from 'vitest';
import { Playlist } from '../../src/audio/playlist';
import { MUSIC_TRACKS } from '../../src/data/soundConfig';
test('all six tracks play once per cycle, with no adjacent cycle repeats', () => {
  for (let seed = 0; seed < 100; seed++) {
    const player = new Playlist(MUSIC_TRACKS, seed);
    let previous = '';
    for (let cycle = 0; cycle < 10; cycle++) {
      const tracks = MUSIC_TRACKS.map(() => player.next());
      expect(new Set(tracks)).toEqual(new Set(MUSIC_TRACKS));
      expect(tracks[0]).not.toBe(previous);
      previous = tracks.at(-1)!;
    }
  }
});
test('one track repeats, invalid playlists fail clearly', () => {
  const player = new Playlist(['only'], 1);
  expect([player.next(), player.next()]).toEqual(['only', 'only']);
  expect(() => new Playlist([], 1)).toThrow();
  expect(() => new Playlist(['same', 'same'], 1)).toThrow();
});
