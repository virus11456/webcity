export interface BuildingFire {
  burning: boolean;
  damage: number;
  startedDay: number;
}
export interface FireMission {
  id: number;
  from: number;
  to: number;
  requestedTick: number;
  retryTick: number;
}
export interface FireState {
  version: 1;
  lastDay: number;
  missions: FireMission[];
}
export const emptyFire = (): FireState => ({
  version: 1,
  lastDay: -1,
  missions: [],
});
