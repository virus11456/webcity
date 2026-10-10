# M3-18 背景音樂

六首原創合成器樂，每首 3:12、AAC 128 kbps、44.1 kHz stereo：River Morning、Little Avenue、Sunlit Roofs、Garden Walk、Blue Hour、City Lights。以撥弦音色、鍵盤旋律、柔和長音與輕電子節奏構成；非現場樂器錄音，無外部採樣或引用歌曲。`scripts/generateMusic.mjs` 固定 seed 重建，`FFMPEG_BIN` 指向本機 ffmpeg 編碼工具，無新增 runtime 依賴。

只有一個 HTMLAudioElement，第一次手勢後透過 MediaElementAudioSource 接入既有 Web Audio 主音量與独立音樂 gain；不以 fetch／decodeAudioData 將長曲全量解碼，未選到的曲目不預下載。六首 shuffle bag 每輪各播一次，輪與輪交界不連續重複同首。ended 自動接下一首；網路錯誤最多跳六首後停止，之後手勢可重試。

音樂音量預設 35%，即時保存，音量歸零／主音量歸零或切到背景會暫停 media，回前景接續。瀏覽器拒絕 autoplay 時保持靜音並在下一次手勢重試。頁面卸載移除事件、media source 與 DOM。音樂 m4a 不進 PWA precache，也不由既有音效 CacheFirst 攔截，保留 HTTP Range 串流；離線不保證音樂可用，遊戲仍可遊玩。參考 [Workbox 音訊與影片快取說明](https://developer.chrome.com/docs/workbox/serving-cached-audio-and-video)。

Playwright 驗證首次互動前無音樂請求、只請求目前曲目、实际媒體時間前進、跳至曲尾後自然 ended 換曲、獨立音量及背景暫停。三裝置為 Chrome viewport／觸控模擬，Safari 原生實機仍待驗證。

驗證：928 項單元、6 項三裝置音樂與音效 E2E 通過，lint／typecheck／build 通過。四張裝置與橫式截圖已檢視。
