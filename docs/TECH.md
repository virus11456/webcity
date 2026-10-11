# WebCity 技術架構書（Architecture）

> 所有實作都必須遵守這份架構。若需要偏離（例如加入新套件、改變模組邊界），請在 PR 說明中寫明理由，並同步更新本文件。

---

## 1. 技術棧

| 類別 | 選擇 | 版本策略 |
|---|---|---|
| 語言 | TypeScript（`strict: true`） | 建置時用最新穩定版，`package.json` 鎖定版本 |
| 建置 | Vite | 同上 |
| 3D | Three.js（WebGL2）＋ `three/examples/jsm`（後製、載入器） | 同上 |
| UI | Preact + `@preact/signals` | 輕量（約 5 KB），元件化方便多人 / 多 AI 協作 |
| 樣式 | 原生 CSS + CSS 變數（`src/ui/styles/tokens.css`），不使用 CSS 框架 | |
| 雜訊 | `simplex-noise` | |
| 序列化 | `@msgpack/msgpack` + 瀏覽器內建 `CompressionStream('gzip')` | |
| 儲存 | IndexedDB（用 `idb` 小型封裝） | |
| PWA | `vite-plugin-pwa`（Workbox `generateSW`） | 若與當下 Vite 版本不相容，改手寫 Service Worker（見 §11） |
| 測試 | Vitest（單元）、Playwright（E2E，3 種 viewport） | |
| 程式風格 | ESLint（typescript-eslint）+ Prettier | |
| CI | GitHub Actions | |
| 部署 | Vercel（使用者指定正式站）；GitHub Pages workflow 保留為原規劃 | |

**禁止**：React / Vue / Angular、遊戲引擎（Babylon、PlayCanvas 等）、CSS 框架、jQuery、lodash（需要時自己寫小工具函式）。新增任何 runtime 依賴都要在 PR 說明理由。

---

## 2. 目錄結構

```
webcity/
├─ AGENTS.md                給 AI 的總規則（必讀）
├─ docs/                    企劃、GDD、美術、架構、任務
├─ public/
│  ├─ icons/                PWA 圖示（192、512、maskable、apple-touch-icon 180）
│  └─ assets/               模型（.glb）、貼圖（.ktx2）、音效
├─ scripts/                 建置輔助腳本（圖示生成、素材壓縮）
├─ src/
│  ├─ main.ts               進入點：偵測裝置 → 建立 Game
│  ├─ game.ts               Game 類別：串起 SimClient、Renderer、Input、UI
│  ├─ data/                 ★ 所有平衡數值與定義（純資料，無邏輯）
│  │  ├─ roads.ts           道路種類表（GDD §3.1）
│  │  ├─ zones.ts           分區、容量、教育分布（GDD §4、§5）
│  │  ├─ buildings.ts       服務 / 電廠 / 公園等可放置建築表（GDD §9、§10）
│  │  ├─ milestones.ts      里程碑（GDD §14）
│  │  ├─ policies.ts        政策（GDD §15）
│  │  ├─ economy.ts         稅、貸款、起始資金（GDD §13）
│  │  ├─ palette.ts         色板（ART §2）
│  │  └─ config.ts          世界常數（CELL_SIZE、TILE_CELLS…）、畫質設定
│  ├─ core/                 不依賴 DOM / Three 的共用工具
│  │  ├─ math.ts            向量、貝茲曲線、幾何（線段交點、點到曲線距離）
│  │  ├─ rng.ts             可設定 seed 的亂數（mulberry32）
│  │  ├─ events.ts          型別安全的事件匯流排
│  │  ├─ grid.ts            格子索引工具
│  │  └─ spatial.ts         空間雜湊（快速查詢附近物件）
│  ├─ world/                世界資料模型（純資料 + 純函式，主執行緒與 Worker 共用）
│  │  ├─ types.ts           ★ 核心型別（見 §4）
│  │  ├─ terrain.ts         高度圖生成、取樣、壓平
│  │  ├─ roadGraph.ts       節點 / 路段 / 車道圖操作
│  │  ├─ roadGeometry.ts    曲線取樣、交點切割、吸附（工具預覽與 Worker 驗證共用）
│  │  ├─ zoneGrid.ts        沿路產生分區格
│  │  └─ lots.ts            地塊尋找
│  ├─ sim/                  ★ 模擬（只在 Web Worker 中執行）
│  │  ├─ worker.ts          Worker 進入點、訊息分派
│  │  ├─ simulation.ts      Simulation 類別：tick 迴圈、系統排程
│  │  ├─ state.ts           SimState（權威狀態）
│  │  ├─ commands.ts        處理玩家指令（驗證 → 套用 → 產生事件）
│  │  └─ systems/           每個系統一個檔案，簽名統一 `(state, ctx) => void`
│  │     ├─ time.ts
│  │     ├─ demand.ts
│  │     ├─ growth.ts
│  │     ├─ population.ts
│  │     ├─ power.ts
│  │     ├─ water.ts
│  │     ├─ garbage.ts
│  │     ├─ services.ts
│  │     ├─ fields.ts       污染、噪音、地價
│  │     ├─ happiness.ts
│  │     ├─ economy.ts
│  │     ├─ milestones.ts
│  │     ├─ citizens.ts     (M2)
│  │     ├─ pathfinding.ts  (M2)
│  │     ├─ traffic.ts      (M2)
│  │     └─ transit.ts      (M4)
│  ├─ bridge/               主執行緒 ↔ Worker 溝通
│  │  ├─ protocol.ts        ★ 訊息型別定義（見 §5）
│  │  ├─ simClient.ts       主執行緒端：送指令、收事件、維護鏡像狀態
│  │  └─ mirror.ts          主執行緒的唯讀世界鏡像
│  ├─ render/
│  │  ├─ renderer.ts        WebGLRenderer、場景、渲染迴圈、resize
│  │  ├─ quality.ts         畫質偵測與分級
│  │  ├─ camera.ts          RTS 相機（狀態 + 平滑）
│  │  ├─ lighting.ts        太陽、環境光、陰影
│  │  ├─ sky.ts             天空 Shader
│  │  ├─ dayNight.ts        日夜循環
│  │  ├─ terrain/           分塊地形 Mesh + Shader
│  │  ├─ water/             水面 Shader
│  │  ├─ roads/             道路 Mesh 產生器、路口、標線
│  │  ├─ zones.ts           分區格 Instanced 渲染
│  │  ├─ buildings/         程序建築生成器、InstancedMesh 池、LOD
│  │  ├─ vehicles.ts        (M2)
│  │  ├─ props.ts           樹、路燈、號誌
│  │  ├─ overlays.ts        資訊圖層
│  │  ├─ icons.ts           問題圖示 Billboard
│  │  ├─ preview.ts         工具預覽（幽靈道路 / 建築、覆蓋圈）
│  │  ├─ effects.ts         粒子特效
│  │  └─ postfx/            移軸、SSAO、Bloom、FXAA
│  ├─ input/
│  │  ├─ pointer.ts         Pointer Events 統一處理
│  │  ├─ gestures.ts        單指 / 雙指 / 捏合 / 旋轉辨識
│  │  ├─ keyboard.ts        快捷鍵
│  │  ├─ picking.ts         射線 → 地形座標 / 物件
│  │  └─ cameraController.ts
│  ├─ tools/
│  │  ├─ tool.ts            Tool 介面（見 §7）
│  │  ├─ toolManager.ts
│  │  ├─ roadTool.ts
│  │  ├─ zoneTool.ts
│  │  ├─ placeTool.ts       放置建築
│  │  ├─ networkTool.ts     電線 / 水管
│  │  ├─ bulldozeTool.ts
│  │  ├─ inspectTool.ts     預設工具：點選查看
│  │  └─ districtTool.ts    (M4)
│  ├─ ui/
│  │  ├─ App.tsx            UI 根元件
│  │  ├─ store.ts           UI 狀態（signals）
│  │  ├─ styles/            tokens.css、base.css
│  │  ├─ components/        Button、Panel、BottomSheet、Slider、Icon、Tooltip…
│  │  ├─ hud/               TopBar、DemandBars、SpeedControls、Toolbar、ToolOptions
│  │  ├─ panels/            InspectPanel、BudgetPanel、InfoViewPanel、MilestonePanel…
│  │  ├─ screens/           MainMenu、NewGame、LoadGame、Settings、Pause
│  │  ├─ notifications.tsx
│  │  └─ i18n/              zh-TW.ts、en.ts、t()
│  ├─ save/
│  │  ├─ serializer.ts      SimState ↔ 二進位
│  │  ├─ storage.ts         IndexedDB 存取、存檔槽
│  │  └─ migrations.ts      存檔版本遷移
│  ├─ audio/                (M3)
│  └─ pwa/
│     ├─ register.ts        註冊 SW、更新提示
│     └─ install.ts         安裝提示（Android/桌面 beforeinstallprompt、iOS 說明）
└─ tests/
   ├─ unit/                 Vitest（sim、world、core）
   └─ e2e/                  Playwright
```

### 2.1 模組相依規則（必須遵守，用 ESLint `no-restricted-imports` 強制）
```
data, core     ← 不能 import 任何其他資料夾
world          ← 只能 import data, core
sim            ← 只能 import data, core, world, bridge/protocol
bridge         ← 只能 import data, core, world
render         ← 可 import data, core, world, bridge（不可 import sim、ui、tools）
input, tools   ← 可 import data, core, world, bridge, render
ui             ← 可 import data, core, world, bridge, tools（不可 import sim、不可直接操作 Three 物件）
game.ts        ← 可 import 全部
```
**`sim/` 內禁止使用 DOM、`window`、Three.js**，必須能在 Node（Vitest）中直接執行。

---

## 3. 執行緒模型

```
┌────────────── 主執行緒 ──────────────┐        ┌──────── Sim Worker ────────┐
│ Input → Tools ──Command──────────────┼──────▶ │ commands.ts（驗證、套用）   │
│                                      │        │ Simulation.tick()          │
│ SimClient ◀──Events / Snapshot───────┼─────── │  systems/*                 │
│   └ Mirror（唯讀鏡像）                │        │ SimState（權威狀態）        │
│        ├→ Render（Three.js）          │        └────────────────────────────┘
│        └→ UI store（signals）         │
└──────────────────────────────────────┘
```
- **Worker 是唯一權威**。主執行緒永遠不直接修改世界狀態，只送 Command。
- 工具預覽（道路吸附、地塊顯示）在主執行緒用 `world/` 的純函式計算，Worker 收到指令後用**同一套函式**再驗證一次。
- Worker 主迴圈：依遊戲速度固定步長執行 tick（每 tick = 0.24 實際秒 @×1），每 tick 結束送出累積的事件。
- 車輛位置（M2）：每 50 ms 送一次 `Float32Array`（Transferable），主執行緒在兩次之間插值。

---

## 4. 核心資料型別（`src/world/types.ts`）

ID 一律用遞增整數（`number`），不用 UUID。大量資料用 TypedArray。

```ts
export type Id = number;
export type ZoneType = 'RL' | 'RH' | 'CL' | 'CH' | 'I' | 'O';
export interface Vec2 { x: number; z: number }           // 世界座標（公尺），y 為高度

// ── 道路圖 ──
export interface RoadNode {
  id: Id;
  pos: Vec2;
  height: number;               // 節點高度（地形或高架）
  segments: Id[];               // 相連路段
  control: 'none' | 'lights' | 'stop';
}
export interface RoadSegment {
  id: Id;
  type: RoadTypeId;             // data/roads.ts 的 key
  start: Id; end: Id;           // 節點 id
  c1: Vec2; c2: Vec2;           // 三次貝茲控制點（直線時 = 端點三等分點）
  length: number;
  elevated: boolean;
  builtDay: number;             // 用於 7 天內全額退款
  paidCost?: number;            // 實付整數費用，切段守恆；缺少時不退款
  zoneBlockIds: Id[];
}

// ── 分區格 ──
// 每個 ZoneBlock = 某路段某一側的一排格子，寬 n 格 × 深 4 格
export interface ZoneBlock {
  id: Id;
  createdOrder?: Id;           // 最早來源 block ID；道路切段後繼承重疊優先序
  segment: Id;
  side: -1 | 1;
  origin: Vec2;                 // 第一格的前緣中心
  dir: Vec2;                    // 沿路方向（單位向量）；曲線路段會切成多個 block
  width: number;                // 沿路格數
  cells: Uint8Array;            // width × 4，值 = ZoneCode（0 無、1 RL…6 O、255 無效）
  buildingAt: Int32Array;       // width × 4，建築 id 或 -1
}

// ── 建築 ──
export interface Building {
  id: Id;
  kind: 'zoned' | 'service' | 'park' | 'utility' | 'unique';
  defId: string;                // zoned 為 zone（如 'RL'），其他為 data/buildings.ts 的 id
  level: number;                // 1～5
  pos: Vec2; rotation: number;  // 地塊正面中心、朝向（弧度）
  lotW: number; lotD: number;   // 占地格數
  seed: number;                 // 外觀用
  state: 'construction' | 'active' | 'abandoned' | 'burned';
  stateTimer: number; // construction 時為已施工遊戲天數
  constructionStartedTick?: number; // 開工的絕對 tick
  rezoneAtTick?: number; // 改分區後自動拆除的絕對 tick
  flags: number;                // 位元旗標：HAS_POWER | HAS_WATER | HAS_SEWAGE | HAS_GARBAGE_SERVICE | ON_FIRE …
  problemTimers: Record<ProblemType, number>;
  households: number; residents: number;   // 住宅
  jobs: number; workers: number;           // 工作
  zoneBlock?: Id; blockCell?: number;      // zoned 建築所屬格位
}

// ── 環境場 ──
export interface Fields {
  size: number;                 // 300（每 16 m 一格）
  pollution: Float32Array;
  noise: Float32Array;
  landValue: Float32Array;
  waterPollution: Float32Array;
  coverage: Record<ServiceType, Float32Array>;
}

// ── 全域 ──
export interface CityStats {
  day: number; money: number; population: number;
  demand: Record<'R' | 'C' | 'I' | 'O', number>;
  income: number; expenses: number;       // 上週
  power: { produced: number; consumed: number };
  water: { produced: number; consumed: number };
  sewage: { capacity: number; produced: number };
  happiness: number;
  milestone: number;
}
```

`SimState`（`src/sim/state.ts`）包含：`seed, settings, day, tickInDay, speed, money, loans, taxRates, budgets, terrain, ownedTiles, nodes, segments, zoneBlocks, buildings, networks（電線、水管）, fields, citizens（M2）, transitLines（M4）, districts（M4）, policies, unlocked, statsHistory, nextId`。

---

## 5. 訊息協定（`src/bridge/protocol.ts`）

```ts
// 主執行緒 → Worker
export type Command =
  | { t: 'init'; seed: number; mapId: string; mode: GameMode; cityName: string }
  | { t: 'load'; data: ArrayBuffer }
  | { t: 'save'; reqId: number }
  | { t: 'setSpeed'; speed: 0 | 1 | 2 | 4 }
  | { t: 'buildRoad'; reqId: number; type: RoadTypeId; points: RoadDraft }     // 已在主執行緒預覽過
  | { t: 'upgradeRoad'; reqId: number; segment: Id; type: RoadTypeId }
  | { t: 'zone'; reqId: number; cells: Array<[blockId: Id, cellIndex: number]>; zone: ZoneType | null }
  | { t: 'place'; reqId: number; defId: string; pos: Vec2; rotation: number }
  | { t: 'buildNetwork'; reqId: number; net: 'power' | 'water'; points: Vec2[] }
  | { t: 'bulldoze'; reqId: number; targets: Array<{ kind: 'segment' | 'building' | 'network'; id: Id }> } // 仍接受舊單筆 target，兩者不可並存
  | { t: 'undo'; reqId: number }
  | { t: 'setTax'; zone: ZoneType; rate: number }
  | { t: 'setBudget'; dept: Department; value: number }
  | { t: 'takeLoan'; bank: number } | { t: 'repayLoan'; index: number }
  | { t: 'buyTile'; tx: number; tz: number }
  | { t: 'setPolicy'; policy: PolicyId; district: Id | null; on: boolean }   // M4
  | { t: 'inspect'; reqId: number; target: { kind: string; id: Id } };

// Worker → 主執行緒
export type SimEvent =
  | { t: 'ready'; snapshot: WorldSnapshot }               // 初始化或讀檔後的完整狀態
  | { t: 'result'; reqId: number; ok: boolean; reason?: string; cost?: number; refund?: number }
  | { t: 'roadsChanged'; added: RoadSegment[]; removed: Id[]; nodes: RoadNode[]; removedNodes: Id[] }
  | { t: 'zonesChanged'; blocks: ZoneBlock[]; removed: Id[]; occupancyOnly?: boolean }
  | { t: 'buildingsChanged'; added: Building[]; updated: BuildingPatch[]; removed: Id[] }
  | { t: 'networksChanged'; ... }
  | { t: 'stats'; stats: CityStats; transient?: boolean }                     // 每遊戲天一次
  | { t: 'fields'; which: FieldName; data: Float32Array } // 開啟資訊圖層時才送（Transferable）
  | { t: 'vehicles'; data: Float32Array; count: number } // M2，每 50 ms
  | { t: 'notify'; kind: NotificationKind; pos?: Vec2; params?: Record<string, unknown> }
  | { t: 'milestone'; index: number }
  | { t: 'saved'; reqId: number; data: ArrayBuffer }
  | { t: 'inspectResult'; reqId: number; info: InspectInfo }
  | { t: 'error'; message: string };
```
- 每個需要回應的指令帶 `reqId`；`SimClient` 提供 `send(cmd): Promise<Result>`。
- M1-01 實作細節：所有請求（含 init / setSpeed）均自動配置 reqId；ready 回覆也帶 reqId。`send()` 的實際回傳為 `Promise<Response>`（result / ready / saved / inspectResult union），並增加獨立 clock 事件回報速度與固定步數。鏡像於接收訊息時套用，避免依賴 WebGL 是否正常繪製。完整執行、背景節流與未實作型別界線見 `docs/SIMULATION.md`。
- M1-02：snapshot 增加目前 `stats`，遊戲日完成時依序執行日鉤子、適用的週鉤子、stats snapshot 與事件；day=0 為起始日，第一個週鉤子於完成第 7 天觸發。日期與執行順序詳見 `docs/SIMULATION.md`。
- M1-05：`buildRoad` 已接入權威驗證、道路圖與扣款；新增 `fundsChanged` 事件立即同步資金而不寫入每日統計歷史。工具鏡像快取、exact 接點與地表路口整合詳見 `docs/ROAD_TOOL.md`。
- M1-07：成功建路在地形整平後呼叫 `rebuildZoneGrid`，依序送 `roadsChanged`、`zonesChanged`、`fundsChanged`。道路的 `zoneBlockIds` 與分區格共用全域 ID；鏡像提供 `readZoneBlocks()` 防禦性複本，詳細約定見 `docs/ZONE_GRID.md`。
- 失敗原因 `reason` 用 i18n key（例：`err.notEnoughMoney`、`err.slopeTooSteep`），由 UI 翻譯顯示。

---

## 6. 渲染架構

| 模組 | 做法 | 更新時機 |
|---|---|---|
| 地形 | 每 64×64 格一個 Chunk（`BufferGeometry`，16 m 頂點間距），視錐剔除；自訂地形 Shader（MVP 以 `MeshStandardMaterial.onBeforeCompile` 注入坡度／高度／雜訊上色，保留 Three.js 光照、霧與 CSM；完整貼圖混合見 M3-02） | 地形變更時重建該 Chunk |
| 水 | 單一大平面（地圖範圍）+ 水 Shader，用地形高度貼圖算水深 | 每幀更新 uniform 時間 |
| 道路 | 每個路段產生一個 Mesh 片段，再依地形 Chunk **合併**成一個 `BufferGeometry`（減少 draw call）；路口單獨產生 | 路網變更時快取片段並分幀重建受影響批次；相鄰 Chunk 合併至最多 24 批（M1-06） |
| 分區格 | 一個 `InstancedMesh`（平面方格，per-instance 顏色），只在分區 / 道路工具啟用時或縮放距離 < 600 m 時顯示 | zonesChanged |
| 建築 | 程序生成器產生 `BufferGeometry` → 依「幾何雜湊」快取 → 相同幾何共用一個 `InstancedMesh`；所有建築共用一個材質 + 窗戶 Atlas | buildingsChanged |
| 車輛 | 每種車型一個 `InstancedMesh`，每幀依插值位置更新矩陣 | 每幀 |
| 樹、路燈 | `InstancedMesh`，依 Chunk 分組 | 變更時 |
| 問題圖示 | `Sprite` 或 Instanced Billboard，最多 300 個，距離 > 1500 m 隱藏 | stats 更新時 |
| 資訊圖層 | 地形 Shader 讀取一張 `DataTexture`（場資料）；建築 per-instance 顏色覆寫 | 開啟 / 每天 |

**Draw call 目標**：白天一般城市畫面 < 250（PC）、< 150（行動裝置）。

**每幀流程**：`input.update → camera.update → simClient.flushEvents → 各 renderer.sync(mirror) → dayNight.update → postfx.render`。

---

## 7. 工具系統（`src/tools/tool.ts`）

```ts
export interface ToolContext {
  pick(screenX: number, screenY: number): PickResult | null;  // 地形座標 + 命中物件
  mirror: Mirror;                                              // 唯讀世界
  sim: SimClient;
  preview: PreviewRenderer;
  ui: UiBridge;                                                // 顯示提示、費用
}
export interface Tool {
  id: string;
  cursor?: string;
  activate(ctx: ToolContext, options?: unknown): void;
  deactivate(): void;
  onPointerDown(e: ToolPointerEvent): void;
  onPointerMove(e: ToolPointerEvent): void;
  onPointerUp(e: ToolPointerEvent): void;
  onCancel(): void;              // 右鍵 / Esc / 行動裝置取消鈕
  onConfirm?(): void;            // 行動裝置確認鈕
  onRotate?(): void;             // R 鍵 / 旋轉鈕
}
```
M0-12 已提供 `input/picking.ts` 的 `TerrainPicker`。`pick(clientX, clientY, viewport, camera, maxDistance)` 使用 CSS client 座標；`raycast(origin, direction, maxDistance)` 使用世界座標。傳回 `world/picking.ts` 的 `TerrainPick`（world、cell、tile、owned、distance）或 null；結果物件會重用，非同步命令與存檔前必須複製所需數值。此版本只選地形表面，不選建築或水面；擁有權預設中央地塊，之後由 Mirror 查詢函式取代。除錯框由 `main.ts` 在相機更新後呼叫輸入層，再交 render 層繪製，沒有 render → input 依賴。

- 同一時間只有一個工具；預設為 `inspectTool`。
- 手勢分流（`input/gestures.ts`）：**單指 / 左鍵 → 交給目前工具**；但若目前是 `inspectTool`，單指拖曳 → 平移鏡頭。**雙指 → 永遠給相機**（平移、捏合縮放、旋轉、上下推改仰角）。雙指觸控開始時取消工具進行中的動作。
- 行動裝置：道路 / 網路工具採「點擊放點」而不是拖曳；完成一段後出現 ✔ / ✕ 浮動按鈕。

---

## 8. UI 架構

- `ui/store.ts` 用 signals 保存：`stats, selectedTool, toolOptions, openPanel, inspectTarget, notifications, settings, infoView, layout`。
- `layout` 由 `matchMedia` 與 `window.innerWidth/innerHeight` 決定：
  | layout | 條件 | 版面 |
  |---|---|---|
  | `desktop` | 寬 ≥ 1024 且有精確指標（`pointer: fine`） | 頂部資訊列、底部工具列、右側面板 |
  | `tablet` | 寬 ≥ 768 | 同 desktop，按鈕放大到 48px |
  | `phone-portrait` | 寬 < 768 且直式 | 頂部精簡列、底部可橫向捲動工具列、面板改 BottomSheet |
  | `phone-landscape` | 高 < 500 且橫式 | 左側直排工具列、右側面板窄版 |
- 所有可點元件最小 44×44 CSS px；使用 `env(safe-area-inset-*)`。
- UI 元件不得直接 import Three.js；需要 3D 互動時透過 `tools` 或 `game.ts` 提供的介面。
- 所有文字走 `t('key')`，不可寫死中文字串在元件中。

---

## 9. 存檔格式

```
[4 bytes magic "WCTY"][2 bytes version][gzip(msgpack(SaveData))]
```
- `SaveData` = SimState 的可序列化版本；TypedArray 直接存 `Uint8Array` 視圖。
- `version` 從 1 開始，每次改變結構 +1，並在 `save/migrations.ts` 新增 `migrate_{n}_to_{n+1}`。
- 存檔槽 metadata（城市名、人口、日期、縮圖 JPEG 320×180 base64）另存在 IndexedDB `slots` store，讀取清單時不需解壓完整存檔。

---

## 10. 效能預算

| 項目 | 預算 |
|---|---|
| 首次載入 JS（gzip） | < 400 KB（不含模型） |
| 首屏可互動 | PC < 3 s、iPhone < 5 s（4G） |
| 每幀主執行緒 | < 8 ms（PC）、< 14 ms（iPhone） |
| 每 tick Worker 時間 | < 30 ms（10 萬人口） |
| 記憶體 | iPhone < 700 MB |
| GC | 渲染迴圈中不可每幀配置新物件（重用 Vector3 / Matrix4） |

- 開發時 `?debug=1` 顯示 FPS、draw calls、三角形數、Worker tick 時間、JS heap。
- 大型重建（道路 Chunk、建築批次）若超過 4 ms 要分幀處理。

---

## 11. PWA

- `manifest.webmanifest`：`name: "WebCity"`, `short_name: "WebCity"`, `display: "fullscreen"`（iOS 不支援時自動降為 standalone）, `orientation: "any"`, `background_color: "#141A22"`, `theme_color: "#141A22"`, 圖示 192 / 512 / 512 maskable。
- `index.html` 需包含：
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="WebCity">
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
  ```
- CSS：`html, body { overscroll-behavior: none; touch-action: none; -webkit-user-select: none; -webkit-touch-callout: none; }`，避免 iOS 拖曳回彈、長按選取、雙擊縮放。
- Service Worker：預快取 app shell（HTML/JS/CSS/字型），模型與音效用 `CacheFirst` 執行期快取；新版本可用時顯示「有新版本，點此更新」提示（不自動重新載入，避免中斷遊戲）。
- iOS 安裝說明：偵測到 iOS Safari 且非 standalone 時，在主選單顯示「分享 → 加入主畫面」圖示說明（可關閉，不再顯示）。
- 呼叫 `navigator.storage.persist()` 請求持久儲存，降低存檔被系統清除的風險。

---

## 12. 測試策略

| 層 | 工具 | 必須涵蓋 |
|---|---|---|
| `core/`、`world/` | Vitest | 幾何（交點、貝茲取樣、吸附）、分區格生成、地塊尋找 |
| `sim/` | Vitest | 每個 system 至少 1 個測試；用固定 seed 跑 100 天的「黃金測試」比對人口 / 金錢在預期範圍（GDD §13.5） |
| 存檔 | Vitest | 存 → 讀 → 再存，兩次二進位相同；舊版本存檔可遷移 |
| UI / 整合 | Playwright | 3 個 viewport：`iPhone 15`（393×852）、`iPad Pro 11`（834×1194）、`Desktop`（1440×900）；主選單 → 新遊戲 → 鋪路 → 分區 → 時間推進 → 存檔 → 重新整理 → 讀檔 |
| 視覺 | Playwright 截圖 | 每個 PR 附上 3 種 viewport 截圖（CI artifact） |

---

## 13. 程式規範

- 命名：檔案 `camelCase.ts`、元件 `PascalCase.tsx`、型別 / 類別 `PascalCase`、常數 `UPPER_SNAKE_CASE`。
- 不使用 `any`（必要時 `unknown` + 型別守衛）；不使用 `default export`（Preact 元件除外）。
- 數值一律從 `src/data/` 讀取，程式碼中不可出現平衡用的魔術數字。
- 公開函式寫一行 JSDoc 說明用途；複雜演算法（交點切割、尋路）寫區塊註解說明步驟。
- 隨機一律使用 `core/rng.ts`，禁止在 `sim/` 中使用 `Math.random()`（確保可重現）。
- `sim/` 內不可使用 `Date.now()`，時間只來自遊戲 tick。
- Commit 訊息：`feat(roads): ...`、`fix(sim): ...`、`docs: ...`、`chore: ...`、`test: ...`、`perf: ...`。

---

## 14. 指令（`package.json` scripts）

| 指令 | 用途 |
|---|---|
| `npm run dev` | 開發伺服器（`--host`，可用手機連區網測試） |
| `npm run build` | 型別檢查 + 正式建置 |
| `npm run preview` | 預覽正式建置（測試 PWA） |
| `npm run lint` | ESLint + Prettier 檢查 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest |
| `npm run e2e` | Playwright |
| `npm run icons` | 由 `scripts/` 產生 PWA 圖示 |

M1-06 道路模型與 Worker 地形整平：見 `docs/ROAD_MESH.md`。`roadsChanged` 可攜帶 `terrain: { indices, heights, revision }`，鏡像在同一事件中先更新高度，再通知渲染及選取；道路高度與地形路基分開處理。

M1-08：分區權威驗證、空間選取、交易式工具與 InstancedMesh 貼地格線見 `ZONE_TOOL.md`；Worker `zone` 已啟用，保持 `zonesChanged` 增量區塊同步。

M1-09：原子拆除、實付退款、路口／分區清理及失去道路的建築狀態見 `BULLDOZE.md`。Building 與 NetworkSegment 支援可選 `builtDay`／`paidCost`；Building 另以 `roadDisconnectedDay` 與 `problemTimers.noRoad` 記錄斷路，不占用未定義的 flags 位元。

M1-10：`main.ts` 延遲載入城市 `game.ts` 或 `?gallery=1` 工坊 `gallery.ts`。六分區原創幾何、共用 Canvas Atlas、施工視覺介面與單 canvas 多視圖管理見 `BUILDING_GENERATOR.md`；城市建築 InstancedMesh 管理仍屬 M1-11。

M1-11：`BuildingRenderer` 已接入城市 `ready`／`buildingsChanged`，支援內容雜湊、可擴容 InstancedMesh、受限近景細節、施工／荒廢／拆除。施工 `stateTimer` 暫約定為已施工遊戲天數，等 M1-12 提供。展示與效能驗證、記憶體策略及 LOD 取捨見 `BUILDING_RENDERER.md`。

M1-12：分區成長、施工與重分區三天拆除已接入 Worker。`zonesChanged.occupancyOnly` 僅更新占用，格碼／拓撲不變；工具不因施工進度取消筆畫或重建道路。世界建築以正面中心 `pos`、旋轉後 +local Z 為深度；生成模型深度為 -Z，渲染額外旋轉 π，讓碰撞、占地與外觀一致。詳細演算法、初始需求及界線見 `GROWTH.md`。

M1-13：`Building.housing` 保留五戶量、四教育／年齡層、可工作人口、平均教育與就業群組；`jobEducation`／`workerEducation` 分別記錄職位要求與實際員工。`CityStats.populationDetails` 提供日內搬入搬出與戶數／就業總計。`stats.transient` 更新目前值但不追加每日歷史；`mirror.readStats()` 提供小型防禦性複本。日結與結構變更處理規則見 `POPULATION.md`。


M1-14：`sim/systems/demand.ts` 在 `createState` 初始化及每日人口結算後計算 RCIO，寫入既有 `stats.demand`；無新協定或主執行緒寫入。`calculateDemand` 是可單獨測試的純公式，`updateDemand` 僅讀取 active 建築與 settings/taxRates/happiness。需求每日一次，即時人口刷新不重算需求；鏡像與每日歷史沿用原 stats 事件。詳見 `DEMAND.md`。


M1-15：`place` 支援兩種開局電力設施，`buildNetwork` 支援 power；共用 `world/power.ts` 驗證。`stats.power` 增加 optional served／unpowered／groups，flags bit 1 為 HAS_POWER。供電 BFS 與空間索引在 Worker，建造及人口變化觸發更新；鏡像新增 `readPowerWorld`，電線事件推進 nextId。獨立 PowerRenderer 接收已確認事件，PlaceTool／NetworkTool 使用既有工具管理器、雙指取消與明確確認；不跨模組直接改世界。詳見 `POWER.md`。


M1-16：`place` 開放水務設施、`buildNetwork` 支援 water，新增 `buildRoadPipes` 原子批次請求。Worker 先更新電力再更新水務；flags bit 2／4 表示 HAS_WATER／HAS_SEWAGE，既有位元保留。water stats 增加 optional served／unserved／groups，sewage 增加 treated／uncollected。工具沿用共享場址／土地驗證並由 Worker 重算；鏡像 `readPowerWorld('water')`、獨立 WaterTool／WaterUtilityRenderer 及地形透明模式接入。詳見 `WATER_UTILITIES.md`。


M1-17：`problemSinceTick`／`abandonedAtTick` 是 Building 的 optional 絕對時間欄位，Worker 在日結及結構變更刷新問題。日結合併同建築的狀態、人口與旗標 patch，主執行緒保持唯讀；廢棄 60 天占用釋放由 GrowthSystem 處理。`ProblemIcons` 共用事件、屋頂位置及單批次圖集渲染，詳見 `BUILDING_PROBLEMS.md`。


M1-18：`WorldSnapshot.economy` 保存已結算週與破產連續週狀態，`economy` 事件／`readFinance()` 同步小型財政資料。Worker 於 onWeek 結算，所有既有付費建造統一 `chargeConstruction`，四種財政命令完成驗證與回覆；稅率／預算不由 UI 直接寫入。原型操作使用現有 DOM 控制模式，共用 UI 仍待 M1-19／M1-23。詳見 `ECONOMY.md`。


M1-20：`ui/hud/TopBar` 與事件訂閱模型取代原速度 DOM 面板；`ui/store.ts` 提供每座城市獨立的統計／時鐘 signals。鏡像 cityName getter 只讀字串，時鐘事件不複製 stats；資金事件即時刷新 HUD，速度仍須 Worker 確認。手機摘要與 BottomSheet、版面避讓和驗證約定見 `TOPBAR.md`。

### M1-24 存檔轉接層補充

`sim/worker.ts` 是序列化 I/O 的組裝點，唯一允許 import `save/serializer` 的 sim 檔案；它將非同步 codec 注入 CommandDispatcher。其餘 sim 邊界不變，Worker 仍禁止 DOM／UI／Three。IndexedDB 只在主執行緒 save/controller 使用；UI 取得 game 提供的 SaveActions，不能直接 import save 層。v1 header 與還原／驗證約定見 `SAVES.md`。

### M1-25／M1-26 啟動與整合

預設主選單以動態 import 載入，不配置 Worker／WebGL；一次性新遊戲或讀檔請求經 sessionStorage 交給 bootstrap，再建立 Game。新遊戲 `CitySettings.starterRoads?` 為 Worker 初始化選項，缺省保留既有空白測試世界；存檔保留實際路網。`RoadSegment.regional?` 僅標記起始地塊外的預鋪高速公路維護歸屬，並排除自動水管。這兩個可選欄位與 version 1 存檔向後相容。

### M2-01 曲線道路

道路與控制點沿用現有 RoadDraft／RoadSegment。`world/roadCurves.ts` 負責形狀、投影、交叉與精確分段，RoadGraph 與工具共用；Worker 改為接受有限地面三次貝茲載荷，並以同一份幾何驗證重新計價。無新增 runtime 依賴或存檔版本。操作及容差見 `CURVED_ROADS.md`。

### M2-02 道路車道

`world/roadLanes.ts` 從路段推導 Lane，與道路 Mesh 共用橫斷面；車道屬可重建資料，不新增存檔權威。路樹使用單一 InstancedMesh，重建時釋放舊 GPU 資源。詳見 `ROAD_TYPES.md`。

### M2-03 道路升級

`world/roadUpgrade.ts` 共用報價、命中與拆除範圍；`upgradeRoad` 指令由 Worker 重新報價，保留路段 ID，透過 roads/zones/buildings/funds 事件同步。`RoadSegment.zoningReversed?` 保留實體分區方向並傳給切割子路段；`Building.frontageSetbackM?` 保存縮窄後退縮距離。兩個欄位為可選，舊 v1 存檔可直接載入，讀檔檢查型別與範圍。操作與退款政策見 `ROAD_UPGRADE.md`。

### M2-04 高架與橋樑

`RoadDraft.startHeight/endHeight` 為可選海拔；明確高架草稿必須包含兩端高度。`roadGeometry` 共用垂直吸附、全寬地形驗證、曲線坡度與立體交叉淨高檢查。建造命令傳遞 `elevated` 到 RoadGraph，沿用既有分層拓撲與 earthworks 排除高架的邏輯。`render/roads/structures.ts` 生成混凝土橋面與橋墩，併入原有批次快取；下方道路變動會重建相關橋墩。規則見 `BRIDGES.md`。

### M2-05 路口控制

`setIntersection` 指令以 node/control/banLeft 更新 Worker；RoadNode 的可選 manualControl/banLeft 欄位向後相容舊存檔。RoadGraph 與升級重算時尊重手動控制。`world/intersections.ts` 提供命中、進入方向分組與相位選取，讓渲染與後续車流共用規則。`IntersectionProps` 將燈桿、停止標誌批次合併，燈色依 Worker ticks × 0.24 秒更新；相位改變之外不重建。見 `INTERSECTIONS.md`。

### M2-06 有向車道圖

`Simulation.laneGraph` 為 Worker 本機衍生快取，不進入 WorldSnapshot 或傳給主執行緒。發送 roadsChanged 前先同步，確保建造、升級、拆除、路口禁轉均同步生效。`world/roadJunctions` 共用路口裁切距離，畫面道路與車道端點使用相同規則；車道連接包含可插值的轉彎路徑。全圖 O(n) 簽章掃描後，只重建改變的車道幾何與鄰接路口，revision 供後續尋路快取失效。見 `LANE_GRAPH.md`。

### M2-07 市民 SoA

`WorldSnapshot.citizens` 為 `CitizenTable`（7 個 Int32Array、9 個 Uint8Array），Worker `CitizenSystem` 保留穩定個人／家庭 ID，以 swap-remove 壓縮活動列。MessagePack 沿用既有 typed array codec；v1 舊檔的空陣列轉為空表，Simulation 初始化轉換住宅人口。每日生命週期增量更新彙總，就業保留已有職位；結構變更重新驗證容量。見 `CITIZENS.md`。

### M2-08 行程資料

市民 SoA 擴充為 16 個 Int32 與 13 個 Uint8 欄位，含 locationId、destinationId、tripOriginId、tripStartTick、shiftEndTick、班次／活動週期、行程用途／狀態。ScheduleSystem 每 tick 產生個別請求，由尋路／交通系統呼叫 pending → depart → arrive；過期結果依個人 ID、請求 tick、目的地檢查。schema 缺少整組行程欄位時補零，保留 M2-07 及 M1 v1 讀檔。見 `SCHEDULES.md`。

### M2-09 路徑規劃

Pathfinder 重用數值化車道相位圖、TypedArray 搜索工作區、二元堆積與 ALT 下界；一般道路另建雙向行人路網。RoutePlanner 在 Worker 每 tick 處理有上限的個人 Journey，输出带 revision 的 RouteLeg 陣列。一般車道腿共用取樣 points，加上 startDistance 偏移，路口／換道腿保留所屬節點及車道。衍生圖與路徑不寫入存檔。完整界面、快取及驗證見 `PATHFINDING.md`。

### M2-10 權威交通

TrafficSystem 於 ScheduleSystem／RoutePlanner 之後更新，車道排序占用表供跟车與雙車道換道檢查，路口 mutex 管理號誌／讓行。`vehicles` 每 50 ms 傳送十欄 Float32Array，附 tick/speed，Worker 移交 buffer。WorldSnapshot 增加可遷移的 traffic 集合；路徑去重並保存腿／進度與少量獨立幾何，載入後重建道路引用。詳見 `TRAFFIC.md`。

### M2-11 移動實體畫面

VehicleRenderer 消費十欄 vehicles 封包，以 tick/speed 決定插值時間、最短弧轉向，重複封包不重啟插值。每車型／LOD 使用預配 InstancedMesh；畫面點選送 inspect vehicle，Worker 回傳真實居民的家／工作／目的地資訊。鏡頭縮放不改變個人身份，畫面只做 400/900 m 車輛 LOD／剔除及 120 m 行人剔除。見 `VEHICLE_RENDERING.md`。

### M2-13 貨運任務

CargoSystem 管理 WorldSnapshot.cargo 與 Building.cargo，每 tick 最多八次路徑查詢、輪流處理企業。TrafficSystem 的負數個人欄位代表獨立物流 mission ID，與正數居民分離；貨車沿相同車道占用系統移動，抵達通知由 CargoSystem 入庫，斷路則保留原地裝載貨單。traffic.nextMissionId 保留任務識別，遷移驗證貨單與車流關聯。詳見 `CARGO.md`。

### M2-14 公共服務框架

world/ServiceNetwork 共用道路接入、二元堆 Dijkstra、預覽路段裁切及覆蓋場取樣；sim/ServiceSystem 在 Worker 計算 Building.coverage／serviceStatus 與既有 coverage TypedArray。新增 setBuildingEnabled 命令，暫停時仍重新计算並送 building patches；derived coverage 在載入時重算。ServiceTool 只讀鏡像預覽，設置由 Worker 重驗；ServiceRenderer 按材質合併原創幾何。見 SERVICES.md。

### M2-15 警察與犯罪

每日服務覆蓋更新後執行 updateCrime；可選 Building.crime/crimeUpdatedDay 保存犯罪率與最後結算日，避免讀檔及重複重算累加。crime 問題加入共用判定、40 天連續計時、圖集與檢視，實際條件不依賴 UI 計時值。公共設施圖示以保守高度定位，分區仍採原有精確屋頂位置。見 POLICE.md。

### M2-16 消防任務與火勢

FireSystem 保存 WorldSnapshot.fire／Building.fire，日結依確定性 RNG 起火和損毀；TrafficSystem 負數任務以 purpose 7 表示消防，與貨運共用 ID 分配、各自消費到站事件。救援抵達後才滅火，斷路保持實體位置，序列化驗證任務与車流關聯。FireRenderer 消費 Building patches，以單批程序 billboard 表示火焰黑煙。見 FIRE.md。

### M2-17 健康與小數累積

每日服務、火勢結算後執行 updateHealth；CitizenTable 新增 healthFraction Uint8Array 與 lastHealthDay，每人 16 Int32／14 Uint8 共 78 bytes。結構重算只聚合 Building.health／CityStats.health，不治療；每日才更新個別居民。world/fieldSampling 共用 300×300 場取樣，Building.drinkingWaterPollution 為供水污染掛接欄位。舊 v1 表補零小數，驗證欄位、上限與日期。詳見 HEALTH.md。

### M2-18 教育配置

`CitizenSystem` 追蹤教育預算、設施啟停／火災與道路版本，在計算就學日前檢查學位。沿用 `ServiceNetwork` 道路距離，配置由居民穩定 ID 決定；`education.ts` 只由個人權威資料產生住宅／學校摘要，透過 BuildingPatch 更新檢視。存檔驗證新增可選摘要且向下相容。詳見 `EDUCATION.md`。

### M2-19 公園及樹木

`plantTrees` 是有上限的 Worker 原子指令，`world/parks.ts` 共用筆畫與地形／占用預覽，`sim/systems/parks.ts` 產生徑向休憩場。樹木採 park 建築記錄、保留 ID／費用／種植日，沿用分區阻擋、拆除與存檔，不參與電網或職缺。渲染以兩組共享幾何 InstancedMesh 承載最多 4,000 棵，公園原創模型按材質合併。詳見 `PARKS.md`。


M2-20：FieldsSystem 以 clock.ticks 的 1／3／5／7 相位分散四個 300×300 場，差異才發送 fields 事件。environmentVersion 保留期中狀態，WaterSystem 產生實際排污與容量加權飲用水污染，TrafficSystem 提供可從存檔重建的即時道路車數。Building.environment／sewageDischarge 為向下相容摘要。見 ENVIRONMENT.md。


M2-21：happiness／levels 在 Worker 更新 Building.happiness、upgrade 與 development；每日守衛及低地價計時保存在存檔，更新容量後重跑人口／供應，HUD 與個人幸福度由權威聚合。BuildingRenderer 既有 level recipe 使模型與有界改建特效同步更新。詳見 LEVELS.md。


M2-22：world/infoViews 純衍生、InfoOverlays 消費權威事件；300×300 地形 DataTexture，加 600×600 設施占地遮罩。分區模型使用 per-instance 顏色；既有合併批次設施使用第二貼圖，保留 draw calls。材質 hook 與 CSM 組合且避免重複注入；建築改色沿用分幀佇列，資料最多 250 ms 刷新。詳見 INFO_VIEWS.md。

### M2-12 交通統計與渲染
Worker 發送精簡 `roadTraffic` 事件；路段檢視向 Worker 取得統計。存檔讀取從實際車輛重新計算。交通色帶沿道路高度合併為一個 draw call，路網事件重建幾何，週期事件只更新顏色，沒有逐幀世界重建或新依賴。

### M2-23 通知事件投影
`ui/cityNotices.ts` 只投影 Worker ready/buildingsChanged/economy/milestone/notify 事件，增量維護問題集合並按轉變提醒。純資料 queue 可測試實際時間到期／去重，不將時間或 DOM 引入 sim。世界卸載清理所有通知、計時器和訂閱。

### M2-24 跟隨鏡頭
render/FollowCamera 只讀 VehicleRenderer 的重用座標輸出；RtsCamera 追蹤焦點並沿用幀率獨立阻尼。UI 僅透過 callback 開始／取消，game 組合事件與生命週期，不新增跨層依賴。每幀不分配追蹤物件，不向 Worker 輪詢。


### M3-01 素材管線
`render/assets.ts` 是 scene-scoped GLTFLoader / MeshoptDecoder / KTX2Loader 管理器；Promise 去重、失敗重試、共享 GPU 資源統一釋放。`core/assetManifest.ts` 驗證內容雜湊路徑及授權 metadata；decoder 在本站預快取，模型使用既有 media CacheFirst。工具依賴只加入 devDependencies，正常 build 不需 KTX CLI。詳見 `ASSET_PIPELINE.md`。


### M3-02 地形細節
`world/terrainDetail.ts` 產生確定性週期 RGBA 灰階細節，render 封裝 mipmapped DataTexture。TerrainRenderer 以 world-space 三平面投影組合既有 lighting hook／資訊圖層，所有 Chunk 共用一張貼圖與中央差分法線。詳見 `TERRAIN_DETAIL.md`。


### M3-03 水面細節
WaterRenderer 共用一個 MeshStandardMaterial，兩層沿河道流向的週期法線、菲涅耳天空色反射與淺岸泡沫。ready／fields 只讀權威水污染場並更新單通道貼圖；逐幀只改相位，GPU 資源集中釋放。見 WATER_SHADER.md。


### M3-04 天空與高度霧
CityRenderer 依鏡頭海拔每幀更新既有 FogExp2 密度；80–2000 m smoothstep 淡化到 30%，天空球維持 camera-relative。曝光、光暈與高度參數集中在 data/rendering，debug 只投影實際霧密度。見 SKY_LIGHTING.md。


### M3-05 陰影穩定性
高畫質 CSM 開啟 fade，更新 frustums 後才安裝材質 hooks。中畫質以 light-space texel 對齊追蹤中心，重用方向與暫存向量；保留 bias／normalBias 與完整資源清理。見 SHADOWS.md。


### M3-06 生活時鐘與日夜
DayNight 只投影 Worker SimClock 至 ART 關鍵影格，最多一 tick 插值並重用 Color／uniform。game 接合建築／路燈／交通，render 不依賴 UI；窗戶 shader 與 CSM、建築狀態 hooks 組合。道路燈具與車燈使用固定批次 instancing／程序貼花，沒有逐幀配置或 point lights。見 DAY_NIGHT.md。

### M3-07 後製

PostProcessing 管理 HDR targets 與所有 pass，真實深度重建 AO、夜間光暈、相對鏡頭高度移軸、輸出轉色與 DPR 條件 FXAA。Renderer 統一處理 resize／quality／dispose；debug 提供啟用 flags，無逐幀配置。詳見 POSTFX.md。

### M3-08 道路表面

world/roadDetail 生成確定性表面像素；render/roads/detail 使用同一批次材質的 world-space 紋理，與 CSM hook 組合。道路 draw call 不變，dispose 釋放 GPU 貼圖；遠距淡出＋mipmap 保持穩定。見 ROAD_DETAIL.md。

### M3-09 森林植被

world/vegetation 從既有森林場與 seed 分批衍生植被與權威地物占用。Mirror 僅複製道路與建築足跡，不帶整張地形／模擬場；render/vegetation 以雙緩衝 instancing、分幀生成、三段 LOD 與程序 billboard atlas 顯示，逐幀不配置矩陣。見 VEGETATION.md。

### M3-10 正式住宅素材

world/modelCatalog 為穩定 recipe／資產選擇；scripts 離線輸出三段 LOD 與共用分區 atlas。CatalogAssets 將 GLTF 節點量化變換還原為 float geometry，資產完成後排入既有細節預算；分區材質保留 CSM、狀態與窗燈 hooks。未下載／不支援規格維持程序替代，無主執行緒世界寫入。詳見 RESIDENTIAL_MODELS.md。

### M3-11 商業、工業與辦公素材

MODEL_CATALOG 擴充 CL／CH／I／O，沿用 world mapping 與 CatalogAssets 無需改變 Worker、存檔或模擬。離線 catalogGeometry 提供各分區細節與完整高度的三段 LOD；共用 atlas 仍按分區去重。見 COMMERCIAL_MODELS.md。

### M3-12 公共設施與地標素材

world/facilityModels 對照 BUILDINGS 與純美術地標清單；FacilityAssets 提供原始 GLTF 變換、獨立幾何副本與共用狀態材質，接入既有 power／water／services 渲染器，保留權威事件、風力動畫與水管高度。樹維持 instancing，量化 buffer 先還原 float 才烘焙矩陣。見 FACILITY_MODELS.md。

### M3-13 正式車輛
VehicleRenderer 的 16 款車輛與行人按型號／LOD 分批實例化；world/vehicleModels 以居民 ID 決定穩定款式。AssetLibrary 載入 Meshopt GLB，還原量化與 `_PAINT` 遮罩；材質安裝回呼在畫質切換後重掛 CSM 與烤漆 shader。失敗保留同款原創幾何。車輛權威及序列化未改變，見 VEHICLE_MODELS.md。

### M3-14 全城建築 LOD
正式城市以 world/buildingLod 的 250／900 m 與 20 m 遲滯決定各棟細節；render 按模型／LOD 實例化近中景，遠景合併共用盒子批次。InstancePool 保存帶正負號的漸變屬性，buildingMaterial 採互補抖色切換，舊批次在 0.3 秒後回收；相機跳轉與素材完成排入每幀 2 ms／8 棟佇列。施工仍有獨立近景預算。詳見 BUILDING_LOD.md。

### M3-15 城市特效
CityEffects 消費 ready／buildingsChanged，以兩個預配 InstancedBufferGeometry 顯示煙霧與升級光環；煙霧飄移在 GPU，主執行緒只更新來源及事件時序。game 讀取實際渲染畫質，同步各效果的開關，不修改模擬。電力／水務渲染快取最新建築，僅在火災狀態變化時重建；非同步素材完成亦使用最新狀態。見 EFFECTS.md。

### M3-16 UI 美術與縮圖
純資料 SVG paths 同時服務 Preact／DOM 控制與城市問題圖集。game 注入 BuildingThumbnails callback，render 在現有 WebGLRenderer 的離屏 target 渲染正式模型來源幾何，還原全部 renderer 狀態並限制快取；UI 只持有 PNG 字串，不跨層存取 Three。詳見 UI_ART.md。

### M3-17 Audio
主執行緒 audio 模組只依賴 data／core／world／bridge，管理 Web Audio 與已確認事件；game 提供鏡頭、地形與實際車數，UI 透過 preferences-change 傳遞純音量設定。音源數量有上限、背景 suspend、頁面卸載清理。詳見 AUDIO.md。

M3-18：`audio/music.ts` 使用單一串流 HTMLAudioElement 與 MediaElementAudioSource，獨立音樂 gain 接既有主音量；純 playlist 邏輯採 core/Rng，長音樂不建立完整 AudioBuffer。六首 AAC 各 192 秒，未選曲不預載、不進 SW precache；背景與音量零暫停。詳見 MUSIC.md。

M3-19：GraphicsOptions 為 data 中的偏好契約，UI 經 game 注入 CityRenderer，個別陰影／後製資源按需釋放與重建。SustainedQuality 以兩個十秒低 FPS 視窗降級；onAutoQuality callback 由 game 轉通知。車輛畫面上限不修改 Worker 行程。詳見 QUALITY_SETTINGS.md。

M3-20：離線 GLB 稽核核對內容雜湊、命名與各 LOD 面數；Playwright 經 IndexedDB 正常載入固定城市，在 12／19／22 時驗證實際 renderer。展示存檔依負载計算水電設施，鏡頭停止及 LOD 轉換完成後才截圖。主選單 gzip JS 與高畫質渲染數據分開記錄，不能取代真機／10 萬人口效能驗證。見 ART_REVIEW.md。

### M4-01 公車權威
TransitSystem 管理每條路線與個別乘客，RoutePlanner 將可搭直達公車的居民請求交由它處理；TrafficSystem 仍是車輛與接駁行人的位置權威，新增 purpose 8 任務。createBusLine／setBusVehicles／deleteBusLine 皆經 Worker 邊界驗證。transit event 僅送路線摘要，完整乘客／派車狀態隨 Worker 存檔；WorldMirror.readTransit 回傳防禦拷貝，UI 不寫模擬。停止服務會將真實位置保存在 traffic.stranded，跨存檔不回到住宅起點。新增票款待結算欄位向後相容，讀檔核對乘客與交通任務所有權。見 BUS.md。

### M4-02 地鐵
TransitSystem 的向後相容 mode／stationIds 標記地下路線，共用個人乘客、步行任務與票款；TrafficKind.metro 使用已存在的 M3 地鐵模型。world/metro 生成地下 access 路段及土地／造價驗證，Worker 從車站位置重建並獨立占用軌道。軌道與路線一起提交，沒有主執行緒修改權威狀態；readTransit 仍是摘要，存檔保留列車實際進度。MetroTracks 僅於地下工具顯示 X-ray 軌道，地形沿用透明模式且保留拾取表面。見 METRO.md。

### M4-03 道路電車
TransitSystem 的 tram mode 使用既有道路 RouteLeg 與 TrafficKind.tram；同車道占用及路口規則不另開旁路。路線保存已支付軌道的路段與車道取樣，道路改變後只允許仍在已鋪軌路段的路徑，拆路移除相應軌道。createBusLine.preview 是純驗證報價，不配置 ID、派車或扣款，正式命令重驗狀態。TramTracks 依權威摘要繪製成單批線段，與 M3 原創 18 m 軌道車體共用素材；沒新增外部素材。見 TRAM.md。

## M4-04 行政區資料流

`world/districts.ts` 定義 District／DistrictView 與 16 m 格網純函式。Worker 的 district 指令集中處理建立、命名、刪除、塗抹及所有權轉移，成功後以 districts 事件通知 Mirror；人口和建築事件補送統計。區界以不可變集合替換，衍生格網索引使用 WeakMap 快取。SimClient 只發送命令，districtTool 管理手勢草稿，UI 只讀統計。存檔驗證 ID、名稱及全市互斥格子。

Renderer 依地形建立頂點色格網，每幀最多建立 1,024 格，區名用 CanvasTexture／Sprite，無新增依賴。筆刷預覽僅顯示目前觸點並限制已購地塊，完整連續筆劃於放開時交 Worker 套用。`__webcityDistricts` 僅為 debug 唯讀副本。

## M4-05 政策資料與路由

全市政策仍為 PolicyId 陣列，District 的可選 policies 字典表示明確 boolean 覆寫（缺項繼承）。setPolicy 指令 on=null 僅用於取消單區覆寫。world/policies 統一解析作用位置、費用與效果；Worker 發出 policies／districts 事件，UI 不持有權威修改。垃圾產量／庫存及 policyExpenses 可選欄位相容舊存檔，載入驗證其有限值與政策鍵。

Pathfinder.between 支援可選 forbidden 道路集合，只由貨運傳入。CargoSystem 在政策、區界或道路改變時重算禁行道路並透過 TrafficSystem 保留違規行程的實際停留位置；貨物與待送需求不消失。禁止高樓 floorLimit 由 Worker 計算，catalogModel 回退至樓層受限的程序模型。

M4-06：District.industry 為可選特化 id，district action specialize 由 Worker 驗證 MS6。updateIndustry 在初始化、每日及結構更新時把行政區種類派生到工業建築，轉型報廢庫存；人口結構偵測含 industry，職缺教育分配同步重算。world/industry 提供資源取樣与定義。貨運 daily 依資源倍率產原料，原料 Shipment.commodity 僅容許出口，沿用真實路徑和抵達結算。render/buildings/industryGeometry 提供近遠景共用輪廓；特化不套用一般工業 GLB。存檔新增欄位皆向後相容並驗證，詳見 INDUSTRY.md。

M4-07：GarbageSystem 使用既有 RoutePlanner／TrafficSystem，purpose=9／kind=6，collect 和 return 兩段路程，入場預留容量，四次尋路／tick。每日處理持久庫存並向 power 提供實際焚化發電；當日處理先於供電刷新。WorldSnapshot.garbage、Building.wasteFacility 為 Worker 權威，舊檔補空狀態；garbageValidation 驗證任務與容量，migrations 合併驗證共享 mission id 及交通端點。UI、圖示、通知與幸福度读取實際堆積／滿載，沒有 UI 回写。詳見 GARBAGE.md。

### M4-08 殯葬權威狀態
CitizenSystem 的實際死亡新增 Building.bodies.pending，人口 patch 同步到主執行緒。DeathcareSystem 採 Traffic purpose 10／kind 7 與共享 reserveMission ID，區分接運與回程，出發前預留 Mortuary 容量。服務覆蓋比例不會清除遺體；daily 處理火化，存檔 validateDeathcare 驗證整數與跨系統 ID，詳見 DEATHCARE.md。

### M4-09 里程碑事件
updateMilestones 只在 Worker 修改 unlocked、money 與 stats.milestone，依序發 fundsChanged／milestone／economy。unlocked 兼為一次性獎金記錄，Mirror 和建造工具收到 milestone 即刷新鎖定；UI 慶祝佇列只呈現事件。舊城補領在首個運行 tick 發生，已領不重播，見 MILESTONES.md。

### M4-10 土地指令與裝置限制
WorldSnapshot.tileLimit 是 4／9；SimClient 的當前裝置限制隨每次 init／load 送入 Worker，舊存檔可預設 9。buyTile 採 world/tiles 的相同預覽與權威驗證，成功原子扣款／更新 ownedTiles 並發 tilesChanged；Mirror 和快取建造工具即時刷新。讀取九塊城市到手機只停用新增購買，不刪土地。見 TILES.md。

### M4-11 獨特建築
`data/unique` 提供十二筆建築資料，`world/unique` 共用唯一性／解鎖判斷。ServiceTool 與 Worker place 共用預覽，卡片只顯示唯讀狀態。地標沿用 parkField 地價／幸福度、預算、停用、拆除與保存，使用 unique kind；facilityModels 保留原 M3 模型 ID 與 landmark 索引，無重複資產。詳見 UNIQUE_BUILDINGS.md。

### M4-12 地形指令
`terraform` 接收有限長 TerraformDraft，由 world/terraform 同時供預覽與 Worker 驗證。Simulation 只接受沙盒，產生稀疏 TerrainPatch，重用 roadsChanged.terrain 同步鏡像與渲染；重建 zone grid 及 utility fields。建築／道路支撐三角形在任何寫入前受保護。自然植被重分批時重新取地面高度並略過水下位置；水面沿 revision 更新 texture。詳見 TERRAFORM.md。

### M4-13 天氣渲染
`world/weather` 以 seed 與 clock.ticks 純計算 WeatherSample；`render/weather` 僅使用只讀時鐘，插值最多一個 tick。雨批次、霧與雲影無每幀物件配置。偏好 weather 儲存於本機，無新增 Worker 命令或存檔欄位。詳見 WEATHER.md。

### M4-14 災害與復建權威
WorldSnapshot.disasters 保存開關、下一次預警日或待發生預警；舊檔補 disabled。FireSystem 每日防重後執行 updateDisasters，批次點火交由既有消防派遣／損毀處理，disasters 事件更新 Mirror。rebuild 原子檢查／扣款後重啟 constructionStartedTick，保留 ID、占地及庫存並刷新人口服務；UI 只發命令。見 DISASTERS.md。

### M4-15 財政歷史投影
world/financeHistory 將既有 statsHistory 投影成最多 52 筆 FinancePoint；Mirror 提供防禦性小陣列。ui/financeChart 以原生 Canvas 2D 自繪，輸出至 img，面板未展開不繪圖，ResizeObserver 與訂閱於 dispose 清理。週界樣本不重加總每日收入，不增套件或 Worker 權威資料。見 FINANCE_CHARTS.md。

M4-16：WorldMirror 緩存 Worker roadTraffic，ready 從存檔重算、道路刪除清理；readCityStatistics 以住宅聚合及精簡 stats 計算獨立唯讀摘要。城市統計面板只在展開時響應 stats／roadTraffic，不受畫面車流上限影響，沒有新的權威狀態。見 CITY_STATISTICS.md。

M4-17：world/mapSelection.resolveMap 共用確定性預設解析，random mapId 可保存；Terrain 接受只含 relief／coast 的設定。MapPreview 使用延後 120 ms 可取消的 effect，在離屏 Canvas 2D 生成縮圖並以 img 呈現，不配置 Worker 或 WebGL。Worker 仍驗證種子與地圖 ID；見 MAP_SELECTION.md。

M4-18：Simulation 在成功建造邊界記錄 constructionUndo 差異，最多 UI_RULES.undoActions 筆；Worker undo 完整驗證後套用物件與地形反向差異，保留時鐘與人口等動態狀態、重新同步路網／區塊／服務。undoState 只向 Mirror 發送筆數、類型、日期與費用；主執行緒不持有可寫復原快照。紀錄不序列化，見 UNDO.md。

M5-01：新增可選 `CitySettings.tutorial` 與 `WorldSnapshot.tutorial`，沿用 v1 存檔的缺欄位遷移。`tutorial` 命令僅允許 pan/rotate/zoom/finance/skip/dismiss；Worker 控制 step/status 與固定獎勵，事件更新防禦複製 mirror。建造完畢檢查現存道路、分區、管線，成長步驟才在 tick 檢查；非教學城市不掃描。輸入 callback 與財政開啟 callback 由 game 接 UI，沒有 UI/sim 或 input/UI 模組相依。詳見 TUTORIAL.md。
