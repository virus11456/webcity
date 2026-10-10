export const AUDIO = {
  volume: 60,
  sfxVolume: 70,
  ambientVolume: 45,
  maxVoices: 16,
  sampleSeconds: 0.5,
  nearHeight: 80,
  farHeight: 1000,
  zoneRadius: 220,
  fadeSeconds: 0.3,
  shorelineHeight: 4,
  retrySeconds: 5,
} as const;
export const SFX = [
  'click',
  'place',
  'demolish',
  'road',
  'milestone',
  'error',
] as const;
export const AMBIENCE = [
  'wind',
  'traffic',
  'birds',
  'voices',
  'industry',
  'water',
] as const;
export type SoundId = (typeof SFX)[number];
export type AmbienceId = (typeof AMBIENCE)[number];
export interface AudioLevels {
  volume: number;
  sfxVolume: number;
  ambientVolume: number;
}
