import { AUDIO, MUSIC_TRACKS, type AudioLevels } from '../data/soundConfig';
import { cityAudio } from './manager';
import { Playlist } from './playlist';
/** A single streaming media element; no full-track downloads or decoded AudioBuffers. */
export class MusicPlayer {
  private element?: HTMLAudioElement;
  private playlist?: Playlist;
  private track?: string;
  private hidden = false;
  private enabled = true;
  private closed = false;
  private failures = 0;
  private started = false;
  private next = () => {
    if (
      !this.element ||
      !this.playlist ||
      this.closed ||
      navigator.onLine === false
    )
      return;
    this.track = this.playlist.next();
    this.element.src = `${import.meta.env.BASE_URL}assets/audio/music/${this.track}.m4a`;
    this.resume();
  };
  private error = () => {
    // Streaming music is intentionally not precached. Keep the current track
    // during an outage instead of exhausting the playlist with failed requests.
    if (this.closed || navigator.onLine === false) return;
    if (++this.failures < MUSIC_TRACKS.length) this.next();
  };
  private playing = () => {
    this.failures = 0;
  };
  /** Must run in the same gesture as AudioContext creation, before any await. */
  unlock() {
    if (this.closed || this.hidden || navigator.onLine === false) return;
    if (!this.element) {
      this.element = document.createElement('audio');
      this.element.preload = 'none';
      this.element.hidden = true;
      this.element.dataset.webcityMusic = '';
      document.body.append(this.element);
      this.playlist = new Playlist(
        MUSIC_TRACKS,
        crypto.getRandomValues(new Uint32Array(1))[0]!,
      );
      this.element.addEventListener('ended', this.next);
      this.element.addEventListener('error', this.error);
      this.element.addEventListener('playing', this.playing);
    }
    if (!cityAudio.connectMusic(this.element)) return;
    this.started = true;
    if (!this.track || this.failures >= MUSIC_TRACKS.length) {
      this.failures = 0;
      this.next();
    } else this.resume();
  }
  private resume() {
    if (
      this.element &&
      this.started &&
      this.enabled &&
      !this.hidden &&
      !this.closed &&
      navigator.onLine !== false
    ) {
      // A media element with a network error needs a fresh load after reconnect.
      if (this.element.error) this.element.load();
      void this.element.play().catch(() => {
        /* Retry on next gesture; no autoplay error loop. */
      });
    }
  }
  setLevels(levels: Pick<AudioLevels, 'volume' | 'musicVolume'>) {
    this.enabled =
      levels.volume > 0 && (levels.musicVolume ?? AUDIO.musicVolume) > 0;
    if (this.enabled) this.resume();
    else this.element?.pause();
  }
  setHidden(hidden: boolean) {
    this.hidden = hidden;
    if (hidden) this.element?.pause();
    else this.resume();
  }
  readStats() {
    return {
      track: this.track ?? null,
      paused: this.element?.paused ?? true,
      time: this.element?.currentTime ?? 0,
      duration: this.element?.duration ?? 0,
      failures: this.failures,
      hidden: this.hidden,
    };
  }
  dispose() {
    this.closed = true;
    const audio = this.element;
    if (!audio) return;
    audio.removeEventListener('ended', this.next);
    audio.removeEventListener('error', this.error);
    audio.removeEventListener('playing', this.playing);
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    audio.remove();
  }
}
export const cityMusic = new MusicPlayer();
