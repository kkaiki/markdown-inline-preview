# Preview: 見出しプレフィックスの `#` を全部削除しても見出しのまま固着する不具合の修正 仕様

最終更新: 2026-07-08

## 1. 症状

見出し（例: H4 `#### 見出し`）にフォーカスすると `blockPrefixEditPlugin` が実テキストとして
`#### `（`#### ` + 区切り文字 NBSP）を展開する。ここでユーザーが Backspace を4回押して
`#` を全部（0個まで）削除すると、次のような不具合が起きる:

- フォーカスを外しても、見出しは**段落に戻らず、見出しレベルも元のまま**（今回の例では4のまま）
  固着する。
- 展開時に挿入した区切り文字（NBSP, U+00A0）が削除されずに本文の先頭に残骸として残る。
- 再度フォーカスすると、固着したレベル分の新しい `####` + NBSP が、残骸の NBSP の**手前に**
  挿入されるため、見た目上は `####␣␣見出し`（NBSP が2つ）のように隙間が増えて見える。
  この操作を繰り返すたびに残骸の NBSP が積み重なっていく。

ユーザー報告「# を削除して focus out/in を繰り返すと ### が増えていく」の実体はこれだと
判断した（`headingPrefixBackspaceLevel.test.ts` で、1個・数個だけ削除するケースは正しく
動作することを確認済み。0個まで削除しきるケースだけがこの不具合を持つ）。

## 2. 根本原因

`src/preview/webview/blockPrefixEditPlugin.ts` の `collapseHeading`:

```ts
const fullText = node.textContent;
const m = /^(#{1,6})\s/.exec(fullText);
const newLevel = m ? m[1].length : currentLevel;
const prefixLen = m ? m[1].length + 1 : 0;
```

正規表現 `/^(#{1,6})\s/` は**最低1個の `#`** が無いとマッチしない。ユーザーが `#` を
全部消すと `fullText` は区切り文字（NBSP）から始まる（例: `" 見出し"`）ため `m` は
`null` になり、`newLevel = currentLevel`（変更なし）、`prefixLen = 0`（何も削除しない）
という「無変更」パスに落ちる。しかし実際には「見出し記法が完全に無くなった」のだから、
この状態は「編集していない」ではなく「見出しをやめた」と解釈すべきだった。

## 3. 修正方針

`#` に何も一致しなかった場合、`heading` ノードを `paragraph` ノードへ変換する
（`codeBlockBackspace.ts` がフェンス解除で `code_block → paragraph` に変換するのと
同じ発想）。展開時に挿入した区切り文字（NBSP）だけが残っている場合は、それも
先頭の空白として削除してから変換する。

```ts
// 修正後
const tr = state.tr;
if (m) {
    const newLevel = m[1].length;
    const prefixLen = m[1].length + 1;
    tr.delete(expanded.contentStart, expanded.contentStart + prefixLen);
    if (newLevel !== currentLevel) {
        tr.setNodeMarkup(expanded.nodePos, undefined, { ...node.attrs, level: newLevel });
    }
} else {
    // # が1個も残っていない = 見出し記法として成立しない → 段落へ変換する。
    const leadingWhitespace = /^\s+/.exec(fullText);
    if (leadingWhitespace) {
        tr.delete(expanded.contentStart, expanded.contentStart + leadingWhitespace[0].length);
    }
    tr.setNodeMarkup(expanded.nodePos, state.schema.nodes.paragraph);
}
```

`heading`/`paragraph` はどちらも `inline*` を content とするため、`setNodeMarkup` による
型変換は中身のテキスト（marks 含む）をそのまま保持できる。

`expanded.nodePos` は今回の `tr.delete` が nodePos より後ろ（ノードの中身）にしか作用しない
ため、型変換の呼び出し時点でも有効な位置のままである（既存の `collapseHeading` 実装と同じ
前提）。

## 4. スコープ外・既知の類似課題

同じ「プレフィックスを完全に消し切ると規定の正規表現にマッチしなくなり、レベル/属性が
固着し区切り文字の残骸が残る」というバグの型は、`collapseListItem`（`- `/`- [ ] `/`- [x] `/
`1. ` を全部消した場合）と `collapseBlockquote`（`> ` を全部消した場合）にも構造的に存在する
可能性が高い。ただし、これらは単純な `setNodeMarkup` では直せない
（`list_item`/`blockquote` は親ノード（`bullet_list`/`ordered_list`/`blockquote`）からの
「持ち上げ（lift）」が必要）。今回はユーザーが実際に踏んだ見出しのケースのみを修正対象とし、
リスト・blockquote 側は追加調査・別対応の候補として記録するに留める。

## 5. テスト

`test/browser/focus-expand/headingPrefixBackspaceLevel.test.ts`:
- 「H4 の "####" から1文字 Backspace で H3 にした後、フォーカスを外して戻してもレベルは
  3のまま」「さらにもう一度 unfocus→focus を繰り返しても...安定する」— 部分削除は
  元々問題なかったことの回帰固定。
- 「# を全部（0個まで）削除すると、見出しではなく段落になる（残骸のNBSPも残らない）」—
  今回の修正対象のバグを再現し、修正後は green になることを確認。
