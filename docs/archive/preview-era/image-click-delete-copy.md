# 画像のクリック削除・右クリックコピー（image-click-delete-copy）

最終更新: 2026-07-27

## 背景

ユーザー要望: 「画像をクリックすることで削除できるようにしつつ、右クリックなどでコピーも
できるようにして欲しい」。

要望を受けた時点の実装状況:

| できていたこと | 状況 |
|---|---|
| `![alt](相対パス)` の画像が Preview に表示される | 実装済み（`markdownTransform.ts` がパスを webview URI へ変換） |
| 画像の実データのコピー（Cmd/Ctrl+C・右クリック「Copy Image」） | 実装済み（`imageCopyPlugin.ts`） |
| 画像をクリックすると ProseMirror の NodeSelection になる | 実装済み（ProseMirror 既定動作） |
| **選択されたことが見た目で分かる** | **未実装**（`.milkdown img` に選択時スタイルが無かった） |
| **削除の導線** | **未実装**（Backspace を知っているユーザーしか消せない） |

つまり不足していたのは「削除」と「選択されたことの可視化」だけ。水平線（`---`）で
同じ問題を解決した `horizontal-rule-editing-fix.md` と同種の欠落。

## 仕様

### 1. 選択の可視化

画像をクリックして NodeSelection になっている間、`<img>` に選択枠（`outline`）を描く。
消せる状態にあることが見た目で分かるようにする（水平線と同じ考え方）。

### 2. 削除ボタン（×）オーバーレイ

画像が選択されている間、その画像の**右上に重ねて**削除ボタン（×）を表示する。

- クリックすると、その画像ノードだけを削除する（前後のブロックは壊さない）。
- 削除後は選択が外れるのでボタンも消える。
- 選択が外れる（画像以外の場所をクリック・外部更新など）とボタンは消える。
- 通常の編集操作なので **Undo（Cmd/Ctrl+Z）で元に戻せる**（＝クリック即削除ではなく
  「選択 → ×」の2段階にしたのも、誤操作でソースが壊れないようにするため）。
- 読み取り専用（`settings.editable === false`）のときは表示しない。

ボタンは `position: fixed` で `document.body` に置き、画像の矩形 (`getBoundingClientRect`)
に合わせて配置する。DOM を画像の親に差し込むと `p:has(> img)` を使った既存の
「画像のみの段落は横並び」レイアウト（`milkdown-preview.css`）が壊れるため。
スクロール・リサイズ時は再配置する。

### 3. 右クリックメニュー

画像の右クリックメニュー（既存の `Copy Image` のみだったもの）に `Delete Image` を追加する。

```
┌──────────────┐
│ Copy Image   │  ← 既存（画像の実データをクリップボードへ）
│ Delete Image │  ← 追加
└──────────────┘
```

右クリック時点では ProseMirror の選択が画像ノードになっているとは限らないため、削除対象は
**クリックされた `<img>` の DOM 位置**（`view.posAtDOM`）から解決する。

### 4. 削除の粒度

削除するのは画像ノード 1 個だけ（`NodeSelection` + `deleteSelection`）。画像だけの段落
だった場合は**空の段落が残る**。これは Backspace で消したときと同じ結果であり、
空行保持（`blank-line-preservation.md`）のもとでソースの行数・行番号がずれないため
（画像の行がそのまま空行になる）。

### 対象外（スコープ外）

- **動画・音声（`<video>`/`<audio>`）の削除ボタン**。これらの NodeView は
  `stopEvent: () => true` でブラウザ標準 controls の操作を守っており、クリックしても
  NodeSelection にならない（`media-embed-support.md`）。× を出すと再生ボタン等と
  重なって誤爆する。削除は Raw モードか前後ブロックからの Backspace で行う。
- 画像のリサイズ・alt/title の編集（別要望）。

## 実装

| ファイル | 変更内容 |
|---|---|
| `src/preview/webview/imageDeletePlugin.ts` | 新規。× オーバーレイの表示/配置/削除実行。DOM から画像ノード位置を解決する `deleteImageAtDom` を公開 |
| `src/preview/webview/imageCopyPlugin.ts` | コンテキストメニューを項目リスト駆動に変更し、`Delete Image` を追加。ラベルを `t()` 経由に |
| `src/preview/webview/i18n.ts` | `Copy Image` / `Delete Image` の日本語訳を追加 |
| `src/preview/webview/milkdownApp.ts` | `imageDeletePlugin` を登録 |
| `media/milkdown-preview.css` | `.milkdown img.ProseMirror-selectednode`（選択枠）と `.ipreview-image-delete`（× ボタン）のスタイル |

## テスト

- `test/browser/editing-core/imageClickDelete.test.ts`（実 Chromium・実マウス）:
  クリックで画像が選択される／選択で × が画像に重なって出る／× で画像だけ消える／
  選択解除で × が消える／選択中は見た目が変わる／右クリックに Copy と Delete が並ぶ／
  Delete Image で消える／Undo で戻る／動画には × を出さない。
  - 画像の src は実ファイルに依存しない data: URL（120×80 の SVG）を使う。相対パスだと
    ブラウザが読み込めず矩形が 0 になり実マウスで掴めない。
  - `.milkdown img` は ProseMirror が空段落に挿入する 0×0 の `img.ProseMirror-separator`
    を先に掴んでしまうため、テストのセレクタは
    `.milkdown img:not(.ProseMirror-separator)` を使う。
- `test/webview/rendering/imageCopy.test.ts`: 既存のコピー系ユニットテスト（回帰防止）。
