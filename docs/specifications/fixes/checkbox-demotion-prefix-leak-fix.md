# Preview: チェックボックス降格時に "- " がテキストへ漏れる不具合の修正 仕様

最終更新: 2026-07-08

## 1. 症状

Preview（Milkdown WYSIWYG）で、チェックボックス項目の行頭にカーソルを置いて Backspace すると
（`markerBackspace.ts` による「チェックボックス → 箇条書き → 段落」の段階的降格の
1段階目）、降格自体（`checked: boolean → null`）は成功するにもかかわらず、直後に
**`- ` が実テキストとしてその項目の内容へ混入する**ことがある（例: `second` →
`- second`）。単独のチェックボックス項目（前後に他の行が無い）でも、リスト内の
2番目以降のチェックボックス項目でも再現する。

発見経緯: 2026-07-08、`test/extension/preview/` にチェックボックス関連の実 VS Code
テストが1件も無いという監査（`docs/testing/preview-usage-flow-test-backlog.md`
4.2）をきっかけに、実ブラウザで「リスト2番目のチェックボックスの行頭 Backspace」を
新規に検証したところ再現した。

## 2. 根本原因

`markerBackspace.ts` のチェックボックス降格分岐は次の1回の `view.dispatch` で完結する:

```
state.tr.setNodeMarkup(liPos, undefined, { ...listItem.attrs, checked: null })
```

この `dispatch` は同期的に全プラグインの `view.update()` を呼び出す。`checked` が
`boolean` から `null` に変わった瞬間、この list_item は
`blockPrefixEditPlugin.ts` の `getFocusedBlockInfo` から見て「チェックボックスではない
普通の箇条書き」と区別が付かなくなる（`getFocusedBlockInfo` はチェックボックスを
`typeof checked === 'boolean'` で除外しているだけで、`null` になった瞬間の由来までは
判定しない）。カーソルはまだこの項目内にあるため、`view.update()` はこれを
「フォーカスが普通の箇条書きへ移った」と誤検知し、Typora 風プレフィックス展開の一環で
`- ` を実テキストとしてその場に挿入してしまう。

これは `previewKeymapPlugin.ts` の `makeTodo()` が既に対処済みの Bug1
（`checked-cursor-jump-fix.md` 系統ではなく、`checked: null → boolean` の逆方向で
同種の誤検知が起きるケース）と同じ機序だが、`checked: boolean → null`（降格）の
経路だけ `setBlockPrefixExpansionSuppressed` による抑制が漏れていた。

さらに、list-item-block コンポーネント（Web Component）はラベルを**非同期で
再描画**するため、`markerBackspace.ts` の `pinSelection`（2段 `requestAnimationFrame`）
の完了までのあいだに追加の `selectionchange` が発火することがある。この非同期
ウィンドウの間も同じ誤検知が起こりうるため、dispatch 前後の同期的な抑制フラグの
オン/オフだけでは不十分だった。

## 3. 修正方針

`blockPrefixEditPlugin.ts` に `pendingCheckboxSelectionGuard` と同じ「位置追跡 +
時間窓」方式の新しいガード `recentCheckboxDemotion` を追加した:

- `markRecentCheckboxDemotion(pos)`: `markerBackspace.ts` が降格の `dispatch` を
  呼ぶ**前**に、降格対象の list_item の位置を時間窓（500ms）つきで記録する
  （`dispatch` は内部で同期的に `view.update()` を呼ぶため、記録は必ず dispatch より
  前に行う必要がある）。
- `appendTransaction` 内で、`pendingCheckboxSelectionGuard` と同様に `tr.mapping` で
  位置を追跡し続け、時間窓を過ぎたら破棄する。
- `getFocusedBlockInfo` の list_item 分岐で、対象位置が `recentCheckboxDemotion` と
  一致し時間窓内であれば `null` を返す（この項目だけ展開対象から除外）。

グローバルな真偽値フラグ（`setBlockPrefixExpansionSuppressed`）を rAF を跨いで
持ち続ける方式も検討したが、そのあいだに**無関係な他のブロック**へフォーカスが移った
場合の正当な展開まで巻き込んで止めてしまうため採用しなかった（対象ノードの位置だけを
時間窓つきで除外する現方式なら、この副作用が無い）。

## 4. テスト

- `test/webview/focus-expand/blockPrefixEdit.integration.test.ts`:
  `markerBackspace`+`blockPrefixEditPlugin` の両方をロードする専用ハーネスで、
  降格直後のテキスト混入を再現・固定（**jsdom で唯一この不具合を再現できる場所**。
  `test/webview/editing-core/` の素の `milkdownHarness.ts` にはこれらのカスタム
  プラグインが載っておらず再現しない）。
- `test/browser/lists-tables/checkboxEditDelete.test.ts`: 実ブラウザ（実バンドル）で
  リスト2番目のチェックボックスの行頭 Backspace を再現・固定。
- `test/extension/preview/lists-tables.test.ts`: 実 VS Code end-to-end で、降格結果が
  実ドキュメント・実ディスクまで正しく（記法の混線なく）反映されることを固定。
- `test/browser/cursor-focus/caretRegression.test.ts` の「単独チェックボックス
  （前に行なし）で連続 Backspace しても飛ばない」は、この修正前は**2回目の
  Backspace が「段落への昇格」ではなく「漏れたプレフィックス文字の削除」という
  別の壊れた動作をしており、たまたまキャレット座標のズレが許容値内に収まって
  「合格」していた**（構造は壊れているのに検知できていなかった＝偽装カバレッジ）。
  修正後は正しく「箇条書き → 段落」へ昇格するようになり、CSS マージン差による
  数px の正当な差が出るため、この項目だけ許容値を緩めて再調整した。
