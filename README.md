# WebCity

一款玩法與美術風格參考《Cities: Skylines》的城市建造模擬遊戲，以 Web 技術開發，支援 PWA 安裝，可在 iPhone、iPad、PC 上遊玩。

目前已完成 **M0-01 專案骨架與 M0-02 測試框架**：顯示全螢幕深色 WebCity 啟動畫面。城市模擬、3D 渲染與 PWA 安裝將依任務卡陸續加入。

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
npm test           # Node 環境的單元測試與模組邊界回歸測試
npm run build      # 型別檢查 + 正式建置到 dist/
npm run preview    # 預覽正式建置
npm run e2e        # 自動 build、啟動 preview、執行三種 viewport 測試及截圖
npm run icons      # M0-04 的佔位指令，尚不產生圖示
```

## 測試

Vitest 由 `vitest.config.ts` 設定，只在 Node 環境執行 `tests/unit/**/*.test.ts`，共用 Vite 的 `@/` 路徑別名。`tests/unit/i18n.test.ts` 為範例，可用 `npm test -- tests/unit/i18n.test.ts` 單獨執行。

Playwright 由 `playwright.config.ts` 設定，執行 `tests/e2e/**/*.spec.ts`。三個專案皆使用 Chromium：

| 專案        | Viewport | 裝置模擬     |
| ----------- | -------- | ------------ |
| iPhone 15   | 393×852  | 行動版、觸控 |
| iPad Pro 11 | 834×1194 | 行動版、觸控 |
| Desktop     | 1440×900 | 桌機         |

使用預裝的 Playwright Chromium，或將 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 設為既有 Chrome／Chromium 執行檔的絕對路徑。例如 macOS：

```bash
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
npm run e2e
npm run e2e -- --project='iPhone 15'
```

若沒有預裝瀏覽器，先自行執行 `npx playwright install chromium`；測試不會自動下載。每次 E2E 都重新建置，管理 `127.0.0.1:4173` 的預覽伺服器生命週期，避免測到其他程序或過期版本；該連接埠必須可用。

每個專案都會產生 `test-results/<測試與專案目錄>/shell.png`，並附在 `playwright-report/` 的 HTML 報告；可用 `npx playwright show-report` 開啟。失敗時另保留截圖與 trace。`CI` 模式禁止 `test.only`，使用一個 worker，失敗重試兩次。未來的 CI artifact 上傳由 M0-03 負責。

目前 E2E 範例檢查標題、全螢幕版面、背景與瀏覽器錯誤；遊戲互動測試會隨功能加入。行動裝置是 Chromium 模擬，並非 iOS Safari 實機驗證。

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
