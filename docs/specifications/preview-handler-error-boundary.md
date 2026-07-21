# Preview: メッセージハンドラ／モード切替の一律エラーバウンダリ 仕様

最終更新: 2026-07-21

## 1. 背景

`docs/vscode-office-stability-analysis.md`（vscode-office との比較調査）が指摘した最優先ギャップ:
本プロジェクトの `previewPanel.ts` は多くの経路を `void somePromise()` の fire-and-forget で
処理しており、失敗してもユーザー・開発者どちらにも一切見えない。`change` メッセージ（webview →
document の保存）については `webview-save-failure-visibility.md`（2026-07-14）で既に
`reportRejection` + `debugLog` + `showErrorMessage` の対処が入ったが、それ以外の経路は
未対応のまま残っていた。

`docs/vditor-base-migration-plan.md` §9 のとおり、Vditor へのエンジン全面移行は Phase 0 の
PoC で No-Go と判定された（ラウンドトリップが Lute の仕様上成立しない）。vscode-office の
安定性の本質はエンジンではなくこの「一律エラーバウンダリ」にあるという分析メモの結論を受け、
エンジンは Milkdown のまま、この対処を横展開する。

## 2. 洗い出した未対応の経路と対処

`onDidReceiveMessage` 内の各分岐と、モード切替の内部実装を全て確認した。既に自己完結して
エラーを処理している経路（`savePastedImage`・`handleCopyImageRequest`・
`handleExportRequest` の local モード分岐）はそのまま。以下の4箇所が無防備だった:

| 箇所 | 症状（修正前） | 対処 |
| --- | --- | --- |
| `openLinkFromPreview` の `https?` リンク（`vscode.env.openExternal`） | 外部ブラウザ起動に失敗すると無条件に unhandled rejection | try/catch を追加。`debugLog` + 既存の警告文言（`Could not open link: ...`）で通知 |
| `handleExportRequest` の server モード（Pro アップグレード導線の `openExternal`） | 同上 | try/catch を追加。`debugLog` のみ（アップグレード導線の付随処理のためユーザー通知は不要と判断） |
| `switchToPreview`（Raw→Preview 切替） | `vscode.openWith` 等が失敗すると `finally` だけが走り、呼び出し元（`void switchToPreview(...)`・4箇所の command ハンドラ）へ無言で伝播。fire-and-forget 経路（`onDidChangeActiveTextEditor` のモード記憶自動切替）では完全に消える | `catch` を追加。`debugLog` + `showErrorMessage`。例外を再送出しないため、`await switchToPreview(...); syncEditorContext();` の形の呼び出し元でも `syncEditorContext()` が必ず実行されるようになる（失敗時に VS Code のコンテキストキーが古いままになる副次バグも同時に直る） |
| `switchToRaw`（Preview→Raw 切替） | 同上 | 同上 |

`insertImage`（`savePastedImage`）・`copyImageRequest`・`exportRequest` の local モードは
既存で自己完結しており対象外。`scroll`・`cursor`・`ready` メッセージは同期的なマップ更新のみで
失敗しうる非同期呼び出しを持たないため対象外。

## 3. Output チャンネルについて

分析メモは「Output チャンネルが無い」ことを issue としていたが、調査の結果
`src/core/debug.ts`（`debugLog`）+ `rawRuntime.debugChannel`（`src/raw/activate.ts` で
拡張起動時に無条件生成）が既に存在し、`previewPanel.ts` は `setDebugLog` 経由でこれに
書き込んでいた。**新しい Output チャンネルは作らない**（重複を避ける）。

ただし既存チャンネルの名前が `"Markdown Table Debug"` のままで、Preview 側の不具合調査で
ユーザーに「Output パネルを見てください」と案内しても発見されにくかったため、拡張の
`displayName`（`Markdown Inline Preview`）に合わせて改名した（`src/raw/activate.ts`）。
`docs/developer/contributing.md` の案内も合わせて更新。

## 4. テスト

`switchToPreview`/`switchToRaw`/`openLinkFromPreview`/`handleExportRequest` はいずれも
`vscode` モジュールに依存する host 専用コードのため、失敗パスの決定的な再現は実 VS Code
（`test/extension/`）でも環境依存性が高く、既存の `webview-save-failure-visibility.md` も
同じ理由で「呼び出し側の配線」に自動テストを設けていない（同ドキュメント §4）。本修正も
同じ方針を踏襲し、新規の自動テストは追加していない。代わりに:

- `npm run test:unit` と `npm run test`（実 VS Code拡張ホスト）をフルスイートで実行し、
  既存の全テストがグリーンのままであることを確認した（catch 追加により `switchToPreview`/
  `switchToRaw` の正常系の `return` 経路・`finally` 実行順序に変更が無いことの回帰確認）。
  **実機（vsix をパッケージして実 Cursor にインストール）での手動確認はこの時点では行っておらず、
  §6 の regression につながった。**

## 5. 対象外（意図的にやらないこと）

- `showErrorMessage` の頻度制限は本修正のスコープ外（`webview-save-failure-visibility.md` と同じ判断）。
- Milkdown プラグイン間の相互作用起因のバグ（本質的な複雑さ）は本修正の対象外。個別の
  TDD ループ（`tdd-browser-preview` skill）で引き続き縮小する。
- Vditor へのエンジン移行は `docs/vditor-base-migration-plan.md` の判定により凍結中。

## 6. 追記（2026-07-21）: `switchToRaw` が「切替自体は成功しているのに」頻繁にエラーを出す regression の修正

vsix をパッケージして実 Cursor にインストールし実際に触ったユーザーから、「前より悪化した。
少し触っているだけでエラーが頻発する」という報告を受けた。§4 に書いた「実機確認済み」は
誤りで、実際にはスクリプト化された自動テストのみで実機の対話的な連続操作は検証していなかった。

### 根本原因

`switchToRaw`（Preview→Raw 切替）の実装は、(a) タブの開閉という**切替そのものの成否**と、
(b) 切替後のカーソル/スクロール位置復元という**体感向上のための付随処理**を、1つの
`try { ... } catch { showErrorMessage(...) }` にまとめて包んでいた。(b) は
`cursorAnchorToRaw` や `editor.revealRange` など、保存済みアンカーが最新の内容と
ズレている場合や、連続してモードを切り替えて `editor` が使われる直前に別の操作で状態が
変わった場合に、切替そのものは成功していても例外を投げうる。

修正前は (a)(b) どちらの失敗も同じ「Raw への切り替えに失敗しました」というエラーダイアログを
出していたため、タブの切替自体は毎回ちゃんと成功しているにもかかわらず、(b) 側のありふれた
失敗のたびにユーザーには「失敗した」という誤った赤いダイアログが出続けていた。§2 の修正で
「これまで無音だった失敗を可視化する」こと自体は狙い通りだったが、**重篤度の異なる失敗を
同じ扱いにしてしまった**ことが regression の原因。

### 修正内容

`switchToRaw` を2段階に分割した:

1. `vscode.openWith` → `openTextDocument` → `showTextDocument` → `closeStaleTabs` までを
   最初の `try/catch` に残す。ここでの失敗は「切替自体が成立していない」ため、引き続き
   `debugLog` + `showErrorMessage` で通知する。`inFlightSwitch` はこの段階が終わり次第
   解放する（カーソル/スクロール復元はタブの整合性に関与しないため、この Set の本来の目的
   ―― 並行するタブ整理処理との競合防止 ―― にはもう不要）。
2. カーソル/スクロール位置の復元は別の `try/catch` に分離し、失敗しても `debugLog` のみ
   （ユーザーへの通知はしない）。切替自体は既に成功しているため、ここでの失敗は
   「保存した位置に戻せなかった」という軽微な体験劣化に過ぎない。

### 教訓

- fire-and-forget を一律で「見える化」するとき、**本当に失敗として通知すべき範囲**を
  関数単位ではなく処理の意味単位で見極める必要がある。「無音より可視化の方が常に良い」は
  誤りで、重篤度を揃えずに可視化すると「前よりエラーが増えた」という体感の悪化を生む。
- host 側の fire-and-forget 修正は自動テストで正常系の回帰は検証できても、
  「実際に連続して速く操作したときの失敗頻度」は自動テストでは可視化されない。この種の
  変更は次回から `vsce package` → 実エディタへのインストールでの対話的確認を、
  コミット前の必須ステップに含める。

### テスト

§4 と同じ理由で自動テストは追加していないが、`test:unit`（926件）と実 VS Code 拡張ホストの
全スイートを再実行し回帰が無いことを確認した上で、vsix を再パッケージして実 Cursor に
インストールし直した。
