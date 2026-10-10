/** Transport / scheduler limits; game time ratios live in config.TIME. */
export const SIM_RUNTIME = {
  pulseMs: 20,
  maxElapsedMs: 250,
  requestTimeoutMs: 15000,
  maxCityNameLength: 64,
  initialSpeed: 1,
  defaultBudget: 1,
} as const;
