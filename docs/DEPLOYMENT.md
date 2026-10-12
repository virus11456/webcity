# 發布節奏與額度

使用者於 2026-10-11 要求持續完成 M4，但 Vercel 每天只部署兩次，避免浪費額度。採用每天最多兩次（台北時區），沒有待發布變更就不部署；GitHub 提交、PR 與合併仍按每張任務卡完成時進行。

`vercel.json` 設定 `git.deploymentEnabled: false`，關閉 push、PR、merge 引起的自動部署。這是 Vercel 官方支援的設定：[Git configuration](https://vercel.com/docs/project-configuration/git-configuration#turning-off-all-automatic-deployments)。

發布前先完成本機測試並檢查當日專案部署紀錄，合併計算 preview、production 和失敗嘗試。不得以建立新專案、換別名或增加重試繞過上限。不確定當日次數就先保留版本，不送部署請求。兩次是上限而非排程；目前沒有建立定時自動部署。

發布後記錄台北時間、commit、結果、URL；只有 READY 且實際開啟驗證過才宣稱正式站更新。當次數已滿，持續開發 GitHub 版本並清楚區分正式站。

已知狀態：2026-10-11 03:34 的部署嘗試遇到 `api-deployments-free-per-day`，平台要求等待 24 小時。當日已有大量先前部署，因此 10 月 11 日不再發出部署請求。最後已確認 READY 的正式版本為 M3-10（`d9e537809637a782682255abebcd1edaab7fd4ab`）；不得把後續 GitHub 合併當作部署成功。

2026-10-11 23:25 左右唯讀複查：Vercel MCP 對既有 scope 回覆 403；使用已登入 CLI 確認目標為 `virus11456s-projects/webcity`（`prj_6yhBx3NgKW44C4bMJWBgKd8MsULy`）後成功查詢。最近清單已有多筆當日 production／preview，超過每日兩次上限，因此本輪沒有建立任何部署。最新觀察到的既有正式部署為 `dpl_2qheQ4sf1iikdbpAnpGCWps23tnb`，台北時間 11:09:20 建立、CLI 狀態 READY、別名包含 `webcity-theta.vercel.app`，URL 為 https://webcity-4suwokqi8-virus11456s-projects.vercel.app 。此資訊更新上段較早的發布觀察，但本輪未驗證它的 commit 與瀏覽器內容，也不是本輪效能修改的部署成果。使用者已授權本批完成後可部署；後續仍需遵守每日上限與平台限制，沒有建立排程。

2026-10-12 凌晨唯讀檢查：MCP 仍回覆既有 scope 的 403；改用已登入 CLI，明確指定同一 team／project，以 `/v7/deployments` 的 `since=1791734400000`（台北 10 月 12 日 00:00）查詢，回覆 `deployments: []`、`count: 0`、`next: null`。本輪沒有本機部署嘗試。每日次數雖已換日，前述平台要求等待 24 小時的期限要到台北 10 月 12 日 03:34 才滿，因此本輪未發送部署請求。期限屆滿也須先重新查詢當日次數，不能直接把等待結束當成部署成功；本輪沒有建立排程。

2026-10-12 01:33 左右再次唯讀確認：MCP scope 仍為 403，同 team／project 的已登入 CLI 回覆今日部署零筆、無下一頁。第四批服務覆蓋效能修改沒有發送部署請求；平台 03:34 等待期限尚未滿，未建立排程。

## 2026-10-12 正式發布

- 台北 20:29:39 建立，約 20:30 完成。今日第 1 次部署嘗試；發布前同 team／project 的當日清單為空、無下一頁，本機今日沒有其他嘗試。既有 03:34 等待期限已過。
- 發布 commit：`df35454721ad981faeffccbdfc5aa8faa01d9cb1`（PR #111 合併），tree `d51d17b1ed1972b55a0ebaeffce7bb82db7a3a3d`，與本機通過測試的 tree 完全一致。包含先前累積修改及 M5-03 第八批；此段發布紀錄不另外部署。
- 使用既有已登入 CLI 從乾淨 checkout 執行 production deploy。MCP 對既有 scope 的唯讀查詢仍回覆 403，CLI project inspect 已確認團隊與專案；沒有新建專案或改動部署保護。
- Deployment：`dpl_13URfcPn88257wDuf1Sni1LbYccJ`；CLI inspect 狀態 **Ready**，target **production**。
- 正式網址：https://webcity-theta.vercel.app/webcity/
- 本次版本網址：https://webcity-27w9wm3s0-virus11456s-projects.vercel.app/webcity/
- 本機檢查：1,124 項單元測試、5 項效能測試、lint、typecheck、production build 通過。Vercel 遠端建置也通過；仍有既有 chunk 大於 500 kB 提醒。
- 台北 20:30–20:32 實際瀏覽器驗證：先套用既有 PWA 的更新提示，DOM 腳本確認為 `/webcity/assets/index-BrlTIqP2.js`，與本機 dist／正式站 HTTP 回應一致。新遊戲地形預覽、新手教學、3D 地形與工具列成功載入；測試城市以 ×1 運行，日期由 1/1 前進到 1/15，之後暫停。瀏覽器未記錄 error／warn。沒有覆寫既有存檔。
- 此次為發布 smoke check，不代表 iPhone 真機效能、完整自然城市或 M5-03 所有效能預算已驗收；M5-03 保留未完成。
