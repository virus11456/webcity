# AGENTS.md — 給 AI 開發者的總規則

你正在開發 **WebCity**：一款玩法與美術風格參考《Cities: Skylines》的 3D 城市建造模擬遊戲。
用 TypeScript + Three.js 開發，是可安裝的 PWA，要能在 iPhone、iPad、PC 上順暢遊玩。

## 1. 必讀文件（依順序）

| 文件 | 內容 | 何時讀 |
|---|---|---|
| `docs/PLAN.md` | 企劃總覽、範圍、里程碑 | 第一次參與時 |
| `docs/TASKS.md` | 任務卡（你要做的事） | 每次接任務 |
| `docs/GDD.md` | 玩法規格與所有數值公式 | 做玩法 / 模擬相關任務 |
| `docs/ART.md` | 美術規格：色板、尺寸、光照、模型規範 | 做渲染 / UI / 素材相關任務 |
| `docs/TECH.md` | 架構、資料型別、訊息協定、模組邊界、效能預算 | **每個任務都要讀** |

文件之間的優先順序：**TECH（架構）> GDD（玩法）> ART（美術）> PLAN（總覽）**。發現矛盾時，依此順序判斷，並在 PR 說明中列出。

## 2. 工作流程

1. 一次只做**一張任務卡**，不做任務卡範圍以外的功能、不順手重構無關程式碼。
2. 從最新 `main` 建立任務卡指定的分支（`feature/{任務ID小寫}-{簡述}`）。
3. 開發 → 本機驗證（見 §4）→ commit → push → 開 PR 到 `main`。
4. **不要直接 push 到 `main`**，不要 force-push 到別人的分支。
5. PR 標題：`[M1-05] 道路工具（直線）`。PR 說明使用以下格式：

```markdown
## 任務
M1-05 道路工具（直線）— docs/TASKS.md

## 變更內容
- ...

## 驗收標準
- [x] 桌機與觸控都能鋪出道路，費用正確扣除
- [x] ...

## 截圖（UI / 視覺相關任務必附）
| iPhone | iPad | Desktop |
|---|---|---|

## 待確認事項
- （文件不清楚、你自行做的決定）
```

6. Commit 訊息：`feat(roads): add straight road tool`（type：feat / fix / perf / refactor / test / docs / chore）。

## 3. 架構硬性規則（違反會被退回）

- **模組邊界**：遵守 TECH §2.1。`src/sim/` 不可使用 DOM、`window`、Three.js、`Math.random()`、`Date.now()`。
- **Worker 是唯一權威**：主執行緒不可直接修改世界狀態，一律送 `Command`（TECH §3、§5）。
- **數值集中**：所有平衡數值放在 `src/data/`，程式碼中不可出現魔術數字。修改數值要同步更新 `docs/GDD.md`。
- **色彩集中**：顏色一律來自 `src/data/palette.ts`（對應 ART §2）或 `src/ui/styles/tokens.css`。
- **文字集中**：UI 文字一律用 `t('key')`，不可把中文寫死在元件中。
- **依賴**：不可加入 TECH §1「禁止」清單中的套件；新增任何 runtime 依賴要在 PR 說明理由。
- **型別**：`strict` 模式，不使用 `any`。
- **效能**：渲染迴圈中不可每幀建立新物件；大型重建要分幀（TECH §10）。
- **版權**：不可使用、描摹或重製 Cities: Skylines（或其他商業遊戲）的模型、貼圖、圖示、音效、名稱。外部素材只能用 CC0 或允許商用的授權，並記錄在 `public/assets/CREDITS.md`。

## 4. 提交前必須通過

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run e2e        # 有 UI / 互動變更時
```
- 新增的 `core/`、`world/`、`sim/` 程式碼必須有單元測試。
- UI / 視覺變更要用 Playwright 產生 iPhone 15、iPad Pro 11、Desktop 1440×900 三種截圖附在 PR。
- 觸控相關功能要說明如何驗證（Playwright 觸控模擬或實機）。

## 5. 跨裝置要求（每個 UI 任務都要檢查）

- 可點元件 ≥ 44×44 px；文字 ≥ 12px。
- 使用 `env(safe-area-inset-*)`，不被瀏海與 Home Bar 遮擋。
- iPhone 直式、橫式都要能操作；不可出現頁面捲動、回彈、雙擊縮放。
- 雙指手勢永遠控制鏡頭，單指交給目前工具（TECH §7）。

## 6. 遇到問題時

- 文件沒寫到的細節：選最接近 Cities: Skylines 體驗、且最簡單的做法，寫在 PR「待確認事項」。
- 任務太大：先完成驗收標準中的核心項目，剩餘部分在 PR 說明列為後續任務建議，不要擅自擴大範圍。
- 發現其他任務的 bug：在 PR 說明提出，不要在本 PR 修改無關檔案。
