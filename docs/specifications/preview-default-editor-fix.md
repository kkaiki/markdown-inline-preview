# customEditor priority を "option" → "default" へ変更（サイドバー再オープン時のRawちらつき・フォーカス奪取の解消）

## 経緯・ユーザー報告

`markdownInline.preview.defaultMode` の既定値を `preview` に変更した（`preview-features.md`
2026-07-16 追記）後も、次の症状が残っていた。

1. 既に Preview で開いているファイルを、左のサイドバー（Explorer）から**もう一度**開くと、
   一瞬 Raw（テキストエディタ）が表示されてから Preview へ切り替わる（ちらつき）。
2. これに伴い、**サイドバーのキーボードフォーカスが奪われる**ため、ファイルをクリックした
   直後に矢印キーで別ファイルへ移動したり、`Cmd+Delete`（`workbench.action.files.delete`
   相当、サイドバーにフォーカスがある前提のキーバインド）でファイルを削除する、といった
   「サイドバーにフォーカスを残したまま操作を続ける」ワークフローができなくなっていた。

## 原因

`customEditors[0].priority` が `"option"` だったため、VS Code は `.md` ファイルの
既定エディタとして**常にテキストエディタ（Raw）を選ぶ**。サイドバーからの単発クリックで
ファイルを開くと、まず Raw タブが（プレビューモードで）作られ、その後
`onDidChangeActiveTextEditor` を検知した本拡張の `collapseDuplicateRawTabForActiveEditor`
（`sidebar-reopen-preview-duplicate-tab-fix.md`）が非同期に `vscode.openWith(...)` で
Preview へ差し替えて Raw タブを閉じる、という **reactive な後始末**で重複を解消していた。

この reactive な仕組み自体は正しく機能していたが、次の2点が症状の直接原因だった。

- Raw タブが実際に一瞬でも作られ、描画されてしまう（`priority: "option"` である以上、
  VS Code 自身が既定でテキストエディタを選ぶ挙動そのものは変えられない）。
- `collapseDuplicateRawTabsInGroup` 内の `vscode.commands.executeCommand('vscode.openWith',
  uri, VIEW_TYPE, group.viewColumn)` 呼び出しに `preserveFocus` を指定していなかった。
  VS Code の単発クリック（プレビューモード）は本来サイドバーのキーボードフォーカスを
  奪わないが、この openWith 呼び出しがエディタ側へフォーカスを強制的に奪っていた。

## 修正内容

### 1. `package.json`: `customEditors[0].priority` を `"option"` → `"default"`

`.md`/`.markdown` ファイルの既定エディタ自体を本拡張の Preview（Custom Editor）にした。
これにより、サイドバーからの通常オープンは Raw を経由せず**直接 Preview が解決される**
（`vscode.workspace.getWorkspaceFolder` 等と同様、VS Code 自身のエディタ解決の話であり、
本拡張のコードが介在する前に決まる）。

### 2. `src/preview/host/previewPanel.ts`: `resolveCustomTextEditor` での Raw 跳ね返し

`priority: "default"`化後も、ユーザーが明示的に Raw を最後に選んでいた場合
（`markdownInline.preview.rememberMode` で記憶した `'raw'`、または
`markdownInline.preview.defaultMode` 設定が `'raw'`）は、その意向を尊重する必要がある。
`PreviewEditorProvider.resolveCustomTextEditor` の冒頭で、そのファイルが「このセッションで
まだ見ていない（＝新規オープン）」場合に限り記憶モード/既定設定を確認し、`'raw'` なら
`bounceToRawEditor()` で即座に Raw エディタへ跳ね返す（webview はまだ何も描画していない
状態で `dispose()` する）。

「未確認 URI かどうか」の判定基準は、既存の `onDidChangeActiveTextEditor` ハンドラ
（新規オープン時のモード適用ロジック）と揃える必要があるため、`seenMarkdownUris`
（従来は `activatePreviewFeature` 関数のローカル変数）をモジュールスコープへ移動し、
両方の場所から共有した。

`bounceToRawEditor` は `rememberMode` を呼ばない — ここは「既に raw が選ばれている」ことを
尊重して跳ね返すだけであり、ユーザーが今まさに raw へ切り替えたわけではないため、記憶を
上書きする必要が無い（`switchToRaw` との違い）。

### 3. `collapseDuplicateRawTabsInGroup` に `preserveFocus: true` を追加

明示的な「Reopen Editor With > Text Editor」等、priority 変更後も残るごく一部の経路で
重複解消ロジックが働く際、Preview タブを「そのグループのアクティブなタブ」にする効果は
保ったまま、キーボードフォーカスまでは奪わないようにした。

## 副作用として解消されたこと

`priority: "default"`化 と `supportsMultipleEditorsPerDocument: false` の組み合わせにより、
同じ列で既に Preview 中のファイルをサイドバーから再オープンしても、**Raw タブは一度も
作られず**、既存の Preview タブがそのまま再利用される（`collapseDuplicateRawTabsInGroup`
の 500ms 猶予窓を待つ必要すらなくなった）。別カラムに開いた場合は、それぞれ独立した
Preview インスタンスになる（Raw にはならない）。

## 既知の対称的なリスク（未解消・実機確認が必要）

`resolveCustomTextEditor` での Raw 跳ね返しは、"Raw を好むユーザーの初回オープン" で
逆方向の一瞬のちらつき（Preview が一瞬解決されてから Raw へ跳ね返る）を生みうる。
`markdownInline.preview.defaultMode` の既定値は既に `preview` に変更済みのため、この
跳ね返りが発生するのは「過去に明示的に Raw へ切り替えたことがあり、`rememberMode` に
より記憶されている」ユーザーのみに限定される。

## テストの限界（自動化できないこと）

VS Code の拡張ホストテスト環境では **`vscode.window.activeTextEditor` が常に `undefined`
のまま**であることを実験で確認した（`showTextDocument({preserveFocus: false})` を呼んでも
変化しない）。これは拡張テストのウィンドウが実際の OS キーボードフォーカスを持たない
ためと考えられる。「サイドバーのキーボードフォーカスが保持されるか」を直接検証する
公開 API も無い。そのため、本修正が実際に「サイドバークリック直後の `Cmd+Delete` が
機能するか」を解消したかどうかは、**実機（Cursor/VS Code）での手動確認が必要**であり、
自動テストではカバーできない。

## テスト

`test/extension/preview/tabs-editors.test.ts` 13.1〜13.4 を新しい仕様
（Raw タブがそもそも作られない）に合わせて更新した。
`npm run test:unit`（926件）・`npm test`（実VS Code、既知flake2件を除き110件green）・
`npm run compile`・`npm run lint:error` で確認済み。
