import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MusicPlayer } from '../../src/audio/music';
import { MUSIC_TRACKS } from '../../src/data/soundConfig';

vi.mock('../../src/audio/manager', () => ({
  cityAudio: { connectMusic: () => true },
}));

class MediaStub extends EventTarget {
  src = '';
  preload = '';
  hidden = false;
  dataset = {};
  error: { code: number } | null = null;
  paused = true;
  currentTime = 0;
  duration = 192;
  play = vi.fn(async () => {
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  load = vi.fn(() => {
    this.error = null;
  });
  remove = vi.fn();
  removeAttribute = vi.fn();
}

describe('music during network outages', () => {
  let audio: MediaStub;
  let player: MusicPlayer;
  let network: { onLine: boolean };
  beforeEach(() => {
    network = { onLine: true };
    audio = new MediaStub();
    vi.stubGlobal('navigator', network);
    vi.stubGlobal('document', {
      createElement: vi.fn(() => audio),
      body: { append: vi.fn() },
    });
    player = new MusicPlayer();
  });
  afterEach(() => {
    player.dispose();
    vi.unstubAllGlobals();
  });

  it('stays silent across offline gestures, then starts on the next online gesture', () => {
    network.onLine = false;
    player.unlock();
    player.unlock();
    player.setLevels({ volume: 60, musicVolume: 100 });
    player.setHidden(false);
    expect(globalThis.document.createElement).not.toHaveBeenCalled();
    expect(audio.play).not.toHaveBeenCalled();
    expect(player.readStats()).toMatchObject({ track: null, failures: 0 });
    network.onLine = true;
    player.unlock();
    expect(audio.play).toHaveBeenCalledOnce();
    expect(player.readStats().track).not.toBeNull();
  });

  it('keeps a failed track through an outage and reloads it after reconnect', () => {
    player.unlock();
    const track = player.readStats().track;
    network.onLine = false;
    audio.error = { code: 2 };
    audio.dispatchEvent(new Event('error'));
    audio.dispatchEvent(new Event('ended'));
    player.unlock();
    player.setHidden(false);
    expect(player.readStats()).toMatchObject({ track, failures: 0 });
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.load).not.toHaveBeenCalled();
    network.onLine = true;
    player.unlock();
    expect(audio.load).toHaveBeenCalledOnce();
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(player.readStats().track).toBe(track);
  });

  it('bounds retries when online status cannot detect the outage', () => {
    player.unlock();
    for (let i = 0; i < MUSIC_TRACKS.length; i++)
      audio.dispatchEvent(new Event('error'));
    expect(audio.play).toHaveBeenCalledTimes(MUSIC_TRACKS.length);
    expect(player.readStats().failures).toBe(MUSIC_TRACKS.length);
    player.unlock();
    expect(audio.play).toHaveBeenCalledTimes(MUSIC_TRACKS.length + 1);
    expect(player.readStats().failures).toBe(0);
  });

  it('does not resume after reconnect while muted, hidden or disposed', () => {
    player.unlock();
    network.onLine = false;
    player.setLevels({ volume: 0, musicVolume: 100 });
    network.onLine = true;
    player.unlock();
    expect(audio.paused).toBe(true);
    player.setHidden(true);
    player.setLevels({ volume: 60, musicVolume: 100 });
    player.unlock();
    expect(audio.play).toHaveBeenCalledTimes(1);
    player.dispose();
    player.setHidden(false);
    player.unlock();
    audio.dispatchEvent(new Event('error'));
    expect(audio.play).toHaveBeenCalledTimes(1);
  });
});
