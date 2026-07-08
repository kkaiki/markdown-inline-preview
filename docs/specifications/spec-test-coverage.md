# 仕様 ⇄ テスト対応表

最終更新: 2026-07-08

各仕様書（機能仕様・fix 仕様）がどのテストで担保されているかを一覧する。新しい仕様書を追加・
変更したら、この表に対応行を追加/更新すること（CLAUDE.md の運用ルール）。既知の未消化ギャップは
[preview-usage-flow-test-backlog.md](preview-usage-flow-test-backlog.md) §4 に集約されているため、
ここでは重複させず参照するに留める。テストの置き場所の設計思想は
[test-directory-design.md](test-directory-design.md) を参照。

## 機能仕様書

| 仕様書 | 主なテスト | 状態 |
|---|---|---|
| `preview-features.md` | `test/browser/rendering/mathRendering.test.ts`（数式）、`test/browser/rendering/mermaidRendering.test.ts`（Mermaid）、`test/browser/shortcuts/slashMenuDom.test.ts`（スラッシュメニュー）、`test/browser/rendering/frontmatterPanel.test.ts`（frontmatter） | 主要機能はカバー済み。旧「ギャップ1〜3」（数式・スラッシュメニュー・frontmatter の実 DOM 検証）は下記の通り解消済み |
| ├─ ギャップ1: 数式が実 Chromium で本当に描画されるか未検証だった | `test/browser/rendering/mathRendering.test.ts`（9件） | **解消済み**。実バグ発見・修正: `math-decoration-rendering-fix.md` |
| ├─ ギャップ2: スラッシュメニューの実 DOM 操作が未検証だった | `test/browser/shortcuts/slashMenuDom.test.ts`（6件） | **解消済み**。実バグ発見・修正: `preview-slash-empty-block-fix.md` |
| └─ ギャップ3: frontmatter パネルの表示が未検証だった | `test/browser/rendering/frontmatterPanel.test.ts`（4件） | **解消済み** |
| `inline-preview-features.md` | `test/webview/focus-expand/blockPrefixEdit.integration.test.ts`、`test/browser/focus-expand/*`、`test/webview/cursor-focus/*` | 見出し/箇条書き/blockquote は網羅。タスクリスト項目・番号付きリストの focus-expand は一部未検証（backlog §4.2 参照） |
| `preview-toolbar.md` | `test/browser/shortcuts/previewToolbar.test.ts`（レイアウト + クリック実効果 + ツールチップ） | レイアウトとクリック効果（H1-H3/箇条書き/引用/Undo）まで検証済み（2026-07-07 追加）。チェックボックスボタンは `test/browser/cursor-focus/checkboxCursorJump.test.ts` が別途担当 |
| `i18n-localization.md` | `test/suite/preview/rendering/webviewI18n.test.ts` | 文字列テーブルの存在・キー網羅を検証 |
| `mermaid-node-label-inline-edit.md` | `test/suite/preview/rendering/mermaidNodeLabelEdit.test.ts`（純関数）、`test/browser/rendering/mermaidNodeLabelEdit.test.ts`（ダブルクリック→確定→ソース反映、Escapeキャンセル） | 新規実装・テスト済み（2026-07-08）。プレビュー上でのノードラベル編集（新機能）。座標のドラッグ編集は Mermaid 構文上不可能なため対象外 |
| `preview-scroll-sync.md` | `test/suite/preview/external-sync/scrollAnchor.test.ts`、`test/suite/preview/external-sync/scrollSync.test.ts` | 純関数レベルで検証済み |

## fix 仕様書（バグ修正・回帰防止）

| 仕様書 | 主なテスト | 状態 |
|---|---|---|
| `checkbox-cursor-jump-fix.md` | `test/browser/cursor-focus/checkboxCursorJump.test.ts`（20件） | 修正済み。**2026-07-07**: ショートカット系/ツールバー系の非対称カバレッジを解消し、両入口で同じ組み合わせ（周辺状態4種×リスト種別2種+見出し起点）を検証するよう対称化 |
| `checkbox-demotion-prefix-leak-fix.md` | `test/webview/focus-expand/blockPrefixEdit.integration.test.ts`、`test/browser/lists-tables/checkboxEditDelete.test.ts`、`test/extension/preview/lists-tables.test.ts` | **修正済み（2026-07-08）**: チェックボックス→箇条書き降格直後に `- ` が実テキストへ漏れる不具合。`test/browser/cursor-focus/caretRegression.test.ts` の許容値も併せて再調整 |
| `code-block-tab-focus-leak-fix.md` | `test/browser/cursor-focus/codeBlockTabFocus.test.ts`、`test/suite/preview/shortcuts/previewShortcuts.test.ts` | 修正済み・回帰防止済み |
| `code-fence-focus-markers.md` | `test/suite/preview/cursor-focus/previewFocusSyntax.test.ts`（純関数）、`test/browser/focus-expand/codeFenceFocusMarkers.test.ts` | 新規実装・テスト済み（2026-07-08）。フォーカス中のフェンス行/言語名表示（新機能） |
| `collapse-markdown-sync-fix.md` | `test/browser/focus-expand/collapseMarkdownSync.test.ts` | 修正済み・回帰防止済み |
| `dirty-raw-edit-preview-switch-loss-fix.md` | `test/extension/preview/external-sync.test.ts` 12.3（togglePreview経路）、12.3b（openPreview経路） | 修正済み。**2026-07-07**: 3経路のうち togglePreview のみ検証だったギャップを埋め、openPreview コマンド経路も追加。モード記憶の自動切替経路は新規オープン時のみ発火する性質上、既存2経路の検証で共通ガード（`switchToPreview`）のリグレッションは十分捕捉できるため対応見送り |
| `drag-select-during-expand-fix.md` | `test/browser/cursor-focus/dragSelectDuringExpand.test.ts`、`test/browser/cursor-focus/multiBlockExpandChain.test.ts` | 修正済み。2026-07-07 に3ブロック以上の連鎖移動ケースを追加 |
| `external-update-cursor-jump-fix.md` | `test/browser/cursor-focus/externalUpdateRace.test.ts`、`test/browser/external-sync/rapidExternalUpdates.test.ts`、`test/webview/external-sync/applyExternalContent.integration.test.ts` | 修正済み。2026-07-07 に短時間連続 update のケースを追加 |
| `heading-blockquote-prefix-space-fix.md` | `test/browser/focus-expand/headingBlockquotePrefixSpace.test.ts` | 修正済み・回帰防止済み |
| `heading-prefix-selectable-widget-fix.md` | `test/browser/cursor-focus/headingFocusMarkerBugs.test.ts` | 修正済み・回帰防止済み |
| `list-marker-drag-fix.md` | `test/browser/lists-tables/listMarkerDragFix.test.ts` | 修正済み・回帰防止済み |
| `math-decoration-rendering-fix.md` | `test/browser/rendering/mathRendering.test.ts`（9件） | 修正済み。2026-07-07 に金額表記（`$ 100`）の誤認防止テストを追加（実装済みガードの未テストコメントを解消） |
| `mermaid-text-selection-fix.md` | `test/browser/rendering/mermaidTextSelection.test.ts` | 修正済み・回帰防止済み |
| `prefix-expand-mark-inheritance-fix.md` | `test/webview/focus-expand/blockPrefixEdit.integration.test.ts` | 修正済み・回帰防止済み |
| `preview-external-write-race-fix.md` | `test/suite/preview/external-sync/externalEcho.test.ts`（純関数）、`test/extension/preview/external-sync.test.ts` 12.2 | 純関数レベルの防壁のみ。**既知のギャップ**: webview 側の実レース e2e 化は基盤が無く未対応（backlog §4.1 参照） |
| `preview-slash-empty-block-fix.md` | `test/browser/shortcuts/slashMenuDom.test.ts`（6件） | 修正済み・回帰防止済み |
| `preview-to-raw-pending-edit-loss-fix.md` | `test/suite/preview/external-sync/serialQueue.test.ts` | 修正済み・回帰防止済み |
| `sidebar-reopen-preview-duplicate-tab-fix.md` | `test/extension/preview/tabs-editors.test.ts` 13.1/13.2 | 修正済み。**既知のギャップ**: 500ms未満のレース・スイッチ中の重複解消試行は定常状態（`sleep(600)`後）しか検証していない（backlog §4.1 参照） |
| `stale-document-model-save-defer-fix.md` | `test/suite/preview/external-sync/externalEcho.test.ts`（純関数）、`test/browser/external-sync/staleDocumentSaveDeferBug.test.ts` | 実バグ発見・修正済み（2026-07-08）。外部書き換え直後にユーザーが入力を続けると、document モデルの陳腐化で保存が defer され続け入力が消える不具合 |
| `stale-external-push-cursor-jump-fix.md` | `test/suite/preview/external-sync/externalEcho.test.ts` | 修正済み・回帰防止済み |
| `typed-checkbox-conversion-fix.md` | `test/browser/lists-tables/typedCheckboxConversion.test.ts` | 修正済み。**既知のギャップ**: 日本語ケースが `h.type()` の文字送りであり実 IME composition を通していない（backlog §4.1 参照） |
| `untitled-preview-content-loss-fix.md` | `test/extension/preview/external-sync.test.ts` 12.6 | 修正済み。**既知のギャップ**: 副作用として指摘された「複数 untitled ファイルの高速トグル」シナリオは未検証（backlog §4.1 参照） |

## 網羅監査による未消化ギャップ

2026-07-07 の3エージェントによる `src/` ⇄ `test/` 突き合わせ監査（`preview-usage-flow-test-backlog.md` §4）
のうち、本セッションで以下を消化した:

- チェックボックス変換カーソル飛びの入口間非対称カバレッジ → 解消
- `dirty-raw-edit-preview-switch-loss-fix.md` の openPreview 経路未検証 → 解消
- スラッシュコマンド（`/code` `/quote` `/divider` `/callout` `/bullet` `/numbered` `/todo`）0件 → 15件追加
- `/table normalize` の引数なし・typo エイリアス未検証 → 2件追加
- `mathDecorationPlugin.ts` の金額表記誤認防止ガードが未テスト → 1件追加
- `previewToolbarPlugin.ts` のクリック実効果・ツールチップのショートカット表示切替が未検証 → 7件追加
- `test/browser/cursor-focus/`: 複数ブロックの展開が絡む編集中の位置移動 → `multiBlockExpandChain.test.ts` 追加
- `test/browser/external-sync/`（空だった）: 短時間連続 external update → `rapidExternalUpdates.test.ts` 追加
- `test/browser/ime/`: IME変換中の外部update競合 → `imeExternalUpdateRace.test.ts` 追加
- `test/webview/cursor-focus/`: blockPrefixEditPlugin の selection.map 再マッピング単体固定 → `blockPrefixEditSelectionMap.test.ts` 追加
- `test/extension/preview/tabs-editors/`: 3ファイル以上開いた状態のトグル → 9.3 追加

**残る未消化項目**（`preview-usage-flow-test-backlog.md` §4.1〜§4.3 に詳細）:

- `preview-external-write-race-fix.md` の webview 側実レース e2e 化（基盤不足で保留）
- `sidebar-reopen-preview-duplicate-tab-fix.md` の 500ms未満レース検証
- `typed-checkbox-conversion-fix.md` の日本語ケースが実 IME を通していない
- `blockPrefixEditPlugin.ts` の `pendingCheckboxSelectionGuard` 内部ロジック単体テスト
- `applyExternalContent.ts` のパーサー例外時フォールバック・`hadFocus` 分岐
- タスクリスト項目・番号付きリスト項目の focus-expand 未検証
- `src/preview/webview/codeLanguagePlugin.ts` がテスト0件
- `previewSlashMenu.ts` の `/table` 実適用（カーソルが最初のセルに入ること）
- `src/raw/list/moveLine.ts`・`src/raw/commands/navigation.ts` が実コマンド経由で未テスト（`test/suite/raw/` はソース複製関数のみ検証。§4.3「構造上の注意」参照）
- `src/raw/list/toggleCheckbox.ts` の `moveCompletedTaskToBottom`（`autoMoveCompletedTasks`）
- `renumberLists` の複雑なインデント混在パターン
- テーブル系 webview テストが全て同一の定型テーブルのみ使用（単一列/単一行/列数不揃い未検証）
- `codeBlockTripleClickPlugin.ts` の実プラグイン統合テスト（純関数のみ検証済み）
- `disableTextEscape.ts` の `|` を含む本文でのテーブル破損トレードオフ
- `advanced.*` 設定10種以上の実行時反映確認
- `mermaidDiagramPlugin.ts` のエラーパス・複数コードブロック再描画
- `milkdownApp.ts` のズーム機能全体（テスト0件）
- IME 確定直後のキーボードチェックボックストグル、テーブルセル内実IME

着手する際は `preview-usage-flow-test-backlog.md` の該当項目に沿って TDD で進め、
消化したらこの表と当該バックログ項目の両方を更新する。
