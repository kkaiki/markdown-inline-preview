# Preview: 実利用フローに基づくテスト拡充バックログ

最終更新: 2026-07-07

これまでの修正（`checkbox-cursor-jump-fix.md` / `stale-external-push-cursor-jump-fix.md` /
`preview-to-raw-pending-edit-loss-fix.md` / `typed-checkbox-conversion-fix.md` /
`dirty-raw-edit-preview-switch-loss-fix.md`）は、いずれも
「コードの構造から推測できる、実際に起きそうな操作の組み合わせ」を実 Chromium・実 VS Code で
愚直に再現することで見つかった。同じ考え方で、まだ検証していない操作の組み合わせを洗い出す。
TDD で 1 件ずつ: 失敗するテストを書く → 失敗を確認 → 直す → 通す。

**テスト化したらこのバックログから消し、テストのタイトル自体が仕様文になる**
（全テストのタイトルは `preview-test-catalog.md` に自動集約される。
`npm run docs:test-catalog` で再生成）。

## 1. 消化済み（2026-07-02、テストへ移行）

以下は `test/browser/usageFlows.test.ts`（実 Chromium・13 件）と
`test/extension/preview.test.ts` スイート 12（実 VS Code・5 件）に移行済み。全て passing。

- 同一 1000ms 時間窓内の連続チェックボックス変換（ガード上書き）→ カーソルは 2 つ目に残る ✅
- 変換直後の Cmd+Z が「カーソル復元だけの Undo」にならず内容の Undo になる ✅
- 保留 → 展開 → 保留（`[x` → 別文字 → Backspace で戻る → `] ` で完成）の往復 ✅
- 箇条書きとチェックボックスの同一リスト内混在（checked=null / boolean）✅
- チェックボックス + Enter の高速反復（買い物リスト）✅
- 見出し → チェックリスト → 見出し → チェックリスト（会議メモ）✅
- 行まるごと選択削除 → Undo で checked 状態ごと復元 ✅
- テーブルセル内のチェックボックス記法はただの文字列（クラッシュしない）✅
- 文書の一番先頭（上に何も無い・境界 pos）でのチェックボックス作成 ✅
- フォーカスを外して戻ってからの継続入力 ✅
- 段落の分割・結合、見出し末尾 Enter、箇条書き項目の分割 ✅
- 【実 VS Code】Raw⇄Preview ラウンドトリップで内容不変・dirty 化しない ✅
- 【実 VS Code】Preview 中の外部書き換えでタブ維持 ✅
- 【実 VS Code】**dirty な Raw 編集が Preview 往復で失われる → 実バグを発見し修正**
  （`dirty-raw-edit-preview-switch-loss-fix.md`）✅

- 【実 VS Code】同一 URI への openWith 二重実行でタブが増殖しない ✅
- 【実 VS Code】markdown 以外での togglePreview は安全に no-op ✅

## 1b. 消化済み（2026-07-02 第2弾: 仕様ギャップ → テスト化で実バグ 3 件発見・修正）

- **数式（KaTeX）の実レンダリング** → `test/browser/mathRendering.test.ts`（5 件）。
  **実バグ発見**: auto-render 方式は ProseMirror に巻き戻され一度も描画されなかった →
  デコレーション方式へ移行（`math-decoration-rendering-fix.md`）✅

- **Preview スラッシュメニューの実 DOM 操作** → `test/browser/slashMenuDom.test.ts`（6 件）。
  **実バグ発見**: `/todo` が literal `[ ]` になる・`/h1`〜`/h6` 等はブロックが消えて入力が
  隣へ混入（`preview-slash-empty-block-fix.md`）✅

- **チェックボックス変換ガードと外部 update の衝突** → `test/browser/externalUpdateRace.test.ts`（4 件）。
  **実バグ発見**: 全置換 + 数値クランプでカーソルが外部の行へ飛び入力が混入
  （`external-update-cursor-jump-fix.md`）✅

- **frontmatter パネルの DOM 表示** → `test/browser/frontmatterPanel.test.ts`（4 件）✅
- **IME（日本語変換）とチェックボックス** → `test/browser/imeCheckbox.test.ts`（4 件。
  CDP `Input.imeSetComposition` + `Input.insertText`）✅

## 1c. 消化済み（2026-07-02 第3弾）

- **チェックボックスのコピー & ペースト** → `test/browser/usageFlows.test.ts`
  「コピー & ペースト」（2 件）。実クリップボード API は file:// 上で権限制約があるため、
  `DataTransfer` + `ClipboardEvent('paste')` を `view.dom` へ直接ディスパッチして
  `@milkdown/plugin-clipboard` の `handlePaste`（text/plain を markdown としてパース）を
  実際に通す（`PreviewHandle.pasteMarkdownText`）。

  - チェックボックス項目をペーストすると同じ内容の未チェック項目として挿入される ✅
  - ペースト直後（チェックボックス選択ガードの 1000ms 時間窓内）に別の行で `[ ] ` を
    追記しても、ペースト項目・追記項目の両方が壊れずカーソルも追記項目に残る ✅
    （既存の「変換ガード上書き」ロジックがペースト由来の guard arm とも正しく共存することを確認。
    実装変更は不要だった＝既存動作の仕様固定）

## 1d. 消化済み（2026-07-02 第4弾）

- **Raw インライン装飾の適用範囲** → `test/suite/raw/decorationTheme.test.ts`
  「Decoration range computation」（14 件）。`src/raw/decorations/updaters.ts` は
  `vscode.Range`/`vscode.Position` に依存し jsdom から import できないため、同じ正規表現・
  同じ範囲計算ロジックを純関数として複製し、行・列単位で範囲の一致を検証（他の
  test/suite/raw/ ユニットテストと同じ「ソースからロジックを複製する」慣習に倣った）。
  チェック済みチェックボックスのラベル範囲、見出しレベル判定の境界（スペース無し・7 個以上の
  `#`）、水平線判定の境界、コードブロック背景（未終端フェンス含む）、python/javascript の
  シンタックスハイライトのトークン列位置を検証。実装変更は不要（既存ロジックの仕様固定）。
  **注意**: `updaters.ts` の該当ロジックを変更したら複製側もあわせて更新すること。

## 1e. 消化済み（2026-07-02 第5弾）

- **数式まわりの発展ケース** → `test/browser/mathRendering.test.ts`（4 件追加）。
  - インラインコード内・コードブロック内の `$...$` は数式化されない（実装済みガードの
    テスト化。`mathDecorationPlugin.ts` の `inlineCode`/`code_block` 除外ロジック）✅

  - hardbreak（行末2スペース+改行）をまたぐ `$$...$$` は、テキストノード単位でしか
    正規表現を評価できない実装上の制約により数式化されない。破損せずソースが残ることを
    確認（既知の制約として仕様固定。将来複数テキストノードをまたいだマッチが必要になったら
    ここが対応の起点）✅

  - `enableMath` を `settings` メッセージで true→false→true と動的に切り替えると、
    追加の編集操作なしで都度即座に反映される。`applySettingsToDom` の直後に呼ばれる
    `setEditable()` の `view.setProps()` が副作用として全デコレーションの再計算
    （ProseMirror の `view.update`）を強制しているため。実装変更は不要だった ✅

## 2. 未消化（次の候補）

- **同一ファイルを 2 つの Preview パネル（分割エディタ）で同時編集**: タブレベルは
  スイート 12.4 で検証済み（`supportsMultipleEditorsPerDocument: false` のため 1 枚に保たれる）。
  現状は機能自体が無効化されているため、これ以上テスト化できることはない（対応見送り）。
  将来この設定を変える場合は webview レベルの相互反映テストが必要。

- **Raw モードの外部書き換え自動リロード**: `test/extension/raw.test.ts` 11.1（skip 中）。
  11.1c の切り分けにより、原因は「ファイル監視が動かない」ことではなく「VS Code の
  TextDocument モデルが `@vscode/test-electron` 環境で自動リロードしない」ことまでは
  判明済み。実デスクトップ環境でも同じかはこのテストハーネスだけでは確認できず、
  自動テストでこれ以上切り分けることはできない（実環境での手動確認が必要、対応保留）。

## 4. 2026-07-07 網羅監査（3 エージェントによる src/ ⇄ test/ 突き合わせ）

`test-directory-design.md` のカテゴリ再編完了を受け、`src/preview/webview/`・`src/raw/`
全ファイルと既存 `*-fix.md` の再現条件を、実際のテストファイルと突き合わせて棚卸しした。
以下は実ソースで存在を裏取り済みの具体的ギャップ。優先度高いものから着手する。

### 4.1 実バグの疑いが強いもの（優先着手）

- ~~`untitled-preview-content-loss-fix.md` の副作用で生まれた無防備な穴~~ →
  **調査済み（2026-07-07）、既知の制限と確認**: `tabs-editors.test.ts` に 9.4 として
  「複数 untitled ファイルの高速 Raw⇄Preview 往復」を実装し**1回目の往復から100%再現**
  することを確認した（`vscode.workspace.applyEdit` が "has changed in the meantime" で
  無視される警告を伴う）。当時のチームが実ファイルへの回避策を選んだのと同じ理由
  （根本原因が VS Code 自体の untitled ドキュメントのバージョン管理とタブクローズの
  相互作用にあり、深掘りのリスクが高い）でこれ以上の深追いはせず、`test.skip` として
  再現条件を記録するに留めた（`untitled-preview-content-loss-fix.md` に追記）。

- ~~`sidebar-reopen-preview-duplicate-tab-fix.md` の2つの排他ガード未検証~~ →
  **消化済み（2026-07-07）、実バグ発見・修正**: `tabs-editors.test.ts` に 13.3（500ms 猶予窓
  境界）・13.4（`togglePreview` 実行中の再オープン）を追加。13.4 が**実バグを発見**:
  `togglePreview` とサイドバー再オープンがほぼ同時に起きると、`schedulePush`/`getBaseBody`
  の非同期継続が破棄済み `webviewPanel.webview` にアクセスして未処理rejection
  （`Error: Webview is disposed`）が発生し、Preview/Raw タブが恒久的に重複したまま残る
  （約 25% の確率で再現）。`disposed` フラグで非同期継続をガードして修正
  （`webview-disposed-race-fix.md`）。

- **`preview-external-write-race-fix.md` の e2e カバレッジの偽装**:
  同ドキュメント自身が「webview の中身は実 VS Code テストから駆動できないため、実際の
  レース（外部書き込みと Preview 側の keystroke-save の競合）の e2e 検証は現状不可能」と
  明記している。`test/extension/preview/external-sync.test.ts` 12.2 は「外部書き換え後も
  Preview タブが残る」ことしか見ておらず、**外部編集の内容が Preview 側の保存で上書きされ
  ないこと自体は検証していない**。純関数レベルの `externalEcho.test.ts` のみが実質的な
  防壁であることを認識した上で、書けるなら webview 統合テストでの補強を検討する。

- ~~`dirty-raw-edit-preview-switch-loss-fix.md` の3経路のうち1経路のみ検証~~ → **消化済み（2026-07-07）**:
  `external-sync.test.ts` に `12.3b`（`openPreview` コマンド経路）を追加し、togglePreview 経路（12.3）
  と同じ dirty 編集シナリオで検証。モード記憶の自動切替経路は「新規オープン時のみ」発火するため
  同一テスト内での往復検証とは相性が悪く、対応見送り（現状の実装は3経路とも同じ `switchToPreview`
  共通関数を通るため、2経路の検証で共通ガードのリグレッションは十分に捕捉できる）。

- ~~チェックボックス変換のカーソル飛び: 2つの入口の非対称カバレッジ~~ → **消化済み（2026-07-07）**:
  `test/browser/cursor-focus/checkboxCursorJump.test.ts` を更新し、ショートカット系・ツールバー系
  両方で同じ組み合わせ（周辺状態4種 × リスト種別2種 + 見出し起点）を検証するよう揃えた。
  実バグは見つからず、対称カバレッジを仕様として固定（`checkbox-cursor-jump-fix.md` に追記）。

- **`typedCheckboxConversion.test.ts` の日本語ケースが実 IME を通していない**:
  同ファイルの「日本語本文」ケースは `h.type()` の文字送りであり、`imeEnterRace.test.ts` が
  使う CDP `Input.imeSetComposition`/`insertText` の実 composition シーケンスを経ていない。
  `blockPrefixEditPlugin` の NBSP/空白判定は実ブラウザの contenteditable composition 経路に
  依存するため、**タイプ実装は実際の日本語 IME 入力と同じコードパスを通っていない可能性**。

### 4.2 未テストの分岐・関数（存在を裏取り済み）

**cursor-focus**
- `blockPrefixEditPlugin.ts` の `pendingCheckboxSelectionGuard`（1000ms ガード窓の
  armedAt 経過判定・誤爆からの復帰）は内部ロジック単体では未検証（症状レベルのみ）。
- `applyExternalContent.ts` のパーサー例外時フォールバック（`replaceAllWithClamp`）と、
  ノード属性が異なっても markdown 直列化が同じなら「変更なし」とみなすフォールバックは
  未検証。同ファイルの `hadFocus`（外部更新後にフォーカスを復元するか）の分岐も未検証。

**focus-expand**
- `blockPrefixEditPlugin.ts`: 番号付きリスト項目（`1. item`）のフォーカス展開/収縮は
  `blockPrefixEdit.integration.test.ts` で未カバー（見出し・タスク・箇条書き・blockquote
  のみ検証）。タスクリスト項目のプレフィックスを編集して `checked` が boolean → null に
  戻る分岐も未検証。

**shortcuts**
- ~~`src/raw/completion/applySlashCommand.ts`: `/code` `/quote` `/divider` `/callout`
  `/bullet` `/numbered` `/todo` が一件もテストされていない~~ → **消化済み（2026-07-07）**:
  `test/extension/raw/shortcuts.test.ts` に 8.8〜8.22 を追加。各コマンドの展開結果・
  `/code js` の言語エイリアス展開・`/callout warn` のエイリアス解決・`/h2` 省略形展開・
  複数カーソル時のスキップ・フェンスコードブロック内での抑止・`/table normalize`
  の引数なし（警告のみ）と typo エイリアス（`normilize`）を検証。全15件 passing。
- `src/preview/webview/codeLanguagePlugin.ts`（コードブロック言語選択ドロップダウン）は
  ファイル全体がテスト0件。
- `previewToolbarPlugin.ts`: ツールバーボタンをクリックして実際にドキュメントが変わることを
  確認するテストが無い（DOM レイアウトのみ検証）。`toolbarShowShortcuts: false` でショート
  カットキー表示が消えることも未検証。
- `previewSlashMenu.ts`: `/table` を実際に適用してカーソルが最初のセルに入ることが未検証
  （フィルタ一覧に出ることのみ確認済み）。

**lists-tables**
- `src/raw/list/moveLine.ts` の `moveLineWithHierarchy`、`src/raw/commands/navigation.ts`
  の関連ハンドラは実コマンド経由では一切テストされていない（`test/suite/raw/` は多くが
  ソースをコピーした純関数を独自に再実装してテストしており、**実ソースを通していない**
  ことに注意。詳細は下記「構造上の注意」）。
- `src/raw/list/toggleCheckbox.ts` の `moveCompletedTaskToBottom`
  （`autoMoveCompletedTasks` 設定）は実装を確認済みだが対応テストが無い。
- `adjustIndent` のテーブルセル内 Tab/Shift+Tab 分岐と、複数行選択時の一括インデントは
  未検証（既存テストは折りたたみカーソルのみ）。
- `renumberLists`: 同一行内でタブとスペースが混在するインデント、番号付きリストの間に
  bullet/checkbox が割り込むケース、4段以上のネストは未検証。
- テーブル系 webview テスト（`tableArrowKeymap`/`tableMove`/`tableSelection`/
  `tableSelectionFix`/`tableCellBreak`）は全て同じ 2列×2-3行の定型テーブルのみを使い、
  単一列・単一行（ヘッダのみ）・列数不揃いテーブルが未検証。

**editing-core**
- `codeBlockTripleClickPlugin.ts` の実プラグイン（trip-click → TextSelection dispatch）は
  純関数 `lineRangeAt` のみテスト済みで webview/browser 統合テストが無い。
- `disableTextEscape.ts`: 設定オン時に `|` を含む本文やテーブルセルでテーブルが壊れる
  （コード側コメントで明記のトレードオフ）ケースが未検証。

**settings**
- `autoFormatTables` 以外の設定（`isCodeBlockAutoCompleteEnabled` 等 10 種以上、実装は
  `src/raw/settings.ts` に存在確認済み）はいずれも実行時の反映確認テストが無い。
- `onDidChangeConfiguration.ts` の `headingColorScheme` 変更時のデコレーション再生成、
  複数の `markdownInline.*` 設定が1回の更新でまとめて変わるケースは未検証。

**rendering**
- `mathDecorationPlugin.ts`: `$` の直後が空白の金額表記（`$ 100`）を数式と誤認しないことを
  保証するコードコメントがあるが、対応するテストが無い（grep で確認済み、0件）。
- `mermaidDiagramPlugin.ts`: 不正な Mermaid 構文で `errorCache`/`mermaid-diagram-error`
  クラスが付くエラーパス、同一ソースを持つ複数コードブロックの `liveElements` 再描画は未検証。
- `milkdownApp.ts`: ズーム機能全体（`setZoom`/`applyZoom`/`readSavedZoom`、
  `ZOOM_MIN`/`ZOOM_MAX` のクランプ、`vscodeApi.setState` を介したリロード後の永続化）が
  ファイル存在・実装を確認済みだがテスト0件。同ファイルの `updateScrollBeyondPadding`
  （スクロール末尾パディングの動的計算）と `enableTransitions` のフェードインも未検証。
  `insertImageSrc`（ホストからの `imageInserted` メッセージ経由の画像貼り付け）も未検証
  （逆方向のコピーは `imageCopy.test.ts` でテスト済み）。
- `src/raw/decorations/imageInline.ts`/`tableWrapInline.ts`: 編集中の行でインライン
  プレビューを隠す分岐、ファイル存在チェックのフォールバックが未検証。

**ime**
- チェックボックスのキーボードトグル（Cmd/Ctrl+Enter）を IME 確定直後に行うケースが未検証
  （`imeCheckbox.test.ts` はタイプによる変換のみ）。
- テーブルセル内での実 IME composition（`overrideHardbreakSerializer` との組み合わせ）が
  未検証。

**usage-flows**
- テーブルの貼り付け → Undo → Redo の往復でラッパーが壊れないかが未検証
  （`preview-slash-empty-block-fix.md` が扱う Slice openStart/openEnd の破損パターンと
  同系統のリスクがある操作）。
- テーブルセル内での実 IME 入力（table × ime の組み合わせ）。
- リスト項目のテキスト内から始めてテーブルセルへドラッグする、構造境界をまたぐ選択。

### 4.3 構造上の注意（テスト基盤そのものの弱点）

`test/suite/raw/` の複数ファイル（`smartNavigation.test.ts`、`selectionEdgeCases.test.ts`、
`lineMoveAndIndent.test.ts`、`listEdgeCases.test.ts`、`tableCellNavigation.test.ts` 等）は
`src/raw/commands/navigation.ts` 等の**実ソースを import せず、同じロジックを手動で
再実装した関数**をテストしている（`test/suite/raw/rendering/decorationTheme.test.ts` が
同じ手法を取っていることをファイル冒頭のコメントで明言しているのと同じパターン）。
これ自体は jsdom で `vscode` 型に依存する実装を検証できない制約への対処として妥当だが、
**実コマンド（`markdownInline.smartSelectLeft` 等）を `test/extension/raw/navigation.test.ts`
で一切実行していない**組み合わせが複数ある（`createSmartSelectLeftHandler` のテーブル境界
分岐、`createSmartMoveUpHandler`/`createSmartMoveDownHandler` の文書端フォールバック、
コードフェンス内での Smart Select All progression）。今後 `test/suite/raw/` にテストを
追加する際は「実装をコピーした関数だけをテストして満足しない」よう注意し、可能な限り
`test/extension/raw/navigation.test.ts` 側で実コマンドの統合テストも併設すること。

## 5. 実施方針

各項目を実 Chromium テスト（`test/browser/`）または実 VS Code テスト（`test/extension/`、
`MOCHA_GREP` で絞り込み実行可）で再現を試み、失敗したものは TDD で修正する。
jsdom で十分なもの（DOM レイアウト非依存のもの）は `test/webview/` に振り分ける。
§4 は 2026-07-07 の網羅監査結果であり、着手したら該当項目をここから消してテスト
（`preview-test-catalog.md`）へ移すこと。
