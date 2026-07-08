# Preview 編集中のフォーカス位置変化バグ — 関連テスト一覧

作成日: 2026-07-06

## 背景

Preview（Milkdown WYSIWYG）で編集中にカーソル/フォーカスの位置が意図せず変わる不具合は
過去に複数回発生・修正されている。今回の「まだエラーが出る」報告の切り分け用に、
関連する既存の修正仕様・テストを棚卸しする。

## 1. 過去に修正済みの「フォーカス/カーソルが飛ぶ」系バグ（仕様書）

| 仕様書 | 症状 | 再現テスト |
|---|---|---|
| `docs/specifications/checkbox-cursor-jump-fix.md` | チェックボックス変換（⌥⌘4 等）時、対象行以外の既存リストブロックへカーソルが飛ぶ | `test/browser/blockPrefixBugs.test.ts` |
| `docs/specifications/external-update-cursor-jump-fix.md` | 外部（Raw/AI/他ツール）が同じファイルを編集し update が届くと、カーソルが外部が編集した行へ飛び、直後の入力がそこに混入する | `test/browser/externalUpdateRace.test.ts` |
| `docs/specifications/stale-external-push-cursor-jump-fix.md` | 古い外部内容の push（特にテーブルセル編集中）でカーソルが文書末尾へ飛ぶ | `test/browser/*`（stale push 系） |
| `docs/specifications/code-block-tab-focus-leak-fix.md` | コードブロック内で Tab キーを押すと、ブラウザのネイティブ「次のフォーカス可能要素へ移動」が発動し、次の見出し等の DOM 要素へフォーカスが漏れる | `test/browser/codeBlockTabFocus.test.ts` |

## 2. 「フォーカス」を扱う既存テスト一覧（レイヤー別）

### 実 VS Code（`test/extension/`）— タブ・エディタ間フォーカス

- `test/extension/preview.test.ts:42`
  スイート 9.1 **「左のファイルを Preview→Raw に戻しても右のファイルへフォーカスが移動しない」**
  （マルチファイル時の VS Code タブ・エディタフォーカス）

### 実 Chromium（`test/browser/`）— DOM フォーカス・キー入力依存

- `test/browser/collapseMarkdownSync.test.ts:93`
  「何も変更せずフォーカスして離れただけなら、余計な change は増えない（重複判定の回帰確認）」
- `test/browser/dragSelectDuringExpand.test.ts:52`
  describe「フォーカス展開中の別ブロックが残ったままドラッグ選択できる」
- `test/browser/usageFlows.test.ts:207`
  「チェックボックス入力後にフォーカスを外して戻っても、続きは同じ項目に入力される」
- `test/browser/blockPrefixBugs.test.ts:101`
  「Bug2: H2 フォーカス→外す を複数回繰り返してもプレフィックスが累積しない」
- `test/browser/codeBlockTabFocus.test.ts:39`
  「コードブロック内で Tab キーを押してもフォーカスがエディタ外へ出ない」
- `test/browser/typedCheckboxConversion.test.ts:124`
  「回帰確認: 通常の箇条書き（チェックボックスでない）は今まで通りフォーカス中に "- " が展開される」
- `test/browser/headingFocusMarkerBugs.test.ts:22,38`
  describe「見出し行頭マーカー（## ）の focusSyntaxPlugin バグ回帰」
  → it「Bug1: 見出し行にフォーカスがある/ない状態で見出しの描画幅が変わらない」
- `test/browser/basicOperations.test.ts:145`
  describe「カーソル進入→離脱で内容が壊れない（focus syntax ラウンドトリップ）」

### jsdom + Milkdown 実エディタ（`test/webview/`）— ロジック統合

- `test/webview/blockPrefixEdit.integration.test.ts`（describe「blockPrefixEditPlugin: フォーカスでプレフィックス展開」）
  - `:143` H2 にフォーカスすると "## " がテキスト先頭に現れる
  - `:208` リンクで始まる見出しにフォーカスしても、挿入した "## " がリンクのマークを継承しない
  - `:291` リンクで始まる箇条書きにフォーカスしても、挿入した "- " がリンクのマークを継承しない
  - `:338` リンクで始まる blockquote にフォーカスしても、挿入した "> " がリンクのマークを継承しない
- `test/webview/previewDiffFocusExpand.integration.test.ts`
  describe「Git差分ガター × フォーカス展開の相互作用」
  - `:90` 見出しにフォーカスしただけ（未編集）で誤って「変更」と判定される（不具合の再現）
  - `:102`〜`:124` 見出し/箇条書き/blockquote にフォーカスしても、展開中プレフィックスを除いて比較すれば差分は出ない（修正後）
- `test/webview/previewKeymap.integration.test.ts:360`
  「フォーカスが無いときは何もしない（preventDefault/stopPropagation せず false）」
- `test/webview/focusSyntaxMarker.test.ts`
  describe「focusSyntax: 行内記法マーカー要素」/「focusSyntax: マーカークリック位置ナビゲーション」

### jsdom 純関数（`test/suite/preview/`）— ロジックのみ

- `test/suite/preview/previewFocusSyntax.test.ts`（describe「focusSyntaxHelpers」— focusSyntaxPlugin のヘルパー関数の純ロジックテスト）
- `test/suite/preview/toggleDecision.test.ts:38`
  「Preview にフォーカス中（Raw エディタ非アクティブ）なら、その Preview を Raw に戻す」

## 3. まだテスト化されていない・未解決の関連項目

`docs/specifications/preview-usage-flow-test-backlog.md` より:

- 「同一ファイルを 2 つの Preview パネルで同時編集」→ 機能自体が現状無効化されているため対応見送り
- 「Raw モードの外部書き換え自動リロード」→ `@vscode/test-electron` 環境の制約で自動テスト化できず、実環境での手動確認が保留中

これらは今回の「編集中にフォーカスが変わる」報告の直接原因ではなさそうだが、
外部からの再描画・タブ切り替え絡みという点で関連候補として記載。

## 4. 次のアクション（提案）

上記のどのテストにも一致しない新しい再現パターンがあれば、CLAUDE.md の TDD ワークフロー
（失敗するテスト → 仕様更新 → 実装修正 → 成功確認）に従って新規に切り分けるのが良い。
再現できる具体的な操作手順（どのブロック種別で、どんな編集をした時か）があれば
`test/browser/` への追加が最有力（DOM フォーカス依存のため）。
