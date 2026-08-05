# 動画・音声・追加画像形式の埋め込み表示（media-embed-support）

最終更新: 2026-07-15

## 背景

ユーザーから「webp や mp4, mp3 なども見れるように対応して欲しい」という要望。
Preview は通常の Markdown 画像記法 `![alt](path)` を常に `<img>` として描画していたため、
動画・音声ファイルを参照しても再生できなかった（壊れた画像アイコンになるだけ）。
また webview の CSP には `media-src` が無く、`<video>`/`<audio>` を描画しても
ブロックされる状態だった。

## 仕様

`![alt](path)` の参照先を、拡張子に応じて3種類のいずれかとして描画する
（`src/shared/preview/mediaKind.ts` の `classifyMediaKind`）:

| 種別 | 対象拡張子 | 描画要素 |
|---|---|---|
| `video` | `.mp4` `.webm` | `<video controls>` |
| `audio` | `.mp3` `.wav` `.ogg` `.m4a` | `<audio controls>` |
| `image`（既定） | 上記以外すべて（`.png` `.jpg` `.gif` `.webp` `.svg` 等、拡張子無し・不明な拡張子も含む） | `<img>`（従来通り） |

判定は拡張子ベースの純関数で行い、クエリ文字列・フラグメント（webview URI に付与される
`?id=...` 等）を無視する。大文字小文字は区別しない。

**`.webp` は元々対応済みだった**: 画像パスの webview URI 変換（`markdownTransform.ts` の
`prepareMarkdownImagesForWebview`）は拡張子非依存の正規表現で、`<img>` はブラウザが
ネイティブに webp をデコードできるため、実装変更なしで動作する。本仕様では回帰防止の
テストのみ追加した。

### 実装方式

Milkdown の `image` スキーマ（`@milkdown/preset-commonmark` の `imageSchema`）はそのまま
使う（`src`/`alt`/`title` 属性・`![alt](src "title")` へのシリアライズは変更しない）。
`$view(imageSchema.node, ...)` でノードの **描画（NodeView）だけ** を上書きし、
`classifyMediaKind(attrs.src)` の結果に応じて `<video>`/`<audio>`/`<img>` のいずれかの
DOM 要素を作る（`src/preview/webview/imageMediaView.ts`）。スキーマ・保存形式が
変わらないため、`markdownTransform.ts` の webview URI 変換・復元ロジックや
`imageIsolationPlugin.ts`（画像とテキストの混在段落分割）は無改修でそのまま動画・音声にも
適用される。

動画・音声はブラウザ標準の `<video controls>`/`<audio controls>` によるインタラクティブな
再生 UI を持つため、その操作（再生ボタン押下等）が ProseMirror の編集操作として誤解釈
されないよう、当該 NodeView は `stopEvent`/`ignoreMutation` を返して ProseMirror の
介入を止める（`mermaidDiagramPlugin.ts` が抱えていた「MutationObserver が
contentDOM 外の変更を検知して再パースしてしまう」問題と同種の対策）。

### CSP

`src/preview/host/previewPanel.ts` の webview CSP 文字列組み立てを
`src/preview/host/csp.ts` の `buildPreviewCsp(cspSource, nonce)` へ抽出し、
`img-src` と対になる `media-src ${cspSource} https:` を追加した（ローカルリソース
webview URI + リモート https 動画/音声を許可。`data:` は現状どの経路も生成しないため
含めない）。抽出したのは、CSP 文字列の組み立てロジック自体を `vscode` 非依存の
純関数として単体テスト可能にするため（`previewPanel.ts` は `vscode` に依存し jsdom から
import できない）。

### 画像コピー機能とのガード

`imageCopyPlugin.ts` の Cmd/Ctrl+C コピー機能は「選択中の `image` スキーマノードを
画像バイト列としてクリップボードへ書き込む」処理だが、動画・音声ノードに対して同じ処理を
行うと、動画/音声の生バイトを `image/png` 等として誤ラベルしたデータを書き込んでしまう
（`previewPanel.ts` の `handleCopyImageRequest` は拡張子から mime を推定するが動画/音声の
対応表を持たない）。`isCopyableImageSrc(src)`（`classifyMediaKind(src) === 'image'`）で
ガードし、動画・音声ノードでは copy イベントを横取りしない（＝何も起きない）ようにした。
右クリックの「Copy Image」コンテキストメニューは元々 `HTMLImageElement` にしか出ない実装
のため、動画・音声では自然に出ない（変更不要）。

### 対象外（スコープ外）

- 動画・音声ファイルのクリップボード貼り付け・ドラッグ&ドロップでの新規挿入（既存の
  画像ペースト機能の対象は画像のみ）。
- PDF エクスポート（`localExport.ts`、`marked` ベース）での動画・音声再生
  （PDF は静止文書のため原理的に不可能。対応不要と判断）。
- リモート URL（`https://...mp4` 等）の動作確認は CSP の `media-src ... https:` により
  理論上許可されるが、実ブラウザテストのハーネス（`previewBrowserHarness.ts`）は
  実際の CSP を経由しないため e2e 未検証（下記「テスト」参照）。

## テスト

- `test/suite/preview/rendering/mediaKind.test.ts`: `classifyMediaKind` の拡張子判定
  （純関数）。
- `test/suite/preview/rendering/previewCsp.test.ts`: `buildPreviewCsp` に `media-src` が
  含まれること（純関数。CSP 文字列の構造のみ検証。**実 webview 上で実際に動画/音声が
  ブロックされずに再生できるかは、`test/browser/` のハーネスが実際の vscode-webview の
  CSP 適用機構を経由しないため e2e 検証はできない**。手動確認のみ）。
- `test/webview/rendering/imageCopy.test.ts`: `isCopyableImageSrc` が動画・音声拡張子で
  `false` を返すこと。
- `test/browser/rendering/mediaEmbeds.test.ts`: 実 Chromium で `.mp4`→`<video controls>`、
  `.mp3`→`<audio controls>`、`.webp`→`<img>`（回帰防止）が実際に描画されること、
  動画ノードの削除が他ノードを巻き添えにしないこと。
