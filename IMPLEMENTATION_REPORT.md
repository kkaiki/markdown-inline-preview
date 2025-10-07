# Obsidian-like Markdown Editor 実装レポート

## 概要
VSCode上でObsidian/Notionライクな編集体験を実現するMarkdown拡張機能の実装状況をまとめたドキュメントです。

## 使用技術スタック

| 技術 | 用途 | バージョン |
|------|------|-----------|
| VSCode Extension API | 拡張機能フレームワーク | ^1.74.0 |
| Node.js | ランタイム環境 | 16.x |
| VSCode Decorator API | テキスト装飾システム | - |
| JavaScript | 実装言語 | ES6+ |

## ディレクトリ構造

```
/Users/kaiki/Documents/memento_mori/markdown-wysiwyg-extension/
├── package.json                              # 拡張機能マニフェスト
├── build.js                                  # ビルドスクリプト
├── README.md                                 # プロジェクト説明
├── .vscodeignore                            # パッケージ除外設定
├── src/
│   └── extension-obsidian.js               # メイン実装ファイル (352行)
├── media/
│   └── dark.css                            # ダークテーマCSS
├── node_modules/                           # 依存パッケージ
└── obsidian-like-markdown-editor-1.0.0.vsix # パッケージ済み拡張機能
```

## 実装機能一覧

### 1. フォーカス連動型表示切り替え

| 状態 | 表示内容 | 実装関数 |
|------|----------|----------|
| フォーカス時（カーソルがある行） | 生のMarkdown構文 (`- [ ]`, `# 見出し`, `\| table \|`) | `applyFocusedLineDecoration()` |
| 非フォーカス時 | プレビュー風装飾表示 | `applyPreviewDecoration()` |

**実装詳細**:
- カーソル位置の監視: `onDidChangeTextEditorSelection`
- リアルタイム更新: `updateDecorations()`
- 装飾の動的切り替え: `decorationTypes` Map管理

### 2. インタラクティブチェックボックス

| 記法 | プレビュー表示 | 機能 |
|------|---------------|------|
| `- [ ]` | ☐ 未チェック | クリック/Alt+Enterでトグル |
| `- [x]` | ☑ チェック済み + 取り消し線 | クリック/Alt+Enterでトグル |

**実装ファイル**: `src/extension-obsidian.js`
- トグル処理: `toggleCheckboxAtLine()` (314-336行)
- 装飾適用: `applyPreviewDecoration()` (109-182行)

### 3. テーブルのリアルタイム編集

| 機能 | 説明 | 実装箇所 |
|------|------|----------|
| Markdown編集 | パイプ記法での直接編集 | エディタ標準機能 |
| セパレーター認識 | `---` 行の自動判定 | `applyTableDecoration()` (184-219行) |
| 装飾 | 背景色とボーダー表示 | `backgroundColor`, `border` プロパティ |

### 4. 見出しスタイリング

| レベル | カラーコード | フォントサイズ | 
|--------|-------------|---------------|
| H1 (`#`) | #d79921 | 1.6em |
| H2 (`##`) | #98971a | 1.4em |
| H3 (`###`) | #83a598 | 1.2em |
| H4 (`####`) | #b8bb26 | 1.1em |
| H5 (`#####`) | #fabd2f | 1.05em |
| H6 (`######`) | #fe8019 | 1.0em |

**実装**: `applyHeadingDecoration()` (221-250行)

### 5. インライン装飾

| 記法 | 表示 | 実装詳細 |
|------|------|----------|
| `**太字**` | **太字** (オレンジ色) | `fontWeight: 'bold'` |
| `*斜体*` | *斜体* (黄緑色) | `fontStyle: 'italic'` |

**実装**: `applyInlineDecorations()` (252-304行)

## イベントリスナー構成

```javascript
// 主要なイベントリスナー
├── onDidChangeActiveTextEditor    // エディタ切り替え時
├── onDidChangeTextEditorSelection // カーソル移動時
├── onDidChangeTextDocument        // ドキュメント編集時
└── registerCommand                // コマンド実行時
    ├── obsidianMarkdown.toggleCheckbox
    └── obsidianMarkdown.clickCheckbox
```

## コマンド & キーバインディング

| コマンドID | 説明 | キーバインド | 条件 |
|-----------|------|-------------|------|
| `obsidianMarkdown.toggleCheckbox` | チェックボックストグル | Alt+Enter | Markdownファイル編集時 |
| `obsidianMarkdown.clickCheckbox` | マウスクリック処理 | - | - |

## 設定オプション (package.json)

```json
{
  "obsidianMarkdown.enablePreview": {
    "type": "boolean",
    "default": true,
    "description": "プレビュー装飾の有効/無効"
  },
  "obsidianMarkdown.checkboxStyle": {
    "type": "string",
    "default": "icons",
    "enum": ["icons", "brackets"],
    "description": "チェックボックススタイル"
  }
}
```

## 主要ファイルパス

| ファイル種別 | パス |
|------------|------|
| メイン実装 | `/Users/kaiki/Documents/memento_mori/markdown-wysiwyg-extension/src/extension-obsidian.js` |
| パッケージ設定 | `/Users/kaiki/Documents/memento_mori/markdown-wysiwyg-extension/package.json` |
| ビルドスクリプト | `/Users/kaiki/Documents/memento_mori/markdown-wysiwyg-extension/build.js` |
| パッケージファイル | `/Users/kaiki/Documents/memento_mori/markdown-wysiwyg-extension/obsidian-like-markdown-editor-1.0.0.vsix` |
| テストファイル | `/Users/kaiki/Documents/memento_mori/test-markdown-tables.md` |

## 技術的な制約と解決策

| 制約 | 解決策 |
|------|--------|
| VSCode Decorator APIはHTMLレンダリング不可 | `before`/`after`疑似要素でテキスト置換 |
| テーブルの完全なWYSIWYG表示不可 | 背景色とボーダーで視覚的に区別 |
| クリックイベントの直接取得不可 | コマンドとキーバインドで代替 |
| 装飾の重複問題 | Map構造で装飾タイプを管理、動的にdispose |

## 依存パッケージ

```json
{
  "dependencies": {
    "marked": "^9.0.0",
    "dompurify": "^3.0.0",
    "jsdom": "^22.0.0"
  },
  "devDependencies": {
    "@types/vscode": "^1.74.0",
    "@types/node": "16.x"
  }
}
```

## インストール済み拡張機能

| 拡張機能ID | 名称 | 用途 |
|-----------|------|------|
| `custom.obsidian-like-markdown-editor` | Obsidian-like Markdown Editor | 本実装 |
| `yzhang.markdown-all-in-one` | Markdown All in One | 基本的なMarkdown機能サポート |

## ビルド & デプロイ

```bash
# ビルド
npm run compile

# パッケージ作成
vsce package --allow-missing-repository

# インストール
code --install-extension obsidian-like-markdown-editor-1.0.0.vsix --force
```

## 今後の改善案

1. **パフォーマンス最適化**
   - 大規模ファイルでの装飾処理の最適化
   - デバウンス処理の追加

2. **機能拡張**
   - リンクのホバープレビュー
   - 画像のインライン表示
   - コードブロックのシンタックスハイライト

3. **UX改善**
   - チェックボックスのマウスクリック対応
   - テーブルセルの個別編集サポート

## 更新履歴

| 日付 | バージョン | 変更内容 |
|------|-----------|----------|
| 2025-09-15 | 1.0.0 | 初回リリース - Obsidianライク編集機能実装 |

---

*このドキュメントは2025年9月15日時点の実装状況をまとめたものです。*