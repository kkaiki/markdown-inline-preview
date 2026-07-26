# Preview: フォーカス展開中の別ブロックが残ったままドラッグ選択できない不具合の修正 仕様

最終更新: 2026-07-02

## 1. 症状

Preview を開くと、最初のブロック（見出しなど）が「フォーカスで記法展開（Typora 風）」（`blockPrefixEditPlugin`）により自動で展開される（auto-expand）。この状態のまま、**別のブロック**（例: 箇条書き項目のテキスト部分）をマウスでドラッグして範囲選択しようとすると、選択が完了しない（mouseup 後も選択が空のまま）。

## 2. 根本原因

`blockPrefixEditPlugin` の `view.update()` は、selection が変化するたびに「フォーカス中のブロックが変わったか」を判定し、変わっていれば旧ブロックの collapse（プレフィックス削除のテキスト変更を伴う transaction）を即座に発火させる。

ドラッグの最中、ブラウザは mousedown 位置から mousemove の位置までネイティブ選択を伸ばしていくが、その過程で ProseMirror の selection も逐次変化する。この変化のたびに旧ブロック（auto-expand された見出しなど）の collapse transaction が発火し、**ドラッグの途中でドキュメントが変化**すると、ブラウザが内部で追跡しているネイティブ選択の anchor/focus ノードが無効になる。結果、mouseup 時点の最終選択が正しく反映されない（選択が空になる）。

## 3. 修正方針（`blockPrefixEditPlugin.ts`）

マウスボタンが押されている間（`mousedown`〜`mouseup`）は expand/collapse の同期を保留し、`mouseup` 後にまとめて 1 回だけ同期する。

- `view()` の中で `document` に `mousedown`/`mouseup` を購読し、`isDragging` フラグを管理する。
- `update()` の先頭で `if (isDragging) return;` して、ドラッグ中の selection 変化には反応しない。
- `mouseup` で `isDragging` を `false` に戻し、展開状態を最終 selection に合わせて同期する（`syncExpandedBlock`）。

### 注意点: `mouseup` 時点ではまだ selection が同期されていないことがある

`update()` は本来 ProseMirror の transaction 適用直後に同期的に呼ばれるが、**ドラッグを伴わない単純なクリック**でも `mousedown`→`mouseup` は一瞬だけ発生する。この `mouseup` ハンドラで即座に `syncExpandedBlock` を呼ぶと、クリックによるブラウザのネイティブ selection 変更が **まだ ProseMirror 側の `state.selection` に反映されていない**（`selectionchange` → `domObserver` 経由の反映が非同期になりうる）タイミングで動いてしまうことがあり、古い selection のまま「ブロックは変わっていない」と誤判定して、展開中ブロックの折りたたみが一切起きなくなる回帰があった（`見出しに入って出ても内容が保持される` 等のラウンドトリップテストで発覚）。

`mouseup` の同期処理は `setTimeout(..., 0)` で次のタスクへ遅延させ、ブラウザの `selectionchange` が ProseMirror 側へ反映される猶予を与えてから実行する。

## 4. テスト方針

実 Chromium（`test/browser/dragSelectDuringExpand.test.ts`）で:

- 見出し（auto-expand 済み）が残ったまま、最初の箇条書き項目のテキストをドラッグ選択できること。
- （比較）見出しの展開が既に解除されていれば、同じドラッグは元から選択できること。

回帰防止として、既存の `test/browser/basicOperations.test.ts`「カーソル進入→離脱で内容が壊れない（focus syntax ラウンドトリップ）」（見出し/箇条書き/番号付き/引用の 4 パターン）が全て通ることも確認する。マウスイベントの発火順序・`selectionchange` の反映タイミングに依存するため jsdom では再現できない。
