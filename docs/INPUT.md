# 輸入與手勢（M0-09）

目前可在 3D 預覽平地上操作鏡頭；測試方塊不是可建造的城市。道路、建築、模擬及物件拾取依後續任務開發。

| 操作                            | 效果                                                 |
| ------------------------------- | ---------------------------------------------------- |
| 點選畫布後 WASD／左鍵或中鍵拖曳 | 平移，速度隨鏡頭距離縮放                             |
| QE／右鍵拖曳                    | 旋轉                                                 |
| RF／Ctrl + 右鍵上下拖曳         | 仰角                                                 |
| 滾輪                            | 以游標下地面為中心縮放，支援 pixel／line／page delta |
| 單指拖曳（尚無工具）            | 平移                                                 |
| 雙指捏合／扭轉                  | 以中心點縮放／旋轉                                   |
| 雙指平行左右滑                  | 平移                                                 |
| 雙指平行上下滑                  | 仰角                                                 |
| 操作提示中的核取方塊            | 啟用／關閉 PC 邊緣捲動；預設關閉，不跨重新載入保存   |

## 分流與生命週期

`PointerInput` 僅捕捉畫布上的 Pointer Events，按下時 focus 畫布並捕捉 pointer。`Gestures` 處理 6 CSS px 拖曳門檻、550 ms 長按和多指接管；`CameraController` 透過 `main.ts` 在 renderer 的 `onBeforeFrame` 接收時間，不建立反向的 render → input 依賴。

同一幀的雙指 pointermove 合併後才判斷手勢，避免快速平行滑動被第一根手指暫時產生的角度差誤判為旋轉。超過縮放 6% 或旋轉 0.08 rad 先採 transform；否則位移超過 10 px，垂直大於水平兩倍時鎖定仰角，其餘鎖定平移／縮放／旋轉。模式固定到手指全放開，避免平移與仰角搶同一動作。相關參數集中在 `src/data/input.ts`。

長按後仍可拖曳鏡頭，但已取消的工具不會因後續抬指被提交。第二根手指落下即取消工具；雙指中抬起一指後，剩餘手指不恢復工具、不產生單指 tap。第三指加入會取消本輪，直到全數放開。失焦、背景、pointercancel、意外失去 capture、WebGL 中斷及 dispose 都清除未完成動作；鍵盤失焦立即清掉 held keys。輸入每幀最大步長 50 ms，避免卡頓後鏡頭跳躍。

`setTool` 接受結構化 `InputTool` 回呼；單指／左鍵交給工具、中鍵和右鍵維持鏡頭操作。tap、long press、Space 暫停與數字 1/2/3 速度透過 `InputOptions` 回呼預留給後續拾取與模擬，目前未綁定尚不存在的系統。數字鍵依 GDD §2 速度定義；PLAN 的工具快捷鍵敘述有衝突，採 GDD 優先。R 的工具旋轉分流留待工具卡整合。

鍵盤只在畫布聚焦時生效，保留表單操作、Ctrl／Meta／Alt 瀏覽器快捷鍵；空白鍵不會捲頁。操作提示避開 safe area，桌機可點標籤高 44 px，觸控模式顯示手機手勢說明。CSS `touch-action: none`、overscroll 與 overflow 設定禁止畫布拖曳造成回彈／頁面縮放。

## 驗證

- lint、strict typecheck、build 通過，無新增 runtime 依賴。
- 275 項單元測試，新增點擊／拖曳門檻、長按、雙指接管、快速平行滑動、捏合旋轉、第三指、取消與 stale event 回歸。
- 24 項 E2E 通過：既有渲染、鏡頭和 PWA 21 項，以及 Desktop 原生鍵鼠、iPhone／iPad 的 Chromium CDP 原生多點觸控。另 3 個不適用裝置組合略過。
- 檢查 page scale 保持 1、無捲動、iPhone 橫式尺寸更新、切換 focus 停止移動、邊緣捲動可關閉。截圖見 `screenshots/m0-09/`。
- 這是桌機 Chromium 裝置模擬，尚未驗證 iOS／Safari 實機手感。

## Vercel 部署

`vercel.json` 保留與 GitHub Pages 相同的 `/webcity/` 路徑，根目錄導向該路徑，資源與 Service Worker 由 rewrite 對應至 `dist`。使用登入的 Vercel 帳戶部署；`.vercel/`、環境檔、測試產物與本機憑證不加入 Git 或部署來源。
