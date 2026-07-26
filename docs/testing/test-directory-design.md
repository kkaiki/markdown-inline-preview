# テストディレクトリ設計（症状カテゴリ別の再編・具体版）

最終更新: 2026-07-06

関連: [preview-focus-jump-tests-overview.md](../specifications/preview-focus-jump-tests-overview.md)（フォーカス位置バグの既存テスト棚卸し）、
[preview-test-catalog.md](preview-test-catalog.md)、[spec-test-coverage.md](spec-test-coverage.md)

***

## 1. 設計思想

### 1.1 2軸で分類する

テストの置き場所は次の2つの質問で決まる:

1. **どの実行環境が必要か**（レイヤー）— これは現状の4層をそのまま維持する。
   実行コマンド・ハーネス・速度が違うので混ぜられない。

   - `extension/` = 実 VS Code（タブ・コマンド・設定・保存が絡む）
   - `browser/` = 実 Chromium（DOM フォーカス・キャレット座標・IME・rAF が絡む）
   - `webview/` = jsdom + 実 Milkdown（ProseMirror のトランザクション・キーマップロジック）
   - `suite/` = jsdom 純関数（正規表現・変換・判定ロジック単体）
2. **どの症状/機能を守っているか**（カテゴリ）— 今回新設する軸。
   「フォーカスが飛ぶ」というバグ報告を受けたとき、`grep` ではなく
   **`*/cursor-focus/`** **を開けば関連テストが全部ある**状態を作る。

### 1.2 raw / preview の分割はレイヤーによって意味が違う

| レイヤー         | raw/preview 分割                      | 理由                                                                                 |
| ------------ | ----------------------------------- | ---------------------------------------------------------------------------------- |
| `extension/` | **する**（`raw/` `preview/` を切る）       | 両モードとも実 VS Code 上に実体がある                                                            |
| `suite/`     | **済み**（`preview/` `raw/` `shared/`） | 両モードのロジックがある。現状維持                                                                  |
| `browser/`   | **しない**                             | Raw はネイティブ VS Code エディタで webview を持たないため、実ブラウザテストは構造的に Preview 専用。`raw/` を切っても永久に空 |
| `webview/`   | **しない**                             | 同上（Milkdown = Preview のみ）                                                          |

### 1.3 カテゴリの語彙は全レイヤーで共通、ただし空ディレクトリは作らない

「`cursor-focus` という名前はどのレイヤーでも同じ意味」に統一するが、
中身のないカテゴリディレクトリはそのレイヤーには作らない
（例: `browser/navigation/` は Raw 固有カテゴリなので存在しない）。

### 1.4 カテゴリの定義（何をここに入れるかの判定基準）

| カテゴリ             | 判定基準（このテストが失敗したときユーザーが体感する症状）                                                            | 主な対象ソース                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `cursor-focus/`  | **カーソル・DOM フォーカスが意図しない場所へ移動する / 選択が壊れる**                                                 | `markerBackspace`(pin selection), `checkboxToggleCommand`, `focusSyntaxPlugin`, `applyExternalContent`(カーソル維持部分) |
| `focus-expand/`  | **Typora 風のプレフィックス展開/収縮（`## `,** **`- `,** **`> `** **の出し入れ）が壊れる**。カーソル位置は正しいのに本文・記法が汚れる | `blockPrefixEditPlugin`                                                                                          |
| `shortcuts/`     | **キーボードショートカット・スラッシュメニュー・ツールバーが効かない/誤動作する**                                              | `previewKeymapPlugin`, `previewSlashMenu`, `previewToolbarPlugin`, `previewShortcuts`(shared), `previewFindBar`  |
| `editing-core/`  | **Enter・Backspace・分割/結合・Undo/Redo・インライン書式・直列化という基本編集が壊れる**                               | commonmark キーマップ, `markerBackspace`, `inlineMarkBackspace`, serializer                                           |
| `lists-tables/`  | **リスト・チェックボックス・テーブル固有の操作が壊れる**（変換・継続・セル移動・行列入替）                                          | `tableArrowKeymap`, checkbox 変換系, list 系コマンド                                                                     |
| `external-sync/` | **外部（Raw/AI/他ツール/Git）との内容同期が壊れる**（反映されない・二重反映・diff 誤判定・スクロール同期）                          | `applyExternalContent`, `previewDiffPlugin`, `previewPanel`(echo/serialQueue/scroll)                             |
| `rendering/`     | **表示だけの問題**（数式・Mermaid・画像・ハイライト・行番号・frontmatter・i18n。編集結果は正しい）                           | `mathDecorationPlugin`, `mermaidDiagramPlugin`, `codeHighlightPlugin`, `lineNumberGutterPlugin`                  |
| `ime/`           | **日本語 IME（composition）が絡むと壊れる**                                                          | ProseMirror composition 対応全般                                                                                     |
| `navigation/`    | **（Raw）カーソル移動・スマート選択・行移動が壊れる**                                                           | `src/raw/commands/navigation`, smart select                                                                      |
| `tabs-editors/`  | **（実 VS Code）タブが増殖する・別ファイルへフォーカスが移る・トグルが誤動作する**                                          | `previewPanel`(host), `toggleDecision`, CodeLens                                                                 |
| `settings/`      | **拡張設定が反映されない・VS Code 本体設定と連動しない**                                                       | `markdownInlineSettings`, `onDidChangeConfiguration`                                                             |
| `usage-flows/`   | **単一症状に分類できない複合シナリオ**（日常操作の連なり。バックログ消化テストの受け皿）                                           | 横断                                                                                                               |

**分類に迷ったときの規則**:

- 「カーソルは正しいがプレフィックスが汚れる」→ `focus-expand`。「記法は正しいがカーソルが飛ぶ」→ `cursor-focus`。両方壊れるバグは**ユーザーが最初に気づく症状**の方。
- チェックボックス変換の「カーソル飛び」は `cursor-focus`、「変換ルール自体（`- [ ]` タイプで変換される等）」は `lists-tables`。
- 外部 update で「カーソルが飛ぶ」→ `cursor-focus`（外部同期はきっかけに過ぎず、守りたいのはカーソル）。「内容が反映されない/diff がおかしい」→ `external-sync`。

***

## 2. 移行後の全体ツリー

```
test/
├── extension/                     # 実 VS Code
│   ├── helpers.ts                 # 共通ヘルパー（現状維持）
│   ├── raw/
│   │   ├── lists-tables.test.ts   # 旧 raw.test.ts suite 1,2,5,6
│   │   ├── navigation.test.ts     # 旧 raw.test.ts suite 3,4(SmartSelectAll),4.3
│   │   ├── editing-core.test.ts   # 旧 raw.test.ts suite 4(インデント),11.2,11.3
│   │   ├── shortcuts.test.ts      # 旧 raw.test.ts suite 8
│   │   ├── settings.test.ts       # 旧 raw.test.ts suite 7
│   │   └── external-sync.test.ts  # 旧 raw.test.ts suite 11.1c（+ skip 中の 11.1）
│   └── preview/
│       ├── tabs-editors.test.ts   # 旧 preview.test.ts suite 9,13 + 12.4,12.5
│       ├── settings.test.ts       # 旧 preview.test.ts suite 10
│       ├── external-sync.test.ts  # 旧 preview.test.ts suite 12.1,12.2,12.3,12.6
│       └── lists-tables.test.ts   # 2026-07-08 新設。チェックボックス操作の実 VS Code
│                                  # end-to-end（実ドキュメント・実ディスクへの書き戻し）
├── browser/                       # 実 Chromium（Preview 専用）
│   ├── previewBrowserHarness.ts   # 共通ハーネス（直下に維持）
│   ├── cursor-focus/              # ★今回の報告の本丸
│   ├── focus-expand/
│   ├── shortcuts/
│   ├── editing-core/
│   ├── lists-tables/
│   ├── external-sync/
│   ├── rendering/
│   ├── ime/
│   └── usage-flows/
├── webview/                       # jsdom + Milkdown（Preview 専用）
│   ├── jsdomSetup.ts              # 直下に維持
│   ├── milkdownHarness.ts         # 直下に維持
│   ├── cursor-focus/
│   ├── focus-expand/
│   ├── shortcuts/
│   ├── editing-core/
│   ├── lists-tables/
│   ├── external-sync/
│   └── rendering/
└── suite/                         # jsdom 純関数
    ├── index.ts                   # 実 VS Code テストの Mocha エントリ（直下に維持）
    ├── preview/
    │   ├── cursor-focus/
    │   ├── shortcuts/
    │   ├── tabs-editors/
    │   ├── external-sync/
    │   └── rendering/
    ├── raw/
    │   ├── navigation/
    │   ├── lists-tables/
    │   └── rendering/
    └── shared/                    # 現状維持（両モード共通の純ロジック。カテゴリ分割しない※）
```

※ `shared/` は 12 ファイルあるが「markdown パース・整形の純関数」でほぼ均質なため、
カテゴリを切ると 1 ファイル 1 ディレクトリになり過剰。現状維持とする。

***

## 3. ファイル単位の移行マッピング（全ファイル）

「テスト対象」列 = そのテストが守っている処理・ソースモジュール。
「思想」列 = なぜそのカテゴリなのか（迷いそうなものだけ記載）。

### 3.1 `test/browser/`（25 ファイル）

#### → `browser/cursor-focus/`（カーソル・フォーカスが飛ぶ症状）

| 現ファイル                            | テスト対象（守っている処理）                                                                                                              | 思想                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `caretRegression.test.ts`        | `markerBackspace` の pinSelection（list-item-block の非同期再描画が DOM キャレットを奪うのを 2 段 rAF で補正）。チェックボックス/リスト行頭 Backspace でカーソルが上へ飛ばない | jsdom で再現不能な「唯一の防壁」。症状はカーソル飛び                       |
| `checkboxCursorJump.test.ts`     | `checkboxToggleCommand` の 2 段 dispatch（wrap→checked 設定）時のカーソル維持。⌥⌘4/ツールバー変換後にカーソルが既存リストへ飛ばない（`checkbox-cursor-jump-fix.md`） | 変換機能自体ではなく「変換後のカーソル位置」を守るテストなので lists-tables ではなくここ |
| `codeBlockTabFocus.test.ts`      | code_block の Tab ハンドラ。Tab で DOM フォーカスが言語選択 `<select>` へ漏れない（`code-block-tab-focus-leak-fix.md`）                             | ショートカットの追加で直したが、守っている症状は「フォーカス漏れ」                   |
| `dragSelectDuringExpand.test.ts` | `blockPrefixEditPlugin` の auto-expand 中に別ブロックをドラッグ選択すると選択が空になるバグ                                                            | 症状は「選択が壊れる」なのでここ。展開自体の正しさは focus-expand が守る         |
| `externalUpdateRace.test.ts`     | `applyExternalContent` の差分適用 + カーソル維持。外部 update 直後の入力が外部の行へ混入しない（`external-update-cursor-jump-fix.md`）                      | きっかけは外部同期だが、守っているのはカーソル位置。external-sync ではなくここ      |
| `headingFocusMarkerBugs.test.ts` | `focusSyntaxPlugin` の `::before` 描画とテキスト実挿入の切替。描画幅が変わらない・Cmd+A で `## ` が選択に含まれる                                             | キャレット/選択座標依存                                        |

#### → `browser/focus-expand/`（プレフィックス展開・収縮が壊れる症状）

| 現ファイル                                  | テスト対象                                                                                              | 思想                                                        |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `blockPrefixBugs.test.ts`              | `blockPrefixEditPlugin` の expand/collapse。checked 保持（Bug1）、`## `/`- ` の累積・残留（Bug2,3）、変換後カーソル（Bug4） | Bug4 はカーソル系だがファイルの主眼は expand/collapse の整合性。ファイル分割はせず主眼で分類 |
| `headingBlockquotePrefixSpace.test.ts` | 1 文字ずつタイプ時のプレフィックス末尾スペース保持と collapse 後の markdown 正しさ                                               |                                                     |
| `collapseMarkdownSync.test.ts`         | collapse（`addToHistory: false` の dispatch）がホストへ同期される（サイレントなデータ消失防止）                                | 症状は「保存内容の欠落」だが原因も守る対象も collapse 処理そのものなのでここ               |

#### → `browser/shortcuts/`

| 現ファイル                    | テスト対象                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `previewToolbar.test.ts` | `previewToolbarPlugin` のレイアウト（scroll 領域/fixed 領域・ボタン配置・狭幅ビューポート）                         |
| `slashMenuDom.test.ts`   | `previewSlashMenu` の実 DOM 操作（`/` で開く→絞込→Enter/Escape/ArrowDown、`enableSlashMenu: false`） |

#### → `browser/editing-core/`

| 現ファイル                       | テスト対象                                                                             |
| --------------------------- | --------------------------------------------------------------------------------- |
| `basicOperations.test.ts`   | Markdown ロードと構造化・focus syntax ラウンドトリップ（進入→離脱で内容不変）・Cmd+B/I。「すぐエラーが起きる」退行の防壁       |
| `editingOperations.test.ts` | Enter 継続・リストの Tab/Shift+Tab・行頭 Backspace・分割/結合・マーク端 Backspace・テーブル実キー移動・Undo/Redo |

（※ `editingOperations` のテーブル移動 describe を `lists-tables/` へ分割する案もあるが、
「実キーでの編集操作一式」という 1 ハーネス設計を崩す方が損なので分割しない。）

#### → `browser/lists-tables/`

| 現ファイル                             | テスト対象                                                         |
| --------------------------------- | ------------------------------------------------------------- |
| `typedCheckboxConversion.test.ts` | `- [ ] ` を 1 文字ずつタイプしたときのチェックボックス変換（マーカー種別・番号付き内・日本語本文）       |
| `listMarkerDragFix.test.ts`       | list-item-block のマーカー（bullet/ordered）からのドラッグ選択・チェックボックストグルの共存 |

#### → `browser/external-sync/`

| 現ファイル          | テスト対象  | 思想                                                                                 |
| -------------- | ------ | ---------------------------------------------------------------------------------- |
| （新規置き場。現状該当なし） |  | `externalUpdateRace` は症状がカーソルなので cursor-focus 行き。「内容の反映が壊れる」系の実ブラウザテストを今後ここに書く（§5） |

#### → `browser/rendering/`

| 現ファイル                          | テスト対象                                                               |
| ------------------------------ | ------------------------------------------------------------------- |
| `mathRendering.test.ts`        | `mathDecorationPlugin`（KaTeX デコレーション。`enableMath` 動的切替・コード内 `$` 除外） |
| `mermaidRendering.test.ts`     | `mermaidDiagramPlugin` の SVG 描画・`enableMermaid: false`              |
| `mermaidTextSelection.test.ts` | Mermaid widget の `ignoreSelection`（SVG 内テキストのドラッグ選択・コピー）            |
| `lineNumberGutter.test.ts`     | `lineNumberGutterPlugin`（ソース行番号の一致・toolbar/diff ガターとの共存・padding）    |
| `frontmatterPanel.test.ts`     | frontmatter パネル（`showFrontmatter` の表示/非表示・外部編集追従）                   |
| `visualShowcase.test.ts`       | スクリーンショット撮影（目視確認用。テストというより道具だが、描画の防壁なのでここ）                          |

#### → `browser/ime/`

| 現ファイル                    | テスト対象                                                            |
| ------------------------ | ---------------------------------------------------------------- |
| `imeCheckbox.test.ts`    | IME 確定とチェックボックス変換の組み合わせ（CDP `Input.imeSetComposition`）           |
| `imeEnterRace.test.ts`   | IME 確定 Enter と改行 Enter のレース（`inOrNearComposition` の Safari 限定問題） |
| `imePersistence.test.ts` | IME 入力後の保存 Markdown（`#`/`-` の二重化防止・blockPrefixEdit との共存）         |

#### → `browser/usage-flows/`

| 現ファイル                | テスト対象                                                    | 思想                                                                |
| -------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| `usageFlows.test.ts` | 日常操作の連なり（買い物リスト・会議メモ・コピペ・Undo・フォーカス離脱→復帰）。バックログ消化テストの受け皿 | 中身は checkbox/編集/フォーカスに跨るが、**「複合シナリオはシナリオのまま守る」**のが目的のファイルなので解体しない |

### 3.2 `test/webview/`（29 ファイル）

#### → `webview/cursor-focus/`

| 現ファイル                              | テスト対象                                                                                | 思想     |
| ---------------------------------- | ------------------------------------------------------------------------------------ | ------ |
| `cursorAnchor.integration.test.ts` | カーソル ⇄ ブロックアンカー変換（Raw⇄Preview のカーソル引き継ぎの中核）                                          |  |
| `focusSyntaxMarker.test.ts`        | 行内記法マーカー `<span>` の `contenteditable="false"`（矢印キーのキャレットがマーカー内に吸い込まれない）・マーカークリック位置ナビ |  |

#### → `webview/focus-expand/`

| 現ファイル                                        | テスト対象                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `blockPrefixEdit.integration.test.ts`        | `blockPrefixEditPlugin` の展開ロジック（見出し/タスクリスト/箇条書き/blockquote・リンクのマーク非継承・markerBackspace との共存） |
| `previewDiffFocusExpand.integration.test.ts` | 展開中プレフィックスを diff 比較から除外する処理（フォーカスしただけで「変更」ガターが点かない）                                         |
| `previewDiffInlineMarkExpand.integration.test.ts` | 展開中インライン記法マーカー（`` ` ``/`**`/`[..](..)`）を diff 比較から除外する処理（テーブルセル内含む）                                         |

#### → `webview/shortcuts/`

| 現ファイル                                    | テスト対象                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `previewKeymap.integration.test.ts`      | `previewKeymapPlugin`（⌥⌘1-9 ブロック変換・Cmd+A 段階選択・``` +Enter・フォーカス無し時 no-op） |
| `blockConvert.integration.test.ts`       | ⌥⌘2/3/4/0 の残りとトグル動作（previewKeymap の補完）                                   |
| `shortcutCoverage.integration.test.ts`   | Cmd+Enter チェック切替・Cmd+Shift+. toggleRaw 通知・Cmd+F 検索バー・Cmd+← 行頭移動の「実反応」    |
| `previewFindReplace.integration.test.ts` | `previewFindBar` の実置換（DOM レンジ→PM 位置変換）                                   |

#### → `webview/editing-core/`

| 現ファイル                                     | テスト対象                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `paragraphEnter.integration.test.ts`      | 段落の Enter / Shift+Enter                                                                                 |
| `listEnter.integration.test.ts`           | リスト項目の Enter（継続・離脱）                                                                                     |
| `checkboxEnter.test.ts`                   | チェックボックスの Enter 継続（新項目は常に未チェック）※ lists-tables と迷うが「Enter の挙動」ファミリーとしてここ。listEnter と同居が自然                |
| `blankLines.integration.test.ts`          | 段落間の空行保持                                                                                                |
| `inlineFormatting.integration.test.ts`    | Cmd+B / Cmd+I のトグル                                                                                      |
| `inlineMarkBackspace.integration.test.ts` | マーク範囲端の Backspace/Delete で記法解除                                                                          |
| `markerBackspace.integration.test.ts`     | 行頭マーカーの段階的削除（H2→H1→段落）                                                                                  |
| `codeBlockBackspace.integration.test.ts`  | コードブロック先頭 Backspace で段落へ解除                                                                              |
| `serializeRoundtrip.integration.test.ts`  | 直列化 round-trip（編集なしで記法が保たれる）                                                                            |
| `textEscape.test.ts`                      | `disableTextEscape`（`[` が `\[` にならない）                                                                   |
| `clipboardHardbreak.test.ts`              | コピー時の text/plain に `&#10;` が漏れない（`overrideHardbreakSerializer`）※テーブルセル文脈だが症状は「コピー結果の汚れ」なので editing-core |

#### → `webview/lists-tables/`

| 現ファイル                                   | テスト対象                                               |
| --------------------------------------- | --------------------------------------------------- |
| `tableArrowKeymap.integration.test.ts`  | `tableArrowKeymap`（↑/↓ の同列移動計算）                     |
| `tableMove.integration.test.ts`         | テーブル行/列の入替（ヘッダ行は固定）                                 |
| `tableSelection.integration.test.ts`    | CellSelection（複数セル選択）                               |
| `tableSelectionFix.integration.test.ts` | `fixTableCrossingSelection`（表境界をまたぐ Shift+↓ 選択の正規化） |
| `tableCellBreak.test.ts`                | セル内改行の round-trip（hardbreak ⇄ `&#10;`）              |

#### → `webview/external-sync/`

| 現ファイル                                      | テスト対象                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `applyExternalContent.integration.test.ts` | `applyExternalContent`（外部 Markdown での本文置換・選択位置のクランプ）                  |
| `previewDiff.integration.test.ts`          | `previewDiffPlugin` の基準正規化（Git HEAD を `normalizePreviewMarkdown` に通す） |

#### → `webview/rendering/`

| 現ファイル                                | テスト対象                                                         |
| ------------------------------------ | ------------------------------------------------------------- |
| `codeHighlight.integration.test.ts`  | `codeHighlightPlugin`（hljs デコレーション生成）                         |
| `imageCopy.test.ts`                  | `imageCopyPlugin`（dataUrl→Blob・クリップボード・コンテキストメニュー DOM）        |
| `imageIsolation.integration.test.ts` | `imageIsolationPlugin`（テキストと画像を同一段落に混在させない appendTransaction） |

### 3.3 `test/suite/`（純関数。preview/raw は分割済み → カテゴリを 1 段追加）

#### `suite/preview/`

| 現ファイル                                         | テスト対象                                                                             | 移行先                      |
| --------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------ |
| `cursorAnchor.test.ts`                        | アンカー計算の純ロジック                                                                      | `cursor-focus/`          |
| `previewFocusSyntax.test.ts`                  | `focusSyntaxHelpers`（マーカー判定・位置計算の純関数）                                             | `cursor-focus/`          |
| `previewShortcuts.test.ts`                    | `previewShortcuts`（KeyboardEvent → ショートカット種別の分類）                                  | `shortcuts/`             |
| `toggleDecision.test.ts`                      | Preview⇄Raw トグルの判定（どのタブを閉じてどれを開くか）                                                | `tabs-editors/`          |
| `titleBarToggle.test.ts`                      | タイトルバートグルボタンの状態                                                                   | `tabs-editors/`          |
| `previewTabs.test.ts`                         | タブ管理ロジック                                                                          | `tabs-editors/`          |
| `codeBlockTripleClick.test.ts`                | トリプルクリックの選択範囲計算                                                                   | `cursor-focus/`（選択範囲の症状） |
| `externalEcho.test.ts`                        | 自己エコー判定（`lastAppliedFromWebview` 比較。`stale-external-push-cursor-jump-fix.md` の中核） | `external-sync/`         |
| `serialQueue.test.ts`                         | ホスト側書き込みの直列化キュー                                                                   | `external-sync/`         |
| `scrollAnchor.test.ts` / `scrollSync.test.ts` | Preview⇄Raw スクロール位置同期                                                             | `external-sync/`         |
| `imageUriRoundtrip.test.ts`                   | 画像 URI ⇄ webview URI 変換                                                           | `rendering/`             |
| `markdownAssets.test.ts`                      | アセットパス解決                                                                          | `rendering/`             |
| `webviewI18n.test.ts`                         | webview 側 i18n 文字列                                                                | `rendering/`             |

#### `suite/raw/`

| 現ファイル                                                              | テスト対象                                           | 移行先             |
| ------------------------------------------------------------------ | ----------------------------------------------- | --------------- |
| `smartNavigation.test.ts`                                          | スマートナビゲーション（行頭/行末判定等）                           | `navigation/`   |
| `selectionEdgeCases.test.ts`                                       | Smart Select All の選択範囲計算                        | `navigation/`   |
| `lineMoveAndIndent.test.ts`                                        | 行移動・インデント計算                                     | `navigation/`   |
| `listEdgeCases.test.ts`                                            | リスト整形のエッジケース                                    | `lists-tables/` |
| `tableCellNavigation.test.ts` / `tableNavigationEdgeCases.test.ts` | テーブルセル移動計算                                      | `lists-tables/` |
| `tableFormatting.test.ts`                                          | テーブル整形                                          | `lists-tables/` |
| `decorationTheme.test.ts`                                          | `src/raw/decorations/updaters.ts` の範囲計算（複製ロジック） | `rendering/`    |

#### `suite/shared/` — 現状維持（分割しない）

`blockDiff` / `frontmatter` / `inlineEmphasis` / `lineBreaks` / `listCoverage` /
`markdownInlineSettings` / `patterns` / `slashMenuItems` / `slugShared` / `tableCoverage` /
`utils` / `widthCoverage` の 12 本。markdown パース・整形・設定の純関数で均質なため、
カテゴリを切ると 1 ファイル 1 ディレクトリの過剰分割になる。

### 3.4 `test/extension/` — 2 巨大ファイルを raw/preview × カテゴリの 9 ファイルへ分割

**注意**: このレイヤーは「VS Code を 1 回起動して全ファイル連続実行」なので、
ファイルを分けても起動コストは増えない（`suite/index.ts` の Mocha エントリが glob で拾う。
分割時に glob パターンを `extension/**/*.test.ts` へ更新すること）。
番号付き suite 名（`9.` 等）は `MOCHA_GREP` での絞り込みに使われているため、
**分割後も suite 名の番号は維持する**（例: `suite('9. 複数ファイル Preview/Raw トグル')` のまま移す）。

#### `raw.test.ts`（1094 行） → `extension/raw/` 6 ファイル

| 現 suite                       | 中身                             | 移行先                     | 思想                                                                                                                        |
| ----------------------------- | ------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1. 番号付きリスト自動整形機能              | `renumberLists` の実 VS Code 動作  | `lists-tables.test.ts`  |                                                                                                                     |
| 2. リストタイプ変換機能                 | bullet⇄ordered⇄checkbox 変換コマンド | `lists-tables.test.ts`  |                                                                                                                     |
| 3. スマートEnter機能                | リスト継続・空項目脱出                    | `navigation.test.ts`    | Enter による「次にカーソルがどこへ行くか」が主眼。editing-core と迷うが Raw のスマート Enter は navigation 系コマンド実装（`src/raw/commands/`）なので実装と揃える          |
| 4. Smart Select All           | 段階的選択拡大                        | `navigation.test.ts`    |                                                                                                                     |
| 4.3 Table Vertical Navigation | テーブルセルの上下移動                    | `navigation.test.ts`    | suite/raw では lists-tables に置いたが、extension 層は「コマンドとして何が動くか」が主眼なので navigation。※どちらかに寄せたければ lists-tables でも可。決めたら両レイヤーで揃えること |
| 4. インデント調整機能（番号重複）            | Tab/Shift+Tab のインデント           | `editing-core.test.ts`  | 分割時に suite 番号を「14.」等へ採番し直して重複解消                                                                                           |
| 5. チェックボックス機能                 | トグルコマンド                        | `lists-tables.test.ts`  |                                                                                                                     |
| 6. エッジケース（6.1〜6.8）            | 全て「空行・ネスト・タブ混在での**リスト整形**」     | `lists-tables.test.ts`  | 名前は「エッジケース」だが中身は全部リスト整形なので解体不要、丸ごと移動                                                                                      |
| 7. Advanced Settings          | `advanced.*` 設定の反映             | `settings.test.ts`      |                                                                                                                     |
| 8. Slash Commands             | Raw のスラッシュコマンド                 | `shortcuts.test.ts`     |                                                                                                                     |
| 11.1c FileSystemWatcher 検知    | 外部書き換え検知の切り分け                  | `external-sync.test.ts` | skip 中の 11.1（自動リロード）も一緒に                                                                                                  |
| 11.2 再採番の Undo                | renumber + Undo の統合            | `lists-tables.test.ts`  | 症状は「リスト番号が壊れる」                                                                                                            |
| 11.3 最左項目の Shift+Tab          | インデント境界でクラッシュしない               | `editing-core.test.ts`  | インデント調整の境界ケース                                                                                                             |

（「11. バグハンティング」suite は寄せ集めなので**解体**し、各テストを症状カテゴリへ振り直す。）

#### `preview.test.ts`（506 行） → `extension/preview/` 3 ファイル

| 現 suite / test                          | 中身                                          | 移行先                     | 思想                                                                        |
| --------------------------------------- | ------------------------------------------- | ----------------------- | ------------------------------------------------------------------------- |
| 9.1 左を Preview→Raw に戻しても右へフォーカスが移動しない   | マルチファイル時のタブ間フォーカス                           | `tabs-editors.test.ts`  | カーソル系に見えるが「VS Code のエディタフォーカス」というタブ管理の症状。webview 内カーソルの cursor-focus とは別物 |
| 9.2 CodeLens(openPreview)               | 他ファイル Preview 中のトグル                         | `tabs-editors.test.ts`  |                                                                     |
| 10.1〜10.6 VS Code 本体設定との連携              | `alwaysOpenNewTab`/`wordWrap`/`wrapTabs`    | `settings.test.ts`      |                                                                     |
| 12.1 Raw→Preview→Raw で内容不変・dirty 化しない   | 切替時の内容同期                                    | `external-sync.test.ts` |                                                                     |
| 12.2 外部書き換えでタブ維持                        | FileSystemWatcher とタブ                       | `external-sync.test.ts` | 「タブが維持される」が判定だが守っているのは外部編集フロー                                             |
| 12.3 dirty Raw 編集が往復で失われない              | `dirty-raw-edit-preview-switch-loss-fix.md` | `external-sync.test.ts` |                                                                     |
| 12.4 openWith 二重実行でタブ増殖しない              | タブ管理                                        | `tabs-editors.test.ts`  | suite 12 は解体し、テスト単位で振り直す                                                  |
| 12.5 markdown 以外で togglePreview は no-op | トグル判定                                       | `tabs-editors.test.ts`  |                                                                     |
| 12.6 untitled ファイルの Preview 化           | 未保存文書の内容維持                                  | `external-sync.test.ts` | 「本文が失われない」= 内容同期の症状                                                       |
| 13.1/13.2 サイドバー再オープンでタブ重複しない            | タブ管理                                        | `tabs-editors.test.ts`  |                                                                     |

***

## 4. 移行時に必ず更新するもの（チェックリスト）

1. **`test/suite/index.ts`**（実 VS Code テストの Mocha エントリ）: glob を
   `extension/**/*.test.ts` に対応させる。
2. **`package.json`** **の test スクリプト**: `test:unit` / `test:browser` の対象 glob が
   サブディレクトリを拾うか確認（`test/browser/**/*.test.ts` 形式へ）。
3. **`scripts/`（docs:test-catalog 生成）**: 走査 glob の深さ対応。カタログの
   「ディレクトリ → 層の説明」もカテゴリ説明を追加。
4. **import パス**: ハーネス（`previewBrowserHarness` / `milkdownHarness` / `jsdomSetup` /
   `helpers`）は各レイヤー直下に残すため、移動したテストからは `../xxx` に一段深くなる。
5. **`test/README.md`** **と** **`CLAUDE.md`**: 構成図・「どちらのテストを書くか」にカテゴリの
   判定基準（§1.4 の表）を反映。
6. **`docs/testing/spec-test-coverage.md`**: パス変更を反映。
7. **`npm run docs:test-catalog`** **を再生成してコミットに含める**（必須運用ルール）。

## 5. カテゴリ別ギャップ（再編後にまず書くべきテスト）→ 消化済み（2026-07-07）

再編と同時に以下の5件を TDD で消化した。全て `npm run test:unit` / `npm run test:browser` で passing。

| ギャップ                                                                                          | 追加したテスト                               | 中身                                                                     |
| --------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| `browser/cursor-focus/`: 複数ブロックの展開が絡む編集中の位置移動が未カバー                                            | `multiBlockExpandChain.test.ts`       | 見出し→チェックボックス→blockquote→見出しの3ブロック以上の連鎖移動で、記法が汚れずカーソルが正しいブロックに残ることを検証   |
| `browser/external-sync/`: 短時間に複数回連続する外部 push が未カバー（空だった）                                      | `rapidExternalUpdates.test.ts`        | 待機なし5連続 update・編集中の連続 update・サイズ増減を繰り返す update でクラッシュしないことを検証          |
| `browser/ime/`: IME 変換中（未確定）に外部 update が届くケースが未カバー                                            | `imeExternalUpdateRace.test.ts`       | 変換中に無関係な段落へ update が届いても確定後にテキストが失われないことを検証                            |
| `webview/cursor-focus/`: `blockPrefixEditPlugin` の `selection.map`（トランザクションによる位置写像）の単体固定が未カバー | `blockPrefixEditSelectionMap.test.ts` | 展開中のブロックより前のブロックが編集され文書長が変わっても nodePos/contentStart が正しく再マッピングされることを検証 |
| `extension/preview/tabs-editors/`: 3 ファイル以上開いた状態のトグルが未カバー（2ファイルまでだった）                         | `tabs-editors.test.ts` の `9.3`        | 3ファイル全て Preview 中に真ん中だけ Raw へ戻しても両隣の Preview タブが維持されることを検証             |

新しいギャップが見つかった場合はこの表の下に追記していく。

## 6. 移行手順（段階移行）

一括リネームは import・glob・カタログ・`MOCHA_GREP` を全部同時に壊すため、次の順で行う:

1. **Step 0（すぐ）**: 新規テストは新構造のパスに置く。今回のフォーカスバグ再現テストは
   `test/browser/cursor-focus/` を最初のディレクトリとして作成して置く。
   `package.json` / カタログ生成の glob を `**/` 対応にする（この時点で旧フラット配置と共存可能）。
2. **Step 1**: `test/extension/` の分割（効果最大・ファイル数最少）。suite 番号は維持。
3. **Step 2**: `test/suite/preview/`・`test/suite/raw/` のカテゴリ分割（import 影響が最小）。
4. **Step 3**: `test/browser/` → カテゴリ分割（ハーネス import を `../` へ一括修正）。
5. **Step 4**: `test/webview/` → カテゴリ分割（同上）。
6. 各 Step ごとに `npm run test:all` + `npm run docs:test-catalog` 再生成をコミットに含める。
