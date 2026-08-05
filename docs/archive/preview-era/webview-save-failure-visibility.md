# Preview: webview からの保存失敗が誰にも気づかれない不具合の修正 仕様

最終更新: 2026-07-14

## 1. 症状

Preview（Milkdown webview）でユーザーが編集すると、`change` メッセージが host（`previewPanel.ts`）へ
送られ、`enqueueWebviewChange(() => applyMarkdownFromWebview(markdown))` 経由でドキュメントへ
`WorkspaceEdit` を適用・保存する。この保存（`vscode.workspace.applyEdit` / `document.save()`）が
何らかの理由（ディスクフル、読み取り専用ファイル化、権限エラーなど）で失敗した場合、**その失敗は
ユーザーにも開発者にも一切通知されない**。ユーザーは入力し続けているつもりでも、実際にはその
キー入力の保存がサイレントに失われている可能性がある。

## 2. 根本原因

`src/preview/host/previewPanel.ts` の `onDidReceiveMessage` は、`change` メッセージを次のように
fire-and-forget で処理している:

```ts
if (message.type === 'change' && typeof message.markdown === 'string') {
    const markdown = message.markdown;
    void enqueueWebviewChange(() => applyMarkdownFromWebview(markdown));
    return;
}
```

`void` により、`enqueueWebviewChange(...)` が返す Promise は誰にも await/catch されない。
`createSerialQueue`（`src/preview/host/serialQueue.ts`）自体は、あるタスクが reject しても
**呼び出し元に返す Promise では正しく reject を伝播する**（`test/suite/preview/external-sync/serialQueue.test.ts`
の「先行タスクが失敗しても、後続タスクは実行される」で検証済み）。問題は serialQueue の設計ではなく、
**呼び出し側がその reject を一切観測していない**ことにある。

参考: 同じファイル内の `push`（外部変更を webview へ反映する側）の経路（`schedulePush`）は
既に `(err: unknown) => debugLog(...)` で失敗をログしており、対称性がない。`change`（webview → document
方向）の経路だけがこの保護を欠いている。

## 3. 修正方針

### 3.1 `reportRejection`（`serialQueue.ts` に追加）

Promise の reject を `onError` コールバックへ確実に転送する、小さな汎用ユーティリティを追加する。
元の Promise 自体は変更しない（呼び出し元が引き続き await/catch できる、二重の安全網にする）。
`onError` 自身が例外を投げても、それ以上伝播させない（webview 破棄後の `postMessage` 失敗などで
新たな未処理例外を生まないため）。

```ts
export function reportRejection<T>(promise: Promise<T>, onError: (error: unknown) => void): Promise<T> {
    promise.catch((error) => {
        try {
            onError(error);
        } catch {
            // onError 自体の失敗はこれ以上伝播させない。
        }
    });
    return promise;
}
```

テスト: `test/suite/preview/external-sync/serialQueue.test.ts`（jsdom 純関数レイヤー。`createSerialQueue`
と同じファイル・同じ `external-sync` カテゴリ）。

### 3.2 呼び出し側の配線（`previewPanel.ts`）

`change` メッセージハンドラで `reportRejection` を使い、失敗を **(a)** 既存の `debugLog`（Output
チャンネル、`src/core/debug.ts`／`rawRuntime.debugChannel`）へ記録し、**(b)** `vscode.window.showErrorMessage`
でユーザーにも通知する:

```ts
if (message.type === 'change' && typeof message.markdown === 'string') {
    const markdown = message.markdown;
    void reportRejection(
        enqueueWebviewChange(() => applyMarkdownFromWebview(markdown)),
        (error) => {
            debugLog(`[preview] change apply failed: ${String(error)}`);
            void vscode.window.showErrorMessage(`Markdown Inline Preview: 編集の保存に失敗しました (${String(error)})`);
        }
    );
    return;
}
```

`debugLog` は既に `previewPanel.ts` にモジュールスコープの注入済み関数として存在する（`setDebugLog`
経由、`src/raw/activate.ts` が起動時に注入）ため、**新しい Output チャンネルは作らない**。既存の
`push failed` ログ（`schedulePush` 内）と同じチャンネル・同じ命名規約（`[preview] ... failed: ...`）に揃える。

## 4. 対象外（意図的にやらないこと）

- `applyMarkdownFromWebview` 内部の `try/catch` 追加は行わない。呼び出し側（`reportRejection`）で
  一元的に扱うことで、将来 `enqueueWebviewChange` を使う他の呼び出し箇所（テスト専用シームの
  `testChangeInjectors` など）にも同じパターンをそのまま適用できるようにする。
- `showErrorMessage` の頻度制限（連続失敗時に何度も出さない、等）は本修正のスコープ外。まずは
  「一切通知されない」を解消することを優先する。
