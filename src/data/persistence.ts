/** Versioned local persistence limits; autosave cadence is wall-clock time. */
export const SAVE = {
  version: 1,
  fileTimeoutMs: 30000,
  slots: 10,
  autoId: 'auto',
  intervalMs: 5 * 60 * 1000,
  maxBytes: 64 * 1024 * 1024,
  thumbnailWidth: 240,
  thumbnailHeight: 135,
  thumbnailQuality: 0.65,
} as const;
