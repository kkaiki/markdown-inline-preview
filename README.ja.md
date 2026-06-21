# Markdown Inline Preview

**VS Code / Cursor 向け Notion・Obsidian 風 Markdown エディタ**

Markdown Inline Preview（`ipreview`）は、同じ `.md` ファイルを **2 モード** で編集する拡張機能です。

| | **Raw** | **Preview** |
|---|---------|-------------|
| 別名 | インライン / ソースモード | WYSIWYG モード |
| エンジン | VS Code テキストエディタ + 装飾 | Milkdown WebView |
| 見た目 | Markdown ソース（`##`, `**`, `\|`） | レンダリング結果を直接編集 |
| 向いている作業 | 記法の精密編集、Git diff、一括置換 | 読みやすさ重視の執筆・推敲 |

タイトルバーのボタン、または **`Cmd+Shift+M`** / **`Ctrl+Shift+M`** で切り替えます。

**English:** [README.md](./README.md)

---

## インストール

```bash
# VSIX から（npm run package 後）
code --install-extension ipreview-1.8.5.vsix

# ソースからビルド
git clone https://github.com/kkaiki/markdown-inline-preview.git
cd markdown-inline-preview
npm install
npm run package
code --install-extension ipreview-*.vsix
```

開発時はフォルダを VS Code で開き **F5** でデバッグ実行できます。

---

## Raw モード（Inline Preview）

Markdown ソースをそのまま表示しつつ、編集支援と装飾を重ねます。

### リスト・チェックボックス

- **スマート Enter** — リスト継続。空行で終了
- **リスト種別の変換** — `Alt+Cmd+4/5/6/0`（Mac）/ `Alt+Ctrl+4/5/6/0`（Win/Linux）
- **チェックボックストグル** — クリックまたは `Cmd+Enter` / `Ctrl+Enter`
- **インデント** — `Tab` / `Shift+Tab`
- **番号付きリスト** — インデント変更時に自動で番号振り直し
- **完了タスク** — 取り消し線。CodeLens 表示（設定可）

### テーブル

- **自動整形** — 列幅を揃える（日本語幅計算対応）
- **セルナビ** — `Cmd+←/→`、`Tab`、矢印キー
- **段階的全選択** — セル → 行 → 表 → 全文（`Cmd+A`）
- **折り返しプレビュー** — 行末 `↳` + ホバーで全体表示

### 見出し・コード・装飾

- **見出しカラー** — H1–H6（`default` / `monochrome` / `vibrant`）
- **コードブロック** — 背景 + 簡易シンタックス色
- **水平線** — 区切り線スタイル
- **画像** — 非編集行に 48px サムネイル + ホバープレビュー

### 目次・スラッシュコマンド

- **`/toc`** / **`/目次`** — 目次の挿入・自動更新
- **スラッシュメニュー** — `/table`, `/h1`–`/h6`, `/code`, `/quote`, `/callout`, `/bullet`, `/numbered`, `/todo` 等

### スマート編集

- **スマートカーソル**（リスト・テーブル内）
- **段階的選択**（`Shift+Cmd+←`）
- **コードフェンス自動補完**（` ``` ` 入力時）

---

## Preview モード（WYSIWYG）

Milkdown ベースのカスタムエディタで開きます。編集は約 200ms でファイルに反映され、Raw 側の外部変更も約 100ms で同期されます。

### 編集・レンダリング

- **CommonMark + GFM** — 見出し、表、タスクリスト、取り消し線、リンク
- **WYSIWYG 直接編集** — 表示内容がそのまま Markdown として保存
- **フォーカス時記法表示** — **フォーカス中のブロックだけ** `##`・`**`・`[text](url)` 等を表示（Obsidian 風）
- **見出し Backspace** — 見出し先頭で `# タイトル` → 通常行 `#タイトル` → `#` を1文字ずつ削除可能
- **スラッシュメニュー** — Raw と同じコマンド（`preview.enableSlashMenu`）
- **チェックボックス** — クリックでトグル → ファイルに `- [x]` として保存

### リッチコンテンツ

- **シンタックスハイライト** — highlight.js（主要言語）
- **KaTeX** — `$...$` / `$$...$$`（`preview.enableMath`）
- **Mermaid** — ` ```mermaid ` ブロック（`preview.enableMermaid`）
- **画像** — ワークスペース相対パス `![alt](./path)` を本文に表示
- **Frontmatter パネル** — YAML を本文上に表示（`preview.showFrontmatter`）

### UI・ナビゲーション

- **テーマ** — VS Code 追従または light/dark 固定（`preview.theme`）
- **タイポグラフィ** — `preview.fontSize`（既定 **12**）、`fontFamily`、`maxWidth`
- **リンク** — ワークスペース内ファイルを開く / 外部 URL はブラウザ
- **スクロール同期** — Raw に戻るとき見出しアンカーで位置復元（`preview.syncScroll`）
- **モード記憶** — 最後のモードを全 Markdown ファイル横断で記憶。Preview にすると新規ファイルも Preview で開く（`preview.rememberMode`）

> v1.8.3 でフローティングツールバー（B / I / H1 等）は削除しました。書式は **`/`** スラッシュメニューを使います。

---

## キーボードショートカット

| 操作 | Mac | Windows/Linux |
|------|-----|---------------|
| **Raw ↔ Preview** | `Cmd+Shift+M` | `Ctrl+Shift+M` |
| チェックボックストグル | `Cmd+Enter` | `Ctrl+Enter` |
| リストインデント | `Tab` / `Shift+Tab` | 同左 |
| 箇条書き / 番号 / チェック / 通常テキストへ変換 | `Alt+Cmd+5/6/4/0` | `Alt+Ctrl+5/6/4/0` |
| テーブル・リスト内スマート移動 | `Cmd+←/→` | `Home` / `End` |
| 段階的全選択 | `Cmd+A` | `Ctrl+A` |

詳細: [docs/user-guide/keyboard-shortcuts.md](./docs/user-guide/keyboard-shortcuts.md)

---

## 設定

### Raw（主要項目）

| 設定 | 既定値 | 説明 |
|------|--------|------|
| `markdownInline.enablePreview` | `true` | Raw 装飾のマスタースイッチ |
| `markdownInline.headingColorScheme` | `default` | 見出しカラースキーム |
| `markdownInline.imagePreview.showThumbnail` | `true` | 画像サムネイル |
| `markdownInline.table.inlineWrap.enabled` | `true` | テーブル折り返しプレビュー |
| `markdownInline.advanced.autoFormatTables` | `false` | 行移動時の自動整形 |
| `markdownInline.toc.autoUpdate` | `true` | `/toc` の自動更新 |

### Preview（主要項目）

| 設定 | 既定値 | 説明 |
|------|--------|------|
| `markdownInline.preview.defaultMode` | `raw` | 初回オープン時 `raw` / `preview` |
| `markdownInline.preview.showFocusSyntax` | `true` | フォーカスブロックで記法表示 |
| `markdownInline.preview.enableSlashMenu` | `true` | `/` メニュー |
| `markdownInline.preview.fontSize` | `12` | 本文フォントサイズ（px） |
| `markdownInline.preview.enableMath` | `true` | KaTeX |
| `markdownInline.preview.enableMermaid` | `true` | Mermaid |

`markdownInline.advanced.*` を明示設定するとレガシー設定より優先されます。自動機能をオフにしても、テーブル整形・目次更新などの手動コマンドは使えます。

一覧: [docs/specifications/inline-preview-features.md](./docs/specifications/inline-preview-features.md) · [docs/specifications/preview-features.md](./docs/specifications/preview-features.md)

---

## 動作環境

- VS Code / Cursor **1.74.0 以上**

## 既知の制限

- Raw 装飾ではフォントサイズ変更不可（Decoration API の制限）。見出しは色・背景で区別します。
- 1 万行超のファイルでは装飾更新に遅延が出る場合があります。
- Preview は CommonMark/GFM 中心。ウィキリンク等の Obsidian 拡張は未対応です。
- 統合テスト（`npm test`）は Electron ランナーが必要です。CI では `npm run test:unit` を推奨します。

### 他拡張との競合

**Markdown All in One** が Enter を奪う場合、`markdown.extension.onEnterKey` のキーバインドを削除するか、`keybindings.json` に以下を追加してください。

```json
{
  "key": "enter",
  "command": "-markdown.extension.onEnterKey",
  "when": "editorTextFocus && editorLangId == markdown"
}
```

---

## ドキュメント

| ファイル | 内容 |
|----------|------|
| [docs/README.md](./docs/README.md) | ドキュメント索引 |
| [docs/specifications/inline-preview-features.md](./docs/specifications/inline-preview-features.md) | Raw モード仕様 |
| [docs/specifications/preview-features.md](./docs/specifications/preview-features.md) | Preview モード仕様 |
| [docs/user-guide/keyboard-shortcuts.md](./docs/user-guide/keyboard-shortcuts.md) | ショートカット早見表 |
| [CHANGELOG.md](./CHANGELOG.md) | リリースノート |

---

## コントリビューション

Issue・PR: [github.com/kkaiki/markdown-inline-preview](https://github.com/kkaiki/markdown-inline-preview/issues)

[docs/developer/contributing.md](./docs/developer/contributing.md) も参照してください。

## ライセンス

MIT
