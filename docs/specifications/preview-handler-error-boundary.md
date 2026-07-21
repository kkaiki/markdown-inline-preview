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
- 手動確認: 存在しないファイルパスへの `switchToRaw` 相当の操作、権限の無いディレクトリへの
  画像保存等は目視で確認済み（開発者ツールの Console にも `[preview] switchToRaw failed: ...`
  等が出ることを確認）。

## 5. 対象外（意図的にやらないこと）

- `showErrorMessage` の頻度制限は本修正のスコープ外（`webview-save-failure-visibility.md` と同じ判断）。
- Milkdown プラグイン間の相互作用起因のバグ（本質的な複雑さ）は本修正の対象外。個別の
  TDD ループ（`tdd-browser-preview` skill）で引き続き縮小する。
- Vditor へのエンジン移行は `docs/vditor-base-migration-plan.md` の判定により凍結中。
