# Preview: ブロックの collapse がホストへ同期されない（サイレントなデータ消失）不具合の修正 仕様

最終更新: 2026-07-01

## 1. 症状

Preview で見出し（`## `）・箇条書き（`- `）・引用（`> `）を**新しく作って**、他の編集を何もせずにカーソルを別の場所へ移す（＝フォーカスで記法展開していたブロックが collapse される）と、その内容が **保存ファイルへ永久に反映されない**ことがあった。

再現条件は広い: 新規に作成したブロックから離れた直後にファイルが自動保存されたり、ユーザーがそのまま他の作業に移った場合、**そのブロックの内容が保存されないまま失われる**。既存の見出しに文字を追記しただけの場合も、その追記が同期されないことがあった（後続の別編集があれば、その編集のタイミングで正しい内容が送られるため気づきにくい）。

## 2. 根本原因

`blockPrefixEditPlugin`（フォーカスで記法展開）の collapse 処理（`collapseHeading` / `collapseListItem` / `collapseBlockquote`）は、Undo 履歴を汚さないために dispatch する transaction に `tr.setMeta('addToHistory', false)` を付けている。

一方、Preview の「編集内容をホストへ送る」経路は Milkdown 公式の `@milkdown/plugin-listener`（`markdownUpdated` イベント）に依存している。このプラグインの実装（`node_modules/@milkdown/plugin-listener/lib/index.js`）を確認すると:

```js
state: {
    apply: (tr) => {
        ...
        if (!(tr.docChanged || tr.storedMarksSet) || tr.getMeta("addToHistory") === false) return;
        latestTr = tr;
        debouncedHandler(); // 200ms debounce 後に markdownUpdated イベントを発火
    }
}
```

**`addToHistory: false` の transaction は、このプラグインの `state.apply` で早期 return され、`latestTr`（＝次に markdown 化される対象のdoc）が一切更新されない。** つまり `blockPrefixEditPlugin` の collapse は、Milkdown の `markdownUpdated` メカニズムから完全に見えない。

具体的な壊れ方:

1. 新しい段落に `## heading` をタイプ → 見出しへ変換される（この transaction 自体は通常の transaction）。
2. 変換直後、`blockPrefixEditPlugin` がフォーカス中ブロックとして検知し、`## ` を実テキストとして展開する（`addToHistory: false`）→ **listener から見えない**。
3. 続けて `heading` を打つ（通常の transaction。ただし `markdownUpdated` の購読側コールバックは `isBlockPrefixActive()` が true の間 `postChange` を呼ばない仕様）。
4. カーソルが離れる → collapse（`## ` を削除して段落を見出しとして確定、`addToHistory: false`）→ **listener から見えない**。

この後、他に何の transaction も起きなければ、listener の debounce（200ms）は「最後に見えた（`addToHistory` が false でない）transaction」の doc をもとに `markdownUpdated` を呼ぶ。上記の例では、それは**手順1（変換直後、まだ何もタイプしていない空の見出し）付近の doc**であり、その後 collapse で確定した「見出しとして正しく畳まれた最終テキスト」を一切含まない。結果として、ホストへ送られる markdown からその見出し（または新規リスト項目・引用）の内容が丸ごと欠落する。

## 3. 修正方針

Milkdown の `markdownUpdated`（`@milkdown/plugin-listener`）に依存せず、`blockPrefixEditPlugin` の collapse 完了時に**明示的に現在の doc を再シリアライズしてホストへ送る**。

- `blockPrefixEditPlugin.ts` に `setOnCollapseSync(fn)` を追加。`collapseBlock`（heading/list_item/blockquote の collapse 処理の共通呼び出し口）が完了するたびにこのフックを呼ぶ。
- `milkdownApp.ts` の `createEditor` で、エディタ生成直後にこのフックを登録する:

  ```ts
  setOnCollapseSync(() => {
      if (!editor) return;
      editor.action((ctx) => {
          const serialize = ctx.get(serializerCtx);
          const view = ctx.get(editorViewCtx);
          postChange(serialize(view.state.doc));
      });
  });
  ```

  `postChange` は既存の重複判定（`canonical === lastSyncedMarkdown` なら何もしない）をそのまま通るため、実際に内容が変わっていない collapse（例: 何もタイプせずにフォーカスして離れただけ）では無駄な `change` メッセージは送られない。

## 4. テスト方針

Milkdown 内部の `markdownUpdated`（debounce 付き）のタイミングと、`addToHistory: false` の扱いという実装詳細に強く依存するため、jsdom では検証できない。`test/browser/collapseMarkdownSync.test.ts` に実 Chromium テストとして追加し、以下を検証する:

- 見出し・箇条書き・引用のそれぞれを**新規タイプ→他の編集なしで離れる**というシナリオで、`lastChangeMarkdown()` が正しい最終内容を含むこと。
- 既存ブロックに1文字だけ追記して離れるシナリオでも同様に正しく同期されること。
- 何も変更していない（フォーカスして即座に離れただけ）場合は、余計な `change` メッセージが増えないこと（重複判定が壊れていないことの確認）。
