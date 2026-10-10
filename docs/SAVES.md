# 城市存讀檔（M1-24）

提供 10 個手動槽及獨立自動槽。手動覆寫有第二次確認；存檔清單顯示城市名、人口、遊戲日、儲存時間與縮圖。每五分鐘及切到背景時自動儲存；瀏覽器突然被作業系統終止仍可能來不及完成最後一次非同步寫入，保留最近成功的槽。

格式為 `WCTY` 四位元組、little-endian uint32 版本、gzip 壓縮的 MessagePack。Float32Array / Int32Array 使用自訂 little-endian extension，Uint8Array 為 MessagePack binary。固定 key 排序與省略 undefined 保證同一快照的存→讀→存二進位一致。

Worker 原子取得快照及對應 metadata。壓縮期間城市可繼續運行；載入期間暫停接收修改指令，完整解壓、版本、型別、數值與拓樸檢查通過後才替換世界。損壞／不支援版本不覆寫現有城市。v1 是第一個正式格式，尚無需遷移的舊版存檔；未來版本由 migrations 擴充。

IndexedDB 的 metadata / data 寫入使用同一交易，空間不足不會只覆寫一半。縮圖失敗仍可存城市。載入使用明確選取的槽重新建立 Worker 和與城市相同 seed／地圖的 renderer；一般重新整理不會自動覆寫手動槽。資料只保存在目前瀏覽器，不是雲端同步。

新增 runtime 依賴 `@msgpack/msgpack@3.1.3` 與 `idb@8.0.4`，均為 TECH §1 原指定套件。Worker 進入點作為序列化轉接層，可注入 save codec；模擬系統與 CommandDispatcher 本身仍不依賴儲存／瀏覽器 API。UI 透過 game 提供的 SaveActions 操作，不直接存取 IndexedDB。

驗證：型別陣列與二進位往返、恢復後繼續同一個 tick、損壞／新版本／無效拓樸拒絕、載入中指令拒絕與失敗保留原城；三裝置實際建城→存檔→重新整理→讀檔，逐項比對人口、建築、分區與資金；背景事件驅動自動槽（可見性以明確 fixture 觸發，城市快照來自真實 Worker）。

API 依據：[MessagePack 官方實作](https://github.com/msgpack/msgpack-javascript)、[idb 官方文件](https://github.com/jakearchibald/idb)。

存檔採語意一致的正規格式：數字 `-0` 轉為 `0`，未設定的可選 `undefined` 欄位省略。實際城市數值、地形 typed arrays 與下一步模擬結果不變；整合 E2E 比較城市時正規化這兩類 JavaScript 表示差異。
