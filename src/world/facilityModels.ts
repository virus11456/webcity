import { BUILDINGS, type BuildingDefinition } from '../data/buildings';
import {
  LANDMARK_MODELS,
  FACILITY_MODEL_RULES as R,
} from '../data/facilityModels';
export interface FacilityModel {
  id: string;
  defId: string;
  w: number;
  d: number;
  definition?: BuildingDefinition;
  landmark?: number;
}
export const facilityModels: readonly FacilityModel[] = [
  ...BUILDINGS.map((definition) => {
    const [w, d] =
      definition.footprintCells ??
      (definition.id === 'power_hydro' ? R.hydroLot : R.defaultLot);
    return {
      id: `svc_${definition.id}`,
      defId: definition.id,
      w,
      d,
      definition,
      landmark:
        definition.kind === 'unique'
          ? LANDMARK_MODELS.findIndex((id) => `unique_${id}` === definition.id)
          : undefined,
    };
  }),
];
export const facilityModel = (id: string) =>
  facilityModels.find((m) => m.defId === id);
