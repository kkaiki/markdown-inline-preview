# Preview: ブロック変換後にカーソルが別ブロックへ飛ぶ不具合の修正 仕様

最終更新: 2026-07-01

## 1. 症状

Preview（Milkdown WYSIWYG）で「対象行」をチェックボックスへ変換する（⌥⌘4 ショートカット、またはツールバーのチェックボックスボタン）と、変換自体は成功する（対象行が `list_item(checked=false)` になる）にもかかわらず、**カーソルだけが文書内の別のリストブロックへ飛ぶ**ことがある。多くの場合、飛び先はドキュメント内で直前に存在していた別のリスト項目（体感としては「上の行」）。

再現条件: 対象行を変換する時点で、**ドキュメント内の他の場所に既存のリストブロック（箇条書き・番号付き・チェックボックスいずれでも可）が存在する**こと。単独の段落しか無い文書では再現しない（既存のリグレッションテスト `test/browser/blockPrefixBugs.test.ts` の Bug4 が単独段落のケースをカバーしており、そちらは元々パスしている）。

## 2. 根本原因

対象行がまだリストでない場合、チェックボックス変換は内部的に **2 回に分けて `view.dispatch` している**:

1. `wrapInList(bulletType)` 相当で対象行を `bullet_list > list_item` に包む（1 回目の dispatch）
2. 直後に `setNodeAttribute(pos, 'checked', false)` で `checked` 属性を設定する（2 回目の dispatch）

チェックボックス項目は Milkdown の `list-item-block` Web Component（`@milkdown/kit/component/list-item-block`）でレンダリングされる。1 回目の dispatch 時点では `checked` はまだ未設定（`undefined`/`null`）なので通常の `<li>` としてレンダリングされ、2 回目の dispatch で `checked` が boolean になった瞬間に **同じノードが Web Component として再マウントされる**。

この「素の `<li>` → Web Component」への差し替えは、対象行の DOM サブツリーを丸ごと破棄・再生成する（属性更新ではなくノード種別が変わる扱いになるため、ProseMirror の NodeView 差分更新の対象外）。DOM ノードが破棄される瞬間、ブラウザのネイティブ selection がその中のテキストノードを参照できなくなり、ブラウザは既定の挙動として **別の有効なテキストノード（ドキュメント内の既存リスト項目など）へ selection を退避させる**。この退避で発生したネイティブ `selectionchange` を ProseMirror の domObserver がそのまま「ユーザーによる選択変更」として読み取り、`state.selection` をその位置へ書き換えてしまう。

2 回の dispatch の**間**に「素の `<li>` としての再描画」が挟まることが本質的な原因であり、1 回の dispatch で `bullet_list` への wrap と `checked` 設定を同時に行えば、この中間状態（＝素の `<li>` レンダリング）自体が発生しないため再現しない。

参考: 単一の dispatch で完結する `applyListType`（⌥⌘5 / ⌥⌘6、`previewKeymapPlugin.ts`）や `applyHeading`（⌥⌘1-3）には本不具合は無い（同条件の対照実験で確認済み）。

## 3. 影響箇所（2 回 dispatch していた箇所）

| 箇所 | 操作 | 修正方針 |
|---|---|---|
| `previewKeymapPlugin.ts` の `makeTodo` | ⌥⌘4（Notion 風ショートカット、対象行がまだリストでない場合の分岐） | `wrapInList` が返す transaction を dispatch せずに保持し、同じ transaction に `setNodeAttribute` を追記してから 1 回だけ dispatch する |
| `previewToolbarPlugin.ts` の `toggleCheckbox` | ツールバーの ☑ ボタン（「リスト外（見出し含む）」の分岐） | 同上 |

調査の結果、以下は同じ「wrap 系コマンド + 属性設定」の形をしているが、**実際には再現しなかった**ため対象外とした（対照実験で確認済み。単独 dispatch であるか、Web Component の再マウントを伴わないため）:

- `handleTaskListEnter`（タスク項目内で Enter → 新規項目を強制的に未チェックに戻す分岐）: 新規項目は Enter の時点で既に `list_item` の中（`splitListItemCommand` は同種ノードの分割であり、Web Component の型が変わらない）ため、2 回目の dispatch があっても再マウントを伴わない。
- `applyListType` のリスト内変換（別種のリストへの変換）: 1 回の dispatch で完結している。

すでにリスト項目内にいる場合の `makeTodo` の分岐（`setNodeAttribute` のみの単一 dispatch）は元々問題ない。

## 4. 修正方針

`previewKeymapPlugin.ts` に共有ヘルパーを追加する:

```ts
function wrapInBulletListAndSetChecked(state: EditorState, view: EditorView, checked: boolean): boolean {
    const bulletType = state.schema.nodes.bullet_list;
    if (!bulletType) return false;
    let captured: Transaction | null = null;
    const wrapped = wrapInList(bulletType)(state, (tr) => { captured = tr; }, view);
    if (!wrapped || !captured) return false;
    const afterWrap = state.apply(captured);
    const depth = findDepth(afterWrap.selection.$from, ['list_item']);
    if (depth < 0) return false;
    const pos = afterWrap.selection.$from.before(depth);
    captured.setNodeAttribute(pos, 'checked', checked);
    view.dispatch(captured);
    return true;
}
```

`wrapInList` に **dispatch 関数の代わりに transaction を捕まえるだけの関数**を渡すことで、実際の `view.dispatch` を呼ばせずに transaction オブジェクトだけ得る。その transaction に対して `state.apply()` でローカルに適用した結果から「wrap 後の list_item 位置」を計算し、同じ transaction に `setNodeAttribute` を追記してから、最後に 1 回だけ `view.dispatch(captured)` する。これにより DOM 更新も 1 回に集約される。

`previewToolbarPlugin.ts` からも呼べるよう `previewKeymapPlugin.ts` からエクスポートし、`makeTodo` と `toggleCheckbox` の両方をこのヘルパー経由に置き換える。

## 5. テスト方針

DOM 実レイアウト・実 Web Component の再マウント・ブラウザのネイティブ selection 退避が絡むため、jsdom では再現できない（`CLAUDE.md` の方針どおり `test/browser/` で実 Chromium テストとする）。

新規ファイル `test/browser/checkboxCursorJump.test.ts` に以下のマトリクスでケースを用意する:

- 操作の入口: ⌥⌘4 ショートカット / ツールバーのチェックボックスボタン
- 周辺状態: 対象行の **上**に既存リストがある / **下**に既存リストがある / 上下両方にある / 前後に既存リストが無い（対照群、既存 Bug4 相当）
- 既存リストの種類: 箇条書き / 番号付き / チェックボックス
- 変換対象: 段落 / 見出し

各ケースで、変換後の `selParentText`（`h.model()` の選択位置の親ノードテキスト）が対象行のテキストを含むことを確認する（＝カーソルが対象行に留まる）。

**2026-07-07 追記**: 当初の実装では入口ごとに異なる（重ならない）部分集合しか検証していなかった
（ショートカット系は「上/下/両方/対照群/番号付き/チェックボックス」、ツールバー系は
「上の箇条書き/上のチェックボックス/下の番号付き/見出し起点」のみ）。`test/browser/cursor-focus/checkboxCursorJump.test.ts`
を更新し、両方の入口で同じ組み合わせ（周辺状態4種 × リスト種別2種 + 見出し起点）を検証するよう揃えた。
実際にバグは見つからず（修正が両入口に共通ヘルパー経由で効いているため）、カバレッジの対称性を仕様として固定した。
