# 仕様 ⇄ テスト対応表

最終更新: 2026-07-15

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
| `blank-line-preservation.md` | `test/webview/rendering/blankLineRoundtrip.test.ts`（連続空行のround-trip）、`test/browser/rendering/lineNumberGutter.test.ts`（実ソース行番号化・表/コードブロックの行内番号・空行スペーサーの行番号と入力/Backspace・段落内Enter連打時の番号順序） | 新規実装・テスト済み（2026-07-08、行番号を2026-07-09に実ソース行番号版へ改訂、2026-07-19に hardbreak 連打時の順序崩れを修正）。トップレベルの空行を空 paragraph として復元し、ガター番号は Raw と一致する実ソース行番号（表・コードブロックは行ごと）を表示 |
| `whitespace-only-content-visualization.md` | `test/webview/rendering/whitespaceMarker.test.ts`（8件） | 新規実装・テスト済み（2026-07-08）。空白のみの段落・表セル・行末の空白をデコレーションで可視化 |
| `input-editing-tdd-investigation-plan.md` | `test/browser/editing-core/plainTextEditing.test.ts`（EDIT-001〜010、EDIT-012の11件） | **実装中（2026-07-13開始）**。通常段落P0は実ChromiumでGREEN。EDIT-011と構造ブロック、IME、host保存は未実装 |

## fix 仕様書（バグ修正・回帰防止）

| 仕様書 | 主なテスト | 状態 |
|---|---|---|
| `checkbox-cursor-jump-fix.md` | `test/browser/cursor-focus/checkboxCursorJump.test.ts`（20件） | 修正済み。**2026-07-07**: ショートカット系/ツールバー系の非対称カバレッジを解消し、両入口で同じ組み合わせ（周辺状態4種×リスト種別2種+見出し起点）を検証するよう対称化 |
| `checkbox-demotion-prefix-leak-fix.md` | `test/webview/focus-expand/blockPrefixEdit.integration.test.ts`、`test/browser/lists-tables/checkboxEditDelete.test.ts`、`test/extension/preview/lists-tables.test.ts` | **修正済み（2026-07-08）**: チェックボックス→箇条書き降格直後に `- ` が実テキストへ漏れる不具合。`test/browser/cursor-focus/caretRegression.test.ts` の許容値も併せて再調整 |
| `code-block-arrow-vertical-nav-fix.md` | `test/browser/cursor-focus/codeBlockArrowUpJumpToTop.test.ts`（7件） | **修正済み（2026-07-08）**: コードブロック1行目からの ArrowUp が文書先頭へ飛ぶ／最終行からの ArrowDown が抜けられないバグ。`codeBlockArrowKeymap.ts` で手動の行計算に置き換え。**2026-07-09**: フェンスの実テキスト化（下記）に伴い、フェンス行も「ブロック内の1行」として扱われるよう期待値を更新（旧5件→7件） |
| `code-block-tab-focus-leak-fix.md` | `test/browser/cursor-focus/codeBlockTabFocus.test.ts`、`test/suite/preview/shortcuts/previewShortcuts.test.ts` | 修正済み・回帰防止済み |
| `code-fence-focus-markers.md` | （`code-fence-real-text-edit-fix.md` に置き換え） | **2026-07-09 に widget 方式から実テキスト展開方式へ置き換え**。旧テスト `codeFenceFocusMarkers.test.ts` は削除 |
| `code-fence-real-text-edit-fix.md` | `test/suite/preview/cursor-focus/previewFocusSyntax.test.ts`（`parseCodeFenceRealText` / `hasBoundaryFenceLine` 純関数）、`test/browser/focus-expand/codeFenceRealTextEdit.test.ts`（11件）、`test/browser/shortcuts/selectAllCodeFence.test.ts`（2件）、`test/browser/rendering/codeFenceBrokenBackground.test.ts`（3件） | 新規実装・テスト済み（2026-07-09）。``` の文字自体を1文字ずつ打ち替え・削除できるようにしてほしいというユーザー要望を受け、`code-fence-focus-markers.md` の widget 方式を実テキスト展開方式へ置き換え。**2026-07-13 追記**: ユーザー報告「フォーカスで開きフェンスが2行並ぶ」を修正 — 真因は `lineNumberGutterPlugin` の widget key 衝突による古いフェンス DOM の使い回し＋`expanded` 設定が dispatch 後だったこと（`test/browser/rendering/lineNumberGutter.test.ts` に回帰テスト2件）。調査中に発見した独立バグとして、内容自体の1行目/最終行が既に ``` のブロック（ネストフェンス）も展開スコープ外に。**2026-07-16 追記**: フェンス実テキスト化の副作用2件を修正（Cmd/Ctrl+Aがフェンス自体を選択に含む／フェンスを壊してもフォーカス中は見た目が変わらない）。§6参照 |
| `collapse-markdown-sync-fix.md` | `test/browser/focus-expand/collapseMarkdownSync.test.ts` | 修正済み・回帰防止済み |
| `dirty-raw-edit-preview-switch-loss-fix.md` | `test/extension/preview/external-sync.test.ts` 12.3（togglePreview経路）、12.3b（openPreview経路） | 修正済み。**2026-07-07**: 3経路のうち togglePreview のみ検証だったギャップを埋め、openPreview コマンド経路も追加。モード記憶の自動切替経路は新規オープン時のみ発火する性質上、既存2経路の検証で共通ガード（`switchToPreview`）のリグレッションは十分捕捉できるため対応見送り |
| `drag-select-during-expand-fix.md` | `test/browser/cursor-focus/dragSelectDuringExpand.test.ts`、`test/browser/cursor-focus/multiBlockExpandChain.test.ts` | 修正済み。2026-07-07 に3ブロック以上の連鎖移動ケースを追加 |
| `block-prefix-selection-collapse-fix.md` | `test/browser/focus-expand/blockPrefixBugs.test.ts`「Bug5」（3件）+「Bug5b」（1件） | **修正済み（2026-07-09）**: 展開中のブロック内でテキストを選択すると `## `/`- `/`> ` が収縮しテキスト位置がずれる不具合。`inline-mark-focus-edit-fix.md` §3.1 と同種の修正を `blockPrefixEditPlugin` 側にも適用。Bug5b は「選択範囲が単一カーソルへ潰れる」副作用の有無を確認（バグ無し・回帰防止ロック） |
| `external-update-cursor-jump-fix.md` | `test/browser/cursor-focus/externalUpdateRace.test.ts`、`test/browser/external-sync/rapidExternalUpdates.test.ts`、`test/webview/external-sync/applyExternalContent.integration.test.ts` | 修正済み。2026-07-07 に短時間連続 update のケースを追加 |
| `hardbreak-line-markdown-conversion-fix.md` | `test/browser/lists-tables/typedCheckboxConversion.test.ts`、`test/browser/focus-expand/headingBlockquotePrefixSpace.test.ts`、`test/browser/shortcuts/slashMenuDom.test.ts`、`test/browser/cursor-focus/externalUpdateRace.test.ts`、`test/browser/usage-flows/usageFlows.test.ts`、`test/browser/cursor-focus/caretRegression.test.ts`、`test/browser/cursor-focus/codeBlockArrowUpJumpToTop.test.ts`、`test/browser/lists-tables/checkboxEditDelete.test.ts`、`test/browser/shortcuts/selectAllBrackets.test.ts`、`test/webview/cursor-focus/cursorAnchor.integration.test.ts`、`test/webview/rendering/whitespaceMarker.test.ts`、`test/webview/editing-core/checkboxEditDelete.test.ts`、`test/webview/editing-core/markerBackspace.integration.test.ts`、`test/webview/editing-core/paragraphEnter.integration.test.ts`、`test/webview/shortcuts/previewKeymap.integration.test.ts` | **修正済み（2026-07-16）**: `7d0e907`（Enterのhardbreak化）がMarkdown自動変換（見出し/引用/リスト/チェックボックス/スラッシュメニュー/貼り付け）を広範囲に壊していた不具合。`hardbreakLineInputRulesPlugin`/`blankLinePlaceholderSkipPlugin`を新設。副次的に`markerBackspace.ts`の空チェックボックスbackspace漏れバグも修正 |
| `heading-blockquote-prefix-space-fix.md` | `test/browser/focus-expand/headingBlockquotePrefixSpace.test.ts` | 修正済み・回帰防止済み |
| `heading-prefix-selectable-widget-fix.md` | `test/browser/cursor-focus/headingFocusMarkerBugs.test.ts` | 修正済み・回帰防止済み |
| `inline-mark-focus-edit-fix.md` | `test/browser/focus-expand/inlineMarkFocusEdit.test.ts`（13件） | 新規実装・テスト済み（2026-07-08）。strong/emphasis/inlineCode/strike_through/link の focus-expand。当初 link は href 編集の影響範囲が大きいとして対象外だったが、目次・行ジャンプ用リンクも含め削除・打ち替え可能にしてほしいというユーザー要望を受けて対象に追加（href も含め編集可能）。§3.1: 展開中のマーク内でテキストを選択しても収縮させない修正を追加（ユーザー報告、実バグ）。全マーク種（斜体/コード/取り消し線/リンク）でも選択維持・選択範囲の非崩壊を確認 |
| `heading-prefix-live-level-update-fix.md` | `test/browser/focus-expand/headingPrefixBackspaceLevel.test.ts`（4件） | 新規実装・テスト済み（2026-07-09）。見出しプレフィックス編集中（フォーカスを外す前）に `#` の増減へ応じて見た目のレベルをリアルタイム反映するようにした（ユーザー要望） |
| `list-marker-drag-fix.md` | `test/browser/lists-tables/listMarkerDragFix.test.ts` | 修正済み・回帰防止済み |
| `math-decoration-rendering-fix.md` | `test/browser/rendering/mathRendering.test.ts`（9件） | 修正済み。2026-07-07 に金額表記（`$ 100`）の誤認防止テストを追加（実装済みガードの未テストコメントを解消） |
| `mermaid-text-selection-fix.md` | `test/browser/rendering/mermaidTextSelection.test.ts` | 修正済み・回帰防止済み |
| `prefix-expand-mark-inheritance-fix.md` | `test/webview/focus-expand/blockPrefixEdit.integration.test.ts` | 修正済み・回帰防止済み |
| `preview-external-write-race-fix.md` | `test/suite/preview/external-sync/externalEcho.test.ts`（純関数）、`test/extension/preview/external-sync.test.ts` 12.2 | 純関数レベルの防壁のみ。**既知のギャップ**: webview 側の実レース e2e 化は基盤が無く未対応（backlog §4.1 参照） |
| `preview-slash-empty-block-fix.md` | `test/browser/shortcuts/slashMenuDom.test.ts`（6件） | 修正済み・回帰防止済み |
| `preview-to-raw-pending-edit-loss-fix.md` | `test/suite/preview/external-sync/serialQueue.test.ts` | 修正済み・回帰防止済み |
| `sidebar-reopen-preview-duplicate-tab-fix.md` | `test/extension/preview/tabs-editors.test.ts` 13.1/13.2（定常状態）、13.3/13.4（500ms未満のレース・スイッチ中の重複解消試行、`webview-disposed-race-fix.md` で追加） | 修正済み。**2026-07-20 追記**: `preview-default-editor-fix.md` で `customEditors` の `priority` を `"default"` へ変更したことで、同じ列への再オープンでは Raw タブがそもそも作られなくなり、この reactive な重複解消（Rawタブが一瞬表示されてから閉じる）の出番自体が大幅に減った。13.1〜13.3 は新仕様に合わせて更新済み。明示的に Raw を強制した場合の重複解消ロジック自体は引き続き有効（13.4） |
| `preview-default-editor-fix.md` | `test/extension/preview/tabs-editors.test.ts` 13.1〜13.3 | **修正済み（2026-07-20）**: サイドバーからの再オープンで一瞬Rawが表示されフォーカスが奪われる（`Cmd+Delete`等が効かなくなる）というユーザー報告を受け、`customEditors` の `priority` を `"option"`→`"default"` に変更。`resolveCustomTextEditor` に「記憶モード/既定設定が raw ならその場で跳ね返す」ロジックを追加し、Raw を好むユーザーの体験も維持。`collapseDuplicateRawTabsInGroup` に `preserveFocus: true` も追加。**既知の限界**: 拡張ホストテスト環境では `vscode.window.activeTextEditor` が常に `undefined`（実験で確認済み）のため、「サイドバーのフォーカスが実際に保持されるか」は自動テスト化できず、実機での手動確認が必要 |
| `webview-disposed-race-fix.md` | `test/extension/preview/tabs-editors.test.ts` 13.3/13.4 | 修正済み。**2026-07-09**: クラッシュ修正後も低頻度で再発していたタブ重複（ユーザー報告）を、`tabGroups.onDidChangeTabs` の `event.opened` に限定した2つ目のトリガーで解消（`collapseDuplicateRawTabsInGroup`）。**既知の残存ギャップ**: 13.4 の最も極端な同時実行ケースのみ低頻度で再発しうる（backlog §4.1 参照） |
| `preview-link-open-same-column-fix.md` | `test/extension/preview/tabs-editors.test.ts` 14.1/14.2/14.3/15.1 | 実VS Code。拡張自身のリンクだけ列を明示し、Explorer/CLI相当の列指定なしopenはVS Code標準選択へ任せる。右のロック済みCLIグループがアクティブでも左Preview列へ開くことを検証 |
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
