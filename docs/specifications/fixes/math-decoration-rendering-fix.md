# KaTeX 数式が一度も描画されない不具合の修正（デコレーション方式へ移行） 仕様

最終更新: 2026-07-02

## 1. 症状

`preview.enableMath` を有効にしても、`$...$` / `$$...$$` の数式が Preview 上で
**一度も KaTeX レンダリングされない**（`$` 記法のソーステキストのままになる）。

実 Chromium テスト `test/browser/mathRendering.test.ts` で決定的に再現
（`.katex` 要素が 0 個）。

## 2. 根本原因

旧実装は `katex/contrib/auto-render`（`renderMathInElement`）で、ProseMirror が管理する
contentDOM のテキストノードを KaTeX の `<span>` 群へ**外側から直接置き換えて**いた。
ProseMirror の MutationObserver は「自分が作っていない変更」を検知すると DOM を
巻き戻す／再パースするため、描画結果は即座に消える。これは Mermaid で起きた問題
（CHANGELOG 1.9.10「Mermaid diagrams never rendered」、`mermaidDiagramPlugin.ts`）と
同型で、Mermaid はデコレーション方式へ移行済みだったが数式は旧方式のまま残っていた。

## 3. 修正方針（`mathDecorationPlugin.ts`）

Mermaid と同じく ProseMirror デコレーションで描画する。KaTeX は同期レンダリング
（`katex.renderToString`）なので Mermaid のような非同期キャッシュ機構は不要。
さらに Typora 風の挙動にする:

- **カーソルが数式の外**: ソーステキスト（`$...$`）を `Decoration.inline`
  （CSS `display:none`）で隠し、直後に `Decoration.widget` で KaTeX の描画結果を表示。
- **カーソルが数式の中（境界含む）**: デコレーションを付けない（ソースがそのまま
  見えて編集できる）。widget をクリックするとカーソルが隣に置かれ、自然にソース表示へ
  切り替わる。
- 選択位置に依存するため、decorations は doc 変更時だけでなく**毎 state から計算**する
  （`props.decorations(state)` 直計算。レンダリング結果は式単位でキャッシュ）。

対象: コードブロック・インラインコード以外のテキストノード内で完結する
`$$式$$`（displayMode）と `$式$`（インライン）。`$` の直後が空白のもの
（`$ 100` のような金額表記）は数式とみなさない。

旧 `renderMath` / `enhanceRenderedContent` / `katex/contrib/auto-render` import は削除。
`enableMath` 設定は `setMathEnabled`（モジュールフラグ、Mermaid の `setMermaidEnabled` と
同じパターン）で反映する。CSS は `media/milkdown-preview.css` の
`.ipreview-math-source` / `.ipreview-math` / `.ipreview-math-display`。

## 4. テスト

`test/browser/mathRendering.test.ts`（実 Chromium・5 件）:
インライン/ブロックの描画、`enableMath: false` で描画されないこと、
編集後も保存 markdown に数式ソースが保たれ KaTeX の HTML が混入しないこと、
数式行そのものを編集しても壊れないこと。
