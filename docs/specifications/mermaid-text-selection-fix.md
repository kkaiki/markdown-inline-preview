# Mermaid 図内テキストをマウスドラッグで選択・コピーできないバグ

## 症状（ユーザー報告）

「Mermaidについて、テキストコピーできるようにして」— 描画された Mermaid 図（SVG）内の
ノードラベル等のテキストを、マウスでドラッグ選択してもコピーできない
（`window.getSelection()` が常に空になる）。

## 原因

`mermaidDiagramPlugin.ts` は `Decoration.widget` として図の `<div class="mermaid-diagram">`
（内部に mermaid が生成した SVG。ノードラベルは `<foreignObject><p>...</p></foreignObject>`
として HTML で描画される）をコードブロック直後に挿入している。

ProseMirror の `WidgetViewDesc.ignoreMutation`（`prosemirror-view/src/viewdesc.ts`）は
次の実装になっている:

```ts
ignoreMutation(mutation: ViewMutationRecord) {
    return mutation.type != "selection" || this.widget.spec.ignoreSelection
}
```

`type: "selection"` の DOM ミューテーション（＝ユーザーがマウスドラッグしてネイティブ
selection を変更したとき）は、**widget の decoration spec に `ignoreSelection: true` が
無い限り「無視すべきでない変更」として扱われる**。無視されない場合、ProseMirror の
`DOMObserver.ignoreSelectionChange` はこの変更を通常の（ドキュメントに関連する）選択
変更として処理してしまい、`view.state.selection`（widget 内には対応する doc 位置が
存在しない）に基づいて選択を再同期しようとする結果、**ユーザーが手動で行った widget
内のネイティブ選択が消えてしまう**。

`mermaidDiagramPlugin.ts` の `Decoration.widget(...)` 呼び出しはこのオプションを
指定していなかった。

## 再現（実 Chromium で確認）

1. `enableMermaid: true` で Mermaid 図を含む文書を開く。
2. 図のノードラベル（`foreignObject > p`）の上でマウスを `mousedown` → `move` →
   `mouseup`（ドラッグ）する。
3. `window.getSelection()?.toString()` が常に空文字列になる。

`contenteditable` の除去、CSS `user-select: text` の明示指定、`draggable` 属性の付与は
いずれも効果が無いことを確認済み（ProseMirror 側のミューテーション処理でリセットされる
ため、CSS/属性レベルの対処では解決しない）。

## 修正

`Decoration.widget` の spec に `ignoreSelection: true` を追加する。

```ts
Decoration.widget(pos + node.nodeSize, widgetFactory(source), {
    side: 1,
    ignoreSelection: true,
    key: `mermaid-${source}`
})
```

これにより widget 内で起きた selection ミューテーションは ProseMirror にとって
「無視してよい変更」として扱われ、ネイティブのドラッグ選択がそのまま保持される。
コードブロックのソーステキスト自体（widget の外、`<pre><code>`）の編集可能性には
影響しない。

## テスト

`test/browser/mermaidTextSelection.test.ts`:
- 図のノードラベルをマウスドラッグで選択でき、`getSelection()` にテキストが残る
- 図の選択中もコードブロックの編集（打鍵）は通常どおり効く（既存機能への非破壊確認）
