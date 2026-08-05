# 仕様 ⇄ テスト対応表

最終更新: 2026-07-27

各仕様書がどのテストで担保されているかを一覧する。新しい仕様書を追加・変更したら、
この表に対応行を追加/更新すること（CLAUDE.md の運用ルール）。

> **2026-08-05**: Preview モード（Milkdown）はコード・テストごと削除した。
> 当時の仕様書は [docs/archive/preview-era/](../archive/preview-era/) に退避してある。

## Live モード（新モード・設計文書）

| 仕様書 | 主なテスト | 状態 |
|---|---|---|
| `live-mode/README.md` | — | 索引。3モードの位置づけと調査再現手順 |
| `live-mode/obsidian-observed-spec.md` | — | Obsidian 1.13.4 の実測仕様（CDP 総当たり調査、2026-08-05）。テストの期待値の出典として参照する |
| `live-mode/requirements.md` | 純関数: `test/suite/live/focus-expand/revealScope.test.ts`・`syntaxRanges.test.ts`、`test/suite/live/lists-tables/listSyntax.test.ts`・`tableCells.test.ts`、`test/suite/live/external-sync/diffGutter.test.ts`、`test/suite/live/rendering/blockSyntax.test.ts`・`phase5Syntax.test.ts`、`test/suite/live/tabs-editors/liveWebviewHtml.test.ts`、`test/suite/live/editing-core/liveEnter.test.ts`、`test/suite/live/external-sync/documentSync.test.ts`（計165件）／実 Chromium: `test/browser/live/editing-core/documentFidelity.test.ts`・`liveKeymap.test.ts`、`test/browser/live/focus-expand/tokenReveal.test.ts`、`test/browser/live/lists-tables/listRendering.test.ts`、`test/browser/live/rendering/blockRendering.test.ts`・`typography.test.ts`・`phase5Rendering.test.ts`・`lineNumberGutter.test.ts`、`test/browser/live/ime/composition.test.ts`、`test/browser/live/usage-flows/performance.test.ts`、`test/browser/live/lists-tables/tableCellEdit.test.ts`、`test/browser/live/external-sync/diffGutter.test.ts`（計113件） | **Phase 0〜6 + 4b + 6b 実装済み（2026-08-05）**。受け入れ #1 #2 #3 #4 #5 #6 #9 #10 と §4.7（背景が常に白）§4.8（組版）が GREEN。未消化は #7（クリック着地位置）#8（全選択コピー）
| `live-mode/architecture.md` | 同上 | CodeMirror 6 + decoration 構成。**Phase 0〜6 + 4b（表のセル内編集）+ 6b（Git 差分ガター）完了**（器・差分同期／展開スコープ・見出し・インライン記法／リスト・チェックボックス・引用・キーマップ／コードフェンス／表）。未消化は受け入れ基準 #7（クリック着地位置）#8（全選択コピー）のテスト化。表のセル内直接編集は Phase 4b
