# 道路表面（M3-08）

單張原創 512² RGBA 貼圖以 R 儲存柏油顆粒、G 儲存交錯人行道磚。4 m 世界投影、0.5 m 磚、18 mm 磚縫；顏色沿用 ROAD_PALETTE，只小幅調變明度。重複取樣、mipmap 與 anisotropy，距離 80–350 m 淡出避免摩爾紋。單一材質保留既有分塊批次，沒有增加道路 draw call；各道路 renderer 擁有並釋放自己的約 1.33 MiB 含 mip 貼圖。

shader 依頂點原色分辨柏油／人行道；白黃標線、路緣、橋墩及草地不被紋理污染。CSM 回呼透過 Renderer.registerMaterial 組合，切換画質仍保留。世界座標投影讓路口與跨塊接縫連續，斜向人行道鋪面採全城一致方位。

標線已在 M2-02／05 實作：同向 3 m 實／6 m 空、四線以上黃色雙線、停止線與斑馬線。路燈沿用 M3-06 的 8 m 高、32 m 交錯配置，三個 instanced 批次與夜間地面光暈，不新增 PointLight。

驗證：完整單元、lint、typecheck、build；三裝置真實道路存檔近景與中景、路燈數量、WebGL shader 無錯。截圖見 screenshots/m3-08/，觸控裝置為本機 Chrome 模擬。
