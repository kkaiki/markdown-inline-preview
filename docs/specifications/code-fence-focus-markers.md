# フェンスコードブロックのフォーカス時マーカー表示（```lang` / ```` ``` ````）

> **2026-07-09 追記: この widget 方式は `code-fence-real-text-edit-fix.md` に置き換えられた。**
> 「``` の文字自体を1文字ずつ打ち替え・削除したい」というユーザー要望を受け、
> フェンスは widget 表示ではなく `codeFenceEditPlugin` による実テキスト展開になった。
> 本ドキュメントは経緯（widget 方式を選んだ理由と、実テキスト化を避けていた背景）の
> 記録として残す。関連テスト（`codeFenceFocusMarkers.test.ts`）は削除し、
> `test/browser/focus-expand/codeFenceRealTextEdit.test.ts` に置き換えた。

## 背景

見出し・箇条書き・引用・インライン記法（`**` `` ` `` `~~` `[..](..)`）は、カーソルが
中にあるあいだ Obsidian の Live Preview 同様に Markdown 記法を表示する
（`focusSyntaxPlugin.ts` / `blockPrefixEditPlugin.ts`）。フェンスコードブロック
（`` ```lang `` 〜 `` ``` ``）だけはこの対象になっておらず、フォーカスの有無に関わらず
言語名やフェンス行が常に見えなかった。

## 仕様

コードブロックにカーソルがあるあいだ、`focusSyntaxPlugin` が次の 2 つの
`Decoration.widget` を表示する（`getCodeFenceMarkers`、`src/shared/markdown/focusSyntaxHelpers.ts`）:

- 開始行: `` ```lang ``（`lang` が空なら `` ``` `` のみ）+ 改行 — コード内容の直前
- 終了行: 改行 + `` ``` `` — コード内容の直後

見た目は見出し等と同じ `.md-syntax-marker`（`contenteditable="false"`、`white-space: pre`）
を使う。`white-space: pre` が要素自身に指定されているため、marker のテキストに含めた
改行文字がそのまま行送りとして描画される（`<pre>` の white-space 継承に頼らない）。

## 見出し等（実テキスト展開）とは異なる方式を選んだ理由

見出し・箇条書き・引用は `blockPrefixEditPlugin` が**実テキスト**としてプレフィックスを
挿入し、そのまま編集できるようにしている（Backspace で 1 文字ずつ削除でき、`## ` を
`### ` に打ち替えると `level` 属性が自動更新される等）。

コードブロックにはこの方式を採らなかった。`code_block` ノードは中身がそのまま保存用の
コードテキストであり、フェンス行（`` ```js ``）を実テキストとして混ぜてしまうと:

- シリアライズ（`toMarkdown`）は `node.content.firstChild.text` をそのままコードの中身
  として扱うため、実テキストの `` ``` `` が保存時にコードの一部として紛れ込む
  （ネストしたフェンス扱いになり Markdown として壊れる）。
- `codeHighlightPlugin`（hljs によるシンタックスハイライト）や `codeLanguagePlugin`
  （言語ドロップダウン）がフェンス文字列込みでハイライト・言語判定してしまう。

widget decoration（実文書には何も挿入しない）であれば、これらの懸念が一切ない。
`getExpandedBlock() !== null` によるガード（見出し等が実テキスト展開中は
`focusSyntaxPlugin` 側の重複描画を防ぐためのもの）より**先に** `code_block` を判定し、
`blockPrefixEditPlugin` の展開状態に関係なく常にフェンスマーカーを出す。

## 実装

- `getCodeFenceMarkers(node)`（`src/shared/markdown/focusSyntaxHelpers.ts`）: `code_block`
  ノードから `{ open: '```' + language, close: '```' }` を返す純関数。
- `findFocusedBlockDepth`: `code_block` も「フォーカス対象ブロック」として認識するよう拡張。
- `focusSyntaxPlugin.ts` の `blockMarkerDecoration`: 単一の `Decoration | null` ではなく
  `Decoration[]` を返すようにし、コードブロックの開始/終了の 2 つの widget を返せるようにした。

## テスト

- `test/suite/preview/cursor-focus/previewFocusSyntax.test.ts`: `getCodeFenceMarkers` /
  `findFocusedBlockDepth` の純関数テスト。
- `test/browser/focus-expand/codeFenceFocusMarkers.test.ts`（実 Chromium）:
  - フォーカス中に開始行・終了行の widget が表示される。
  - フォーカスが外れると widget が消える。
  - widget は装飾のみで、実文書（`doc.textContent`）やホストへ送る markdown には
    `` ``` `` が混入しない（編集後の round-trip も確認）。
