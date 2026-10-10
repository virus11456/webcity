# 模擬 Worker、通訊與遊戲時間

## 本次可操作範圍

正式頁面提供暫停、×1、×2、×4。只有收到 Worker 的 `ready` 才啟用控制；按鈕選取狀態來自 Worker 的 `clock` 回覆。鏡頭聚焦時可用空白鍵暫停／以 ×1 繼續，數字 1、2、3 對應 ×1、×2、×4。暫停不影響探索鏡頭或水面視覺動畫。

這是模擬核心，不代表城市經營已完成。畫面上的街區仍為 M0 展示模型；權威新城市的建築、人口與路網為空，沒有把展示房屋冒充可經營資產。M1-02 已加入日期、每日／每週鉤子與每日統計傳送；可建道路、分區、人口、公用事業與公共服務依 TASKS 後續卡實作。

## 執行與權威

- `main.ts` 建立獨立 module Worker，再注入 `SimClient`；bridge 不依賴 sim 實作。
- `Simulation` 可在 Node 直接建立，持有私有 `SimState`；遊戲運算不讀取瀏覽器或實際時鐘。`tick()` 執行一步，暫停時不執行；`advance(ms)` 累積固定步長。
- ×1 每步 240 ms，每天 10 步；×2 與 ×4 分別消耗 120 / 60 ms。速度變更保留已累積的不足一步時間；暫停期間不累積。
- Worker 每 20 ms 喚醒，用 `performance.now()` 計算經過時間。收到指令前先以舊速度計入上一段時間；建立地圖耗時不算模擬時間。
- 單次補進最多 250 ms，避免背景分頁、電腦休眠後無限追趕。背景計時器受瀏覽器節流時遊戲可能慢於實際時間；不承諾離線經過多久城市就成長多久。
- 每次執行固定步長批次後傳一次精簡 `clock`，不重傳大地圖。日／日內 tick 是零起算計數；日期控制列用同一份 Worker 時鐘換算，不另設 UI 計時器。
- 新城市依 seed / mapId 建地形，中央一塊土地、一般 $70,000／簡單 $200,000、9% 稅率、100% 部門預算。沙盒記錄 mode 並開啟全部里程碑；扣款等實際規則留待經濟系統。

## 訊息與鏡像

`bridge/protocol.ts` 定義 TECH §5 全部指令與事件。所有請求由 `SimClient` 配給唯一正整數 `reqId`，包含 init 和 setSpeed；`ready` 也帶 reqId。`send()` 回傳 `Promise<Response>`，Response 是 result / ready / saved / inspectResult 的 discriminated union，保留各種回覆的 payload。

目前執行 init、setSpeed 與地面直線 buildRoad。未初始化回 `err.notReady`；錯誤參數回 `err.invalidCommand`；其他尚未實作的建造種類、存讀檔等指令回 `err.notImplemented`，不假回成功。道路驗證、原子扣款與立即 fundsChanged 同步見 `docs/ROAD_TOOL.md`。無法關聯請求的非法 reqId 回 error。再次 init 原子地替換城市，無效 init 保留原城市。

`WorldMirror` 套用完整 snapshot、路網／分區／建築／管線差異、場資料與車流。接收即套用，再發出訂閱通知，不等渲染迴圈；WebGL 中斷不會堵住訊息回覆。公開 snapshot 與 typed arrays 都是副本，clock 是凍結的小物件。傳輸錯誤會停用控制、結束 Worker 並拒絕待處理 Promise；請求逾時為 15 秒。HMR 清理會取消訂閱、關閉 Worker、清除所有待處理計時器。

未明訂的 wire 型別採最小明確格式：RoadDraft 為四個三次貝茲控制點與 elevated；networksChanged 以 power / water 分流，包含新增管線及刪除 ID；FieldName 含四種環境場與 coverage.service；inspect 回覆採 building / segment / network union；notify.kind 為 info / warning / danger。實際幾何與查詢驗證由後續任務實作。M2 市民及 M4 運輸線／行政區暫以空 `never[]` 保留，尚未定義完整玩法 schema。

## 驗證

- Node 測試：固定 seed、初始模式、可直接 tick、各倍速、暫停與小數步保留、長時間補算上限、非法輸入、狀態副本隔離。
- 協定測試：初始化、重設、拒絕未實作功能、請求關聯、逆序回覆、取消訂閱、逾時、Worker 錯誤與清理。
- 瀏覽器測試：確實建立 Worker，桌機／iPhone／iPad 上切換速度與暫停，暫停可移動鏡頭，快捷鍵，44 px 操作目標，手機橫式，以及 PWA 離線重載後 Worker 重新初始化並能暫停。
- Worker bundle 包含於 service worker precache，不依賴外部 CDN。此階段沒有存檔，重新整理會建立新城市。

## M1-02：日期與系統排程

- 新城市 day=0 對應 2026-01-01；完成 10 ticks 後 day=1，日期為 2026-01-02。日期運算採 UTC 日曆，與玩家時區／夏令時間無關，支援跨月、跨年及閏日。
- `sim/systems/time.ts` 的 `TimeSystem` 每 tick 更新日期計數；日界線只觸發一次 onDay，在累計完成第 7、14、21…天另觸發 onWeek。第一個週結算觸發點為 2026-01-08 00:00，表示首七天已完整經過；初始時刻不結算。
- `Simulation.onDay(system)` / `onWeek(system)` 提供 Worker 內後續系統掛載；回傳取消訂閱函式。順序為每日系統 → 當週週結算 → 擷取當日 stats → 傳送事件。日／週邊界資訊為唯讀物件。
- stats 每個遊戲天傳一次，含當日的 day / money 及系統目前的統計值，並累積隔離副本至 statsHistory；WorldMirror 同步最新 stats 與歷史。初始 stats 隨 ready snapshot 傳送，不額外冒充一天的 stats 事件。
- 本卡沒有新增稅收、扣款或人口公式。初始空城市人口／需求／產消量為零、幸福度使用既有中性基準；實際成長與收支由後續系統更新。週鉤子可掛載結算，不代表現階段已經在賺取稅收。
- 日期列顯示日期、目前第幾週與週內第幾天；暫停／倍速沿用既有操作。只在遊戲日改變時更新日期文字，避免每個 tick 重複更新閱讀輔助提示。
- 新增單元測試涵蓋精確倍速天數、暫停、跨月／閏年、日週順序、訂閱取消、結算後統計、100 天排程、事件與歷史副本隔離，以及 init 重設鏡像。瀏覽器另量測 ×1 三個完整遊戲日的平均長度，要求與 2400 ms 相差不到 5%。
