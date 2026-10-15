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

## 2026-10-13 正式發布

- 台北 19:54:13 建立、19:54:44 Ready。今日第 1 次部署嘗試；發布前同 team／project 的當日清單為空、無下一頁，發布後清單只有本次一筆，本機嘗試紀錄也只有一筆。
- 發布 commit：`b154ff3a5110418a6933dd9e8e8c227da9bd82e6`（PR #117 合併），tree `8ed07c9b047e510c9d8490510e62089fc3553856`，與本機通過測試的 tree 一致。包含 M5-03 第九至十三批；此段發布紀錄不另外部署。
- 使用既有已登入 CLI 從乾淨 checkout 發布至既有 `virus11456s-projects/webcity`。MCP 唯讀查詢仍回覆 scope 403，CLI 已確認專案；未更換專案或部署保護，未建立排程。
- Deployment：`dpl_4NE1VbqSNj5zaUuMtKYXZa5hinHF`；狀態 **Ready**，target **production**，遠端建置約 30 秒。
- 正式網址：https://webcity-theta.vercel.app/webcity/
- 本次版本網址：https://webcity-pk4revi6t-virus11456s-projects.vercel.app/webcity/
- 本機檢查：121 個測試檔、1,172 項單元測試、10 項效能測試、lint、typecheck、production build 通過。Vercel 遠端建置通過，保留既有 chunk 大於 500 kB 提醒。
- 實際瀏覽器驗證：套用 PWA 更新後，DOM 腳本為 `/webcity/assets/index-BM6BLGm8.js`，與本次建置一致。新城市地形預覽、遊戲畫面、教學與工具列成功載入；×1 運行時日期從 1/1 推進，最後在 3/22 暫停。瀏覽器未記錄 error／warn，沒有覆寫既有存檔。
- 此次只驗證發布載入及空城市基本運行，不能替代自然成長城市、GPU、其他畫質、iPhone 真機記憶體或每 tick 30 ms 的驗收；M5-03 仍未完成。

## 2026-10-13 第二次正式部署（瀏覽器驗證待補）

- 台北 21:27:27 建立、21:27:54 Ready，遠端建置約 26 秒。當日第 2 次嘗試；發布前當日清單一筆、發布後兩筆且無下一頁，本機嘗試記錄也恰為兩筆，今日不再部署。
- 發布 commit：`54033b1cdc8acd11606b4cf29261b77a5af50d6e`（PR #121 合併），tree `e1123443c94eaad52ca4c517add394fb780489a1`，乾淨 checkout 與本機測試內容一致。Vercel metadata 的 githubCommitSha 也一致，包含第十四至十六批。此發布紀錄不再部署。
- 既有 `virus11456s-projects/webcity`、project `prj_6yhBx3NgKW44C4bMJWBgKd8MsULy`，使用已登入 CLI；MCP 唯讀查詢仍回覆 scope 403，CLI 同 team／project 查詢成功。沒有更換專案、別名或部署保護，沒有建立排程。
- Deployment：`dpl_4yTn9SNMQ1nou7hdzpTRY4PYeH6m`；API 回報 **READY**、target **production**，別名包含 `webcity-theta.vercel.app`。
- 正式網址：https://webcity-theta.vercel.app/webcity/
- 本次版本網址：https://webcity-ohjpfki4e-virus11456s-projects.vercel.app/webcity/
- 本機 123 個檔案／1,183 項單元測試、12 項效能測試、lint、typecheck、production build 通過；遠端 build 通過，仍有既有 chunk 超過 500 kB 提醒。
- **遊戲頁面與 PWA 更新未驗證**：瀏覽器工具回報管理員安全檢查服務無法驗證政策，拒絕存取正式站。没有使用其他瀏覽器、HTTP 抓取或間接方式繞過。此次只確認 Vercel 控制平面 READY、commit 與別名；不可將它當作正式站實際載入／城市運行 smoke check 通過，也未取得瀏覽器錯誤紀錄。
- 待工具安全檢查恢復後補做既有頁面 PWA 更新、新城市載入與時鐘推進的唯讀／暫存 smoke check，不需要再部署。M5-03 的每 tick 30 ms、自然城市、GPU、其他畫質及 iPhone 真機記憶體仍未完成驗收。

## 2026-10-15 正式發布：精簡鎖定標籤

- 台北 11:29:31 建立、11:29:54 Ready，遠端建置約 22 秒。當日第 1 次部署嘗試；發布前同 team／project 的當日部署清單為空、無下一頁，發布後恰為一筆，本機嘗試紀錄也只有一筆。
- 發布 commit：`2571992404185cd98779445c399c0626e56342dc`（PR #129 合併），tree `2a0dc02bcb8d6436879970ea84817c263ba67b32`；乾淨 checkout 與本機通過測試的 tree 一致，Vercel metadata 的 githubCommitSha 相同。包含鎖定卡片／分類的 MS 標籤簡化、短按解鎖說明，以及先前尚未發布的累積修改。
- 既有 `virus11456s-projects/webcity`，project `prj_6yhBx3NgKW44C4bMJWBgKd8MsULy`。MCP 唯讀查詢回覆 scope 403，使用已登入 CLI 對相同 team／project 查詢及發布；未更換專案或部署保護，未建立排程。
- Deployment：`dpl_BMChTV8pTJaX84a1HRKHVDCqn1fQ`；控制平面 **READY**、target **production**，CLI 確認別名 `webcity-theta.vercel.app`。
- 正式網址：https://webcity-theta.vercel.app/webcity/
- 本次版本網址：https://webcity-nus0qj80j-virus11456s-projects.vercel.app/webcity/
- 本機 18 項 E2E、125 檔／1,193 項完整單元測試、lint、typecheck、production build 通過；遠端 build 通過，保留既有大於 500 kB chunk 提示。
- 瀏覽器安全檢查已恢復可用。在獨立暫存分頁點擊 PWA「有新版本，點此更新」後，DOM 腳本為 `/webcity/assets/index-C9Pwi47N.js`，與本機 dist 一致。新城市正常載入及推進日期，最後暫停於 1/8；工具分類與公共服務卡片不再顯示 MS 字樣，點鎖定墓園顯示「人口達到 1,200 人解鎖」，仍為 disabled。未手動儲存測試城市，完成後關閉暫存分頁，保留原遊戲分頁。
- 該分頁瀏覽器 error／warn 紀錄為空；此靜態網站未另外執行伺服器日誌、Drains 或長時間監控驗收。本次線上 smoke check 不代表 Safari 真機、十萬人口或 M5 全矩陣通過。這份發布紀錄不再部署。
