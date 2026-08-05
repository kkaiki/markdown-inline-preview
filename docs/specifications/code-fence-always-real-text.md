# コードフェンスを常に実テキストにする（code-fence-always-real-text）

最終更新: 2026-07-27 / 状態: **実装中（設計確定・段階導入）**

## 要望（ユーザー 2026-07-27）

> ``` にカーソルを入れられるようにして、delete 一つでも押して `` になったら、
> リアルタイムでコードビューを解除するようにしたい

方式は「常に実テキスト（Typora 式）」を選択。

## 現状（この仕様の直前）

コードブロックの開き/閉じフェンスは **表示専用の widget**（`.code-fence-display`、
`lineNumberGutterPlugin` が生成）で、文書には存在しない。したがって

- フェンス行にカーソルを置けない・1文字だけ消せない
- 記法を壊す/直すことによるリアルタイムな表示切り替えができない

（歴史的経緯: 以前は `codeFenceEditPlugin` が**フォーカス時だけ**フェンスを実テキスト化
していたが、「カーソル移動が文書を書き換える」ことに起因するカーソル飛び・Git 差分の
誤検出・行番号ズレが多発し、`no-focus-expand.md` で廃止した。今回の方式は
**常に**実テキストなので、カーソル移動では文書が変わらない ＝ その問題は再発しない。）

## 仕様

### 1. 不変条件

Preview の文書内のすべての `code_block` は、**自分のフェンス行を内容の先頭行・最終行として
持つ**。

```text
code_block の textContent =
    "```lang\n" + コード本体 + "\n```"
```

- 空のコードブロックは `"```lang\n\n```"`（本体は空行1行）。
- フェンスの長さは内容に応じて広げる（`codeFenceMarker`。ネストフェンス対応）。

### 2. 不変条件の維持（appendTransaction）

文書変更のたびに全 `code_block` を検査する:

| 状態 | 処理 |
|---|---|
| フェンスが揃っている（`parseCodeFenceRealText` が成功） | 何もしない |
| フェンスが無い（新規ノード: パース直後・貼り付け・スラッシュメニュー・input rule） | フェンス行を**注入**する |
| 直前の状態では揃っていたのに、揃わなくなった（ユーザーが壊した） | ブロックを**段落へ変換**（＝リアルタイムなコードビュー解除） |

「新規」と「壊された」の区別は、`appendTransaction(transactions, oldState, newState)` で
**同じノードが oldState で有効なフェンスを持っていたか**（位置マッピング経由）で判定する。
テキストの形だけで推測しない。

### 3. 段落 → コードブロックのリアルタイム変換

編集の結果、連続する段落が

```text
段落: "```lang"
段落: 任意（0行以上）
段落: "```"
```

の形になったら、その範囲を1つの `code_block`（フェンス行を含む実テキスト）へ変換する。
これにより「``` を打ち直して揃えた瞬間にコード表示へ戻る」を実現する。

### 4. 保存・コピー・行番号（フェンスを二重に書かない）

`code_block` の内容にフェンスが入っている状態でそのまま直列化すると、remark が
さらに外側フェンスを付けて**二重フェンス**になる。以下のすべての直列化経路で、
`normalizeExpandedCodeFences`（`parseCodeFenceRealText` でフェンスを剥がして
`language` 属性へ移す）を通す:

| 経路 | 場所 |
|---|---|
| ファイル保存 | `milkdownApp.ts` の `postChange` |
| クリップボード（コピー） | `clipboardPlainTextPlugin.ts`（既に実装済み） |
| 行番号の再パース | `lineNumberGutterPlugin.ts` の `parseCurrentDocAsMdast` |
| Git 差分の署名 | `previewDiffPlugin.ts` |

### 5. 表示

- `.code-fence-display` widget は**廃止**（フェンスは実テキストとして見える）。
- 行番号: フェンス行も内容の物理行になるため、コードブロックの行番号割り当ては
  「本文の各行」だけを見ればよくなる（フェンス用の特別扱いが不要になる）。
- フェンス行は本文と見分けが付くよう、デコレーションで薄く表示する（`.ipreview-fence-line`）。

### 6. Cmd+A

コードブロック内の Cmd+A は**フェンス行を含まない本文だけ**を選択する
（`previewKeymapPlugin` の既存実装が `parseCodeFenceRealText` を使って対応済み）。

## 影響範囲（実装時に必ず確認する）

- `test/browser/rendering/lineNumberGutter.test.ts`（フェンス widget 前提のテストがある）
- `test/browser/rendering/nestedFenceSerialization.test.ts`
- `test/browser/shortcuts/selectAllCodeFence.test.ts`
- `test/browser/editing-core/copyMarkdownFidelity.test.ts` / `pasteIntoCodeBlock.test.ts`
- `test/browser/cursor-focus/caretRegression.test.ts`（フェンス widget とキャレット）
- `model().text` / `outline` を見ているテスト全般（code_block のテキストが変わる）

## 将来方向: 記法を常に見せる「エンジニア向け Preview」（ユーザー要望 2026-07-27）

> `**` などのものは最初から見えていて構いません。そういったエンジニアフレンドリーな
> preview エディタに段階的に変えていってほしい

つまりコードフェンスだけでなく、**太字 `**`・リスト `- `・見出し `## ` 等の記法も
常に文書の実テキストとして見せる**方向（Typora より「ソース寄り」、Obsidian の
ソースモードに近い）。本仕様（フェンス）はその第一歩であり、同じ設計原則を横展開する:

1. 記法は**常に**実テキスト（フォーカスで出し入れしない ＝ `no-focus-expand.md` の
   原則「カーソル移動で文書を書き換えない」は維持する）
2. 直列化の全経路で、実テキスト化した記法を二重に書かないよう剥がす
3. 記法を壊した/揃えた瞬間にブロック種別をリアルタイムで切り替える
4. 記法部分は本文と見分けが付くよう淡色のデコレーションを当てる

対象と順序（フェンス完了後に着手）: 見出し `## ` → リスト `- ` / `1. ` /
`- [ ] ` → 引用 `> ` → インライン（`**` `*` `` ` `` `[text](url)`）。
インラインは範囲計算が既存の `collectEditableInlineMarkRanges` を再利用できる。

## 段階導入（この順で TDD する）

1. 不変条件の注入 + 直列化のフェンス剥がし（保存・コピー・行番号・差分）
2. 壊れたフェンス → 段落へのリアルタイム変換
3. 段落 → コードブロックのリアルタイム変換
4. フェンス widget の廃止と行番号の単純化、フェンス行のデコレーション
5. 既存テストの期待値更新（上記「影響範囲」）
