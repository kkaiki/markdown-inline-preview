# コピーすると空行が増殖する不具合の修正（copy-blank-line-inflation-fix）

最終更新: 2026-07-27

## 症状（ユーザー報告 2026-07-27）

Preview で範囲を選択してコピーし、他アプリ（ChatGPT 等）へ貼り付けると、内容が
ソースと違う形になる。ソースの空行 1 行が、貼り付け先では 4 行になる。

```text
ソース:                    コピー結果:
前の段落                   前の段落
                           （空行）
```                        （空行）
Animate ...                （空行）
```                        （空行）
                           ```
後の段落                   Animate ...
                           ```
                           （空行 ×4）
                           後の段落
```

## 真因

Preview は空行をソースと 1:1 の空 paragraph として保持している
（`blank-line-preservation.md`）。この空 paragraph は remark-preserve-empty-line が
`<br />` プレースホルダとして直列化する。

ファイルへ書き戻す `postChange`（`milkdownApp.ts`）は

```
tightenListSpacing → stripPlaceholderLineBreaks → stripListItemPlaceholderBr
```

でプレースホルダを正しい本数の空行へ畳んでから保存していた。ところが
**クリップボード用の直列化（`clipboardPlainTextPlugin.ts`）はこの正規化を通さず**、
`<br>` を無条件に改行へ置換していた。その結果、空 paragraph 1 個につき
「ブロック区切りの `\n\n` + `<br />` 由来の `\n` + `\n\n`」で改行が 5 個になり、
コピーのたびに空行が増えていた。

## 修正

`clipboardPlainTextPlugin` の `clipboardTextSerializer` を、保存パスと同じ順序に揃えた:

1. `serializer(doc)` で Markdown 化（従来どおり）
2. `tightenListSpacing` → `stripPlaceholderLineBreaks` → `stripListItemPlaceholderBr`
   （**追加**。空行プレースホルダを正しい本数の空行へ畳む）
3. 残った `<br>` を実際の改行へ戻す（従来どおり。表セル内改行の保存用表現）

順序が重要で、3 を先にやるとプレースホルダが普通の改行になってしまい 2 で畳めない
（これが元の実装だった）。

## テスト

- `test/browser/editing-core/copyMarkdownFidelity.test.ts`（実 Chromium・実 copy イベント）:
  段落だけ／コードブロックを含む／空行が2行連続、いずれも **コピー結果がソースの
  Markdown と一致**すること。
- 既存の `test/webview/editing-core/clipboardHardbreak.test.ts`（表セル内改行が `<br>` の
  まま漏れない）が回帰防止として引き続き有効。

## 補足: コピー結果に ``` が含まれることについて

コードブロックを**ブロックごと**選択してコピーすると、Markdown として
`` ``` `` フェンス付きでコピーされる（Markdown エディタとして正しい挙動で、別の
Markdown 文書へ貼り付ければコードブロックとして復元される）。フェンス無しの素の
コードだけが欲しい場合は、**コードブロックの中にカーソルを置いて選択**（ブロック内の
テキスト選択）してコピーすると本文だけがコピーされる。
