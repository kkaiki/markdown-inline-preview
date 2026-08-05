# 二重フェンスの防止と修復（nested-code-fence-repair）

最終更新: 2026-07-27

## 症状（ユーザー報告 2026-07-27）

Preview 上でコードブロックのフェンス行が4本並んで見え、見た目が崩れる。
コードブロックの中で Cmd+A → コピーしても `` ``` `` が付いてくる。

Raw で見ると、ファイルが**二重フェンス**になっている:

````text
````            ← 外側（保存時に広げられたフェンス）
```             ← 本文として入り込んだフェンス
Animate the attached image ...
```             ← 同上
````
````

## 真因

コードブロックの内容は**常にリテラル**なので、フェンス付きテキスト（ChatGPT 等から
コピーしたコード）をコードブロックの中へ貼り付けると、`` ``` `` の行が本文として入る。
保存時には remark-stringify が「内容を包める長さ」まで外側フェンスを広げる
（`longestStreak + 1`、最低3 → 4連バッククォート）ため、ファイルが二重フェンスになる。

この状態になると:

- Preview のフェンス行が4本に見える（表示用フェンス自体の長さのズレは
  `code-fence-display-length-fix.md` で別途修正済み）
- コードブロック内の Cmd+A は「中身だけ」を正しく選択しているのに、その中身に
  `` ``` `` が含まれるためコピー結果に混ざる（＝Cmd+A 側の不具合ではない）

## 対策1: 貼り付け時に防ぐ

`src/preview/webview/codeBlockPasteFence.ts`（新規、`clipboard` プラグインより前に登録）。

貼り付け先が code_block で、かつ**貼り付けたテキスト全体が単一の完結したフェンス
ブロック**のときだけ、外側フェンスを剥がして中身だけを挿入する。貼り付け元に言語指定が
あり貼り付け先が無指定なら、その言語を引き継ぐ。

剥がさない（＝従来どおり）ケース:

- 貼り付け先が code_block でない（段落へのフェンス付き貼り付けは、これまでどおり
  コードブロックとして取り込まれる）
- 中身にさらに同じ長さ以上のフェンス行が残る場合（複数ブロックを一度にコピーした、
  フェンスの使い方を説明している等）。外側だけ剥がすと壊れるため触らない

## 対策2: 既に壊れたファイルを直す

コマンド **`markdownInline.repairNestedCodeFences`**
（コマンドパレット: "Markdown Inline Preview: Repair Double-Fenced Code Blocks"）。

アクティブな Markdown ファイル（Raw / Preview どちらでも可）を走査し、
「コードブロックの中身がそれ自体で完結した1つのフェンスブロックになっている」ブロックを
1重に戻す。外側フェンスの長さも内容に合わせて詰め直し、言語は外側にあれば外側、
無ければ内側を引き継ぐ。三重以上の入れ子も1重になるまで繰り返す。

中身が「複数のフェンスブロックの例示」であるような**正当なブロックは変更しない**。
修復件数（または対象なし）は通知で表示する。

## 実装

| ファイル | 内容 |
|---|---|
| `src/shared/markdown/codeFence.ts` | 新規。純関数 `codeFenceMarker` / `unwrapFencedBlock` / `repairNestedCodeFences`。webview と Extension Host の両方から使う |
| `src/preview/webview/codeBlockPasteFence.ts` | 新規。貼り付け時のフェンス剥がし（`handlePaste`） |
| `src/preview/webview/lineNumberGutterPlugin.ts` | 表示用フェンスの長さ計算を shared の `codeFenceMarker` に統一 |
| `src/preview/host/previewPanel.ts` | 修復コマンドの登録 |
| `package.json` / `l10n/*` | コマンド定義と通知メッセージ |

## テスト

- `test/suite/shared/codeFence.test.ts`（純関数、18件）: フェンス長・剥がし判定・修復
  （二重/三重/言語の引き継ぎ/正常ファイル不変/複数ブロック例示を壊さない）
- `test/browser/editing-core/pasteIntoCodeBlock.test.ts`（実 Chromium、4件）:
  コードブロック内への貼り付けでフェンスが本文に残らない・言語を引き継ぐ・
  普通のテキストは従来どおり・段落への貼り付けは従来どおりコードブロック化
- `test/extension/raw/editing-core.test.ts` 20.1/20.2（実 VS Code）:
  修復コマンドが二重フェンスを1重に戻す／正常ファイルを書き換えない
