import type { PowerReason } from '../world/power';
import type { BulldozeReason, BulldozeTarget } from '../world/bulldoze';
import type { ZoningReason } from '../world/zoning';
import type { TerrainPatch } from '../world/roadBed';
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
  FinanceView,
} from '../world/snapshot';

export type CommandInput =
  | { t: 'tutorial'; action: import('../data/tutorial').TutorialAction }
  | { t: 'setDisasters'; enabled: boolean }
  | { t: 'rebuild'; id: number }
  | ({ t: 'district' } & import('../world/districts').DistrictAction)
  | ({ t: 'init'; tileLimit?: 4 | 9 } & CitySettings)
  | { t: 'load'; data: ArrayBuffer; tileLimit?: 4 | 9 }
  | { t: 'save' }
  | {
      t: 'createBusLine';
      stops: Vec2[];
      mode?: 'metro' | 'tram';
      preview?: boolean;
    }
  | { t: 'setBusVehicles'; id: number; vehicles: number }
  | { t: 'deleteBusLine'; id: number }
  | { t: 'setSpeed'; speed: SimSpeed }
  | { t: 'buildRoad'; type: RoadTypeId; points: RoadDraft }
  | { t: 'upgradeRoad'; segment: Id; type: RoadTypeId }
  | {
      t: 'setIntersection';
      node: Id;
      control: RoadNode['control'];
      banLeft: boolean;
    }
  | { t: 'zone'; cells: [Id, number][]; zone: ZoneType | null }
  | { t: 'plantTrees'; points: Vec2[] }
  | { t: 'place'; defId: BuildingDefId; pos: Vec2; rotation: number }
  | { t: 'setBuildingEnabled'; id: Id; enabled: boolean }
  | { t: 'buildRoadPipes' }
  | { t: 'buildNetwork'; net: NetworkKind; points: Vec2[] }
  | {
      t: 'bulldoze';
      target: BulldozeTarget;
    }
  | { t: 'bulldoze'; targets: BulldozeTarget[] }
  | { t: 'terraform'; draft: import('../world/terraform').TerraformDraft }
  | { t: 'undo' }
  | { t: 'setTax'; zone: ZoneType; rate: number }
  | { t: 'setBudget'; dept: BudgetDepartment; value: number }
  | { t: 'takeLoan'; bank: number }
  | { t: 'repayLoan'; index: number }
  | { t: 'buyTile'; tx: number; tz: number }
  | {
      t: 'setPolicy';
      policy: PolicyId;
      district: Id | null;
      on: boolean | null;
    }
  | { t: 'inspect'; target: { kind: string; id: Id } };
export type Command = CommandInput & { reqId: number };
export type FailureReason =
  | 'err.undoEmpty'
  | 'err.undoConflict'
  | import('../world/tiles').TileReason
  | import('../world/terraform').TerraformReason
  | PowerReason
  | ConstructionReason
  | ZoningReason
  | BulldozeReason
  | 'err.districtName'
  | 'err.districtLimit'
  | 'err.tramRoute'
  | 'err.metroStations'
  | 'err.busDepot'
  | 'err.busRoute'
  | 'err.busCapacity'
  | 'err.gameOver'
  | 'err.loanLimit'
  | 'err.locked'
  | 'err.notReady'
  | 'err.notImplemented';
export type Result = {
  t: 'result';
  reqId: number;
  ok: boolean;
  reason?: FailureReason;
  cost?: number;
  refund?: number;
};
export type Response =
  | Result
  | { t: 'ready'; reqId: number; snapshot: WorldSnapshot }
  | {
      t: 'saved';
      reqId: number;
      data: ArrayBuffer;
      metadata: { settings: CitySettings; population: number; day: number };
    }
  | { t: 'inspectResult'; reqId: number; info: InspectInfo };
export type SimEvent =
  | { t: 'tutorial'; state: import('../world/tutorial').TutorialState }
  | { t: 'undoState'; view: import('../world/constructionUndo').UndoView }
  | { t: 'disasters'; state: import('../world/disasters').DisasterState }
  | { t: 'policies'; policies: import('../data/policies').PolicyId[] }
  | { t: 'districts'; districts: import('../world/districts').DistrictView[] }
  | { t: 'transit'; lines: import('../world/transit').BusLineView[] }
  | Response
  | { t: 'clock'; clock: SimClock }
  | { t: 'fundsChanged'; money: number }
  | { t: 'economy'; finance: FinanceView }
  | {
      t: 'roadsChanged';
      terrain?: TerrainPatch & { revision: number };
      added: RoadSegment[];
      removed: Id[];
      nodes: RoadNode[];
      removedNodes: Id[];
    }
  | {
      t: 'zonesChanged';
      blocks: ZoneBlock[];
      removed: Id[];
      occupancyOnly?: boolean;
    }
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
  | { t: 'stats'; stats: CityStats; transient?: boolean }
  | { t: 'fields'; which: FieldName; data: Float32Array }
  | { t: 'roadTraffic'; roads: import('../world/roadTraffic').RoadTraffic[] }
  | {
      t: 'vehicles';
      data: Float32Array;
      count: number;
      tick?: number;
      speed?: SimSpeed;
    }
  | {
      t: 'notify';
      kind: 'info' | 'warning' | 'danger';
      pos?: Vec2;
      params?: Record<string, unknown>;
    }
  | { t: 'tilesChanged'; ownedTiles: number[] }
  | { t: 'milestone'; index: number }
  | { t: 'error'; message: string };
