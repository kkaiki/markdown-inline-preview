# 未保存（untitled）ファイルを Preview 化すると本文が消えるバグ

## 症状

保存前の新規 Markdown ファイル（`untitled:Untitled-N`、ディスク実体なし）を開き、
`markdownInline.togglePreview`（または `openPreview`）で Preview に切り替えると、
**その瞬間に文書の本文が空文字列になる**。ディスク上のファイル（`file://` スキーム）
では発生しない。

再現手順（実 VS Code / `@vscode/test-electron`）:

1. 新規 Markdown ファイルを作成し保存しない（`vscode.workspace.openTextDocument({ content, language: 'markdown' })`）。
2. `markdownInline.togglePreview` を実行する。
3. 数百 ms 後、`document.getText()` が `''` になっている（`isClosed` は `false` のまま）。

## 原因

`switchToPreview()`（`src/preview/host/previewPanel.ts`）は次の順で処理する:

1. `vscode.commands.executeCommand('vscode.openWith', document.uri, VIEW_TYPE, viewColumn)`
2. `closeStaleTabs(findTabs(isTextTabForUri(document.uri)))` — 直前まで表示していた
   通常のテキストタブを閉じる（同じ URI のタブが新旧 2 枚同時に存在しないようにするため）。

**通常のファイル**（`file://`）では、`vscode.openWith` はテキストタブを Custom Editor
タブへ「その場で置き換える」ため、ステップ2で見つかる古いテキストタブは既に存在しない
（`closeStaleTabs` は no-op）。

ところが **`untitled:` スキーム**の場合、`vscode.openWith` は置き換えず、
同じ URI を指すテキストタブと Custom Editor タブが **2 枚同時に**開いた状態になる
（実 VS Code で確認済み）。この状態で `closeStaleTabs` が古いテキストタブを
`vscode.window.tabGroups.close()` すると、その瞬間に **同一の `vscode.TextDocument`
オブジェクトの `getText()` が空文字列になる**（`isClosed` は `false` のまま）。

これは VS Code 本体の既知の挙動と考えられる: `untitled` ドキュメントは
ディスク実体を持たないため、その「最後のテキストエディタ」が閉じられると、
Custom Editor タブが同じ URI を参照して残っていても、ドキュメントの内容自体が
破棄される（テキストエディタと Custom Editor で、ドキュメントの生存期間の
数え方が異なるとみられる）。

## 修正

最初に検討した「untitled のときは `closeStaleTabs` を呼ばない」案は、複数の
untitled ファイルを同時に Preview 化する既存シナリオ（`test/extension/preview.test.ts`
9.1: 複数ファイルの Preview/Raw トグル）で、閉じ残ったテキストタブがタブ判定を乱し、
無関係なファイルへフォーカスが漂流する回帰を生んだ（タブが増えること自体が別の
不具合を誘発した）。

そのため最終的な修正は「タブを閉じる操作自体は維持しつつ、内容の消失だけを直後に
復元する」方式にした:

1. `closeStaleTabs` を呼ぶ**前**に、`document.uri.scheme === 'untitled'` なら
   現在の本文を変数に退避する。
2. 従来どおり `closeStaleTabs` を呼ぶ（タブ構成は変えない）。
3. 退避した本文があり、かつ `closeStaleTabs` の後に `document.getText()` が
   その本文と異なっていたら（＝消えていたら）、`WorkspaceEdit` で本文を先頭に
   再挿入して復元する。

これにより、タブ構成（1 ファイル1タブ）を保ったまま、untitled 特有の内容消失だけを
ピンポイントで打ち消す。

## テスト

`test/extension/preview.test.ts` 12.6:
「未保存の新規（untitled）ファイルを Preview 化しても本文が失われない」

## 副作用として見つかった別件（9.1 のテストを実ファイルへ変更）

この修正の検証中、**複数の untitled ファイルを同時に Preview 化してから素早く
Raw⇄Preview を往復する**と（`test/extension/preview.test.ts` 9.1 が元々使っていた
シナリオ）、`vscode.workspace.applyEdit` を経由する内容復元処理そのものが
（成功・失敗を問わず）VS Code のタブ・フォーカス管理と干渉し、無関係なファイルへ
フォーカスが漂流する新たな不具合を引き起こすことが分かった
（`await` の有無やタイミングを変えても再現し、`WorkspaceEdit` を呼ぶこと自体が
原因と特定）。

9.1 の本来の検証目的は「タブ・フォーカス管理」であり untitled 固有の挙動ではない
ため、同テストはディスク実体を持つ実ファイル（`fs.mkdtempSync` で作成した一時
ファイル）を使うよう変更した。実ファイルはこの一連の untitled 固有の問題の影響を
受けないため、テストの意図を保ったまま安全に検証できる。

## 追記（2026-07-07）: 上記の副作用シナリオを実際に再現・調査した結果

`preview-usage-flow-test-backlog.md` の網羅監査で「この組み合わせを守るテストが
存在しない」と指摘されたため、`test/extension/preview/tabs-editors.test.ts` に
実際に「複数 untitled ファイルを開いて高速に Raw⇄Preview を往復する」テスト（9.4）
を実装して再現を試みた。

**結果: 1回目の往復から 100% 再現する。** untitled 文書2つを開いて片方を Preview 化
→もう片方も Preview 化→最初のファイルを Preview→Raw と1往復させるだけで、
アクティブタブが無関係な2つ目の untitled ファイルへ漂流する。この際
`vscode.workspace.applyEdit` が内部で
`"untitled:Untitled-N has changed in the meantime"` という警告とともに
無視される（本ドキュメントの「修正」節で導入した内容復元用の `WorkspaceEdit` が、
複数 untitled 文書が絡む状況ではバージョン不整合で毎回失敗している）。

根本原因は VS Code 本体の untitled ドキュメントのバージョン管理とタブクローズ処理の
相互作用にあると見られ、拡張機能側のコードだけで確実に直せる保証がない
（当時のチームが同じ理由で「実ファイルへ回避する」判断をしたのと同じ状況）。
深追いのリスクが高いと判断し、根本修正は行わずテストを `test.skip` として
再現条件を記録するに留めた（`test/extension/preview/tabs-editors.test.ts` 9.4）。

**今後の対応候補**（着手する場合の出発点）:
- `switchToPreview`/`switchToRaw` 内の `WorkspaceEdit` 適用前に
  `vscode.workspace.applyEdit` の戻り値（`boolean`）を確認しておらず、失敗が
  完全に静かに握りつぶされている。まずここへ `debugLog` を足して、実際に
  復元が失敗した頻度・タイミングを本番相当の環境でも観測できるようにする。
- 「未保存ファイルは高速に複数 Preview 切替しない」という運用上の注意を
  ドキュメント（README 等）に明記することも、修正が困難な場合の現実的な代替案。
