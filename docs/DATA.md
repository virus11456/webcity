# 資料設定檔索引（M0-05）

所有設定為 `as const` 常數並匯出對應型別。道路／分區以物件 key 作為 ID，建築、管線、貸款、政策、功能與里程碑使用 `id`。`unlock` 為 `MilestoneId`；名稱由未來 UI 透過 ID 查詢翻譯，資料表不內嵌顯示文字。

| 規格中的數值表／章節                                            | 設定檔與常數                                                                                                                        |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| GDD §1.1 格子與地圖、§1.2 生成                                  | `config.ts`: `CELL_SIZE`, `TILE_CELLS`, `MAP_TILES`, `SEA_LEVEL`, `WORLD`, `TERRAIN_GENERATION`                                     |
| GDD §2 時間                                                     | `config.ts`: `TIME`                                                                                                                 |
| GDD §3.1 道路種類、§3.3–3.5                                     | `roads.ts`: `ROADS`, `ROAD_RULES`                                                                                                   |
| GDD §4.2 分區、§4.3 筆刷、§5.1 占地、§5.3 容量／教育、§5.4 升級 | `zones.ts`: `ZONES`, `ZONE_CODES`, `GROWTH`, `JOB_EDUCATION_PERCENT`, `UPGRADE_REQUIREMENTS`；色碼引用 `palette.ts`: `ZONE_PALETTE` |
| GDD §5.5 問題與廢棄                                             | `simulation.ts`: `PROBLEMS`, `PROBLEM_THRESHOLDS`, `ABANDONMENT`                                                                    |
| GDD §6 需求、§7.2 市民欄位／行程、§8 交通                       | `simulation.ts`: `DEMAND`, `CITIZENS`, `TRAFFIC`, `VEHICLE_TYPES`                                                                   |
| GDD §9.1 電力、§9.2 水／污水、§9.3 垃圾                         | `buildings.ts`: `BUILDINGS`, `NETWORKS`, `UTILITY_RULES`                                                                            |
| GDD §10 公共服務、§10.1 公園                                    | `buildings.ts`: `BUILDINGS`, `SERVICE_TYPES`；`simulation.ts`: `SERVICE_RULES`                                                      |
| GDD §11 環境場、§12 幸福度                                      | `simulation.ts`: `ENVIRONMENT`, `HAPPINESS`；場尺寸在 `config.ts`: `WORLD`                                                          |
| GDD §13.1 貸款／起始資金、§13.2 收入、§13.3–13.5                | `economy.ts`: `LOANS`, `ECONOMY`, `BUDGET_DEPARTMENTS`                                                                              |
| GDD §14 里程碑／地塊                                            | `milestones.ts`: `MILESTONES`, `FEATURES`, `TILE_PURCHASE`；各物件的 `unlock` 為解鎖來源                                            |
| GDD §15 政策／工業特化                                          | `policies.ts`: `POLICIES`, `INDUSTRY_SPECIALIZATIONS`                                                                               |
| GDD §16 大眾運輸                                                | `buildings.ts`: `BUILDINGS`, `NETWORKS`, `TRANSIT`                                                                                  |
| GDD §17–20 通知、教學、存檔、模式／設定                         | `config.ts`: `UI_RULES`, `TUTORIAL`, `SAVE`, `GAME_MODES`                                                                           |
| ART §2 環境、道路、分區、建築、UI 色板                          | `palette.ts` 各色板；保留既有 `PWA_PALETTE`                                                                                         |
| ART §12 畫質分級                                                | `config.ts`: `QUALITY`, `QUALITY_DETECTION`                                                                                         |
| TECH §4 核心資料型別                                            | `world/types.ts`: 道路圖、分區格、建築、環境場、城市統計                                                                            |

## 單位與資料語意

- 名稱帶 `M` 為公尺、`MW` 為百萬瓦、`M3PerWeek` 為每週立方公尺；道路與管線費用以每 8 公尺計。
- 稅率、利率、預算和機率以 0–1 小數表示。教育分布明確命名 `PERCENT`，每列合計 100。需求公式稅率差以百分點計，欄位名稱標明 `PercentagePoint`。
- `capacityPerCell`、教育分布及等級係數以 `level - 1` 索引。占地範圍含上下界；坡度與距離的嚴格上限在欄位名稱用 `Exclusive`／`Below` 標示。
- 里程碑的 `maxOwnedTiles` 是購買權上限，仍須套用 `WORLD.maxOwnedTiles` 裝置限制。
- `null` 表示規格未提供／不適用，不得當作 0。包括服務建築用電、多數建築占地、水力發電量、地鐵軌道維護，以及工業特化教育和污染數值。水力以 `head-dependent` 標記，留待對應任務定義公式。
- 可變世界狀態遵守 TECH §4；資料常數本身為 TypeScript readonly，不做執行期深層凍結。

## 文件差異與決定

- GDD §13.1 明列簡單模式 $200,000，§20 寫「雙倍起始資金」。採具體財政數字 $200,000，保留 §20 的需求 +10。
- GDD §10.1 標題稱 MS1 起解鎖，§14 明列小公園與樹於 MS0。採詳細里程碑表。
- 工業特化依 MS6 解鎖，其餘政策依 MS4；資料中的 ID 是未指定 ID 項目的穩定識別碼，不是介面文案。
- `ServiceType` 包含公共服務及垃圾、公園、大眾運輸，供 TECH §4 的覆蓋 TypedArray 使用。
- GDD §3.2 操作模式等純操作說明不包含平衡數值，留由對應工具任務實作。本任務不加入生成、稅收、解鎖或模擬行為。

## 驗證

`tests/unit/data.test.ts` 直接讀取 GDD，核對道路、建築／管線費用、容量、分區、貸款、升級與里程碑，另檢查跨表 ID 唯一、所有解鎖參照、教育比例、地圖尺寸與裝置上限。`worldTypes.test.ts` 驗證核心型別與 Worker 結構化複製相容性。執行 `npm run typecheck` 才會檢查型別斷言。
