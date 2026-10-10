# M3-17 音效與環境混音

Web Audio 管理器持有單一 AudioContext、主音量／操作音效／環境音三個 gain bus，最多 16 個短音同時播放。首次 pointer 或鍵盤手勢才建立並 resume；沒有手勢不自動播放。切到背景時立即 suspend，停止短音，回前景嘗試 resume，若平台阻擋則下次手勢重試。遵循 [MDN Web Audio 最佳實務](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)。

六種原創 UI／建設音效：柔和點擊、放置低音、拆除碎裂、鋪路滑動、里程碑和弦、錯誤低音。音效由已確認的世界事件觸發，普通居民更新不播放建設音。解碼未完成時，首次按鈕仍有短柔音回饋。所有連線與音源在結束／卸載時釋放，載入以 AbortController 清理。

六種原創環境聲：風、車流、鳥、非語言人群、機械、水。每 0.5 秒取樣鏡頭焦點、高度、附近 active 工業／有人建築、地形相對海平面高度與實際車數，以 0.3 秒 gain 平滑混合；高空降低地面聲、增加風聲。沒有寫入模擬或加入 runtime 依賴。

`scripts/generateSfx.py` 使用固定 seed、正弦與雜訊合成，再透過建置工具 ffmpeg 編碼為 64 kbps OGG + MP3。每個檔案小於 50 KB，無外部錄音／人聲或歌曲。瀏覽器優先 OGG，解碼或下載失敗自動嘗試 MP3；失敗保持遊戲可操作。

音量設定即時生效並保存，舊設定補預設值，異常數值限制 0–100。音效素材進入既有 media CacheFirst，首次請求才下載。裝置自動播放驗證使用 Chrome iPhone viewport 觸控模擬，背景測試觸發瀏覽器 visibilitychange handler；實際 iPhone Safari 仍需實機驗證，不以模擬冒充實機。

驗證結果：lint、typecheck、build 通過，926 項完整單元測試通過，音效單元 4 項最終重驗通過。9 項三裝置音訊／主選單／電力回歸分批通過，手機橫式再驗 1 項通過；readStats 音訊分析器確認非零輸出與靜音後低於閾值。
