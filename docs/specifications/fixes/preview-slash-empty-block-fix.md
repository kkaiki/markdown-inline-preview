# Preview スラッシュメニュー: 空ブロック項目が壊れる不具合の修正 仕様

最終更新: 2026-07-02

## 1. 症状

Preview のスラッシュメニューで「本文が空のブロック」を作る項目を確定すると壊れる:

- `/todo` → チェックボックスにならず、literal な `[ ]` テキストの段落になる
- `/h1`〜`/h6`・`/quote`・`/bullet` 等 → **ブロックが丸ごと消え**、カーソルが隣の
  ブロックへ飛び、続けてタイプした文字が隣のブロック（例: 次の段落の先頭）に混入する

実 Chromium テスト `test/browser/slashMenuDom.test.ts` で決定的に再現。
（`/table` と `/divider` のような「本文を伴わない」項目は無事だった。）

## 2. 根本原因（2 つ、複合）

1. **空本文の Markdown はパースで劣化する**: `## `（本文なし見出し）は空スライスに、
   `- [ ] `（空タスク項目）は GFM タスクとして認識されず literal な `[ ]` テキストになる
   （CHANGELOG 1.9.9 の「serializer が空タスクの `[ ]` を落とす」問題のパーサ側の対）。
2. **`markdownToSlice` は open な Slice を返す**: `openStart/openEnd > 0` のまま
   `tr.replace` すると、ブロックのラッパー（`bullet_list` 等）が剥がされて中身だけが
   元の段落コンテキストへ流し込まれる。リスト系はこれで構造ごと消えていた。

## 3. 修正方針（`previewSlashMenu.ts` の `applyItem`）

- `previewMarkdown` が**末尾スペースで終わる**（＝本文を続けて書く）項目は、
  プレースホルダー文字（U+2060 word joiner、本文に現れない不可視文字）を足して
  パースし、置換後にその 1 文字を削除して**そこへカーソルを置く**。
  これで `- [ ] ⁠` は正しい `checked=false` のタスク項目としてパースされ、
  `## ⁠` は空でない見出しとしてパースされる。
- パース結果の Slice は `new Slice(slice.content, 0, 0)` で**深さ 0 に閉じて**から
  置換する（トップレベルブロックの置換なので、ラッパーごと入れるのが正しい）。

## 4. テスト

`test/browser/slashMenuDom.test.ts`（実 Chromium・6 件）:
メニューが開く／全コマンドが並ぶ、`/todo` 絞り込み → Enter でチェックボックス化、
`/h2` 確定 + 入力で見出し化、Escape でテキスト温存して閉じる、
ArrowDown での選択移動と適用、`enableSlashMenu: false` で開かないこと。
