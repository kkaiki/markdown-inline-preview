# Obsidian-like Markdown Editor for VSCode

ObsidianやNotionのようなWYSIWYG的な編集体験をVSCodeのMarkdownファイルで実現する拡張機能です。

## 主な機能

### ✅ インタラクティブなチェックボックス機能
- **自動チェックボックス生成**: 改行時に前行がチェックボックス行なら自動的に新しいチェックボックスを追加
- **マウスクリックでトグル**: チェックボックスをクリックするだけで状態を切り替え可能
- **キーボードショートカット**: `Cmd+Enter`（Mac）/ `Ctrl+Enter`（Windows/Linux）でカーソル位置のチェックボックスをトグル
- **チェック済みアイテムの装飾**: チェック済み（`[x]`）のアイテムには自動で取り消し線と透明度を適用
- **インデント対応**: `Tab`と`Shift+Tab`でチェックボックスのインデントレベルを調整

### 📊 高度なテーブル整形機能
- **自動整形**: テーブル編集中にリアルタイムで列幅を自動調整
- **日本語対応**: 日本語文字（全角文字）の幅を正確に計算して整列
- **CSV自動変換**: CSVデータを入力してEnterを押すと自動的にMarkdownテーブルに変換
- **文字幅の柔軟な設定**:
  - 日本語文字幅: 2.0倍（カスタマイズ可能）
  - 狭い文字（i, l, 1など）: 0.8倍
  - 広い文字（W, M, mなど）: 1.3倍

### 📝 リッチな見出し表示
- **#記号の非表示化**: 非フォーカス時には`#`記号を隠してクリーンな見出し表示
- **レベル別カラーリング**: H1〜H6まで異なる色とサイズで視覚的に区別
- **フォーカス時の編集**: カーソルがある行では生のMarkdown構文を表示

### 🎨 スマートな装飾システム
- **フォーカス連動表示**: 
  - カーソルがある行: 生のMarkdown構文を表示して編集しやすく
  - その他の行: プレビュー風の装飾を適用
- **インライン装飾**:
  - `**太字**`: 太字でハイライト
  - `*斜体*`: イタリック体で表示
- **横線表示**: `---`、`***`、`___`を装飾された横線として表示

### ⚡ 編集効率化機能
- **スマート選択** (`Shift+Cmd+Left` / `Shift+Ctrl+Left`):
  - チェックボックス行で段階的に選択範囲を拡張
  - テキスト部分 → チェックボックス含む → 行全体（インデント含む）
- **コードブロック内全選択** (`Cmd+A` / `Ctrl+A`):
  - コードブロック内でCmd+Aを押すとコード部分のみを選択
  - もう一度押すとファイル全体を選択
- **IntelliSense無効化**: Markdown編集時の不要な自動補完を完全に無効化

## 実装の詳細

### なぜこのような実装にしたか

#### 1. チェックボックスの自動生成と改行処理
```javascript
// onDidChangeTextDocument イベントで改行を検出
if (lineText.match(/^(\s*)-\s\[[\sx]?\]/i) && change.text.includes('\n')) {
    // 前の行がチェックボックスなら新しいチェックボックスを自動追加
}
```
- **理由**: Obsidianのような直感的な編集体験を実現するため
- **効果**: リスト作成時の手間を大幅に削減

#### 2. グローバルなチェック済み装飾の管理
```javascript
let globalCheckedDecoration = vscode.window.createTextEditorDecorationType({
    textDecoration: 'line-through',
    opacity: '0.6'
});
```
- **理由**: パフォーマンスの最適化とメモリ効率の向上
- **効果**: 大量のチェックボックスがあっても軽快に動作

#### 3. デバウンス処理による更新最適化
```javascript
if (textChangeTimer) clearTimeout(textChangeTimer);
textChangeTimer = setTimeout(() => {
    updateDecorations(editor, false, changedLines);
    changedLines.clear();
}, 150);
```
- **理由**: 高速タイピング時のパフォーマンス問題を回避
- **効果**: スムーズな編集体験を維持しながらリアルタイム更新を実現

#### 4. 日本語文字幅の正確な計算
```javascript
function getStringWidth(str) {
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if ((code >= 0x3000 && code <= 0x9FFF) || // CJK文字
            (code >= 0xFF01 && code <= 0xFF60)) { // 全角記号
            width += 2;
        } else {
            width += 1;
        }
    }
}
```
- **理由**: 日本語を含むテーブルでも正確な整列を実現
- **効果**: 混在言語環境でも美しいテーブル表示

#### 5. IME入力の考慮
```javascript
if (change.text && /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(change.text)) {
    isComposing = true;
    setTimeout(() => { isComposing = false; }, 1000);
}
```
- **理由**: 日本語入力中の誤動作を防止
- **効果**: 日本語入力時でも安定した動作

### 技術的な実装詳細

#### 装飾システムの構造
- **decorationCache**: 頻繁に使用される装飾タイプをキャッシュ
- **decorationTypes Map**: 動的に作成される装飾を管理
- **globalCheckedDecoration**: 全ドキュメントのチェック済みアイテムを一括管理

#### パフォーマンス最適化
- **部分更新**: 変更された行のみを更新（`performIncrementalUpdate`）
- **全体更新**: 5秒ごとまたは大規模変更時に実行（`performFullUpdate`）
- **行単位の変更追跡**: `changedLines Set`で変更箇所を記録

#### イベント処理の階層
1. **テキスト変更**: `onDidChangeTextDocument` → デバウンス → 装飾更新
2. **カーソル移動**: `onDidChangeTextEditorSelection` → 軽量更新
3. **クリック検出**: マウスイベント → チェックボックストグル

## インストール方法

### VSIXファイルからインストール
```bash
code --install-extension obsidian-like-markdown-editor-1.2.1.vsix
```

### ソースからビルド
```bash
# 依存関係のインストール
npm install

# ビルド
npm run compile

# パッケージ作成
vsce package

# インストール
code --install-extension obsidian-like-markdown-editor-*.vsix
```

## 設定オプション

| 設定項目 | デフォルト値 | 説明 |
|---------|------------|------|
| `obsidianMarkdown.enablePreview` | `true` | プレビュー装飾の有効/無効 |
| `obsidianMarkdown.checkboxStyle` | `icons` | チェックボックスの表示スタイル |
| `obsidianMarkdown.showCheckboxCodeLens` | `true` | CodeLens表示（現在無効化） |
| `obsidianMarkdown.table.widthCalculation` | `smart` | テーブル文字幅計算方法 |
| `obsidianMarkdown.table.japaneseCharWidth` | `2.0` | 日本語文字の幅係数 |
| `obsidianMarkdown.table.narrowCharWidth` | `0.8` | 狭い文字の幅係数 |
| `obsidianMarkdown.table.wideCharWidth` | `1.3` | 広い文字の幅係数 |

## キーボードショートカット

| 機能 | Mac | Windows/Linux |
|------|-----|---------------|
| チェックボックストグル | `Cmd+Enter` | `Ctrl+Enter` |
| インデント増加 | `Tab` | `Tab` |
| インデント減少 | `Shift+Tab` | `Shift+Tab` |
| スマート選択 | `Shift+Cmd+Left` | `Shift+Ctrl+Left` |
| コードブロック内全選択 | `Cmd+A` | `Ctrl+A` |

## 連携している拡張機能

この拡張機能は以下の拡張機能と連携して動作します：
- **Markdown All in One**: 基本的なMarkdown編集機能を提供
- **Markdown Preview Enhanced**: プレビュー機能を補完

## システム要件

- VSCode バージョン 1.74.0 以上
- Node.js 16.x 以上

## 既知の問題と制限事項

- VSCodeのDecorator APIの制限により、完全なWYSIWYG表示は実現できません
- 大規模なファイル（1万行以上）では装飾の更新に遅延が発生する場合があります
- 一部の特殊なMarkdown構文には対応していません

## ライセンス

MIT

## 貢献

バグ報告や機能要望は[GitHubリポジトリ]()のIssuesにお願いします。

## 更新履歴

### v1.2.1 (2025-09)
- チェックボックスの自動生成機能を追加
- テーブル整形の日本語対応を改善
- CSV自動変換機能を実装
- パフォーマンスの大幅改善

### v1.0.0 (2025-09)
- 初回リリース
- 基本的なObsidianライク編集機能を実装