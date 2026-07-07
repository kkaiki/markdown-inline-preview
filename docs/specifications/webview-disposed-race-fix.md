# Preview: togglePreview とサイドバー再オープンが重なると webview 破棄後アクセスで未処理rejectionが発生し、タブが恒久的に重複する不具合の修正 仕様

最終更新: 2026-07-07

## 1. 症状

同一ファイルに対して `markdownInline.togglePreview`（Preview 化）と、サイドバー等からの
再オープン（既定の Raw エディタで開く）がほぼ同時に実行されると、まれに
（実測で概ね 4 回に 1 回程度）以下が発生する:

- `Error: Webview is disposed` という**未処理の Promise rejection**が発生する
  （`rejected promise not handled within 1 second` として拡張ホストのログに出る）。
- 同一 URI に対して **Preview タブと Raw タブが恒久的に両方残ったまま**になる
  （`sidebar-reopen-preview-duplicate-tab-fix.md` の重複解消ロジックが本来なら
  解消するはずのケースだが、解消されない）。
- 5 秒以上待っても状態が収束しない（一時的な遅延ではなく、恒久的に壊れた状態のまま）。

`test/extension/preview/tabs-editors.test.ts` 13.4
（`markdownInline.togglePreview` の実行を待たずにサイドバー再オープンを重ねて発火させる
テスト）で再現した。

## 2. 根本原因

`PreviewEditorProvider.resolveCustomTextEditor`（`src/preview/host/previewPanel.ts`）は、
`webviewPanel` に対して複数の非同期継続処理（`setTimeout` や `Promise.then`）から
`webviewPanel.webview` へアクセスする:

- `schedulePush`: `onDidChangeTextDocument`/ファイル監視で変更を検知すると
  `setTimeout(..., 100)` の後に `pushMarkdownToWebview` を呼び、
  `webviewPanel.webview.postMessage(...)` を実行する。
- `'ready'` メッセージハンドラ: `this.getBaseBody(document).then((baseMarkdown) => { ... })`
  の継続で `webviewPanel.webview.postMessage(...)` を実行する。

`togglePreview`（`switchToPreview`）とサイドバーからの再オープンがほぼ同時に発生すると、
VS Code はこの webview パネルを破棄して作り直すことがある。上記の非同期継続がまだ
実行されていない状態でパネルが破棄されると、継続処理の中で `webviewPanel.webview` に
アクセスした瞬間に同期的に例外（`Error: Webview is disposed`）が投げられる。

この例外は `.then()` の**成功コールバック内**で発生するため、`schedulePush` が
`readMarkdown()` の失敗だけを捕捉する `(err) => debugLog(...)` には引っかからず、
新たな未処理rejectionとして扱われる。この結果、`resolveCustomTextEditor` 内の
後続処理（`onDidDispose` によるリスナー解除や `collapseDuplicateRawTabForActiveEditor`
との連携）が正しく完了しないまま処理が異常終了し、重複タブの解消が行われなくなる。

`webviewPanel.onDidDispose` の中で `changeSub`/`fileWatcher`/`themeSub`/`configSub`/
`messageSub` は解除されるが、**それより前に既にスケジュールされていた** `schedulePush`
の `setTimeout` や `getBaseBody().then()` の継続はこれらの購読解除では止まらない
（`setTimeout`/`Promise` はイベントリスナーではないため）。

## 3. 修正

`resolveCustomTextEditor` 内に `disposed`（真偽値フラグ）を持たせ、
`webviewPanel.onDidDispose` の**最初**で `true` にする。`webviewPanel.webview` への
アクセスを含む非同期継続の先頭で必ずこのフラグを確認し、破棄済みなら何もせず戻る:

- `pushMarkdownToWebview`（`schedulePush` の実行先）の先頭で `if (disposed) return;`
- `'ready'` メッセージハンドラの `getBaseBody().then(...)` コールバックの先頭で
  `if (disposed) return;`

`themeSub`/`configSub`/`messageSub` は `onDidDispose` で同期的に解除されるため
理論上は競合しないが、`disposed` フラグはコストがほぼ無いため、将来同様の
非同期継続を追加する際にも同じガードパターンを踏襲すること。

## 4. テスト

`test/extension/preview/tabs-editors.test.ts` 13:

- 13.3: 「Previewタブ作成直後（500ms未満）にサイドバーから再オープンすると、
  その時点ではRawタブの重複解消が見送られ、後でアクティブエディタが変化すると
  解消される」（`previewSettledAt` の 500ms 猶予窓の境界を明示的に検証）。
- 13.4: 「togglePreviewの実行中にサイドバー再オープンが重なっても例外にならず、
  最終的にPreviewタブ1枚に収束する」（修正前は約 25% の確率で
  `Error: Webview is disposed` の未処理rejectionとタブの恒久的な重複を再現した。
  修正後は連続 9 回の実行で再現しないことを確認済み）。
