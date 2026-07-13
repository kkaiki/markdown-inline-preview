# 空白のみコンテンツの可視化 仕様

最終更新: 2026-07-08

## 1. 背景・要望

Preview（WYSIWYG 編集）で、次の3ケースは目に見える文字が無い/少ないため、
本当に空なのか・空白文字（半角スペース／全角スペース「　」／タブ）が入っているのか
見た目で区別できない:

1. 行（段落等のテキストブロック）の内容が空白文字だけのとき
2. 表セルの中身が空白文字だけのとき（セルは内部的に段落1つを含むため、実体としては 1. と同じ）
3. 行末（テキストブロック末尾）に空白文字が付いているとき（本文はあるが末尾に余分な空白）

これらを視覚的にマークし、ユーザーが「ここに空白文字がある」と気付けるようにする。

## 2. 対象外（スコープ外）

- **真に空のブロック**（テキストノードを一切持たない段落）。`blankLineRemarkPlugin.ts` が
  連続空行の本数を往復させるために作る空 paragraph はこれに該当し、意図的な仕組みなので
  一切触らない・マークもしない。このプラグインが対象とするのは「1文字以上の空白文字から
  成るテキストノード」であり、ゼロ文字のノードは対象外。
- **`code_block` およびインラインコード（`inlineCode`/`code_inline` マーク）の内容**。
  ソースの逐語的な表現であり、空白も意図的な可能性が高いため一切マークしない
  （`mathDecorationPlugin.ts` / `trailingNbspFixPlugin.ts` と同じ除外方針）。

## 3. 実装方針（`whitespaceMarkerPlugin.ts`）

`mathDecorationPlugin.ts` と同じ ProseMirror デコレーション方式（`$prose` プラグイン、
`decorations(state)` prop、doc 変更なし・表示専用）で実装する。

`buildWhitespaceDecorations(doc)`（純関数、テスト容易性のためエクスポート）が
`doc.descendants` でテキストブロックを走査し、各ブロックについて:

- `code_block` は `return false` で内部を一切走査しない。
- テキストブロック（`node.isTextblock`）の直接の子（インライン内容）を集める。
  - 子がすべてテキストノードで、`inlineCode`/`code_inline` マークを持つものが無く、
    連結したテキストが1文字以上かつ全体が空白文字（半角スペース／全角スペース／タブ）
    だけで構成される場合 → ブロック内容全体を1つの `Decoration.inline` でマークする
    （表セルの空白マークもこの分岐で自然にカバーされる。GFM の `table_cell`/
    `table_header` は内部に段落を1つ持つ構造のため）。
  - 上記に該当しない（本文がある）場合、末尾から連続する空白文字ラン（インラインコード・
    画像等の非テキストノードで途切れたら打ち切り）を求め、あれば末尾の空白部分だけを
    `Decoration.inline` でマークする。

マーク用クラス名: `ipreview-whitespace-marker`。

## 4. CSS

`media/milkdown-preview.css` の `.ipreview-whitespace-marker`:

- `--vscode-editor-findMatchHighlightBackground` 系と同様に VS Code テーマ変数 +
  rgba フォールバックで薄い背景色を付ける。
- 単なるハイライトではなく「空白文字がある」と分かるよう、
  `radial-gradient` によるドットパターンを重ねる
  （`background-size: 1ch 1ch` で概ね1文字幅ごとにドットが来るようにする）。
- ダークモード専用の上書きは無し（`--vscode-*` 変数がテーマに応じて自動的に値を変えるため、
  既存の `.ipreview-math-source` 等と同様に `dark.css` / `markdown-preview-light.css` 側の
  追加定義は不要）。

## 5. テスト

`test/webview/rendering/whitespaceMarker.test.ts`（jsdom + 実 Milkdown、8件）:

- 全角スペースのみの段落全体にマーカーが付く
- 半角スペースのみの段落全体にマーカーが付く（markdown ソースでは半角スペースのみの行は
  空行として消えるため、実際の編集操作を模して doc へ直接書き込んで検証）
- 表セルの中身が全角スペースのみのときそのセルにマーカーが付く
- 行末の全角スペースにマーカーが付く（本文部分は対象外）
- 行末の半角スペース複数にマーカーが付く（本文部分は対象外）
- 通常の文字だけの段落にはマーカーが付かない
- `blankLineRemarkPlugin` が作る真に空の段落（空行保持用）は対象外
- コードブロック内の行末・内部の空白は対象外
