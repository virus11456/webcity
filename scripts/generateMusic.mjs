/** Six original synthesized arrangements; no external melody, samples or recordings. */
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg',
  rate = 22050,
  seconds = 192;
const tracks = [
  ['river-morning', 60, 96],
  ['little-avenue', 65, 104],
  ['sunlit-roofs', 67, 112],
  ['garden-walk', 62, 90],
  ['blue-hour', 57, 88],
  ['city-lights', 64, 108],
];
mkdirSync('public/assets/audio/music', { recursive: true });
const temp = mkdtempSync(join(tmpdir(), 'webcity-music-'));
try {
  for (let track = 0; track < tracks.length; track++) {
    const [id, tonic, bpm] = tracks[track],
      count = rate * seconds,
      left = new Float32Array(count),
      right = new Float32Array(count),
      beat = 60 / bpm;
    let state = 11456 + track * 7919;
    const rng = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const note = (midi, start, duration, amplitude, kind, pan) => {
      const f = 440 * 2 ** ((midi - 69) / 12),
        first = Math.floor(start * rate),
        end = Math.min(count, first + Math.floor(duration * rate));
      for (let i = first; i < end; i++) {
        const t = (i - first) / rate,
          phase = 2 * Math.PI * f * t;
        let value;
        if (kind === 'pad')
          value =
            (Math.sin(phase + 0.015 * Math.sin(t * 5)) +
              0.2 * Math.sin(phase * 2)) *
            0.55 *
            Math.min(1, t / 0.4, (duration - t) / 0.5);
        else
          value =
            (Math.sin(phase) +
              0.25 * Math.sin(phase * 2) +
              0.1 * Math.sin(phase * 3)) *
            Math.exp(-t * (kind === 'pluck' ? 5 : 2.7)) *
            Math.min(1, t / 0.006) *
            Math.min(1, (duration - t) / 0.04);
        value *= amplitude;
        left[i] += value * Math.sqrt((1 - pan) / 2);
        right[i] += value * Math.sqrt((1 + pan) / 2);
      }
    };
    const progression = [0, 5, 9, 7, 0, 9, 5, 7],
      scale = [0, 2, 4, 7, 9, 12, 14];
    for (let bar = 0; bar * beat * 4 < seconds; bar++) {
      const start = bar * beat * 4,
        root = tonic + progression[(bar + track) % progression.length],
        section = Math.floor(start / 48),
        intro = start < 12;
      for (const interval of [0, 4, 7])
        note(
          root + interval,
          start,
          beat * 4,
          0.047,
          'pad',
          interval === 0 ? -0.45 : 0.45,
        );
      note(root - 24, start, beat * 1.8, 0.13, 'piano', 0);
      if (!intro)
        note(root - 17, start + beat * 2, beat * 1.8, 0.08, 'piano', 0);
      for (let step = 0; step < 8; step++) {
        const harmony = [0, 7, 12, 4, 7, 12, 16, 7][(step + track) % 8];
        note(
          root + harmony,
          start + (step * beat) / 2,
          beat * 0.9,
          0.075,
          'pluck',
          Math.sin(step) * 0.5,
        );
        if (!intro && step % 2 === 0 && rng() > 0.2) {
          const melody =
            tonic +
            12 +
            scale[((bar % 4) + step + section * 2 + track) % scale.length];
          note(
            melody,
            start + (step * beat) / 2,
            beat * 1.4,
            0.095,
            'piano',
            -0.15,
          );
        }
      }
      if (!intro && section !== 2) {
        for (let step = 0; step < 4; step++)
          for (let i = 0; i < rate * 0.15; i++) {
            const at = Math.floor((start + step * beat) * rate) + i;
            if (at >= count) break;
            const t = i / rate,
              drum =
                step % 2 === 0
                  ? Math.sin(2 * Math.PI * (70 * t - 100 * t * t)) *
                    Math.exp(-t * 35) *
                    0.11
                  : (rng() * 2 - 1) * Math.exp(-t * 60) * 0.025;
            left[at] += drum;
            right[at] += drum;
          }
      }
    }
    let peak = 0;
    for (let i = 0; i < count; i++)
      peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
    const pcm = Buffer.alloc(count * 4),
      normal = 0.75 / Math.max(0.75, peak);
    for (let i = 0; i < count; i++) {
      const fade =
        Math.min(1, i / (rate * 3), (count - i) / (rate * 6)) * normal;
      pcm.writeInt16LE(Math.round(left[i] * fade * 32767), i * 4);
      pcm.writeInt16LE(Math.round(right[i] * fade * 32767), i * 4 + 2);
    }
    const wav = Buffer.alloc(44);
    wav.write('RIFF');
    wav.writeUInt32LE(pcm.length + 36, 4);
    wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(2, 22);
    wav.writeUInt32LE(rate, 24);
    wav.writeUInt32LE(rate * 4, 28);
    wav.writeUInt16LE(4, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(pcm.length, 40);
    const path = join(temp, 'track.wav');
    writeFileSync(path, Buffer.concat([wav, pcm]));
    execFileSync(ffmpeg, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      path,
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-ar',
      '44100',
      '-movflags',
      '+faststart',
      `public/assets/audio/music/${id}.m4a`,
    ]);
    console.log(`${id}: ${seconds}s, AAC 128kbps, original arrangement`);
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
