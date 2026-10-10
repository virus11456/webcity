# WebCity

[![CI](https://github.com/virus11456/webcity/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/virus11456/webcity/actions/workflows/ci.yml)
[![Deploy to GitHub Pages](https://github.com/virus11456/webcity/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/virus11456/webcity/actions/workflows/deploy.yml)

部署網址：[WebCity on Vercel](https://webcity-theta.vercel.app/webcity/)。

一款玩法與美術風格參考《Cities: Skylines》的城市建造模擬遊戲，以 Web 技術開發，支援 PWA 安裝，可在 iPhone、iPad、PC 上遊玩。

目前程式碼為 **M3 美術與音訊版**，包含 M1／M2 城市模擬：道路、住宅／商業／工業／辦公分區、四階段施工、逐人就業與上下班路徑、行人車流、水電污水、垃圾、警消醫療、教育、公園及殯葬服務。M3 加入正式模型、地形水面、日夜與陰影後製、LOD、特效、原創圖示、音效與六首串流音樂。正式站版本以 Vercel 最新成功部署為準。

## 開始建城

1. 主選單選「新遊戲」，命名城市、選河谷／海灣／山地與模式。一般模式 $70,000；簡單模式 $200,000；沙盒不扣建設費並解鎖現有建築。
2. 從預鋪匝道接出小路，再鋪幾條街道。桌機點起點／終點；觸控選終點後按「確認建造」。手機橫式使用左側分類列。
3. 選「分區」，在路旁填住宅、商業、工業。播放時間後會開工，依序呈現地基、結構、收尾與完工；住宅完工後每天移入家庭。
4. 放風力機並延伸電線。放水塔或河岸抽水站，水管可沿市區道路自動鋪設；污水排放口要靠岸、通電並接上同一水管網。人口增加後留意供應是否足夠。
5. 選「探索城市」點建築或道路看資訊。缺水、電、污水與工作等問題持續太久會造成廢棄；需求條、幸福度、就業與週收支顯示目前狀況。
6. 使用「存檔與讀檔」保存到 10 個手動槽之一；每五分鐘及切到背景會另存自動槽。暫停選單可即時調整畫質、陰影、後製、移軸、樹密度、日夜、音效與音樂，並儲存返回主選單。主選單「繼續最近的城市」載入最新存檔。

鍵盤：1／2／3 速度，4 道路、5 分區、6 電力、7 水務、8 拆除；Esc 取消當前工具操作。雙指控制鏡頭，單指使用當前工具。

存檔存在**目前瀏覽器的 IndexedDB**，不是雲端同步；清除網站資料會移除存檔。自動存檔是盡力而為，系統立即終止 App 時可能來不及完成，離開前可手動保存。

市民保有各自住家、工作與路徑，Worker 推進通勤、回家及服務車輛行程；畫面只插值實際位置。背景音樂首次操作後播放，音量歸零或切到背景會暫停。一般模式依里程碑解鎖，沙盒可試用現有高階設施。公車路線、地鐵運營等深度內容屬 M4，尚未納入本版。

[M3 美術驗收與六張展示圖](docs/ART_REVIEW.md) · [即時畫質設定](docs/QUALITY_SETTINGS.md) · [背景音樂](docs/MUSIC.md) · [素材與授權](public/assets/CREDITS.md)

詳見 [主選單](docs/MENUS.md)、[存檔格式](docs/SAVES.md)、[M1 整合驗證](docs/MVP.md)、[電力](docs/POWER.md)、[人口與就業](docs/POPULATION.md) 與 [分區成長](docs/GROWTH.md)。`?gallery=1`／`?district=1` 為獨立建築展示；`?play=1` 是保留給開發測試的空白城市入口。

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
npm run assets:audit # 檢查所有 GLB 命名、雜湊、LOD 面數並輸出驗收資料
npm run icons      # 純 Node 產生四種 PNG 圖示；build 也會自動執行
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

若沒有預裝瀏覽器，先自行執行 `npx playwright install chromium ffmpeg`；測試不會自動下載。每次 E2E 都重新建置，管理 `127.0.0.1:4173` 的預覽伺服器生命週期，避免測到其他程序或過期版本；該連接埠必須可用。

每個專案都會產生 `test-results/<測試與專案目錄>/shell.png`，並附在 `playwright-report/` 的 HTML 報告；可用 `npx playwright show-report` 開啟。失敗時另保留截圖與 trace。`CI` 模式禁止 `test.only`，使用一個 worker，失敗重試兩次。GitHub Actions 將截圖、報告與失敗 trace 上傳為 `playwright-results` artifact，保留 14 天。

E2E 覆蓋鏡頭、道路、分區、水電、人口、經濟、面板、存讀檔、新遊戲與完整城市流程。整合案例錄影需 Playwright ffmpeg。行動裝置是 Chromium 模擬，並非 iOS Safari 實機驗證。

## PWA 安裝、離線與更新

執行 `npm run build && npm run preview`，開啟 `/webcity/` 並等待首次 Service Worker 安裝完成。之後斷網重新整理仍可顯示啟動畫面。PWA 需要 HTTPS（本機 localhost 例外），開發模式不註冊 Service Worker。

- Chrome／Edge 可使用網址列的安裝功能；iPhone／iPad Safari 使用「分享 → 加入主畫面」。實機安裝與 iOS 行為仍需另行驗證。
- app shell、圖示、字型由 Workbox 預快取；模型和音效採 CacheFirst。第一次瀏覽之前仍需網路。
- 偵測到新版時顯示「有新版本，點此更新」；點擊後才切換並重新載入。「稍後」可繼續目前版本，重新開啟頁面會再次提示。
- 會向瀏覽器要求持久儲存；是否核准由瀏覽器決定，拒絕或不支援不影響畫面載入。
- `scripts/generateIcons.ts` 用 Node 內建 zlib 與 PNG 編碼產生原創天際線：192、512、512 maskable、180 apple-touch-icon。四種圖示皆為不透明深藍底，圖案位於 maskable 安全範圍，無原生圖像套件依賴。

PWA E2E 使用 Chrome DevTools Protocol 檢查 manifest 和可安裝性、實際離線重載，並以兩個真實 Service Worker 版本驗證延後／接受更新。可安裝性測試使用暫存的一般設定檔，避免無痕模式禁止安裝的限制；不會安裝到使用者的瀏覽器設定檔。

跨模組引用可使用 `@/`（對應 `src/`）或相對路徑。ESLint 依 TECH §2.1 檢查相依方向，且限制模擬層使用 DOM、Three.js、`Math.random()` 或 `Date.now()`。

## CI 與部署

- 正式站依使用者指定部署到 Vercel `virus11456s-projects/webcity`，每次發佈以已合併提交建置並驗證 `/webcity/` 資產與互動。
- 每次 push 與 PR 都執行 `.github/workflows/ci.yml`：`npm ci`、lint、typecheck、unit tests、build、三裝置 E2E，並上傳報告。
- `main` 有新提交時，`.github/workflows/deploy.yml` 先呼叫相同 CI 驗證，成功後才建置並發布 `dist/` 到 GitHub Pages。可手動重新部署 `main`；其他分支不會發布。
- Vite 的 `base` 設為 `/webcity/`，本機預覽與 E2E 也使用此子路徑，確保部署後資源網址一致。開發網址為 `http://localhost:5173/webcity/`。

若另外要啟用原規劃的 GitHub Pages，在儲存庫 **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。合併本任務與前置 PR 後，在 Actions 檢查部署結果；成功的部署會在 `github-pages` environment 顯示正式網址。若更改儲存庫名稱或使用自訂網域，需一併調整 Vite base 與 Playwright baseURL。

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

水務建造：點「水務」放置水塔／岸邊抽水站，接上電力後用水管連到住宅；「沿道路自動鋪水管」會先顯示缺少部分與總價，確認才扣款。污水排放口也要通電並接入同一水管網。水管模式顯示地下藍色管線與 48m 範圍，拆管會立即中止服務。詳見 [水務系統](docs/WATER_UTILITIES.md)。
