import {
  AUDIO,
  SFX,
  AMBIENCE,
  type AudioLevels,
  type AmbienceId,
  type SoundId,
} from '../data/soundConfig';
import { ambientMix, effectForEvent } from './mix';
import type { SimEvent } from '../bridge/protocol';
import type { Building } from '../world/types';
/** Scene audio owns one context, bounded voices and smoothed mixer buses; never writes world state. */
export class AudioManager {
  private context?: AudioContext;
  private master?: GainNode;
  private effects?: GainNode;
  private environment?: GainNode;
  private analyser?: AnalyserNode;
  private samples = new Float32Array(256);
  private buffers = new Map<string, AudioBuffer>();
  private loops = new Map<
    AmbienceId,
    { source: AudioBufferSourceNode; gain: GainNode }
  >();
  private voices = new Set<AudioScheduledSourceNode>();
  private loading?: Promise<void>;
  private closed = false;
  private hidden = false;
  private levels: AudioLevels = {
    volume: AUDIO.volume,
    sfxVolume: AUDIO.sfxVolume,
    ambientVolume: AUDIO.ambientVolume,
  };
  private buildings = new Map<
    number,
    Pick<Building, 'pos' | 'defId' | 'state' | 'residents' | 'workers'>
  >();
  private mix = ambientMix(1500, 0, 0, 0, 0);
  private played: Record<SoundId, number> = {
    click: 0,
    place: 0,
    demolish: 0,
    road: 0,
    milestone: 0,
    error: 0,
  };
  private readonly abort = new AbortController();
  /** Call synchronously inside pointer/key gesture; failed resume remains retryable. */
  async unlock(): Promise<void> {
    if (this.closed || this.hidden) return;
    try {
      if (!this.context) {
        const ctx = (this.context = new AudioContext());
        this.master = ctx.createGain();
        this.effects = ctx.createGain();
        this.environment = ctx.createGain();
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 512;
        this.effects.connect(this.master);
        this.environment.connect(this.master);
        this.master.connect(this.analyser);
        this.analyser.connect(ctx.destination);
        this.applyLevels();
      }
      await this.context.resume();
      // Decode once; OGG preferred, MP3 fallback for Safari or missing decoder support.
      this.loading ??= Promise.all(
        [...SFX, ...AMBIENCE].map(async (id) => {
          for (const ext of ['ogg', 'mp3']) {
            try {
              const response = await fetch(
                `${import.meta.env.BASE_URL}assets/audio/${id}.${ext}`,
                { signal: this.abort.signal },
              );
              if (!response.ok) throw Error('audio');
              const buffer = await this.context!.decodeAudioData(
                await response.arrayBuffer(),
              );
              if (this.closed) return;
              this.buffers.set(id, buffer);
              if ((AMBIENCE as readonly string[]).includes(id))
                this.startLoop(id as AmbienceId);
              return;
            } catch {
              if (this.closed) return;
            }
          }
        }),
      ).then(() => {});
    } catch {
      /* Remain silent and retry on the next gesture. */
    }
  }
  private startLoop(id: AmbienceId) {
    if (!this.context || !this.environment || this.loops.has(id)) return;
    const source = this.context.createBufferSource(),
      gain = this.context.createGain();
    source.buffer = this.buffers.get(id)!;
    source.loop = true;
    gain.gain.value = this.mix[id];
    source.connect(gain);
    gain.connect(this.environment);
    source.start();
    this.loops.set(id, { source, gain });
  }
  setLevels(levels: AudioLevels) {
    this.levels = {
      volume: Math.max(0, Math.min(100, levels.volume)),
      sfxVolume: Math.max(0, Math.min(100, levels.sfxVolume)),
      ambientVolume: Math.max(0, Math.min(100, levels.ambientVolume)),
    };
    this.applyLevels();
  }
  private applyLevels() {
    const now = this.context?.currentTime ?? 0;
    this.master?.gain.setTargetAtTime(
      this.hidden ? 0 : this.levels.volume / 100,
      now,
      0.025,
    );
    this.effects?.gain.setTargetAtTime(this.levels.sfxVolume / 100, now, 0.025);
    this.environment?.gain.setTargetAtTime(
      this.levels.ambientVolume / 100,
      now,
      0.025,
    );
  }
  play(id: SoundId) {
    const ctx = this.context;
    if (
      !ctx ||
      ctx.state !== 'running' ||
      this.hidden ||
      this.closed ||
      !this.effects ||
      this.voices.size >= AUDIO.maxVoices ||
      !this.levels.volume ||
      !this.levels.sfxVolume
    )
      return;
    const buffer = this.buffers.get(id),
      source = buffer ? ctx.createBufferSource() : ctx.createOscillator(),
      gain = ctx.createGain();
    if (source instanceof AudioBufferSourceNode) source.buffer = buffer!;
    else {
      source.frequency.value = id === 'error' ? 150 : 740;
      gain.gain.setValueAtTime(0.16, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    }
    source.connect(gain);
    gain.connect(this.effects);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    this.voices.add(source);
    this.played[id]++;
    source.start();
    if (!buffer) source.stop(ctx.currentTime + 0.09);
  }
  setHidden(hidden: boolean) {
    this.hidden = hidden;
    this.applyLevels();
    if (hidden) {
      for (const voice of this.voices) {
        try {
          voice.stop();
        } catch {
          /* Already stopped. */
        }
      }
      void this.context?.suspend().catch(() => {});
    } else if (this.context) void this.context.resume().catch(() => {});
  }
  accept(e: SimEvent) {
    if (e.t === 'ready') {
      this.buildings.clear();
      for (const b of e.snapshot.buildings)
        this.buildings.set(b.id, {
          pos: b.pos,
          defId: b.defId,
          state: b.state,
          residents: b.residents,
          workers: b.workers,
        });
      return;
    }
    if (e.t === 'buildingsChanged') {
      for (const id of e.removed) this.buildings.delete(id);
      for (const b of e.added)
        this.buildings.set(b.id, {
          pos: b.pos,
          defId: b.defId,
          state: b.state,
          residents: b.residents,
          workers: b.workers,
        });
      for (const p of e.updated) {
        const b = this.buildings.get(p.id);
        if (b) this.buildings.set(p.id, { ...b, ...p });
      }
    }
    const effect = effectForEvent(e);
    if (effect) this.play(effect);
  }
  sampleScene(
    x: number,
    z: number,
    height: number,
    water: number,
    traffic: number,
  ) {
    let industry = 0,
      people = 0;
    for (const b of this.buildings.values()) {
      if (b.state !== 'active') continue;
      const distance = Math.hypot(b.pos.x - x, b.pos.z - z);
      if (distance > AUDIO.zoneRadius) continue;
      const proximity = 1 - distance / AUDIO.zoneRadius;
      if (
        b.defId === 'I' ||
        b.defId.startsWith('power_coal') ||
        b.defId.startsWith('garbage_')
      )
        industry = Math.max(industry, proximity);
      if (b.residents + b.workers > 0) people = Math.max(people, proximity);
    }
    this.mix = ambientMix(height, industry, people, water, traffic);
    for (const [id, loop] of this.loops)
      loop.gain.gain.setTargetAtTime(
        this.mix[id],
        this.context!.currentTime,
        AUDIO.fadeSeconds,
      );
  }
  readStats() {
    let peak = 0;
    if (this.analyser) {
      this.analyser.getFloatTimeDomainData(this.samples);
      for (const sample of this.samples)
        peak = Math.max(peak, Math.abs(sample));
    }
    return {
      state: this.context?.state ?? 'locked',
      hidden: this.hidden,
      loaded: this.buffers.size,
      voices: this.voices.size,
      loops: this.loops.size,
      mix: { ...this.mix },
      levels: { ...this.levels },
      played: { ...this.played },
      peak,
    };
  }
  dispose() {
    this.closed = true;
    this.abort.abort();
    for (const voice of this.voices) {
      try {
        voice.stop();
      } catch {
        /* Already stopped. */
      }
    }
    for (const loop of this.loops.values()) {
      loop.source.stop();
      loop.source.disconnect();
      loop.gain.disconnect();
    }
    this.voices.clear();
    this.loops.clear();
    this.buffers.clear();
    this.buildings.clear();
    void this.context?.close().catch(() => {});
  }
}
export const cityAudio = new AudioManager();
