/** Goods are abstract units, updated on the existing fiscal-day clock. */
export const CARGO = {
  productionPerWorkerDay: 0.5,
  consumptionPerJobDay: 0.25,
  storageDays: 30,
  initialCommercialDays: 8,
  minimumCapacity: 120,
  truckCapacity: 120,
  minimumShipment: 10,
  reserveCommercialDays: 12,
  requestsPerTick: 8,
  retryTicks: 20,
  boundaryToleranceM: 1,
  maxShipments: 300,
} as const;
