export const GARBAGE = {
  ids: ['garbage_landfill', 'garbage_incinerator', 'garbage_recycling'],
  truckCapacity: 100,
  minimumPickup: 1,
  bufferDays: 2,
  requestsPerTick: 4,
  retryTicks: 20,
  maxMissions: 300,
  purpose: 9,
} as const;
