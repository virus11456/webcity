# M1-03：道路圖資料核心

本卡實作 `world/roadGraph.ts`，供後續 Worker 鋪路驗證、吸附及路口 Mesh 使用。M1-05 已將 `buildRoad` 接入 Worker 與可操作工具，並提供暫時的道路色帶；完整道路 Mesh 屬 M1-06。整合見 `docs/ROAD_TOOL.md`。

## API

| 方法                                                                   | 行為                                               |
| ---------------------------------------------------------------------- | -------------------------------------------------- |
| `new RoadGraph(firstId = 1)`                                           | 指定第一個可用 ID，節點與路段共用遞增序列          |
| `addRoad({start,end,type,builtDay,startHeight?,endHeight?,elevated?})` | 加入直線道路並自動切割同高度交叉路段               |
| `addNode(pos,height = 0)`                                              | 新增或重用節點；若位於同高度道路內部，同時切割道路 |
| `addSegment(startId,endId,options)`                                    | 連接既有節點，仍執行完整交叉與拓撲檢查             |
| `splitSegment(id,pos)`                                                 | 精確在路段上插點，內插高度；端點直接重用           |
| `removeSegment(id)`                                                    | 刪路段，更新鄰接並移除失去所有道路的端點           |
| `removeNode(id)`                                                       | 只允許刪除孤立節點，拒絕直接刪除有道路相連的節點   |
| `getNode` / `getSegment` / `neighbors`                                 | 回傳資料副本；鄰接包含另一端節點與路段方向         |
| `snapshot()`                                                           | 回傳完整副本與 nextId，按 ID 排序                  |

所有成功操作回傳 `RoadGraphChange`，其 added / removed / nodes / removedNodes 可直接包成 `roadsChanged` 事件。拆開的舊路段 ID 進入 removed，替代路段取得新 ID，仍保留原道路種類、建造日、單行方向及 elevated。新增節點另回 nodeId。

## 驗證與原子性

- 先在獨立草稿完成全部新增、切割、鄰接與角度檢查，成功才替換權威圖。失敗連 nextId 都不改變。
- 最短 16 m、最小夾角 30° 來自 `data/roads.ts`。最短限制適用切割後每一段，不能因總長夠長而留下 8 m 的碎路段。
- 同高度正長度共線重疊一律拒絕，包含同向、反向、部分重疊和完整包覆；只碰到一個端點可接續。
- 同一平面內多重交叉重用同一節點，處理十字、T 字、既有路口及沿路的孤立節點。
- 高度沿端點線性內插。不同高度交叉不連接；同平面投影的上下道路只在整個重疊範圍保持分離時可共存。橋梁淨空、地形坡度、土地權限、水域及造價留待對應幾何／橋梁任務。
- 直線以三次貝茲保存，控制點位於端點的三等分處。此 API 不接受曲線控制點；曲線交點須在後續曲線任務擴充。
- 座標限於 4800 m 世界邊界內，輸入座標／高度必須有限；道路種類、非負整數建造日及 ID 範圍均檢查。
- `data/roadGraph.ts` 僅存浮點誤差容許值。1e-6 m 的節點合併是數值容差，沒有提前實作 M1-04 的 8 m 接點吸附。
- 路口若至少 3 個分支各有 4 車道以上，預設 control=lights，其他 none。刪除分支後重新判定；手動路口號誌設定屬後續功能。

錯誤為 `RoadGraphError`，code 包含 invalidInput、missingNode、missingSegment、nodeConnected、tooShort、angleTooSmall、overlap。之後工具層可將 code 對應至本地化提示。

## 整合界線

此類別由呼叫端持有，公開輸入與回傳資料均不洩漏可變權威狀態；加入 Worker 時，呼叫端須以 SimState 的全域 nextId 協調建築等其他實體的 ID。此次只生成空 zoneBlockIds，尚未加入分區所有權、存檔還原或自動地形平整。

目前採掃描道路／節點及交易副本，操作在建造時執行，沒有放入 render frame 或每個 simulation tick。驗證包含 100 個交叉路口的確定性網格；大城市的空間索引與效能基準仍需隨後續工具整合評估，沒有宣稱通過 10 萬人口效能要求。

## 測試

涵蓋十字、正反向 T 字、多路段交叉、穿過既有四向路口、孤立節點接入、手動切割、單行方向與高度內插、共線重疊、16 m／30° 邊界、多次切割失敗回復、上下跨越、預設號誌、刪除與鄰接、資料副本、非法輸入及 ID 耗盡。另驗證變更事件經 WorldMirror 套用後仍與權威圖一致。
