# Inline Preview 機能一覧

最終更新: 2026-06-20  
バージョン: **1.8.1**

**Inline Preview** = VS Code の通常テキストエディタ（**Raw モード**）で動く機能です。  
Markdown ソース（`##`, `**`, `|` 等）をそのまま表示しつつ、装飾や編集支援を追加します。

Preview モードの機能は [preview-features.md](./preview-features.md) を参照してください。

---

## 概要

| 項目 | 内容 |
|------|------|
| モード名 | Raw / Inline / ソースモード |
| エンジン | VS Code Text Editor + Decoration |
| 記法の表示 | **常にソースそのまま**（`##`, `**` は隠さない） |
| Preview への切替 | タイトルバー `Preview` / `Cmd+Shift+M` |

---

## 実装済み機能

### リスト・チェックボックス

| 機能 | 操作 | 説明 |
|------|------|------|
| スマート Enter | `Enter` | リスト継続。空行 Enter でリスト終了 |
| 箇条書きに変換 | `Alt+Cmd+5` | `- アイテム` 形式へ |
| 番号付きに変換 | `Alt+Cmd+6` | `1. アイテム` 形式へ |
| チェックボックスに変換 | `Alt+Cmd+4` | `- [ ] タスク` 形式へ |
| 通常テキストに変換 | `Alt+Cmd+0` | マーカーを削除 |
| インデント追加 | `Tab` | リストの入れ子 |
| インデント削除 | `Shift+Tab` | 入れ子を戻す |
| チェックボックストグル | `Cmd+Enter` | 完了状態の切替 |
| チェックボックスクリック | マウス | チェック部分クリックでトグル |
| 番号の再採番 | コマンド `renumberLists` | 順序付きリストの番号修正 |
| 行移動 | `moveLineUp` / `moveLineDown` | ブロック単位の移動（キーバインド未割当） |
| 完了タスクの取り消し線 | 自動 | チェック済み行の本文に打ち消し線 |
| CodeLens | 行上 | Check / Uncheck ボタン（設定で on/off） |

### テーブル

| 機能 | 操作 | 説明 |
|------|------|------|
| テーブル整形 | タイトルバー / `formatTable` | 列幅を揃えて整形 |
| セル内ナビ（上下） | `↑` `↓` | 同じ列位置で行移動 |
| セル内ナビ（左右） | `Cmd+←` `Cmd+→` | セル内・セル間の移動 |
| Tab ナビ | `Tab` / `Shift+Tab` | 次/前のセルへ |
| 段階的選択 | `Cmd+A` | セル内容 → セル全体 → 行 |
| 折り返しプレビュー（行末） | 自動 | 長い行の折り返し見た目を `↳` で表示 |
| 折り返しホバー | ホバー | 折り返した表をポップアップ表示 |
| 日本語幅計算 | 設定 | 全角/半角を考慮した列幅計算 |

### 目次（TOC）

| 機能 | 説明 |
|------|------|
| 目次更新 | タイトルバー / `updateTableOfContents` |
| 自動更新 | 見出し変更時に TOC を更新 |
| スラッシュ `/toc` | スラッシュコマンドから挿入 |

### スラッシュコマンド

行頭で `/` を入力すると補完メニューが開きます。

- 見出し（`/h1`〜`/h6`, `/heading`）
- テーブル（`/table`）
- コードブロック（`/code`）
- コールアウト
- 目次（`/toc`）
- その他テンプレート

### インライン装飾（Decoration）

| 対象 | 説明 |
|------|------|
| 見出し H1–H6 | レベルごとの色・枠・太さ |
| コードブロック | 背景色 + 簡易シンタックス色 |
| 水平線 | 下線スタイル |
| チェックボックス完了 | 本文の取り消し線 |
| 画像行 | 行末に 48px サムネイル（非編集行） |
| 画像ホバー | ホバーで拡大プレビュー |
| テーブル行 | 折り返しプレビュー（行末 + ホバー） |

編集中の行では、画像サムネイル・テーブル折り返し・取り消し線は一時的に外れます（ソース編集を優先）。

### コードブロック補助

| 機能 | 説明 |
|------|------|
| フェンス自動補完 | ` ``` ` 入力時に閉じフェンスを補完 |
| シンタックス色（簡易） | 言語ごとの Decoration 色分け |

---

## 設定一覧

```jsonc
// 装飾全体
"markdownInline.enablePreview": true,

// 見出し
"markdownInline.enableHeadingDecorations": true,
"markdownInline.headingColorScheme": "default",  // default | monochrome | vibrant

// チェックボックス
"markdownInline.showCheckboxCodeLens": true,
"markdownInline.hideStrikethroughOnEdit": true,
"markdownInline.checkboxStyle": "icons",         // icons | brackets
"markdownInline.checkboxClickableArea": "checkbox", // checkbox | full-line
"markdownInline.autoMoveCompletedTasks": false,
"markdownInline.advanced.enableCheckboxMouseToggle": true,

// 画像
"markdownInline.imagePreview.enabled": true,
"markdownInline.imagePreview.showThumbnail": true,

// テーブル
"markdownInline.table.inlineWrap.enabled": true,
"markdownInline.table.inlineWrap.maxWidth": 24,
"markdownInline.table.widthCalculation": "smart",
"markdownInline.advanced.autoFormatTables": false,

// コードブロック・水平線
"markdownInline.advanced.enableCodeBlockDecorations": true,
"markdownInline.advanced.enableHorizontalRuleDecorations": true,
"markdownInline.advanced.enableCodeBlockAutoComplete": true,

// 目次
"markdownInline.toc.autoUpdate": true,
"markdownInline.toc.minLevel": 1,
"markdownInline.toc.maxLevel": 6
```

---

## ショートカット（Inline Preview 関連）

| 機能 | Mac | Windows/Linux |
|------|-----|---------------|
| スマート Enter | `Enter` | `Enter` |
| チェックボックストグル | `Cmd+Enter` | `Ctrl+Enter` |
| インデント | `Tab` / `Shift+Tab` | 同左 |
| リスト変換 | `Alt+Cmd+4/5/6/0` | `Alt+Ctrl+4/5/6/0` |
| スマート移動 | `Cmd+←→`, `↑↓` | `Home/End`, `↑↓` |
| Preview へ切替 | `Cmd+Shift+M` | `Ctrl+Shift+M` |

詳細: [keyboard-shortcuts.md](./user-guide/keyboard-shortcuts.md)

---

## 残タスク（Inline Preview のみ）

| 項目 | 現状 | これから |
|------|------|----------|
| テーブル折り返し | 行末1行 + ホバー | エディタ幅に合わせた複数行 decoration |
| 画像オーバーレイ | 未実装 | ベース画像の上に別画像を重ねる拡張構文 |
| 完了タスク自動移動 | 設定のみ | 動作の安定化・検証 |
| インライン装飾の統合テスト | ユニットテストのみ | E2E テスト |

---

## これからの機能（Inline Preview）

1. **テーブル折り返し本格版** — VS Code API を活用した複数行表示
2. **画像オーバーレイ** — `![base](...){overlay=...}` 等（[image-preview.md](./specifications/image-preview.md) Phase 2）
3. **行内リンクプレビュー** — ホバーでページタイトル表示（検討）
4. **コールアウト装飾** — `> [!note]` 等の視覚強化（検討）

Notion / Obsidian との機能差分は [notion-obsidian-gap.md](./notion-obsidian-gap.md) を参照。

---

## 関連ドキュメント

| ファイル | 内容 |
|----------|------|
| [preview-features.md](./preview-features.md) | Preview モード専用の機能一覧 |
| [notion-obsidian-gap.md](./notion-obsidian-gap.md) | Notion / Obsidian との差分 |
| [table-inline-wrap.md](./specifications/table-inline-wrap.md) | テーブル折り返し仕様 |
| [image-preview.md](./specifications/image-preview.md) | 画像プレビュー仕様 |
| [list-operations.md](./specifications/list-operations.md) | リスト操作仕様 |
| [table-navigation.md](./specifications/table-navigation.md) | テーブルナビ仕様 |
