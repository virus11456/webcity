export const NOTIFICATIONS = {
  maxVisible: 3,
  visibleMs: 5000,
  cooldownMs: 60000,
  pollMs: 250,
  abandonedMinimum: 5,
  abandonedFraction: 0.2,
  focusDistanceM: 160,
} as const;
export const NOTICE_CODES = [
  'noPower',
  'noWater',
  'garbage',
  'fire',
  'abandoned',
  'finance',
  'milestone',
  'qualityLow',
  'qualityMedium',
] as const;
export type NoticeCode = (typeof NOTICE_CODES)[number];
