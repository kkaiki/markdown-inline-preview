# Raw の未保存編集が Preview 切替で失われる不具合の修正 仕様

最終更新: 2026-07-02

## 1. 症状

Raw（通常のテキストエディタ）で編集して**保存しないまま** Preview へ切り替える
（`markdownInline.togglePreview` / タイトルバーのアイコン / モード記憶による自動切替）と、
未保存の編集が**丸ごと破棄され、ディスク上の内容に巻き戻る**。Preview から Raw へ
戻っても編集は失われたまま（dirty フラグも消えている）。

実 VS Code 拡張ホストテスト `test/extension/preview.test.ts` の
「12.3 未保存（dirty）の Raw 編集がある状態で Preview→Raw と往復しても編集内容が失われない」
で決定的に再現する（診断ログにより、**Raw→Preview 切替の直後**の時点で既に
`isDirty=false`・文書内容＝ディスク内容 に巻き戻っていることを確認済み）。

## 2. 根本原因

`switchToPreview`（`src/preview/host/previewPanel.ts`）は

1. `vscode.openWith(uri, 'ipreview.preview')` で Preview（CustomTextEditor）を開き、
2. `closeStaleTabs` で同じ URI の古いテキストタブを閉じる

という手順を踏む。このとき対象ドキュメントが dirty だと、テキストタブの差し替え／
クローズの過程で VS Code がテキストモデルの未保存変更を破棄し、ディスク内容へ
リバートする（`tabGroups.close` は保存確認を出さずに閉じる）。Preview の webview 初期化
（`ready` → `init`）は `document.getText()` を使うが、その後にモデル自体が巻き戻るため、
最終的にユーザーの編集は残らない。

## 3. 修正方針

Preview モードはもともと「webview の 1 キー入力ごとに `applyEdit` + `document.save()`」
という**自動保存前提**の設計（`applyMarkdownFromWebview`）。したがって Raw→Preview の
切替時も同じ思想で、**タブを差し替える前に dirty なら保存する**:

```ts
// switchToPreview の冒頭（openWith より前）
if (document.isDirty && !document.isUntitled) {
    await document.save();
}
```

- 保存してから差し替えるため、リバートが起きても失われる変更が存在しない。
- `switchToPreview` は「togglePreview コマンド」「openPreview コマンド」
  「モード記憶による自動切替」の全経路が通る共通関数なので、ここ 1 箇所で全経路に効く。
- **untitled 文書は除外する**。untitled にはディスク実体が無く（＝リバートによる消失も
  起きず、実際 untitled の Preview 切替は従来から内容を保持する）、`save()` を呼ぶと
  「名前を付けて保存」ダイアログが開いて UI がブロックしてしまうため
  （テスト 9.1 の untitled 文書トグルがタイムアウトすることで検出）。

## 4. テスト

- `test/extension/preview.test.ts` スイート 12「Preview 実利用フロー」12.3（実 VS Code）:
  dirty 編集 → Preview → Raw 往復で編集内容が残ることを検証（本修正の回帰テスト）。
- 併設の 12.1（クリーンな文書のラウンドトリップで内容不変・dirty 化しない）が、
  本修正が「不要な保存や内容変化を起こさない」ことの防壁になる。
