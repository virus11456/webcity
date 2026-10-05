# M1-01：模擬 Worker 與通訊

## 本次可操作範圍

正式頁面提供暫停、×1、×2、×4。只有收到 Worker 的 `ready` 才啟用控制；按鈕選取狀態來自 Worker 的 `clock` 回覆。鏡頭聚焦時可用空白鍵暫停／以 ×1 繼續，數字 1、2、3 對應 ×1、×2、×4。暫停不影響探索鏡頭或水面視覺動畫。

這是模擬核心，不代表城市經營已完成。畫面上的街區仍為 M0 展示模型；權威新城市的建築、人口與路網為空，沒有把展示房屋冒充可經營資產。日期、每日／每週鉤子與每日統計屬 M1-02；可建道路、分區、人口、公用事業與公共服務依 TASKS 後續卡實作。

## 執行與權威

- `main.ts` 建立獨立 module Worker，再注入 `SimClient`；bridge 不依賴 sim 實作。
- `Simulation` 可在 Node 直接建立，持有私有 `SimState`；遊戲運算不讀取瀏覽器或實際時鐘。`tick()` 執行一步，暫停時不執行；`advance(ms)` 累積固定步長。
- ×1 每步 240 ms，每天 10 步；×2 與 ×4 分別消耗 120 / 60 ms。速度變更保留已累積的不足一步時間；暫停期間不累積。
- Worker 每 20 ms 喚醒，用 `performance.now()` 計算經過時間。收到指令前先以舊速度計入上一段時間；建立地圖耗時不算模擬時間。
- 單次補進最多 250 ms，避免背景分頁、電腦休眠後無限追趕。背景計時器受瀏覽器節流時遊戲可能慢於實際時間；不承諾離線經過多久城市就成長多久。
- 每次執行固定步長批次後傳一次精簡 `clock`，不重傳大地圖。日／日內 tick 是零起算計數，尚未做日期 UI。
- 新城市依 seed / mapId 建地形，中央一塊土地、一般 $70,000／簡單 $200,000、9% 稅率、100% 部門預算。沙盒記錄 mode 並開啟全部里程碑；扣款等實際規則留待經濟系統。

## 訊息與鏡像

`bridge/protocol.ts` 定義 TECH §5 全部指令與事件。所有請求由 `SimClient` 配給唯一正整數 `reqId`，包含 init 和 setSpeed；`ready` 也帶 reqId。`send()` 回傳 `Promise<Response>`，Response 是 result / ready / saved / inspectResult 的 discriminated union，保留各種回覆的 payload。

目前只執行 init、setSpeed。未初始化回 `err.notReady`；錯誤參數回 `err.invalidCommand`；未實作的建造、存讀檔等指令回 `err.notImplemented`，不假回成功。無法關聯請求的非法 reqId 回 error。再次 init 原子地替換城市，無效 init 保留原城市。

`WorldMirror` 套用完整 snapshot、路網／分區／建築／管線差異、場資料與車流。接收即套用，再發出訂閱通知，不等渲染迴圈；WebGL 中斷不會堵住訊息回覆。公開 snapshot 與 typed arrays 都是副本，clock 是凍結的小物件。傳輸錯誤會停用控制、結束 Worker 並拒絕待處理 Promise；請求逾時為 15 秒。HMR 清理會取消訂閱、關閉 Worker、清除所有待處理計時器。

未明訂的 wire 型別採最小明確格式：RoadDraft 為四個三次貝茲控制點與 elevated；networksChanged 以 power / water 分流，包含新增管線及刪除 ID；FieldName 含四種環境場與 coverage.service；inspect 回覆採 building / segment / network union；notify.kind 為 info / warning / danger。實際幾何與查詢驗證由後續任務實作。M2 市民及 M4 運輸線／行政區暫以空 `never[]` 保留，尚未定義完整玩法 schema。

## 驗證

- Node 測試：固定 seed、初始模式、可直接 tick、各倍速、暫停與小數步保留、長時間補算上限、非法輸入、狀態副本隔離。
- 協定測試：初始化、重設、拒絕未實作功能、請求關聯、逆序回覆、取消訂閱、逾時、Worker 錯誤與清理。
- 瀏覽器測試：確實建立 Worker，桌機／iPhone／iPad 上切換速度與暫停，暫停可移動鏡頭，快捷鍵，44 px 操作目標，手機橫式，以及 PWA 離線重載後 Worker 重新初始化並能暫停。
- Worker bundle 包含於 service worker precache，不依賴外部 CDN。此階段沒有存檔，重新整理會建立新城市。
