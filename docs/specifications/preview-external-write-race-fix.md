# Preview 編集中に外部ツールがファイルを書き換えると、外部編集が消えるバグ

## 症状

Preview（Milkdown WYSIWYG）でファイルを開いている最中に、別プロセス（LLM ツール、
`git checkout`、他のエディタなど）が **同じファイルをディスク上で直接書き換える**と、
その外部編集がタイミング次第で **Preview 側の直後の保存によって静かに上書き・消失する**
ことがある。

## 原因

`resolveCustomTextEditor`（`src/preview/host/previewPanel.ts`）内の
`applyMarkdownFromWebview` は、webview から届いた `'change'` メッセージ（1 キー入力
ごとに送られる、その時点のドキュメント全文）を、**常に無条件で** `document` の
全範囲置換 + `document.save()` として書き込む:

```ts
const applyMarkdownFromWebview = async (markdown: string): Promise<void> => {
    const restored = this.restoreFromWebview(markdown, document);
    if (document.getText() === restored) return;
    lastAppliedFromWebview = restored;
    applyingRemoteEdit = true;
    try {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, fullRange, restored);
        await vscode.workspace.applyEdit(edit);
        await document.save();
    } finally { applyingRemoteEdit = false; }
};
```

一方、外部ツールによるディスク直接書き換えの検知は `FileSystemWatcher`
（`fileWatcher.onDidChange`）が担い、検知後 **100ms のデバウンス**を経てから
ディスクを読み直し、webview へ `'update'` として push する。webview 側は
`applyExternalContent` で差分マージし、その結果が `markdownUpdated` リスナー経由で
再度 `'change'` として host へ返り、`document` へ反映される（＝自己修復ループ）。

問題は、webview からの `'change'`（デバウンス無し、キー入力ごとにほぼ即時）が、
**外部変更が上記の自己修復ループを一巡する前に**先に処理され得ること。この場合:

1. 外部ツールがディスクに書き込む。
2. `document`（VS Code の `TextDocument` モデル）はこの書き込みを **自動では
   反映しない**（`vscode.workspace.fs.writeFile` 等を経由しない直接書き込みは
   `TextDocument` に伝播しない）。
3. ユーザーが Preview で入力を続けている（あるいは、たまたま直前の入力の
   `'change'` がまだキューに残っている）と、`applyMarkdownFromWebview` が
   `document.getText()`（外部変更を知らない、古いままの内容）を基準に全文置換
   ＋ `document.save()` を実行する。
4. これによりディスク上の外部ツールの書き込みが、**外部変更を含まない**
   Preview 側の内容で丸ごと上書きされる。外部編集は跡形もなく失われる。

## 修正

`applyMarkdownFromWebview` が保存する直前に、ディスクの実内容を読み直し、
`document.getText()`（自分が把握している内容）とも `lastAppliedFromWebview`
（直近に自分が書き込んだ内容）とも食い違っていないかを確認する。食い違って
いれば「自分の知らない外部の変更が割り込んだ」とみなし、**上書き保存せず**、
その最新のディスク内容を webview へ push してマージを待つ（今回の webview の
`'change'` の適用は見送る。ユーザーの入力自体は失われない — webview が外部
内容をマージした直後、続けて新しい `'change'` が host に届き、その時点の
`document.getText()` はディスクと一致しているため通常どおり適用される）。

判定ロジックは `resolveWebviewSaveDecision`（`src/preview/host/externalEcho.ts`）
として純関数に切り出し、`resolveExternalPush` と同じ考え方（内容ベースの比較で
タイミング依存を無くす）を踏襲する。

```ts
export type WebviewSaveDecision = 'apply' | 'defer';

export function resolveWebviewSaveDecision(
    diskContent: string,
    documentContent: string,
    lastAppliedFromWebview: string | null
): WebviewSaveDecision {
    if (diskContent === documentContent) return 'apply';
    if (diskContent === lastAppliedFromWebview) return 'apply';
    return 'defer';
}
```

## テスト

`test/suite/preview/externalEcho.test.ts` の `resolveWebviewSaveDecision` スイート
（純関数のユニットテスト）。

**既知の制約**: 実際の競合（webview の `'change'` メッセージと `FileSystemWatcher`
の発火タイミングの実レース）は、webview 内部からしか `'change'` を発火できず、
実 VS Code 拡張ホストテスト（`test/extension/`）からは webview 内部の JS を
直接駆動できないため、エンドツーエンドでは自動テスト化できない。判定ロジック
そのものは純関数として TDD 済みだが、実際の配線（`applyMarkdownFromWebview` へ
の組み込み）は `test/extension/preview.test.ts` の既存スイート（12.1〜12.6）を
回帰させることで「壊していないこと」のみ確認している。将来 webview を実操作
できるテスト基盤ができた場合はここに実レース再現テストを追加すること。
