# 發布節奏與額度

使用者於 2026-10-11 要求持續完成 M4，但 Vercel 每天只部署兩次，避免浪費額度。採用每天最多兩次（台北時區），沒有待發布變更就不部署；GitHub 提交、PR 與合併仍按每張任務卡完成時進行。

`vercel.json` 設定 `git.deploymentEnabled: false`，關閉 push、PR、merge 引起的自動部署。這是 Vercel 官方支援的設定：[Git configuration](https://vercel.com/docs/project-configuration/git-configuration#turning-off-all-automatic-deployments)。

發布前先完成本機測試並檢查當日專案部署紀錄，合併計算 preview、production 和失敗嘗試。不得以建立新專案、換別名或增加重試繞過上限。不確定當日次數就先保留版本，不送部署請求。兩次是上限而非排程；目前沒有建立定時自動部署。

發布後記錄台北時間、commit、結果、URL；只有 READY 且實際開啟驗證過才宣稱正式站更新。當次數已滿，持續開發 GitHub 版本並清楚區分正式站。

已知狀態：2026-10-11 03:34 的部署嘗試遇到 `api-deployments-free-per-day`，平台要求等待 24 小時。當日已有大量先前部署，因此 10 月 11 日不再發出部署請求。最後已確認 READY 的正式版本為 M3-10（`d9e537809637a782682255abebcd1edaab7fd4ab`）；不得把後續 GitHub 合併當作部署成功。

2026-10-11 23:25 左右唯讀複查：Vercel MCP 對既有 scope 回覆 403；使用已登入 CLI 確認目標為 `virus11456s-projects/webcity`（`prj_6yhBx3NgKW44C4bMJWBgKd8MsULy`）後成功查詢。最近清單已有多筆當日 production／preview，超過每日兩次上限，因此本輪沒有建立任何部署。最新觀察到的既有正式部署為 `dpl_2qheQ4sf1iikdbpAnpGCWps23tnb`，台北時間 11:09:20 建立、CLI 狀態 READY、別名包含 `webcity-theta.vercel.app`，URL 為 https://webcity-4suwokqi8-virus11456s-projects.vercel.app 。此資訊更新上段較早的發布觀察，但本輪未驗證它的 commit 與瀏覽器內容，也不是本輪效能修改的部署成果。使用者已授權本批完成後可部署；後續仍需遵守每日上限與平台限制，沒有建立排程。

2026-10-12 凌晨唯讀檢查：MCP 仍回覆既有 scope 的 403；改用已登入 CLI，明確指定同一 team／project，以 `/v7/deployments` 的 `since=1791734400000`（台北 10 月 12 日 00:00）查詢，回覆 `deployments: []`、`count: 0`、`next: null`。本輪沒有本機部署嘗試。每日次數雖已換日，前述平台要求等待 24 小時的期限要到台北 10 月 12 日 03:34 才滿，因此本輪未發送部署請求。期限屆滿也須先重新查詢當日次數，不能直接把等待結束當成部署成功；本輪沒有建立排程。

2026-10-12 01:33 左右再次唯讀確認：MCP scope 仍為 403，同 team／project 的已登入 CLI 回覆今日部署零筆、無下一頁。第四批服務覆蓋效能修改沒有發送部署請求；平台 03:34 等待期限尚未滿，未建立排程。
