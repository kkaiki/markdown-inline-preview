# Markdown Inline Preview ドキュメント

プロジェクト概要（英語）: [README.md](../README.md) · 日本語: [README.ja.md](../README.ja.md)

## 機能仕様（specifications/）

| ドキュメント | 説明 |
|-------------|------|
| [specifications/inline-preview-features.md](specifications/inline-preview-features.md) | **Raw モード** — リスト・テーブル・装飾・スラッシュ・設定 |
| [specifications/preview-features.md](specifications/preview-features.md) | **Preview モード** — WYSIWYG・数式・Mermaid・切替・設定 |

## ユーザー向け

| ドキュメント | 説明 |
|-------------|------|
| [../README.ja.md](../README.ja.md) | クイックスタート（プロジェクト概要） |
| [user-guide/keyboard-shortcuts.md](user-guide/keyboard-shortcuts.md) | ショートカット早見表 |

## 開発者向け

| ドキュメント | 説明 |
|-------------|------|
| [developer/architecture.md](developer/architecture.md) | アーキテクチャ概要 |
| [developer/contributing.md](developer/contributing.md) | コントリビューション |
| [testing-rules.md](testing-rules.md) | **テストの掟** — レイヤーの信頼度序列（実 VS Code が主軸）・偽装カバレッジ禁止・アンチフレーク・拡充マップ。他のテスト文書と矛盾したら本書が勝つ |
| [test/README.md](../test/README.md) | テスト実行 |
| [specifications/test-directory-design.md](specifications/test-directory-design.md) | テスト置き場所の設計思想（レイヤー×症状カテゴリ）・全ファイルの移行マッピング |
| [specifications/preview-test-catalog.md](specifications/preview-test-catalog.md) | **テストカタログ（自動生成）** — 全テストのタイトル＝ユースケース一覧（生きた仕様書）。`npm run docs:test-catalog` で再生成 |
| [specifications/spec-test-coverage.md](specifications/spec-test-coverage.md) | 仕様 ⇄ テスト対応表（どの仕様がどのテストで担保されるか・既知のギャップ） |
| [specifications/preview-usage-flow-test-backlog.md](specifications/preview-usage-flow-test-backlog.md) | まだテスト化していないユースケース候補のバックログ（テスト化したらカタログへ移す） |
| [specifications/bug-hunt-2026-07-findings.md](specifications/bug-hunt-2026-07-findings.md) | バグハンティング調査記録（見つけた/直したバグ、検証して問題無しと確認した仮説、実 VS Code テスト基盤） |

## サンプル（手動確認用）

| ファイル | 用途 |
|----------|------|
| [examples/test-table.md](examples/test-table.md) | テーブル |
| [examples/test-lists.md](examples/test-lists.md) | リスト |
