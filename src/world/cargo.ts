export interface CargoInventory {
  stock: number;
  capacity: number;
  shortage: boolean;
  exportBlocked: boolean;
}
export interface Shipment {
  commodity?: import('../data/policies').IndustrySpecializationId;
  id: number;
  from: number;
  to: number;
  units: number;
  kind: 'local' | 'import' | 'export';
  requestedTick: number;
  retryTick: number;
}
export interface CargoState {
  version: 1;
  lastDay: number;
  delivered: number;
  imported: number;
  exported: number;
  lost: number;
  shipments: Shipment[];
}
export function emptyCargo(): CargoState {
  return {
    version: 1,
    lastDay: -1,
    delivered: 0,
    imported: 0,
    exported: 0,
    lost: 0,
    shipments: [],
  };
}
