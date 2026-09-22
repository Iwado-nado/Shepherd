# Project

物語制作向けマルチキャンバス・フローエディタ『Shepherd』

## Specification

正式仕様は `docs/specification.md` を参照すること。

## Technology

- Tauri
- React
- TypeScript
- @xyflow/react
- Zustand

## Important design rules

- CardとPlacementを分離する
- CardはProject共通データ
- PlacementはCanvas固有データ
- 同一Cardを複数Canvasから参照可能にする
- Areaは固定矩形ではなくPlacement集合として扱う
- 初期実装は仕様書のPhase 1を優先する

## Development policy

- 一度に複数Phaseを実装しない
- 大きな変更の前に実装計画を提示する
- 既存仕様と衝突する独自仕様を追加しない