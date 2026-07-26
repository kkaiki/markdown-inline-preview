# Preview: 見出しプレフィックス（## ）が全選択（Cmd+A）に含まれない不具合の修正 仕様

最終更新: 2026-07-03

## 1. 症状

見出し（`## ` 等）にカーソルがある/あった状態で Cmd+A（全選択）すると、選択のハイライト（青背景）が見出し本文（`未決定事項` など）にはかかるが、行頭の `## ` 部分だけがハイライトから除外されて見える。ネイティブのコピー&ペーストやブラウザの選択操作からも `## ` だけが一貫して抜け落ちる。

## 2. 根本原因

`focusSyntaxPlugin.ts` の `blockMarkerDecoration` は、カーソルが乗っているブロックの行頭プレフィックス（`## ` `- ` `> ` 等）を **CSS の `::before` 疑似要素**（`data-md-prefix` 属性 + `.md-focus-block` クラス、`media/milkdown-preview.css:156-163`）で表示していた。

`::before` の `content` はブラウザの DOM テキストノードではなく、レンダリングツリー上にのみ存在する。そのため `window.getSelection()` / `Range` などネイティブの選択 API は本質的にこれを選択範囲に含めることができない（Cmd+A で `AllSelection` になっても同様）。カーソルがブロックに入ると `blockPrefixEditPlugin` が実テキストとして展開するが、選択が非空（Cmd+A 後など）になると `getFocusedBlockInfo` は `!state.selection.empty` で早期リターンするため展開されず、`::before` 表示のまま選択操作を迎えることがある。

## 3. 修正方針

見出しの行頭プレフィックスを、`::before` 疑似要素ではなく、行内マーカー（`**` `*` など）と同じ仕組み——`Decoration.widget` + `createSyntaxMarkerElement`（`contentEditable="false"` の実 `<span>`）——で描画するように変更する。

- 実 DOM テキストになるため、ネイティブ選択（Cmd+A 含む）に自然に含まれる。
- クリックでカーソル移動する既存の `mousedown` ハンドラ（`data-pm-pos` 経由）もそのまま流用できる。
- `list_item`（チェックボックスでない箇条書き・番号付きリスト）と `blockquote` の `::before` 表示は本修正では変更しない（別バグとして扱う。`md-focus-list` クラス・CSS は維持）。

`media/milkdown-preview.css` の `.md-focus-block:not(.md-focus-list)::before` ルールは見出し用の `data-md-prefix` を出さなくなるため実質的に不要になるが、`blockquote` は同じクラス（`md-focus-block`、`md-focus-list` 無し）を使い続けるため、CSS ルール自体は残す。

## 4. テスト方針

DOM のネイティブ選択・`::before` の実描画に依存するため、jsdom では再現できない。`test/browser/headingFocusMarkerBugs.test.ts` に実 Chromium テストとして追加する:

- 見出しにカーソルを合わせてから Cmd+A し、見出し要素に `::before` の `data-md-prefix` 由来のコンテンツが残っていない（＝実テキストに置き換わった）ことを確認する。
- フォーカス時・非フォーカス時で見出し要素の描画幅が変わらないこと（回帰確認。今回のテスト方法では変化を検出できなかったため、幅そのものの安定性は目視のスクリーンショット比較でも別途確認する）。
