# WebCity

一款玩法與美術風格參考《Cities: Skylines》的城市建造模擬遊戲，以 Web 技術開發，支援 PWA 安裝，可在 iPhone、iPad、PC 上遊玩。

目前為 **M0-01 專案骨架**：顯示全螢幕深色 WebCity 啟動畫面。城市模擬、3D 渲染與 PWA 安裝將依任務卡陸續加入。

## 本機開發

使用 Node.js 24.15+（建議 Node 24 LTS）與 npm：

```bash
npm ci
npm run dev
```

開啟終端機顯示的網址；開發伺服器使用 `--host`，同一區域網路的手機也可連線。

```bash
npm run lint       # ESLint 模組邊界 + Prettier
npm run typecheck  # TypeScript strict
npm test           # 模組邊界回歸測試
npm run build      # 型別檢查 + 正式建置到 dist/
npm run preview    # 預覽正式建置
npm run e2e        # 先 build；啟動畫面四種 viewport 驗證與截圖
npm run icons      # M0-04 的佔位指令，尚不產生圖示
```

E2E 使用 Chromium。已有 Chrome／Chromium 時設定 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 為執行檔路徑；否則先執行 `npx playwright install chromium`。截圖輸出到 `test-results/`。目前只有骨架 smoke check；完整 Playwright 專案設定與遊戲互動測試由 M0-02 及後續任務擴充。

跨模組引用可使用 `@/`（對應 `src/`）或相對路徑。ESLint 依 TECH §2.1 檢查相依方向，且限制模擬層使用 DOM、Three.js、`Math.random()` 或 `Date.now()`。

## 開發流程

- `main`：主分支，永遠保持可運作的狀態。
- 每個功能使用獨立分支開發（例如 `feature/camera-controls`），完成後透過 Pull Request 合併回 `main`。
- 企劃與任務拆解請見 `docs/PLAN.md`。

## 文件

| 文件                               | 內容                                             |
| ---------------------------------- | ------------------------------------------------ |
| [`AGENTS.md`](./AGENTS.md)         | 給 AI 開發者的總規則（交給 AI 前請先讓它讀這份） |
| [`docs/PLAN.md`](./docs/PLAN.md)   | 企劃總覽                                         |
| [`docs/GDD.md`](./docs/GDD.md)     | 遊戲設計規格（玩法、數值、公式）                 |
| [`docs/ART.md`](./docs/ART.md)     | 美術規格                                         |
| [`docs/TECH.md`](./docs/TECH.md)   | 技術架構                                         |
| [`docs/TASKS.md`](./docs/TASKS.md) | 任務卡與給 AI 的提示詞範本                       |
