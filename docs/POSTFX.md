# 後製管線（M3-07）

中／高畫質使用 HalfFloat HDR EffectComposer：場景 → 高畫質深度 SSAO → 夜間 Bloom → 水平／垂直移軸 → ACES + sRGB → FXAA。低畫質直接渲染。切換畫質、resize 與 dispose 會釋放舊 pass／render target；不新增 runtime 依賴。

移軸依鏡頭相對焦點高度，在 60–150 m 平滑升至全強度，600–1,200 m 淡出；近地與全城視角保持清楚。SSAO 用真實深度重建視空間，8 個取樣、4 m 半徑、0.6 強度，避免 override material 讓自訂水面遮掉陸地。Bloom threshold 0.9、strength 0.6、radius 0.2，降低大尺度 mip 權重以保留密集窗戶間的牆面；只在夜間漸入。FXAA 在實際 DPR ≥ 2 時停用。

ART §4 指定中／高夜間 Bloom，§12 表格原漏列中畫質 Bloom，依較具體 §4 補正表格。沒有修改模擬、存檔或 UI 操作。

驗證：lint、typecheck、完整單元、build、三装置後製與 renderer E2E。`screenshots/m3-07/` 包含各畫質與手機橫式，以及 3 秒 rAF FPS 原始資料。中畫質夜景在本機 Chrome 三種 viewport 約 60 FPS；此為本機 GPU 模擬視窗，不代表 iPhone Safari 實機效能。
