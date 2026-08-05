# Preview: フォーカス展開のプレフィックスがリンク等のマークを継承する不具合の修正 仕様

最終更新: 2026-07-02

## 1. 症状

Preview で、リンクだけで構成される見出し・箇条書き・blockquote（例: `- [1. 業務フローの全体像](#1-業務フローの全体像)`）にカーソルを合わせる（フォーカスで記法展開が発火する）と、挿入されるはずの行頭プレフィックス（`- ` / `## ` / `> `）がリンクの**外**ではなく**内側**に表示されてしまう（`[- 1. 業務フローの全体像](#1-業務フローの全体像)` のように見える）。本来の箇条書き・見出し・引用として認識できず、チェックリストや見出しへ変換したい意図と食い違って見える。

## 2. 根本原因

`blockPrefixEditPlugin` の `expandBlock` は、フォーカスしたブロックのプレフィックスを `state.tr.insertText(prefix, contentStart)` で挿入していた。ProseMirror の `Transform.insertText(text, from)`（`to` 省略）は、挿入するテキストのマークを `doc.resolve(from).marks()` から決定する。

`contentStart` はテキストブロックの**先頭**（内容がまだ無い/直後にしか続かない位置）であり、`ResolvedPos.marks()` は「テキストブロック先頭では直後のノードのマークを採用する」という仕様を持つ。ブロックの内容がリンク等のマーク付きテキストから始まっている場合、`resolve(contentStart).marks()` は**そのリンクのマーク**を返してしまう。結果、`insertText` で挿入した `- ` / `## ` / `> ` がリンクマーク付きテキストとして生成され、直後の本来のリンクテキストと同じマークを持つために隣接テキストノードとして結合され、Markdown シリアライズ時に `[- 1. 見出し](#anchor)` のようにプレフィックスがリンクの `[...]` の内側に取り込まれて見える。

## 3. 修正方針

`expandBlock` で `insertText` の代わりに、明示的にマーク無しのテキストノードを構築して挿入する:

```ts
// 修正前: 挿入位置直後のマークを継承してしまう
const tr = state.tr.insertText(info.prefix, info.contentStart);

// 修正後: マークを明示的に持たないテキストノードを挿入する
const tr = state.tr.insert(info.contentStart, state.schema.text(info.prefix));
```

`heading` / `list_item` / `blockquote` はすべて同じ `expandBlock` を経由するため、この修正で3種別とも同時に直る。

## 4. テスト方針

`test/webview/blockPrefixEdit.integration.test.ts` に、リンクだけで構成される見出し・箇条書き・blockquote それぞれについて、フォーカス直後の挿入プレフィックスノードが空のマーク配列を持つことを検証するテストを追加した:

- 「リンクで始まる見出しにフォーカスしても、挿入した `## ` がリンクのマークを継承しない」
- 「リンクで始まる箇条書きにフォーカスしても、挿入した `- ` がリンクのマークを継承しない」
- 「リンクで始まる blockquote にフォーカスしても、挿入した `> ` がリンクのマークを継承しない」

collapse 後の最終テキスト自体は元々正しかった（`collapseHeading`/`collapseListItem`/`collapseBlockquote` は位置ベースで prefix を削除するため、マークの継承有無に影響されない）。今回の不具合は**フォーカス中の表示のみ**に影響するが、フォーカス中に保存（Preview は毎キー入力で保存する設計）されるケースやユーザーが見て混乱するケースがあるため、表示上のマーク継承自体を修正した。
