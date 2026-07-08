# Preview: 箇条書き/番号付きリストのマーカーからドラッグ選択できない不具合の修正 仕様

最終更新: 2026-07-02

## 1. 症状

Preview で、箇条書き（`- item`）や番号付きリスト（`1. item`）の**マーカー（bullet/ordered アイコン）**の上でマウスの左ボタンを押し、そのままテキストの終わりまでドラッグして離しても、選択範囲が空のまま（選択できない）。テキスト部分から始めるドラッグは問題なく選択できる。

チェックボックス項目（`- [ ]`）のマーカーはクリックでのトグルが目的のため対象外（既存動作のまま）。

## 2. 根本原因（2つ重なっている）

### 原因A: `pointerdown` の `preventDefault()` が後続の `mousedown` を消す

`@milkdown/components` の `list-item-block`（`list-item-block/component.tsx`）は、マーカーを囲む `.label-wrapper` に次のハンドラを付けている:

```tsx
const onClickLabel = (e: Event) => {
  e.stopPropagation()
  e.preventDefault()
  if (checked.value == null) return   // bullet/ordered はここで何もしない
  setAttr('checked', !checked.value)  // checkbox だけトグル
}
// ...
<div class="label-wrapper" onPointerdown={onClickLabel} contenteditable={false}>
```

`stopPropagation()` と `preventDefault()` は **`checked.value == null`（= bullet/ordered、チェックボックスではない）チェックの前に無条件で呼ばれる**。

Pointer Events の仕様上、`pointerdown` を `preventDefault()` すると、本来続けて発火するはずの互換 `mousedown` イベントが**まったく発火しなくなる**。ProseMirror のネイティブなドラッグ選択（`prosemirror-view` の `handlers.mousedown` → `LeftMouseDown`）は `mousedown` を起点にするため、bullet/ordered のマーカー上で mousedown してドラッグを始めても ProseMirror 側には何も伝わらない。

### 原因B: マーカーは `contenteditable="false"` なので、ネイティブ選択もそこを起点にできない

原因A を回避して `mousedown` を発火させたとしても、`.label-wrapper` 自体が `contenteditable="false"` の非編集領域であるため、ブラウザの「mousedown 位置から mousemove 位置までテキスト選択を伸ばす」ネイティブ機能は非編集領域を起点にした場合はそのままでは働かない（実験で確認: mousedown 位置から mouseup 位置へカーソルは移動するが、選択レンジには広がらない）。

## 3. 修正方針（`listMarkerDragFixPlugin.ts`）

bullet/ordered マーカー（`.label-wrapper` 内の `.label` が `bullet` または `ordered` クラスを持つ場合。`checked`/`unchecked`＝チェックボックスは対象外）に限り:

1. `view.dom` の **capture フェーズ**で `pointerdown` を先取りして `stopPropagation()` する（`preventDefault()` は呼ばない）。capture は対象要素（`.label-wrapper`）に到達する前に発火するため、component 側の `onPointerdown` ハンドラ自体が実行されなくなり、後続の互換 `mousedown` が正常に発火するようになる（原因A の回避）。
2. 原因B を自前で補うため、ドラッグを手動実装する:
   - mousedown 時点で、リスト項目の内容（`.children` 要素）の先頭位置を `view.posAtDOM(contentEl, 0)` で求め、そこへ選択のアンカーを置く。
   - 以後の `mousemove` ごとに `view.posAtCoords()` で現在位置を求め、アンカーから現在位置までの `TextSelection` を dispatch する。
   - `mouseup` でリスナーを解除する。

チェックボックスのマーカーには一切手を出さないため、既存の「クリックで常にトグル」動作は変わらない。

## 4. テスト方針

実 Chromium（`test/browser/listMarkerDragFix.test.ts`）で:

- 箇条書きの bullet マーカーからドラッグを始めても選択できること。
- 番号付きリストの ordered マーカーからドラッグを始めても選択できること。
- （回帰確認）チェックボックスのマーカーはクリックで従来どおりトグルできること。

DOM 実レイアウト・`contenteditable` のネイティブ選択挙動・Pointer/Mouse イベントの発火順序に依存するため、jsdom では再現できない。
