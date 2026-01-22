# 全体仕様概要

## 拡張機能の目的

Markdown Inline Previewは、VSCode上でNotionやObsidianのようなWYSIWYG的な編集体験を提供する拡張機能です。

## 主要機能

| 機能 | 説明 | 状態 |
|------|------|------|
| チェックボックス | インタラクティブなタスク管理 | 実装済み |
| リスト操作 | タイプ変換、インデント、自動継続 | 実装済み |
| テーブル整形 | 自動整形、日本語対応 | 実装済み |
| テーブルナビゲーション | セル内カーソル移動 | 実装済み |
| 目次生成 | 自動目次生成・更新 | 実装済み |
| 見出し装飾 | レベル別カラーリング | 実装済み |
| コードブロック | 自動補完、装飾 | 実装済み |

## 設計原則

### 1. 非破壊的

- Markdownファイルの内容を変更しない（装飾は表示のみ）
- ユーザーの編集を妨げない

### 2. 直感的

- マウスとキーボードの両方で操作可能
- 既存のVSCode操作との一貫性

### 3. 高性能

- デバウンス処理で頻繁な更新を抑制
- 部分更新で大きなファイルにも対応

### 4. 日本語対応

- 文字幅を正確に計算
- IME入力中の誤動作を防止

## 設定項目

### プレビュー

| 設定 | 型 | デフォルト | 説明 |
|------|-----|-----------|------|
| `enablePreview` | boolean | true | プレビュー装飾の有効化 |
| `enableHeadingDecorations` | boolean | true | 見出し装飾の有効化 |
| `headingColorScheme` | string | "default" | カラースキーム |

### チェックボックス

| 設定 | 型 | デフォルト | 説明 |
|------|-----|-----------|------|
| `checkboxStyle` | string | "icons" | 表示スタイル |
| `checkboxClickableArea` | string | "checkbox" | クリック可能範囲 |
| `autoMoveCompletedTasks` | boolean | false | 完了タスクを下に移動 |

### テーブル

| 設定 | 型 | デフォルト | 説明 |
|------|-----|-----------|------|
| `table.widthCalculation` | string | "smart" | 幅計算方法 |
| `table.japaneseCharWidth` | number | 2.0 | 日本語文字幅 |
| `table.narrowCharWidth` | number | 0.8 | 狭い文字幅 |
| `table.wideCharWidth` | number | 1.3 | 広い文字幅 |

### 目次

| 設定 | 型 | デフォルト | 説明 |
|------|-----|-----------|------|
| `toc.autoUpdate` | boolean | true | 自動更新 |
| `toc.minLevel` | number | 1 | 最小見出しレベル |
| `toc.maxLevel` | number | 6 | 最大見出しレベル |

## 制限事項

1. **VSCode APIの制限**
   - フォントサイズは装飾で変更不可
   - 完全なWYSIWYG表示は実現不可

2. **パフォーマンス**
   - 1万行以上のファイルでは遅延が発生する可能性

3. **互換性**
   - 一部のMarkdown方言には非対応
   - 他の拡張機能との競合の可能性

## 関連仕様書

- [テーブルナビゲーション仕様](table-navigation.md)
- [目次機能仕様](table-of-contents.md)
- [リスト操作仕様](list-operations.md)
- [テスト仕様](test-specification.md)
