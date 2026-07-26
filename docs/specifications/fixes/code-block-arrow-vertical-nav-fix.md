# コードブロック内で ↑/↓（縦移動）を押すとブロック境界を正しく越えられないバグ

## 症状（ユーザー報告）

Python の `class` 定義など、フェンスコードブロック（` ```python ` 〜 ` ``` `）の
**1行目にある単語**（クラス名）をダブルクリックで選択した状態で ↑（ArrowUp）を押すと、
コードブロックの直前のブロックではなく **文書の一番先頭** までカーソル/選択が飛ぶ。

## 再現・原因

フォーカス中のコードブロックは、開始行（` ```lang `）と終了行（` ``` `）を
`contenteditable="false"` の widget として表示する
（`focusSyntaxPlugin.ts` の `blockMarkerDecoration`、[code-fence-focus-markers.md](./code-fence-focus-markers.md)）。
この widget のテキストには改行文字が含まれており（例: `` ```python\n ``）、複数行に
またがる非編集領域としてレンダリングされる。

ここでネイティブのキャレット上下移動（ブラウザ自身の「1行上/下へ移動」処理）に任せると:

- **コードブロック1行目からの ArrowUp**: widget（改行入りの `contenteditable="false"` 領域）の
  境界を越える DOM 位置解決に失敗し、ProseMirror が選択を復元できず**文書先頭
  （`pos ≈ 1`）へフォールバック**してしまう。
- **コードブロック最終行からの ArrowDown**（対称の境界）: 終了行 widget の直後へ抜けられず、
  キャレットが最終行に留まったまま何も起きない（ブロック直後のブロックへ進めない）。

いずれも `test/browser/cursor-focus/codeBlockArrowUpJumpToTop.test.ts` で、修正前の実装に
対して実 Chromium 上で再現を確認した（クリック位置は `page.getByText(...).click()` では
hljs のシンタックスハイライト `<span>` 分割により意図しない要素をクリックすることがあるため、
DOM の `Range.getClientRects()` から実座標を計算して `page.mouse` で直接クリックする
`clickTextAt`/`doubleClickTextAt`（`previewBrowserHarness.ts`）を用いた）。

なお、コードブロックの**内部**（1行目・最終行以外の行同士）の上下移動はネイティブの
キャレット移動でも正しく動作しており、この不具合の対象外。

## 修正

`src/preview/webview/codeBlockArrowKeymap.ts` を新設し、コードブロック内にカーソン/選択が
あるときの ↑/↓ を `handleKeyDown` で横取りする。ネイティブのキャレット移動には一切
頼らず、`code_block` の生テキスト（`node.textContent`）を `codeBlockLines.ts` の
`lineRangeAt`（既存の行範囲計算・トリプルクリックで使用）で行分割し、移動先を手動計算する:

- 現在行が1行目で ArrowUp → ブロックの外（直前）へ `Selection.near` で抜ける。
- 現在行が最終行で ArrowDown → ブロックの外（直後）へ `Selection.near` で抜ける。
- それ以外 → 隣接行へ移動（列位置はできる限り保持し、短い行にはクランプ）。

修飾キー付き（Shift 範囲選択・Cmd 等）は対象外とし、既存の `tableArrowKeymap.ts` と
同じ方針でネイティブ動作に委ねる。`milkdownApp.ts` で `createTableArrowKeymapPlugin()` の
直後に登録。

## テスト

`test/browser/cursor-focus/codeBlockArrowUpJumpToTop.test.ts`（実 Chromium）:
- コードブロック1行目の単語選択 → ArrowUp で、直前の段落（文書先頭ではない）へ抜ける
- コードブロック2行目の単語選択 → ArrowUp で、ブロック内の1行目へ留まる
- コードブロック3行目（最終行）の単語選択 → ArrowUp で、ブロック内の2行目へ留まる
- コードブロック2行目の単語選択 → ArrowDown で、ブロック内の3行目へ留まる
- コードブロック最終行の単語選択 → ArrowDown で、直後の見出し（ブロック内に留まらない）へ抜ける

`test/browser/previewBrowserHarness.ts` に `clickTextAt` / `doubleClickTextAt`
（DOM Range ベースの実座標クリック）を追加。コードブロックに限らず、hljs 等で
テキストが複数 `<span>` に分割される箇所を実クリックで検証する際に再利用できる。
