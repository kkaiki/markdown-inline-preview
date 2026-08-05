# 画像コピーが無反応になる不具合の修正（image-copy-clipboard-png-fix）

最終更新: 2026-07-27

## 症状（ユーザー報告 2026-07-27）

Preview で画像を右クリック →「Copy Image」しても、**貼り付け先に何も貼り付かない**
（クリップボードが書き換わらない）。エラーも出ないため、原因が分からない。

## 真因

`navigator.clipboard.write()` は **`image/png` 以外の画像タイプを受け付けない**。
実 Chromium で確認した挙動:

| 書き込む type | 結果 |
|---|---|
| `image/png` | OK |
| `image/jpeg` | `NotAllowedError: Failed to execute 'write' on 'Clipboard': Type image/jpeg not supported on write.` |
| `image/svg+xml` | OK |

`imageCopyPlugin.ts` の `writeDataUrlToClipboard` は、Host が返した data URL の mime
（＝ファイル拡張子から推定した `image/jpeg` / `image/gif` / `image/webp` など）を
そのまま `ClipboardItem` のキーに使っていた。そのため **JPEG・GIF・WEBP の画像では必ず
例外**になり、しかも `catch { return false; }` で握りつぶしていたので、ユーザーには
「押しても何も起きない」ようにしか見えなかった。

## 修正

1. **PNG へ変換してから書き込む**。data URL の mime が `image/png` でなければ、
   `<img>` → `canvas` → `canvas.toBlob('image/png')` で再エンコードする
   （webview の CSP は `img-src ... data:` を許可しているのでそのまま読み込める）。
   PNG のときは再エンコードしない。
2. **失敗を無言にしない**。`writeDataUrlToClipboard(dataUrl, { onFailure })` で失敗理由
   （`NotAllowedError: ...` 等）を受け取れるようにし、webview → Host へ
   `copyImageFailed` を送って `showWarningMessage` で理由まで表示する。
3. Host 側の失敗（`uriMap` に無い画像・ファイル読み取り失敗）も、これまで
   `imageCopied: null` を返すだけで無言だったので警告を出すようにした。

`text/html`（`<img src="data:...">`）の同時書き込みは従来どおり（Notion・Google Docs
等へ画像として貼るために必要）。

## テスト

- `test/webview/rendering/imageCopy.test.ts`（jsdom）:
  - JPEG は `image/png` に変換して書き込む（`image/jpeg` のまま書かない）
  - PNG は変換しない（余計な再エンコードをしない）
  - 書き込み失敗時に理由が通知される
  - 変換自体の失敗でも throw せず理由が通知される
  - 変換関数は `convertToPng` オプションで差し替え可能（jsdom に canvas が無いため）
- **実 VS Code のクリップボードに実際に画像が載るかは自動テストで検証できない**
  （クリップボード書き込みには実 webview の focus/権限が必要で、`test/browser/` の
  file:// ハーネスでは権限を付与できない）。Chromium の type 制約は Playwright で
  直接確認した（上表）。以後の失敗は警告メッセージに理由が出るので切り分けできる。
