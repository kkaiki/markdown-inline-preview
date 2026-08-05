# トリプルクリックが1行でなく全体を選ぶ不具合の修正（triple-click-line-selection-fix）

最終更新: 2026-07-27

## 症状（ユーザー報告 2026-07-27）

Preview で3回連続クリック（トリプルクリック）すると、1行ではなく十数行がまとめて
選択される。普通のエディタと同じく1行だけ選択したい。

## 真因

この Preview は Enter を**段落内の改行（hardbreak）**にしているため
（`hardbreak-line-markdown-conversion-fix.md`）、画面上で何行にも見える文章が
**1つの `paragraph` ノード**になっている。ProseMirror 既定のトリプルクリックは
「テキストブロック全体を選択」なので、その段落全体＝画面上の十数行が選択される。

`code_block` については同じ理由（複数行が1ノード）で既に
`codeBlockTripleClick.ts` が1行だけ選ぶようにしていたが、段落側は素通しだった。

## 修正

`codeBlockTripleClick.ts` の `handleTripleClick` を全テキストブロックに拡張し、
「行」の境界で挟まれた範囲だけを選ぶ:

| ブロック | 行の境界 |
|---|---|
| `code_block` | `\n`（`lineRangeAt`。従来どおり） |
| それ以外（段落・見出し・リスト項目・引用・表セル） | `hardbreak`（新規 `hardbreakLineRange`） |

hardbreak が無いブロックでは従来どおりブロックのテキスト全体になる。

## テスト

`test/browser/editing-core/tripleClickLine.test.ts`（実 Chromium・実マウスの
`clickCount: 3`、6件）: 段落の先頭行/中間行/最終行がそれぞれ1行だけ選択されること、
1行だけの段落・リスト項目は従来どおり、コードブロック内の1行選択の回帰防止。
