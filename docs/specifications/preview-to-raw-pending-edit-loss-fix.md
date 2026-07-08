# Preview → Raw 切替時に直前の編集が失われる不具合の修正 仕様

最終更新: 2026-07-01

## 1. 症状

Preview（Milkdown WYSIWYG）で編集した直後、間を置かずに Raw へ切り替える（`Cmd+Shift+.` / ツールバーの Raw ボタン）と、**直前の編集が Raw 側に反映されず、切替前の内容に戻って見える**ことがある。

## 2. 根本原因

Preview の webview は、1 キー入力ごとに `{ type: 'change', markdown }` をホストへ送る（`postChange`、`milkdownApp.ts`）。ホスト側（`previewPanel.ts`）はこれを `enqueueWebviewChange`（`createSerialQueue`）で直列に処理し、`applyMarkdownFromWebview` が `vscode.workspace.applyEdit` + `document.save()` を行う。この一連の書き込みは**非同期**であり、1 キー入力あたり数〜数十 ms かかる。

一方、Preview → Raw への切替（`switchToRaw`）は、webview からの `toggleRaw` メッセージ、または `markdownInline.togglePreview` コマンドから**即座に**呼ばれる。修正前は、この切替が `enqueueWebviewChange` に**積まれてはいるがまだ実行されていない書き込み**を一切待たずに `vscode.commands.executeCommand('vscode.openWith', uri, 'default', viewColumn)` を実行していた。

タイプした直後（書き込みがまだキューに残っている間）に素早く Raw へ切り替えると:

1. 直前のキー入力の `change` メッセージはまだ `enqueueWebviewChange` のキューに積まれているだけで、`applyEdit`/`save` が完了していない。
2. `switchToRaw` が Preview の `CustomTextEditor`（webview）を破棄し、同じ URI を通常のテキストエディタとして開き直す。
3. キューに積まれていた書き込みタスクは（`enqueueWebviewChange` 自体は破棄されないため）その後も実行されるが、**ユーザーはすでに Raw エディタを見ている**。タイミングによっては、この書き込みが実際に反映される前に画面上は「反映されていない」ように見え、体感として「直前の編集が消えた」となる。

## 3. 修正方針

各 Preview インスタンス（`resolveCustomTextEditor` 呼び出しごと）は、生成した `enqueueWebviewChange` を使って「現時点までに積まれた全タスクの完了を待つ」フラッシュ関数を、URI をキーにしたモジュールレベルの `Map`（`pendingWebviewFlush`）へ登録する:

```ts
pendingWebviewFlush.set(key, () => enqueueWebviewChange(async () => {}));
```

空タスクを積んでその完了を待つだけで、`createSerialQueue` の FIFO 性により「その時点までに積まれていた全タスクの完了待ち」になる（新たに追加のロジックを `serialQueue.ts` へ足す必要が無い）。

`switchToRaw` は `vscode.commands.executeCommand('vscode.openWith', ...)` を呼ぶ**前**に、対象 URI のフラッシュ関数があれば必ず待つ:

```ts
await pendingWebviewFlush.get(key)?.();
```

`webviewPanel.onDidDispose` でエントリを削除し、破棄後は残らないようにする。

`switchToRaw` は「webview からの `toggleRaw` メッセージ」「`markdownInline.togglePreview` コマンドの `toRaw` 分岐」など**全ての Preview→Raw 切替経路が通る共通の関数**なので、ここ 1 箇所に足すだけで経路によらず防御が効く。

## 4. テスト方針

この不具合の**トリガー自体**（webview が `change` を送った直後、その書き込みがまだキューに残っている間に `toggleRaw` が届く、というタイミング）は、実 VS Code の拡張ホストテストからは決定的に再現できない。理由:

- webview 側のキー入力・`postMessage` は実際の Milkdown（ProseMirror）インスタンス内で発生するものであり、拡張ホストのテスト（`test/extension/`、`@vscode/test-electron`）は webview の DOM/JS 実行コンテキストへ直接アクセスする手段を持たない。
- `test/browser`（Playwright）は webview バンドル単体をブラウザで動かすが、`previewPanel.ts` のホスト側ロジック（`enqueueWebviewChange` / `switchToRaw` / `pendingWebviewFlush`）は実行されないため、この不具合の経路を再現できない。

そのため、この修正は次の 2 点で担保する:

1. **既存の `createSerialQueue` の FIFO 保証**（`test/suite/serialQueue.test.ts`）が、フラッシュ関数の前提（「空タスクを積んで完了を待てば、それ以前に積まれた全タスクの完了を待ったことになる」）を既に検証している。
2. コードレビューで確認した「`switchToRaw` は全ての Preview→Raw 切替経路が通る唯一の関数であり、フラッシュはこの 1 箇所に足せば経路によらず効く」という設計により、経路ごとの再現テストを要求しない一元的な防御にしている。

将来的に webview の DOM/JS 実行コンテキストへ直接介入できるテストハーネス（例: 拡張ホスト経由で webview に対しスクリプトを注入する仕組み）が整備された場合は、「Preview でタイプ → 直後に togglePreview → Raw の内容に反映されている」という end-to-end テストを追加すること。
