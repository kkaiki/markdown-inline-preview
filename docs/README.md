# Markdown Inline Preview - ドキュメント

このディレクトリには、Markdown Inline Preview拡張機能のすべてのドキュメントが含まれています。

## ディレクトリ構造

```
docs/
├── README.md                    # このファイル
├── user-guide/                  # ユーザー向けドキュメント
│   ├── getting-started.md       # クイックスタートガイド
│   ├── features.md              # 機能一覧
│   ├── commands.md              # コマンドガイド
│   ├── keyboard-shortcuts.md    # キーボードショートカット一覧
│   └── troubleshooting.md       # トラブルシューティング
├── developer/                   # 開発者向けドキュメント
│   ├── architecture.md          # アーキテクチャ概要
│   ├── implementation-guide.md  # 実装ガイド
│   └── contributing.md          # コントリビューションガイド
├── specifications/              # 仕様書
│   ├── overview.md              # 全体仕様概要
│   ├── command-surface.md       # コマンド面仕様
│   ├── table-navigation.md      # テーブルナビゲーション仕様
│   ├── image-preview.md         # 画像インラインプレビュー仕様
│   ├── table-of-contents.md     # 目次機能仕様
│   ├── list-operations.md       # リスト操作仕様
│   ├── slash-commands.md        # スラッシュコマンド仕様
│   └── test-specification.md    # テスト仕様
└── examples/                    # サンプルファイル
    ├── test-table.md            # テーブルテスト用
    ├── test-toc.md              # 目次テスト用
    └── test-lists.md            # リストテスト用
```

## ドキュメント一覧

### ユーザー向け

| ドキュメント | 説明 |
|-------------|------|
| [クイックスタート](user-guide/getting-started.md) | インストールと基本的な使い方 |
| [機能一覧](user-guide/features.md) | すべての機能の詳細説明 |
| [コマンドガイド](user-guide/commands.md) | スラッシュコマンドとコマンドパレットの一覧 |
| [キーボードショートカット](user-guide/keyboard-shortcuts.md) | 全ショートカット一覧 |
| [トラブルシューティング](user-guide/troubleshooting.md) | よくある問題と解決方法 |

補足:
- Advanced設定は「基本機能を保ったまま自動動作や装飾を個別にオフにしたい」ケース向けです。
- まずは README の設定一覧、その後に各仕様書で詳細を確認してください。

### 開発者向け

| ドキュメント | 説明 |
|-------------|------|
| [アーキテクチャ](developer/architecture.md) | システム構成と設計思想 |
| [実装ガイド](developer/implementation-guide.md) | 詳細な実装方法 |
| [コントリビューション](developer/contributing.md) | 開発への参加方法 |

### 仕様書

| ドキュメント | 説明 |
|-------------|------|
| [全体仕様](specifications/overview.md) | 拡張機能の全体仕様 |
| [テーブルナビゲーション](specifications/table-navigation.md) | テーブル内カーソル移動の仕様 |
| [画像インラインプレビュー](specifications/image-preview.md) | 画像表示とオーバーレイ案の仕様 |
| [目次機能](specifications/table-of-contents.md) | 自動目次生成の仕様 |
| [リスト操作](specifications/list-operations.md) | リスト編集機能の仕様 |
| [テスト仕様](specifications/test-specification.md) | テストの書き方と実行方法 |

今回の更新対象:
- Advanced設定の導入
- 自動テーブル整形と自動TOC更新のオン・オフ仕様
- 設定トグルを前提にしたテスト方針
- コマンド面仕様とコマンドガイド
