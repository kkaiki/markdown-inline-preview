# Preview: 見出し・引用のフォーカス展開で末尾スペースが消える不具合の修正 仕様

最終更新: 2026-07-01

## 1. 症状

Preview で新しい行に `## heading` や `> quote` を**1文字ずつ実際にタイプ**すると、`## ` / `> ` へ変換された直後（プレフィックスがまだ空の状態）に続けて文字を打つと、プレフィックスと本文の間の**半角スペースが消える**（`##heading`、`>quote` のように空白無しでくっつく）。

チェックボックス（`typed-checkbox-conversion-fix.md`）や箇条書き（`- item`）・番号付きリスト（`1. item`）では再現しない。**見出しと引用だけ**で再現する。

## 2. 根本原因

`blockPrefixEditPlugin` の `expandBlock` は、フォーカスしたブロックのプレフィックス（`## `、`> ` 等）を `state.tr.insertText(prefix, contentStart)` で**プログラム的に**挿入する。この時点でブロックの中身はまだ空なので、挿入したプレフィックスの末尾スペースがテキストブロックの**末尾**に来る。

ブラウザの contenteditable は、実際のキー入力でテキストブロック末尾にスペースを打つと、視覚的につぶれないよう ` `（non-breaking space, U+00A0）として DOM に反映することが多い（`typed-checkbox-conversion-fix.md` で判明した挙動）。しかし `insertText` によるプログラム的な挿入は素の半角スペース（U+0020）をモデルへ直接書き込む。この状態で DOM が再描画されると、ブラウザは**末尾の素の半角スペースを表示上つぶしてしまう**ことがあり、続けてユーザーが実際のキー入力（例: `h`）を行うと、ProseMirror の domObserver は「DOM とモデルの差分」を読み取る際に、この視覚的に潰れた（実質不在の）スペースを**文字に置き換えられた**ものとして扱ってしまい、スペースが失われる。

`list_item`（箇条書き・番号付き・チェックボックス）は Milkdown の `list-item-block` Web Component でレンダリングされ、同じ問題は起きない（Web Component 側のレンダリングが素のブラウザの空白つぶれ挙動の影響を受けにくいため）。`heading`・`blockquote` は素の `<h1>`〜`<h6>` / `<blockquote><p>` 要素でレンダリングされるため、ブラウザ既定の空白つぶれ挙動をそのまま受ける。

## 3. 修正方針

`getFocusedBlockInfo` の heading・blockquote 分岐で、プレフィックスの末尾区切り文字を実キー入力と同じ non-breaking space（` `）にする:

```ts
// heading
prefix: '#'.repeat(level) + ' ',
// blockquote
prefix: '> ',
```

対応する collapse 側の検出も、素の半角スペースだけでなく non-breaking space も受け付けるよう `\s` を使った正規表現に変更する（`collapseHeading` の `/^(#{1,6})\s/`、`collapseBlockquote` の `/^>\s/`）。

`list_item` のプレフィックス（`- `、`1. ` 等）は今回変更していない（該当バグが再現しないため、リスクの無い範囲に修正を留めた）。

## 4. テスト方針

DOM 実レイアウト・ブラウザの空白つぶれ挙動・実際のキー入力タイミングに依存するため、jsdom では再現できない。`test/browser/headingBlockquotePrefixSpace.test.ts` に実 Chromium テストとして追加し、以下を検証する:

- 見出しレベル 1〜3、引用のそれぞれを新規タイプして、プレフィックスと本文の間に半角スペースが保持されること。
- collapse 後、保存 markdown にプレフィックス（`## `、`> `）が正しく（二重化・欠落せず）反映されること（回帰確認）。
