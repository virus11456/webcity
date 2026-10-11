# 發布節奏與額度

使用者於 2026-10-11 要求持續完成 M4，但 Vercel 每天只部署兩次，避免浪費額度。採用每天最多兩次（台北時區），沒有待發布變更就不部署；GitHub 提交、PR 與合併仍按每張任務卡完成時進行。

`vercel.json` 設定 `git.deploymentEnabled: false`，關閉 push、PR、merge 引起的自動部署。這是 Vercel 官方支援的設定：[Git configuration](https://vercel.com/docs/project-configuration/git-configuration#turning-off-all-automatic-deployments)。

發布前先完成本機測試並檢查當日專案部署紀錄，合併計算 preview、production 和失敗嘗試。不得以建立新專案、換別名或增加重試繞過上限。不確定當日次數就先保留版本，不送部署請求。兩次是上限而非排程；目前沒有建立定時自動部署。

發布後記錄台北時間、commit、結果、URL；只有 READY 且實際開啟驗證過才宣稱正式站更新。當次數已滿，持續開發 GitHub 版本並清楚區分正式站。

已知狀態：2026-10-11 03:34 的部署嘗試遇到 `api-deployments-free-per-day`，平台要求等待 24 小時。當日已有大量先前部署，因此 10 月 11 日不再發出部署請求。最後已確認 READY 的正式版本為 M3-10（`d9e537809637a782682255abebcd1edaab7fd4ab`）；不得把後續 GitHub 合併當作部署成功。
