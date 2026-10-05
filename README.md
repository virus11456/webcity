# WebCity

一款玩法與美術風格參考《Cities: Skylines》的城市建造模擬遊戲，以 Web 技術開發，支援 PWA 安裝，可在 iPhone、iPad、PC 上遊玩。

## 開發流程

- `main`：主分支，永遠保持可運作的狀態。
- 每個功能使用獨立分支開發（例如 `feature/camera-controls`），完成後透過 Pull Request 合併回 `main`。
- 企劃與任務拆解請見 `docs/PLAN.md`。

## 文件

| 文件 | 內容 |
|---|---|
| [`AGENTS.md`](./AGENTS.md) | 給 AI 開發者的總規則（交給 AI 前請先讓它讀這份） |
| [`docs/PLAN.md`](./docs/PLAN.md) | 企劃總覽 |
| [`docs/GDD.md`](./docs/GDD.md) | 遊戲設計規格（玩法、數值、公式） |
| [`docs/ART.md`](./docs/ART.md) | 美術規格 |
| [`docs/TECH.md`](./docs/TECH.md) | 技術架構 |
| [`docs/TASKS.md`](./docs/TASKS.md) | 任務卡與給 AI 的提示詞範本 |
