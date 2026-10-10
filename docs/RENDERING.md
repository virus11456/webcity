# 渲染基礎（M0-07）

M0-07 最初使用地面與 24 m 方塊測試光照；M0-10 已替換成有山地、河流、街廓與建築的城市展示（見 `TERRAIN.md`）。RTS 相機模型已由 M0-08 接入（見 `CAMERA.md`），正式輸入綁定由 M0-09 提供，地形由 M0-10 提供。預覽尺寸集中在 `src/data/rendering.ts`，色彩來自色板。

- `render/renderer.ts` 管理 Three.js WebGL2、場景、生命週期、resize 與 DPR。使用 sRGB 輸出、ACES tone mapping、曝光 1.0；初始 JS 約 146 KB gzip，低於 TECH §10 的 400 KB 目標。
- `render/lighting.ts` 使用 ART §4 的白天太陽／半球光。高畫質 3 段 CSM（2048）、中畫質單張 1024（600 m 範圍）、低畫質無陰影。使用此版本 Three.js 支援的 `PCFShadowMap`。
- `render/sky.ts` 提供無貼圖的天頂／地平線 Shader 漸層及太陽光暈。日夜循環、移軸、FXAA、SSAO、Bloom 留由相應 M3 任務實作；`QUALITY.postprocessing` 是目標設定，尚未啟用。
- 縮放或旋轉視窗會同步畫布像素大小、相機 aspect 與 CSM frustums；每幀檢查 DPR 變化。向量及 stats 物件重用；debug DOM 每 500 ms 才更新。切到背景停止繪製並排除該段效能取樣；WebGL context 遺失顯示狀態並於恢復後繼續。
- `main.ts` 組合渲染與 UI；`ui/debug.ts` 不匯入 Three.js 或 render 模組。開發熱更新會釋放 RAF、observer、事件、陰影貼圖、geometry、material 與 renderer。

## 畫質

- `?quality=low|medium|high` 強制指定，強制設定不受 FPS 降級影響。
- 自動：舊款 iPhone GPU（可讀到 Apple A5–A11）採低；一般行動裝置採中；桌機採高。iPad Pro 使用已知 GPU 名稱或螢幕邏輯尺寸推測，瀏覽器遮蔽硬體資訊時不保證準確，可用網址覆寫。
- 首個完整、可見的 5 秒樣本若平均 FPS < 30，自動降到低畫質一次。切背景／context 變更重新開始未完成的樣本。
- 實際 pixel ratio = `min(裝置 DPR × resolutionScale, maxDpr)`。低畫質上限 1.5，中／高上限 2。

## 驗證

`?debug=1` 顯示實際 FPS、draw calls、三角形與目前畫質／DPR。呼叫數與三角形包含陰影 passes：M0-07 方塊測試場景低／中／高分別有 3／4／6 次繪製（未受視錐裁切時）。目前 E2E 在 WebGL 的 indexed／non-indexed、instanced／non-instanced 四種 draw 呼叫另外計數，與面板數值比對。

- 254 項單元測試通過，涵蓋畫質推測、URL override、DPR、五秒採樣、光照建立／清理和天空；既有核心覆蓋率維持 100%。
- iPhone 15、iPad Pro 11、Desktop 各自通過渲染、尺寸旋轉、畫質覆寫、context 遺失／恢復，以及既有 PWA 安裝、離線重載與更新測試，共 18 項 E2E。
- `docs/screenshots/m0-07/` 保存三裝置與 iPhone 橫式截圖，使用強制高畫質來展示陰影；效能數字來自桌機 Chrome 模擬，不能代表 iOS 實機效能。
- 本機 agent-browser 確認畫面載入、方塊可見、無 Vite 錯誤頁。沒有新增 runtime 依賴。
