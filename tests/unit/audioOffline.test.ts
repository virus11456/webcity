import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioManager } from '../../src/audio/manager';

function node() {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: { setTargetAtTime: vi.fn() },
    getFloatTimeDomainData: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}
class ContextStub {
  currentTime = 0;
  destination = {};
  state = 'running';
  createGain = node;
  createAnalyser = node;
  createBufferSource = node;
  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);
  decodeAudioData = vi.fn().mockResolvedValue({});
}

describe('offline effects and ambience', () => {
  let manager: AudioManager;
  let network: { onLine: boolean };
  const fetchAudio = vi.fn();
  const match = vi.fn();
  beforeEach(() => {
    fetchAudio
      .mockReset()
      .mockImplementation(async () => new Response('audio'));
    match.mockReset().mockResolvedValue(undefined);
    network = { onLine: false };
    vi.stubGlobal('navigator', network);
    vi.stubGlobal('fetch', fetchAudio);
    vi.stubGlobal('caches', { match });
    vi.stubGlobal('AudioContext', ContextStub);
    manager = new AudioManager();
  });
  afterEach(() => {
    manager.dispose();
    vi.unstubAllGlobals();
  });

  it('loads cached effects without a network request, including MP3 fallback', async () => {
    match.mockImplementation(async (url: string) =>
      url.endsWith('.mp3') ? new Response('audio') : undefined,
    );
    await manager.unlock();
    await vi.waitFor(() => expect(manager.readStats().loaded).toBe(12));
    expect(manager.readStats().loops).toBe(6);
    expect(fetchAudio).not.toHaveBeenCalled();
    const lookups = match.mock.calls.length;
    await manager.unlock();
    expect(match).toHaveBeenCalledTimes(lookups);
    expect(manager.readStats().loops).toBe(6);
  });

  it.each(['missing', 'unavailable', 'denied'])(
    'recovers from %s offline storage on an online gesture',
    async (storage) => {
      if (storage === 'unavailable') vi.stubGlobal('caches', undefined);
      if (storage === 'denied') match.mockRejectedValue(new Error('denied'));
      await manager.unlock();
      // Let both format attempts settle before the next user gesture.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(manager.readStats().loaded).toBe(0);
      expect(fetchAudio).not.toHaveBeenCalled();
      network.onLine = true;
      await manager.unlock();
      await vi.waitFor(() => expect(manager.readStats().loaded).toBe(12));
      expect(fetchAudio).toHaveBeenCalledTimes(12);
      await manager.unlock();
      expect(fetchAudio).toHaveBeenCalledTimes(12);
    },
  );
});
