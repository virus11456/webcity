# M3-05 陰影

高畫質維持 3 級 CSM／2048，加入 CSM 原生 fade，使級距交接與最遠陰影淡出更平順。中畫質維持 1024、600 m 投影範圍，跟隨焦點並在光源影像平面以貼圖 texel 對齊，避免亞像素平移造成陰影閃動。投影中心最大誤差小於 0.5 m，不改變光照方向或相機焦點。低畫質關閉陰影。

保留 ART 規定 bias -0.0005、normalBias 0.02、暖色太陽與半球環境光。Three 0.186.1 的 PCFSoftShadowMap 已移除，因此繼續使用 PCFShadowMap；未加入額外陰影依賴。CSM 更新後仍安裝地形、水面、建築及資訊圖層 hooks，切換畫質先釋放舊燈光及 shadow maps。

驗證涵蓋級距 fade 定義、陰影資源釋放、投影中心穩定性與大幅移動後仍跟隨。瀏覽器測試三裝置的高／中／低畫質、移動鏡頭、旋轉 viewport，並人工檢查屋頂、牆面與道路的陰影瑕疵；實際 WebGL draw calls、重新縮放、context loss 恢復由既有 renderer E2E 覆蓋。裝置是 Chrome viewport 模擬。
