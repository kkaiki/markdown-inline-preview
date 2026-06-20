# クイックスタートガイド

## インストール

### 方法1: VSIXファイルからインストール（推奨）

```bash
code --install-extension markdown-inline-preview-1.4.9.vsix
```

### 方法2: ソースからビルド

```bash
# リポジトリをクローン
git clone <repository-url>
cd markdown-inline-preview

# 依存関係のインストール
npm install

# パッケージを作成
npm install -g @vscode/vsce
vsce package

# インストール
code --install-extension markdown-inline-preview-*.vsix
```

### 方法3: 開発モードで実行

1. VSCodeでプロジェクトフォルダを開く
2. `F5` キーを押してデバッグ実行
3. 新しいVSCodeウィンドウで拡張機能が有効化される

## 基本的な使い方

### 1. チェックボックス

```markdown
- [ ] 未完了のタスク
- [x] 完了したタスク
```

- **クリック**: チェックボックスをクリックしてトグル
- **Cmd+Enter**: キーボードでトグル
- **Enter**: 新しいチェックボックスを自動追加

### 2. リスト操作

```markdown
- 箇条書き
1. 番号付きリスト
- [ ] チェックボックス
```

- **Tab**: インデント追加
- **Shift+Tab**: インデント削除
- **Alt+Cmd+4**: チェックボックスに変換
- **Alt+Cmd+5**: 箇条書きに変換
- **Alt+Cmd+6**: 番号付きに変換

### 3. テーブル

```markdown
| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
```

- テーブルを編集して別の行に移動すると自動整形
- 日本語の幅も正確に計算

### 4. 目次

```markdown
/目次

## セクション1
### サブセクション
## セクション2
```

- `/目次` または `/toc` と記述
- 見出しを変更すると自動更新

### 5. コマンドガイド

- 文書内スラッシュコマンドとコマンドパレットの一覧は [コマンドガイド](commands.md) にまとめてある

## 設定

VSCodeの設定（`Cmd+,`）で以下をカスタマイズ:

| 設定 | デフォルト | 説明 |
|------|-----------|------|
| `markdownInline.enablePreview` | true | プレビュー装飾の有効化 |
| `markdownInline.toc.autoUpdate` | true | 目次の自動更新 |
| `markdownInline.table.japaneseCharWidth` | 2.0 | 日本語文字の幅係数 |

### Advanced設定の例

自動整形や自動更新だけを止めたい場合:

```json
{
  "markdownInline.advanced.autoFormatTables": false,
  "markdownInline.advanced.autoUpdateTableOfContents": false
}
```

見た目の装飾だけを減らしたい場合:

```json
{
  "markdownInline.advanced.enableHeadingDecorations": false,
  "markdownInline.advanced.enableCodeBlockDecorations": false,
  "markdownInline.advanced.enableHorizontalRuleDecorations": false
}
```

補足:
- 自動機能をオフにしても、手動コマンドは引き続き使えます。
- 既存の `markdownInline.enableHeadingDecorations` と `markdownInline.toc.autoUpdate` は後方互換のため引き続き有効です。

## 次のステップ

- [機能一覧](features.md) - すべての機能を確認
- [コマンドガイド](commands.md) - 文書内コマンドとコマンドパレットの一覧
- [キーボードショートカット](keyboard-shortcuts.md) - 効率的な編集方法
- [トラブルシューティング](troubleshooting.md) - 問題が発生した場合
