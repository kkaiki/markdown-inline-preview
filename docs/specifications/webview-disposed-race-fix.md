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

## 5. 追記（2026-07-09）: クラッシュは直っても、タブの重複自体は低頻度で再発していた

ユーザー報告（「サイドバーから再度開くとPreviewが開くがRawタブが残ったまま」）を受けて
13.4 を単体で繰り返し実行したところ、**例外は発生しない**が **タブが1枚に収束しない**
（2枚のまま）ケースが依然として発生することを確認した（13.1〜13.4 を連続実行する
テストランで概ね数回に1回の頻度）。

### 原因

`switchToPreview` は `openWith(VIEW_TYPE)` の直後に一度だけ
`closeStaleTabs(findTabs(isTextTabForUri(...)))` を実行して Raw タブを片付けるが、
これは**その時点のタブ一覧のスナップショット**に対する1回限りの掃除である。
サイドバー等からの同時実行の再オープン（既定の Raw エディタで開く操作）が、この
掃除より**後**に新しい Raw タブを作り終えると、そのタブは掃除対象から漏れる。

漏れた Raw タブは通常、次に「Raw エディタがアクティブになる」タイミングで
`collapseDuplicateRawTabForActiveEditor`（`vscode.window.onDidChangeActiveTextEditor`
起点）が拾って片付ける設計になっているが、この漏れた Raw タブが一度も
**アクティブにならない**まま（直後に Preview へフォーカスが戻り、Raw タブは背後に
残ったまま）だと、そのイベント自体が発火せず、タブが恒久的に残り続ける。

### 修正案1（不採用）: switchToPreview 完了後の時間差リトライ

最初に試したのは、`switchToPreview` の既存の即時 `closeStaleTabs` に加えて、一定時間
（400ms）後にもう一度だけ同じ掃除をやり直す、という時間差の追試チェックだった。
`test/extension/preview/tabs-editors.test.ts` 13.4 単体では改善したが、フルスイート
実行で確認したところ、以下の**既存テストを新たに壊す**ことが分かった（3回連続で
同じ3件が再現）:

- 12.3 / 12.3b（dirty な Raw 編集を Preview→Raw と往復しても失われない）が
  `Illegal argument: TextEditor` で失敗する。
- 9.1（複数ファイルの Preview/Raw トグルを5回連続で繰り返す）が、後半の
  iteration で Raw へ正しく戻らなくなる。

原因は、`switchToPreview` を短時間に連続で呼ぶ操作（12.3/12.3b の往復、9.1 の
連続トグル）では、**前の呼び出しの時間差タイマーがまだ発火していない状態で次の
切替が始まる**ため、`inFlightSwitch`/記憶モードのガードをすり抜けたタイマーが、
次の切替がまさに作業中のタブへ横から `closeStaleTabs` を実行してしまうこと。
時間差という「いつ・何に対して安全か」を静的に判断できない仕組みは、この種の
連続切替と本質的に相性が悪いと判断し、不採用にした。

### 修正案2（採用）: 新規タブの出現イベントに限定した重複解消

`collapseDuplicateRawTabForActiveEditor`（`onDidChangeActiveTextEditor` 起点）が
拾えない根本原因は、「トリガーが "Raw エディタがアクティブになった" 一択」である
こと自体にある。そこで、**`vscode.window.tabGroups.onDidChangeTabs` の
`event.opened`（新規に作られたタブだけ）** に限定した2つ目のトリガーを追加した。

```ts
vscode.window.tabGroups.onDidChangeTabs(event => {
    for (const tab of event.opened) {
        if (!(tab.input instanceof vscode.TabInputText)) continue;
        if (!isMarkdownResource(tab.input.uri)) continue;
        void collapseDuplicateRawTabsInGroup(tab.input.uri, tab.group);
    }
}),
```

`collapseDuplicateRawTabForActiveEditor` の中身（`inFlightSwitch` チェック→
同グループに設定済み Preview タブがあるか→`previewSettledAt` の 500ms 猶予窓→
古い Raw タブを閉じる）を `collapseDuplicateRawTabsInGroup(uri, group)` として
切り出し、`editor: TextEditor` からではなく `Tab`（`event.opened` の要素）から
直接 uri/group を渡せるようにした。**判定ロジック自体は変えていない**——
「アクティブになった時」だけでなく「新規タブとして出現した時」にも同じ判定を
行うようになっただけである。

`event.opened` だけを見るのが安全性の要（§2 で述べた過去の "Illegal argument:
TextEditor" 回帰は、あらゆるタブ変更（アクティブ化・並べ替え・close 等）に
反応する広い購読が原因だった）。新規タブの出現はタブがまさに作られた瞬間にしか
発火せず、既存タブの活性化や並べ替えには一切反応しないため、切替処理中の
一時的な並存状態（`switchToPreview`/`switchToRaw` が意図的に作る、Preview/Raw
タブが束の間 2 枚になる状態）を「新規出現」と誤検知することがない。

フルスイートを3回連続実行して 9.1/12.3/12.3b の回帰が無いことを確認した上で、
13.1〜13.4 を6回連続実行して確認したところ、13.4（`togglePreview` の実行中に
サイドバー再オープンが重なる、という最も極端な同時実行ケース）はなお時折
（6回中2回）収束しないことがある。これは、この特定のケースでは競合する
`switchToPreview` 自身の webview 解決（`resolveCustomTextEditor`）がまだ
完了しておらず `previewSettledAt` が未設定のため、新設した `opened` トリガーも
500ms 猶予ガードで見送ってしまうため（安全側に倒した結果の既知の残存ギャップ）。
一方、ユーザーが実際に報告した「安定して開いている Preview を後からサイドバーで
再度開く」という通常の再現手順（13.1 相当）は、この修正で確実に解消される。
