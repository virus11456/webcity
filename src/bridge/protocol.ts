import type { ConstructionReason } from '../world/roadConstruction';
import type { BuildingDefId } from '../data/buildings';
import type { SimSpeed } from '../data/config';
import type { BudgetDepartment } from '../data/economy';
import type { PolicyId } from '../data/policies';
import type { RoadTypeId } from '../data/roads';
import type {
  Building,
  CityStats,
  Id,
  RoadNode,
  RoadSegment,
  Vec2,
  ZoneBlock,
  ZoneType,
} from '../world/types';
import type {
  BuildingPatch,
  CitySettings,
  FieldName,
  InspectInfo,
  NetworkKind,
  NetworkSegment,
  RoadDraft,
  SimClock,
  WorldSnapshot,
} from '../world/snapshot';

export type CommandInput =
  | ({ t: 'init' } & CitySettings)
  | { t: 'load'; data: ArrayBuffer }
  | { t: 'save' }
  | { t: 'setSpeed'; speed: SimSpeed }
  | { t: 'buildRoad'; type: RoadTypeId; points: RoadDraft }
  | { t: 'upgradeRoad'; segment: Id; type: RoadTypeId }
  | { t: 'zone'; cells: [Id, number][]; zone: ZoneType | null }
  | { t: 'place'; defId: BuildingDefId; pos: Vec2; rotation: number }
  | { t: 'buildNetwork'; net: NetworkKind; points: Vec2[] }
  | {
      t: 'bulldoze';
      target: { kind: 'segment' | 'building' | 'network'; id: Id };
    }
  | { t: 'undo' }
  | { t: 'setTax'; zone: ZoneType; rate: number }
  | { t: 'setBudget'; dept: BudgetDepartment; value: number }
  | { t: 'takeLoan'; bank: number }
  | { t: 'repayLoan'; index: number }
  | { t: 'buyTile'; tx: number; tz: number }
  | { t: 'setPolicy'; policy: PolicyId; district: Id | null; on: boolean }
  | { t: 'inspect'; target: { kind: string; id: Id } };
export type Command = CommandInput & { reqId: number };
export type FailureReason =
  ConstructionReason | 'err.notReady' | 'err.notImplemented';
export type Result = {
  t: 'result';
  reqId: number;
  ok: boolean;
  reason?: FailureReason;
  cost?: number;
};
export type Response =
  | Result
  | { t: 'ready'; reqId: number; snapshot: WorldSnapshot }
  | { t: 'saved'; reqId: number; data: ArrayBuffer }
  | { t: 'inspectResult'; reqId: number; info: InspectInfo };
export type SimEvent =
  | Response
  | { t: 'clock'; clock: SimClock }
  | { t: 'fundsChanged'; money: number }
  | {
      t: 'roadsChanged';
      added: RoadSegment[];
      removed: Id[];
      nodes: RoadNode[];
      removedNodes: Id[];
    }
  | { t: 'zonesChanged'; blocks: ZoneBlock[]; removed: Id[] }
  | {
      t: 'buildingsChanged';
      added: Building[];
      updated: BuildingPatch[];
      removed: Id[];
    }
  | {
      t: 'networksChanged';
      net: NetworkKind;
      added: NetworkSegment[];
      removed: Id[];
    }
  | { t: 'stats'; stats: CityStats }
  | { t: 'fields'; which: FieldName; data: Float32Array }
  | { t: 'vehicles'; data: Float32Array; count: number }
  | {
      t: 'notify';
      kind: 'info' | 'warning' | 'danger';
      pos?: Vec2;
      params?: Record<string, unknown>;
    }
  | { t: 'milestone'; index: number }
  | { t: 'error'; message: string };
