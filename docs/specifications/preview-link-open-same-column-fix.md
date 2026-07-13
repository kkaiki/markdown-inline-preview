# Previewからファイルを開くとエディタグループが増殖するバグ

## 症状

Preview（Webview カスタムエディタ）内の Markdown リンク（例: `[link](./target.md)`）を
クリックすると、リンク先のファイルが**同じエディタグループの新しいタブ**としてではなく、
**新しいエディタグループ（右側の分割ペイン）**として開かれる。

期待される挙動は「新しいタブとしては開くが、新しいサイドバー（分割ペイン）は作らない」。

同じ原因で、CursorのExplorer等から別ファイルを続けて開くたびに、1分割が2分割、
2分割が3分割というように増殖する場合がある。CursorがアクティブなCustom Editorを
通常のTextEditor列として解決できず、通常のファイルオープンを `ViewColumn.Beside`
相当としてVS Codeへ渡すためである。

当初の補正はMarkdownだけを対象にしていたため、`eslint.config.js` 等の非Markdownでは
未修正だった。また、Preview列の右にCursor Agent/Terminal等のロックされた既存グループが
ある場合、非Markdownを開くと2分割から3分割へ増殖する。

## 原因

`openLink` メッセージのハンドラ（`src/preview/host/previewPanel.ts` の
`onDidReceiveMessage` 内、`openLinkFromPreview` 呼び出し）は、リンク先を開く際に

```ts
await vscode.window.showTextDocument(targetUri, { preview: false });
```

と `viewColumn` を指定していなかった。

`viewColumn` 省略時、`showTextDocument` は基本的に「現在アクティブな通常エディタと同じ列」
を解決しようとするが、リンクをクリックした時点でアクティブなのは **Webview パネル
（カスタムエディタ）** であり、`vscode.window.activeTextEditor` は `undefined` になっている。
このため VS Code は基準にすべき列を見つけられず、フォールバックとして新しいエディタ
グループを作成してそこにリンク先を開いてしまう。

## 修正

`openLinkFromPreview` に、呼び出し元の `webviewPanel.viewColumn`（＝リンクをクリックした
Preview 自身が属する列）を明示的に渡すようにした。

```ts
async function openLinkFromPreview(
    href: string,
    documentUri: vscode.Uri,
    viewColumn: vscode.ViewColumn | undefined
): Promise<void> {
    // ...
    await vscode.window.showTextDocument(targetUri, { preview: false, viewColumn });
}
```

`resolveCustomTextEditor` 内で `webviewPanel.viewColumn` を捕捉したクロージャを
`onDidReceiveMessage` の `openLink` 分岐から呼ぶことで、リンク先は常に「リンクを
クリックした Preview と同じ列」に、新しいタブとして開かれるようになる（`preview: false`
により、そのタブはプレビュー的（次のファイルを開くと使い回される）タブではなく、
恒久的な新規タブとして開かれる点は既存どおり変更していない）。

### Explorer・CLI等から開く標準経路

Explorer、ChatGPT、Claude Code、bash等がURIだけをVS Codeへ渡す場合は、拡張機能が
`viewColumn`を指定したり、タブ生成後に別列へ移動したりしない。右側のロック済みCLI
グループがアクティブでも、VS Code標準のグループ選択が左の編集列を選ぶ。

一時実装した `onDidChangeTabGroups` / `onDidChangeTabs` /
`onDidChangeActiveTextEditor` による事後移動は削除した。これは明示的なBeside操作まで
横取りし、イベント順と前回のPreview状態に依存するレースを追加していたためである。

### テスト専用シーム

`test/extension/` の実 VS Code テストは Webview 内の JS（実際にリンクをクリックする操作）
を駆動できないため、`change` メッセージのテスト（`injectWebviewChangeForTesting`）と同じ
発想で、`openLink` メッセージ受信と同じ経路をテストから直接呼び出せる
`markdownInline.__test.injectOpenLink` コマンドを追加した（`context.extensionMode ===
vscode.ExtensionMode.Test` の時だけ登録され、通常のユーザーインストールでは存在しない）。

## テスト

`test/extension/preview/tabs-editors.test.ts` 14:

- 14.1: 「Previewでリンクを開くと、新しいエディタグループを作らず同じ列に新しいタブとして
  開く」— リンクを開く前後で `vscode.window.tabGroups.all.length` が変化しないこと、かつ
  リンク先が同じグループのアクティブタブになることを確認する。
- 14.2: Preview中に列指定なしの標準経路で別ファイルを続けて開き、同じ列に留まること。
- 14.3: 右側に既存グループがある状態で、Previewから列指定なしで非Markdownを開いても
  Preview列の新規タブになること。
- 15.1: 右側のロック済みCLIグループをアクティブにしてから列指定なしで非Markdownを開き、
  VS Code標準機能だけで左Preview列が選ばれること。事後移動処理を削除した状態で成功する。
