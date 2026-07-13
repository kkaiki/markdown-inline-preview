# Preview: 展開中のブロック内でテキストを選択すると行頭プレフィックスが収縮する不具合の修正 仕様

最終更新: 2026-07-09

## 1. 症状

見出し（`## `）・箇条書き（`- ` / `1. `）・引用（`> `）の行頭プレフィックスは
`blockPrefixEditPlugin` によりフォーカス時に実テキストとして展開される。この展開中の
ブロック内で、マウスドラッグ等によりテキストを選択すると（カーソルを別ブロックへ移動した
わけではないのに）プレフィックスが collapse（実テキストの `## ` / `- ` / `> ` が消えて
widget/CSS 表示へ戻る）し、選択操作の直後に再度 expand が走る。これにより、選択のたびに
テキストの表示位置が左右にずれ、選択中のテキスト編集（Backspace・打ち替え等）がやりづらい
（ユーザー報告 2026-07-09）。

同種の不具合が `inlineMarkEditPlugin`（`**bold**` 等インライン記法の実テキスト展開）側では
既に `inline-mark-focus-edit-fix.md` §3.1 で修正済みだったが、`blockPrefixEditPlugin` 側には
残っていた。

## 2. 根本原因

`blockPrefixEditPlugin.ts` の `getFocusedBlockInfo`（フォーカス中ブロックの判定）が、
`state.selection.empty === false`（選択が空でない）の場合を無条件に「フォーカス対象なし」
として `null` を返していた。

```ts
function getFocusedBlockInfo(state: EditorState): FocusedBlockInfo | null {
    if (suppressExpansion) return null;
    if (!state.selection.empty) return null;   // ← 選択中は常に対象なし
    ...
```

このため、展開中のブロック内でテキストを選択するたびに「フォーカス対象ブロックが無くなった」
と誤判定され、`sync()` が展開中ブロックの collapse を発火させていた。選択後にカーソル
（`$from`）自体はまだ同じブロック内にあるにもかかわらず、選択が空でないという理由だけで
収縮してしまうのが問題だった。

## 3. 修正方針

`inlineMarkEditPlugin.getFocusedInlineMarkBlock` と同じ考え方を採用する: 選択が空でなくても、
選択の両端（`$from` / `$to`）が同一ブロック内に収まっている場合は、そのブロックを引き続き
「フォーカス中」とみなして展開状態を維持する。選択が複数ブロックにまたがる場合のみ、
従来どおり収縮させる。

`getFocusedBlockInfo` は元々 `$from` 側だけを辿ってブロック種別（heading / list_item /
blockquote 内 paragraph）を判定していたため、同じ辿り方を `$to` にも適用して「同じブロックか」
を比較する `findBlockAnchorPos()` を用意し、選択の両端のブロック位置（`nodePos` 相当）が
一致する場合のみ先へ進めるようにする。一致しない場合（選択が複数ブロックにまたがる場合）は
`null` を返して収縮させる。

`expandBlock` 側は単一位置への `tr.insert` のみで完結しており、ProseMirror の既定の
selection マッピングで選択範囲（非空選択）も正しく前進する（`inlineMarkEditPlugin.expandBlock`
のように複数箇所への挿入を伴わないため、選択の手動再構築は不要）。

## 4. テスト

`test/browser/focus-expand/blockPrefixBugs.test.ts`「Bug5」:

- 見出し展開中に同じブロック内のテキストを選択しても `## ` が収縮しない
- 箇条書き展開中に同じブロック内のテキストを選択しても `- ` が収縮しない
- 引用展開中に同じブロック内のテキストを選択しても `> ` が収縮しない
- 「Bug5b」（未フォーカスの見出しをいきなり選択＝ダブルクリック相当で初めてフォーカスが
  入るケース）: 選択範囲が単一カーソルへ潰れず、選択部分だけ Backspace で削除できる。
  `expandBlock` は単一位置への `insert` のみのため、`inlineMarkEditPlugin` で見つかった
  「選択範囲が単一カーソルへ潰れる」副作用（§3 参照、複数箇所への挿入が原因）は
  そもそも発生しないことをテストで確認済み（バグ無し・回帰防止ロックとして追加）。

回帰確認（既存テスト、修正前後で green のまま）:
- `test/browser/focus-expand/blockPrefixBugs.test.ts` の Bug1〜Bug4（チェックボックス変換・
  見出しレベル維持・箇条書きトグル累積・カーソル位置）
- `test/browser/cursor-focus/dragSelectDuringExpand.test.ts` / `multiBlockExpandChain.test.ts`
  （複数ブロックにまたがる場合の収縮挙動）
