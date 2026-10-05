# 水面（M0-11）

河流現在有依水深變化的色彩、輕微透明與流動波紋；河岸按鈕可直接查看。城市仍是展示，供水／污水服務屬 M1 模擬，這張卡只完成可見水面。

## 實作

- `render/water/waterRenderer.ts` 擁有一張 301×301 單通道 Float32 高度貼圖與海平面高度的單一平面。貼圖直接引用地形高度陣列，無翻轉、無 mipmap。
- 片元讀取四個高度 texel，按地形 mesh 相同對角線做三角形插值，避免雙線性插值與真正地面交界不同。使用 nearest sampling，不依賴浮點 linear-filter 擴充。
- 依 ART 色板，0～3 m 使用淺水色，3～15 m 漸變至深水色；透明度 0.66～0.92。水深 ≤0.06 m 丟棄片元，近岸平滑淡出；保留 depth test、關閉 depth write，沒有多層重疊水面或頂點上下擾動。
- 8 m／40 m 兩個解析正弦波疊加成低強度波紋，第一層沿目前河道向 +z 移動；每幀只改一個共用 phase uniform，不建立新物件。背景恢復不補跑時間，delta 上限 50 ms，phase 在 2π 內連續循環。
- 與地形同樣使用 MeshStandardMaterial shader hook，先組合 CSM hook，再加水深與波紋；保留低／中／高畫質及橋梁陰影。重建畫質 shader 不會重設波紋或遺失高度貼圖。
- 地形 revision 改變時重新上傳高度貼圖。這不代表已接入地形編輯工具；M0-10 地形 mesh 的局部重建仍待工具任務。dispose 釋放貼圖、幾何與材質。
- 視覺參數集中於 `src/data/water.ts`。沒有新增 runtime 依賴、外部圖像或資產。

## 驗證（2026-10-06）

- lint、typecheck、production build、284 項單元測試通過。新增測試涵蓋高度貼圖方向／格式、海平面／depth 設定、CSM hook 組合、phase 共用、delta 限制、revision upload 與資源釋放。
- 三裝置共 30 項 E2E 通過（另 3 個不適用組合略過）：固定鏡頭前後畫素不同且無 shader 錯誤、既有城市導航、鍵鼠／觸控、三畫質、WebGL 恢復、PWA 離線與更新。
- 受控斜坡高度場的離屏 GPU 驗證：同一陸地像素加入水面前後相同；淺水 RGB [53,102,105]、深水 [14,26,46]，動畫後 12,074 bytes 改變。岸線裁切正確，未觀察到 Z-fighting。
- iPhone 393×852、DPR 2、中畫質、全圖距離 4000 m：約 60 FPS、54 calls、422,842 triangles（含陰影）。數據為桌機 Chrome 模擬，非 iOS 實機。
- 截圖見 `screenshots/m0-11/`：iPhone、iPad、Desktop 河岸及 iPhone 橫式。
- 上一版 #11 的 GitHub Actions 雲端 E2E 超時後被 15 分鐘 job 限制取消；本機硬體加速測試全部通過。CI 執行環境與 timeout 問題另追蹤，不將雲端結果標為通過。

## 後續

M3-03 才加入完整雙層法線貼圖、菲涅耳反射、泡沫與污染視覺。本次不修改供水／污水的遊戲公式，也不把 M1 公共設施任務標為完成。
