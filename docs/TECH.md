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
| 部署 | GitHub Pages（`main` 合併後自動部署） | |

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
  zoneBlockIds: Id[];
}

// ── 分區格 ──
// 每個 ZoneBlock = 某路段某一側的一排格子，寬 n 格 × 深 4 格
export interface ZoneBlock {
  id: Id;
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
  stateTimer: number;
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
  | { t: 'bulldoze'; reqId: number; target: { kind: 'segment' | 'building' | 'network'; id: Id } }
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
  | { t: 'result'; reqId: number; ok: boolean; reason?: string; cost?: number }
  | { t: 'roadsChanged'; added: RoadSegment[]; removed: Id[]; nodes: RoadNode[]; removedNodes: Id[] }
  | { t: 'zonesChanged'; blocks: ZoneBlock[]; removed: Id[] }
  | { t: 'buildingsChanged'; added: Building[]; updated: BuildingPatch[]; removed: Id[] }
  | { t: 'networksChanged'; ... }
  | { t: 'stats'; stats: CityStats }                     // 每遊戲天一次
  | { t: 'fields'; which: FieldName; data: Float32Array } // 開啟資訊圖層時才送（Transferable）
  | { t: 'vehicles'; data: Float32Array; count: number } // M2，每 50 ms
  | { t: 'notify'; kind: NotificationKind; pos?: Vec2; params?: Record<string, unknown> }
  | { t: 'milestone'; index: number }
  | { t: 'saved'; reqId: number; data: ArrayBuffer }
  | { t: 'inspectResult'; reqId: number; info: InspectInfo }
  | { t: 'error'; message: string };
```
- 每個需要回應的指令帶 `reqId`；`SimClient` 提供 `send(cmd): Promise<Result>`。
- 失敗原因 `reason` 用 i18n key（例：`err.notEnoughMoney`、`err.slopeTooSteep`），由 UI 翻譯顯示。

---

## 6. 渲染架構

| 模組 | 做法 | 更新時機 |
|---|---|---|
| 地形 | 每 64×64 格一個 Chunk（`BufferGeometry`，16 m 頂點間距），視錐剔除；自訂 `ShaderMaterial`（ART §5.1） | 地形變更時重建該 Chunk |
| 水 | 單一大平面（地圖範圍）+ 水 Shader，用地形高度貼圖算水深 | 每幀更新 uniform 時間 |
| 道路 | 每個路段產生一個 Mesh 片段，再依地形 Chunk **合併**成一個 `BufferGeometry`（減少 draw call）；路口單獨產生 | 路網變更時重建受影響 Chunk |
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
