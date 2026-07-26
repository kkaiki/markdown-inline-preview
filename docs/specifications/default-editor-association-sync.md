# `.md` の既定エディタ（workbench.editorAssociations）を Raw/Preview モードに追従させる

## 経緯・ユーザー要望

[[preview-default-editor-fix]] の「追記（2026-07-26）」で、実機のちらつき・タブ2枚残りの
真因が「同じ `*.md` に対して `priority: "default"` を主張する別拡張機能
（`cweijan.vscode-office` の `cweijan.markdownViewer`）との競合」だと判明した。当時の
対処はユーザーに `workbench.editorAssociations` を手で書いてもらうことだったが、
ユーザーからの要望は次の2点だった。

1. **拡張機能側でその設定を面倒みてほしい**（Cursor の既定を拡張機能から変えられないのか）。
2. **Raw に切り替えたら、以降 Raw が既定で開くようにしてほしい**。
3. **Raw と Preview が2枚開かれることが原理的に無い状態にしたい**（事後的にタブを閉じる
   後始末を増やすのではなく、そもそも2枚目が生まれない構造にする）。

## 原因（なぜ従来は「2手」を踏んでいたか）

`customEditors[0].priority: "default"` だけに頼っていると、`.md` を開く操作は**常に**本拡張の
Custom Editor（`ipreview.preview`）に解決される。そのため Raw モードのユーザーでも、

1. Preview の Custom Editor が生成され `resolveCustomTextEditor` が呼ばれる
2. 記憶モード/既定設定が `'raw'` なら `bounceToRawEditor()` が webviewPanel を dispose し、
   `vscode.openWith(uri, 'default')` で標準テキストエディタを開き直す

という2手を必ず踏む。この過渡状態が、

- Raw を好むユーザーにとっての「一瞬 Preview が見えてから Raw になる」ちらつき
  （[[preview-default-editor-fix]] の「既知の対称的なリスク」そのもの）
- 一瞬とはいえ同じ URI に対して2つのエディタが存在するタイミング
- 他拡張が `priority: "default"` を主張しているときの解決の揺れ

の温床になっていた。`priority` は拡張機能が宣言する**希望**にすぎず、同じ優先度の主張が
複数あるときの決着を拡張機能側から制御することはできない。

## 修正方針

VS Code のエディタ解決では、**ユーザー設定の `workbench.editorAssociations` が
拡張機能宣言の `priority` より強い**。そこで「次に Markdown を開くときのモード」を
この本体設定へ同期させ、**ファイルを開く前から解決先が1つに確定している**状態を作る。

| 現在のモード | `workbench.editorAssociations` へ書く値 | 開いたときの挙動 |
|---|---|---|
| preview | `"*.md": "ipreview.preview"`, `"*.markdown": "ipreview.preview"` | VS Code が直接 Preview を解決（跳ね返し不要） |
| raw | `"*.md": "default"`, `"*.markdown": "default"` | VS Code が直接テキストエディタを解決。**Preview の Custom Editor は生成すらされない** |

これは既存の `markdownInline.preview.alwaysOpenNewTab` → `workbench.editor.enablePreview`、
`preview.wrapTabs` → `workbench.editor.wrapTabs` と同じ「本体設定を拡張機能が直接操作する」
方針の踏襲である（`src/raw/settings.ts`）。

## 実装

### 1. 新設定 `markdownInline.preview.controlDefaultEditor`（既定 `true`）

`workbench.editorAssociations`（グローバル設定）を拡張機能が書き換えることの
オプトアウト手段。`false` にすると、拡張機能が書いた関連付けは**取り除かれ**、
従来どおり `bounceToRawEditor` による跳ね返し経路で Raw を実現する。

### 2. `src/preview/host/defaultEditorAssociation.ts`（純関数）

- `resolveDefaultOpenMode({ remembered, defaultMode })` — 「次に開く Markdown をどちらで
  開くか」。記憶モード優先、無ければ `preview.defaultMode`、未知値は `preview` に丸める。
  `PreviewEditorProvider.resolveCustomTextEditor` と `onDidChangeActiveTextEditor` に
  重複していた同じ判定をこの関数に集約した。
- `computeEditorAssociations(current, desired)` — 現在の関連付けに対し、管理対象パターン
  （`*.md` / `*.markdown`、`package.json` の customEditor selector と一致）だけを差し替えた
  新しいオブジェクトを返す。管理対象外のキー（`*.pdf` など他拡張のための関連付け）は
  そのまま保つ。`desired === null`（制御 OFF）のときは、**自分が書いた値
  （`ipreview.preview` / `default`）である場合に限り**キーを取り除く — ユーザーが自分の
  意思で他拡張のビューアへ向けている場合は残す。
- `editorAssociationsEqual(a, b)` — 変化が無いときに `settings.json` へ書き込まないための比較
  （キー順の違いは無視、`undefined` と `{}` は同一扱い）。

### 3. `previewPanel.ts`: `applyDefaultEditorAssociation(context)`

上記の純関数を使って本体設定を更新する薄い層。次のタイミングで呼ぶ。

- `activatePreviewFeature`（起動時。前回のモードが関連付けへ反映済みであることを保証する）
- `switchToPreview` / `switchToRaw` の中（`rememberMode` の直後）
- `markdownInline.preview.controlDefaultEditor` / `preview.defaultMode` /
  `preview.rememberMode` の設定変更時

`rememberMode` が無効（`preview.rememberMode: false`）のときは `getRememberedMode` が
`undefined` を返すため、関連付けは自動的に `preview.defaultMode` に従う。「モード記憶を
切っているのに、切り替えた瞬間のモードが次回以降へ持ち越される」ことは無い。

### 4. `bounceToRawEditor` は残す（ただし dispose をやめる）

削除はしない。次のケースでは引き続き必要になるため。

- `controlDefaultEditor: false`（ユーザーがオプトアウトした場合）
- 関連付けが効かない URI（`untitled:` スキームなど、パターンマッチの対象外）
- 設定の書き込みが反映されるまでのごく短い過渡期（拡張の起動は `onLanguage:markdown`＝
  最初の Markdown を開いた時点なので、その1回目はまだ関連付けが前回の値のことがある）

**ただし従来の実装には別のバグがあり、同時に修正した**。`bounceToRawEditor` は
`resolveCustomTextEditor` の最中に `webviewPanel.dispose()` を呼んでいたが、VS Code は
エディタ解決中に panel が破棄されるとそのオープン操作自体を失敗扱いにし、

```
Unable to open 'testing-rules.md'
OverlayWebview has been disposed
```

というダイアログを出したうえで、壊れた Custom Editor タブをその場に残す（Raw へ切り替わらず
ファイルが開けない。2026-07-26 ユーザー報告）。修正後は panel を自分で破棄せず、
`setTimeout(0)` で解決から抜けてから `vscode.openWith(uri, 'default')` でタブを置き換え、
panel の破棄は VS Code に任せる。保存済みファイルでは in-place 置換されるため Preview タブは
残らないが、置換されなかった場合（untitled 等）のみ `closeStaleTabs` で後片付けする。

## 「原理的に2枚にならない」の範囲（正確な線引き）

この修正で構造的に排除できるのは「**ファイルを開く経路**」（Explorer クリック、Quick Open、
`vscode.open`、ウィンドウ再起動時のタブ復元）である。ここでは解決先が設定で一意に決まる
ため、2つ目のエディタが作られる余地が無い。

一方、次の2つは引き続き「開いてから閉じる」構造が残る。

- **`togglePreview` コマンド自体**: 反対側のエディタを `openWith` で開き、旧タブを閉じる。
  保存済みファイルでは VS Code がタブを in-place 置換するため実害はほぼ無いが、瞬間的には
  両方が存在しうる。
- **`untitled:` ドキュメント**: `vscode.openWith` がテキストタブを置き換えず2枚並存する
  VS Code 側の既知挙動（[[untitled-preview-content-loss-fix]]）。

## テスト

TDD 順（失敗→仕様→実装→成功）で追加。

- `test/suite/preview/tabs-editors/defaultEditorAssociation.test.ts`（jsdom・純関数）
  — モード解決、関連付けの計算、他拡張の関連付けの保全、無駄な書き込みの抑止。
- `test/extension/preview/settings.test.ts` 16.1〜16.4（実 VS Code）
  — Raw/Preview 切替で `workbench.editorAssociations` が実際に追従すること、
  `controlDefaultEditor: false` では書き換えないこと、無関係な関連付けを壊さないこと。
- `test/extension/preview/tabs-editors.test.ts` 17.1（実 VS Code）
  — Raw モードで新規に `.md` を開いたとき、Preview の Custom Editor タブが
  **タブ生成イベント上でも一度も現れない**こと（＝跳ね返し経路を通っていない）。
- `test/extension/preview/tabs-editors.test.ts` 17.2（実 VS Code）
  — 跳ね返し経路を明示的に通した（`controlDefaultEditor: false` かつ `defaultMode: raw` で
  Custom Editor を直接開く）ときに、`OverlayWebview has been disposed` でオープンが壊れず、
  Raw タブ1枚に収束すること。修正前は Custom Editor タブが残り Raw に切り替わらなかった。

## 関連

- [[preview-default-editor-fix]] — `priority: "option"` → `"default"` 変更と、その後判明した
  他拡張との競合。本仕様はその「ユーザーが手で書く恒久対処」を拡張機能側へ取り込んだもの。
- [[sidebar-reopen-preview-duplicate-tab-fix]] — 事後的な重複タブ解消ロジック（今回は
  拡張せず、そのまま保険として残す）。
- [[untitled-preview-content-loss-fix]] — untitled で2枚並存する VS Code 側の挙動。
