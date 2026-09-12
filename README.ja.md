# Markdown Inline Preview

**VS Code / Cursor 向け Notion・Obsidian 風 Markdown エディタ**

Markdown Inline Preview（`ipreview`）は、同じ `.md` ファイルを **2 モード** で編集する拡張機能です。

| | **Raw** | **Live** |
|---|---------|----------|
| 別名 | インライン / ソースモード | ライブプレビュー（Obsidian 風） |
| エンジン | VS Code テキストエディタ + 装飾 | CodeMirror 6 の WebView |
| 見た目 | Markdown ソース（`##`, `**`, `\|`） | **カーソルのある所だけ記法が開き**、他は見た目どおり |
| 向いている作業 | 記法の精密編集、Git diff、一括置換 | 読みやすさ重視の執筆・推敲 |

どちらのモードも**編集しているのは生の Markdown そのもの**です。
Live モードは Markdown を別のモデルへ変換しないため、記法の展開・収縮で
ファイルの中身が動くことがありません。

タブの右クリックメニューまたはコマンドパレットの
**`Markdown Inline Preview: Live / Raw を切り替え`** で切り替えます。

**English:** [README.md](./README.md)

---

## インストール

```bash
# VSIX から（npm run package 後）
code --install-extension ipreview-3.1.1.vsix

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

- **スマート Enter** — リスト継続。空項目で終了
- **リスト種別の変換** — `Alt+Cmd+4/5/6/0`（Mac）/ `Alt+Ctrl+4/5/6/0`（Win/Linux）
- **チェックボックストグル** — クリックまたは `Cmd+Enter` / `Ctrl+Enter`
- **インデント** — `Tab` / `Shift+Tab`
- **番号付きリスト** — インデント変更時に自動で番号振り直し
- **完了タスク** — 取り消し線。CodeLens 表示（設定可）

### テーブル

- **整形** — 列幅を揃える（日本語幅計算対応）
- **セルナビ** — `Cmd+←/→`、矢印キー
- **段階的全選択** — 行 → 全文。表内は セル → 行 → 表 → 全文（`Cmd+A`）
- **折り返しプレビュー** — 行末 `↳` + ホバーで全体表示

### 見出し・コード・装飾

- **見出しカラー** — H1–H6（`default` / `monochrome` / `vibrant`）
- **コードブロック** — 背景 + 簡易シンタックス色
- **水平線** — 区切り線スタイル
- **画像** — 非編集行にサムネイル + ホバープレビュー（既定オフ）

### スラッシュコマンド・スマート編集

- **スラッシュメニュー** — `/table`, `/h1`–`/h6`, `/code`, `/quote`, `/callout`, `/divider`,
  `/bullet`, `/numbered`, `/todo`
- **スマートカーソル**（リスト・テーブル内）
- **段階的選択**（`Shift+Cmd+←`）
- **コードフェンス自動補完**（` ``` ` 入力時）

---

## Live モード（Obsidian 風ライブ編集）

CodeMirror 6 ベースのカスタムエディタで開きます。生 Markdown を直接編集し、
**カーソルが乗っている記法だけ**をソース表示に開きます。

### 編集・レンダリング

- **CommonMark + GFM** — 見出し、表、タスクリスト、取り消し線、リンク
- **記法の展開/収縮** — カーソルのあるトークン / 行 / ブロックだけ記法が見える
- **表の直接編集** — 畳んだ表示のままセルの中を編集
- **表の行・列操作** — セルを右クリック → 行/列の選択・上下左右に挿入・行/列削除・表削除
- **コードフェンス** — 言語ラベル付きのブロック表示。フェンス行にカーソルを置けば編集可
- **スラッシュメニュー** — Raw と同じコマンド（`live.enableSlashMenu`）
- **チェックボックス** — クリックでトグル → ファイルに `- [x]` として保存

### リッチコンテンツ

- **KaTeX** — `$...$` / `$$...$$`
- **Mermaid** — ` ```mermaid ` ブロックのプレビュー
- **画像** — ワークスペース相対パス `![alt](./path)` を本文に表示
- **Frontmatter** — YAML ブロックの表示
- **コールアウト・水平線**などのブロックウィジェット

### UI・ナビゲーション

- **上部ツールバー** — H1/H2/H3・☑・箇条書き・番号・引用・太字・斜体・コード・PDF・Raw 切替
- **行番号ガター**（`live.showLineNumbers`）
- **Git 差分ガター** — HEAD との差分（追加=緑 / 変更=青 / 削除=赤三角、`live.showDiffGutter`）
- **モード記憶** — ファイルごとに最後のモードを覚えて次回もそのモードで開く（`live.rememberMode`）
- **PDF 書き出し** — `Markdown Inline Preview: Export to PDF`

---

## キーボードショートカット

**Notion と同じキー割り当て**をそのまま採用しています（Raw / Live 共通）。

| 操作 | Mac | Windows/Linux |
|------|-----|---------------|
| 太字 / 斜体 / 下線 | `Cmd+B` / `Cmd+I` / `Cmd+U` | `Ctrl+B` / `Ctrl+I` / `Ctrl+U` |
| インラインコード / 取り消し線 | `Cmd+E` / `Cmd+Shift+S` | `Ctrl+E` / `Ctrl+Shift+S` |
| リンク / ハイライト / コメント | `Cmd+K` / `Cmd+Shift+H` / `Cmd+Shift+M` | `Ctrl+K` / `Ctrl+Shift+H` / `Ctrl+Shift+M` |
| ブロック変換（段落/見出し/ToDo/箇条書き/番号/トグル/コード/引用） | `Alt+Cmd+0〜9` | `Ctrl+Shift+0〜9`（`Alt+Ctrl+0〜9` も可） |
| チェックボックストグル | `Cmd+Enter` | `Ctrl+Enter` |
| ブロックを複製 | `Cmd+D` | `Ctrl+D` |
| ブロックを上下へ移動 | `Cmd+Shift+↑/↓` | `Ctrl+Shift+↑/↓` |
| ブロック内改行（リストを継続しない） | `Shift+Enter` | `Shift+Enter` |
| リストインデント | `Tab` / `Shift+Tab` | 同左 |
| 段階的全選択 | `Cmd+A` | `Ctrl+A` |
| Live / Raw を切り替え | `Cmd+Shift+.` | `Ctrl+Shift+.` |

`markdownInline.notionKeymap.enabled` を `false` にすると、Raw モードでは VS Code 既定
（`Cmd+B` = サイドバー等）に戻ります。

詳細: [docs/user-guide/keyboard-shortcuts.md](./docs/user-guide/keyboard-shortcuts.md)

---

## 設定

### Raw（主要項目）

| 設定 | 既定値 | 説明 |
|------|--------|------|
| `markdownInline.enablePreview` | `true` | Raw 装飾のマスタースイッチ |
| `markdownInline.headingColorScheme` | `default` | 見出しカラースキーム |
| `markdownInline.imagePreview.showThumbnail` | `false` | 画像サムネイル |
| `markdownInline.table.inlineWrap.enabled` | `true` | テーブル折り返しプレビュー |
| `markdownInline.advanced.autoFormatTables` | `false` | 行移動時の自動整形 |
| `markdownInline.autoMoveCompletedTasks` | `false` | 完了タスクをリスト末尾へ移動 |

### Live（主要項目）

| 設定 | 既定値 | 説明 |
|------|--------|------|
| `markdownInline.live.defaultMode` | `live` | 初回オープン時 `raw` / `live` |
| `markdownInline.live.rememberMode` | `true` | 直前のモードを覚えて次も同じモードで開く |
| `markdownInline.live.showToolbar` | `true` | 上部ツールバー |
| `markdownInline.live.showLineNumbers` | `true` | 行番号ガター |
| `markdownInline.live.showDiffGutter` | `true` | Git 差分ガター |
| `markdownInline.live.enableSlashMenu` | `true` | `/` メニュー |

`markdownInline.advanced.*` を明示設定するとレガシー設定より優先されます。自動機能をオフにしても、テーブル整形などの手動コマンドは使えます。

---

## 動作環境

- VS Code / Cursor **1.74.0 以上**

## 既知の制限

- Raw 装飾ではフォントサイズ変更不可（Decoration API の制限）。見出しは色・背景で区別します。
- 1 万行超のファイルでは装飾更新に遅延が出る場合があります。
- Live は CommonMark/GFM 中心。ウィキリンク等の Obsidian 拡張は未対応です。
- Live モードのキー操作は WebView 内（CodeMirror）に持っているため、VS Code のキーバインド
  設定からは個別に変更できません（Raw モードのキーは変更できます）。
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
| [docs/user-guide/keyboard-shortcuts.md](./docs/user-guide/keyboard-shortcuts.md) | ショートカット早見表 |
| [docs/user-guide/pdf-export.md](./docs/user-guide/pdf-export.md) | PDF 書き出し |
| [CHANGELOG.md](./CHANGELOG.md) | リリースノート |

---

## コントリビューション

Issue・PR: [github.com/kkaiki/markdown-inline-preview](https://github.com/kkaiki/markdown-inline-preview/issues)

## ライセンス

MIT
