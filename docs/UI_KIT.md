# UI 基礎元件（M1-19）

`?ui-gallery=1` 是獨立的互動工坊。只載入 Preact 元件，不啟動 Three.js 或模擬 Worker；音量、分頁與通知皆為展示狀態，不代表已接入遊戲設定。既有城市入口不變，頂部列與工具列整合由 M1-20／M1-21 接續。

## 使用約定

UI 根節點引入 `ui/styles/ui-kit.css`，掛載一次 `IconSprite`，然後從個別元件檔案匯入。色彩、圓角、字級與觸控尺寸取自 `tokens.css`，共用排版定義於 `base.css`。新面板遵循 ART 的 8% 邊框；既有城市的 12% 邊框保留以避免改變舊介面。

- `Button`：原生按鈕，預設 `type=button`，primary／secondary／danger；loading 同時停用操作與設定 aria-busy。
- `Icon`／`IconSprite`：六個原創 24px、2px 線條 SVG symbol。圖案不承擔可存取名稱；`IconButton` 必填 label。
- `Panel`：可命名區域、標題、內容、選用關閉與底部操作。
- `BottomSheet`：受控 `open` 與 `onDismiss`，使用原生 modal dialog，Tab／Shift+Tab 在可用控制間循環；Esc、關閉、取消由呼叫端更新狀態，關閉後瀏覽器恢復原焦點。面板內可捲動並保留安全區。點背景不關閉，避免誤觸。
- `Slider`：原生 range，標籤、數值與單位；onInput 即時回傳數值。遊戲的確認、節流與送 Worker 指令由呼叫端負責。
- `Tabs`：受控 value，item id 必須唯一且只用英數／連字號。左右、Home、End 自動切換並跳過停用項目；呼叫端應提供至少一個可用項目及有效 value。
- `Tooltip`：資訊按鈕，滑鼠移入、鍵盤聚焦或觸控點擊皆可讀取；Esc、移出或失焦收起，說明保持在觸發區內。
- `Toast`：success 使用 status、error 使用 alert，不搶焦點；保留到手動關閉。排程、佇列與自動逾時不在本卡範圍。

所有可點目標最小 44×44 CSS px，平板放大到 48×48，內文 14px、小字 12px。工坊只在內容容器捲動，不產生頁面捲動。所有文案經 `t()`／`zh-TW`，未加 runtime 依賴。

## 版面 signal

`observeLayout()` 共用一組 resize 與 pointer media query listener；每個呼叫端必須在卸載時執行回傳的清理函式（可重複呼叫），最後一個訂閱解除後移除監聽。匯入 store 不存取瀏覽器全域，適用 Node 單元測試。

優先順序：

1. 高度 <500 且寬>高：phone-landscape。
2. 寬≥1024 且 pointer:fine：desktop。
3. 寬≥768：tablet（含大尺寸觸控裝置）。
4. 其餘：phone-portrait。這是窄版配置名稱，也涵蓋高度≥500 的窄橫式視窗。

## 驗證

單元測試涵蓋臨界尺寸、pointer 變更、resize、共用訂閱與重複清理。Playwright 在 iPhone 15、iPad Pro 11、Desktop 驗證滑桿、鍵盤分頁、停用狀態、Tooltip、焦點循環／恢復、成功／錯誤通知、面板重開、可點尺寸與頁面溢出；手機另驗旋轉與橫式面板。觸控是 Chromium 模擬，並非 Safari 實機。

驗證結果（2026-10-09）：lint、typecheck、build 與 682 項單元測試通過；完整回歸 85 項 E2E 通過、11 項裝置不適用略過。最後平板尺寸與焦點調整另補驗三裝置工坊。截圖見 `screenshots/m1-19/`。
