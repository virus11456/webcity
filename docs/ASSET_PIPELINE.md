# M3-01 素材管線

模型現在可以從原始 GLB 經 Meshopt + KTX2 壓縮、加入清單，再透過遊戲的素材工坊載入。工坊網址：`/webcity/?asset-gallery=1`。這張卡建立載入管線及一個原創測試住宅；城市中的正式住宅替換屬 M3-10。

## 產製

需要 Node 24、`npm ci`、[KTX-Software 4.4+](https://github.com/KhronosGroup/KTX-Software/releases) 的 `ktx` 在 PATH。一般遊戲 build 不需要安裝 KTX；已壓縮的素材直接納入版本控制。

```sh
npm run assets:sample
npm run assets:compress -- assets-source/bld_rl_l2_2x2_sample.glb /tmp/sample.glb
node scripts/registerAsset.ts /tmp/sample.glb bld_rl_l2_2x2_sample
npm run dev
```

- `assets:sample` 可重現原創住宅，1 單位 1 公尺、地面／正面中央原點、+Z 朝道路；包含斜屋頂、窗戶立面、草坪、步道。
- 壓縮腳本用 glTF Transform 4.5.1：先 ETC1S（quality 255）再 Meshopt medium，最後 glTF validator。中途失敗不覆寫成品、不刪原檔。Validator 不認得壓縮 extension 的提示以實際瀏覽器解碼補驗。
- `registerAsset.ts` 僅用於本專案原創素材；SHA256 前 12 位作檔名。修改素材產生新網址，避免 CacheFirst 讀到舊內容。第三方素材需先補正作者及授權清單。
- Atlas／LOD 規格沿用 ART §7.2；本次樣品只驗證 LOD0 管線，完整 LOD 和全城批次渲染由後續模型任務實作。

## 載入與生命週期

`render/assets.ts` 使用 GLTFLoader、MeshoptDecoder、KTX2Loader；KTX2 先偵測 GPU 支援，只啟用一個解碼 Worker。解碼 JS/WASM 隨 Vite 打包到本站，無 CDN 依賴。素材清單做版本、重複 ID、內容雜湊路徑、作者及授權驗證。

同 ID 的並行下載與解碼共用 Promise；載入失败移除快取，可再次重試。每次回傳獨立 scene clone，但共用 GPU 幾何／材質／貼圖；呼叫者不得自行釋放共享資源。移除所有 clone 後呼叫 library.dispose；清理等候中的解碼、資源只釋放一次。工坊離開、HMR、WebGL context loss 及背景頁暫停均有處理。

PWA 預快取 manifest 及 decoder JS/WASM；實際用過的內容雜湊模型進入既有 media CacheFirst，首次成功下載後可離線再載入。未看過的模型不承諾離線可用。

## 驗證與限制

Vitest 驗證清單輸入、防止越界 URL、實際 Meshopt/Basis extension 與 KTX2 位元標頭、共享資源清理。Playwright 以 iPhone 15、iPad Pro 11、Desktop 測試 HTTP 503 → 重試成功、記憶體快取、真正 WebGL 顯示、斷線重新載入；手機另驗證橫式與觸控按鈕。屬 Chromium 裝置模擬，實機 Safari 留待 M5。

新增依賴全是 devDependencies：glTF Transform CLI/core 和 Sharp；遊戲 runtime 使用已有 Three.js。Sharp 使用修補版 0.35.5。CLI 的 micromatch/braces 尚有未修補的開發工具 glob 拒絕服務通報；壓縮腳本不接受外部 glob，僅處理作者選定的本機 GLB；沒有加入遊戲 bundle。

參考：[glTF Transform CLI](https://gltf-transform.dev/cli)、[Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)。
