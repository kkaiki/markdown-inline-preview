# Markdown Inline Preview ドキュメント

プロジェクト概要（英語）: [README.md](../README.md) · 日本語: [README.ja.md](../README.ja.md)

```
docs/
├── specifications/     機能仕様（この拡張が何をするか）
│   └── fixes/          個別バグ修正の仕様（なぜそう直したか・再発防止）
├── testing/            テストの掟・置き場所設計・カタログ・仕様⇄テスト対応表
├── developer/          アーキテクチャ・コントリビューション
├── user-guide/         利用者向け
└── examples/           手動確認用サンプル Markdown
```

## 機能仕様（specifications/）

| ドキュメント | 説明 |
|-------------|------|
| [specifications/preview-features.md](specifications/preview-features.md) | **Preview モード** — WYSIWYG・フォーカス展開・数式・Mermaid・差分ガター・切替・設定。**最初に読む** |
| [specifications/inline-preview-features.md](specifications/inline-preview-features.md) | **Raw モード** — リスト・テーブル・装飾・スラッシュ・設定 |
| [specifications/preview-toolbar.md](specifications/preview-toolbar.md) | Preview 上部ツールバー |
| [specifications/preview-scroll-sync.md](specifications/preview-scroll-sync.md) | Raw ⇄ Preview のスクロール同期 |
| [specifications/blank-line-preservation.md](specifications/blank-line-preservation.md) | 空行の 1:1 保持（ソース行と Preview 行の対応） |
| [specifications/code-fence-focus-markers.md](specifications/code-fence-focus-markers.md) | コードフェンスのフォーカス時マーカー表示 |
| [specifications/mermaid-node-label-inline-edit.md](specifications/mermaid-node-label-inline-edit.md) | Mermaid ノードラベルの直接編集 |
| [specifications/media-embed-support.md](specifications/media-embed-support.md) | 動画・音声・追加画像形式の埋め込み |
| [specifications/whitespace-only-content-visualization.md](specifications/whitespace-only-content-visualization.md) | 空白のみの行の可視化 |
| [specifications/default-editor-association-sync.md](specifications/default-editor-association-sync.md) | `.md` の既定エディタを現在のモードへ追従させる |
| [specifications/i18n-localization.md](specifications/i18n-localization.md) | UI の多言語化 |
| [specifications/webview-save-failure-visibility.md](specifications/webview-save-failure-visibility.md) | 保存失敗をユーザーへ見せる |
| [specifications/preview-handler-error-boundary.md](specifications/preview-handler-error-boundary.md) | ハンドラのエラーバウンダリ |

### 個別バグ修正の仕様（specifications/fixes/）

**バグを直したらここに 1 本追加**し、[testing/spec-test-coverage.md](testing/spec-test-coverage.md) の対応表も更新する。

| カテゴリ | 仕様書 |
|---|---|
| フォーカス展開（Typora 風） | [inline-mark-focus-edit-fix](specifications/fixes/inline-mark-focus-edit-fix.md) · [block-prefix-selection-collapse-fix](specifications/fixes/block-prefix-selection-collapse-fix.md) · [drag-select-during-expand-fix](specifications/fixes/drag-select-during-expand-fix.md) · [prefix-expand-mark-inheritance-fix](specifications/fixes/prefix-expand-mark-inheritance-fix.md) · [heading-prefix-live-level-update-fix](specifications/fixes/heading-prefix-live-level-update-fix.md) · [heading-prefix-zero-hash-collapse-fix](specifications/fixes/heading-prefix-zero-hash-collapse-fix.md) · [heading-prefix-selectable-widget-fix](specifications/fixes/heading-prefix-selectable-widget-fix.md) · [heading-blockquote-prefix-space-fix](specifications/fixes/heading-blockquote-prefix-space-fix.md) · [collapse-markdown-sync-fix](specifications/fixes/collapse-markdown-sync-fix.md) |
| コードブロック | [code-fence-real-text-edit-fix](specifications/fixes/code-fence-real-text-edit-fix.md) · [code-fence-language-focus-edit-fix](specifications/fixes/code-fence-language-focus-edit-fix.md) · [code-block-arrow-vertical-nav-fix](specifications/fixes/code-block-arrow-vertical-nav-fix.md) · [code-block-tab-focus-leak-fix](specifications/fixes/code-block-tab-focus-leak-fix.md) |
| カーソル・フォーカス | [checkbox-cursor-jump-fix](specifications/fixes/checkbox-cursor-jump-fix.md) · [external-update-cursor-jump-fix](specifications/fixes/external-update-cursor-jump-fix.md) · [stale-external-push-cursor-jump-fix](specifications/fixes/stale-external-push-cursor-jump-fix.md) · [list-marker-drag-fix](specifications/fixes/list-marker-drag-fix.md) · [mermaid-text-selection-fix](specifications/fixes/mermaid-text-selection-fix.md) |
| リスト・チェックボックス | [typed-checkbox-conversion-fix](specifications/fixes/typed-checkbox-conversion-fix.md) · [checkbox-demotion-prefix-leak-fix](specifications/fixes/checkbox-demotion-prefix-leak-fix.md) |
| 編集・直列化 | [hardbreak-line-markdown-conversion-fix](specifications/fixes/hardbreak-line-markdown-conversion-fix.md) · [trailing-space-nbsp-corruption-fix](specifications/fixes/trailing-space-nbsp-corruption-fix.md) · [preview-slash-empty-block-fix](specifications/fixes/preview-slash-empty-block-fix.md) · [math-decoration-rendering-fix](specifications/fixes/math-decoration-rendering-fix.md) |
| 保存・外部同期 | [preview-external-write-race-fix](specifications/fixes/preview-external-write-race-fix.md) · [stale-document-model-save-defer-fix](specifications/fixes/stale-document-model-save-defer-fix.md) · [preview-to-raw-pending-edit-loss-fix](specifications/fixes/preview-to-raw-pending-edit-loss-fix.md) · [dirty-raw-edit-preview-switch-loss-fix](specifications/fixes/dirty-raw-edit-preview-switch-loss-fix.md) · [untitled-preview-content-loss-fix](specifications/fixes/untitled-preview-content-loss-fix.md) |
| タブ・エディタ管理 | [preview-default-editor-fix](specifications/fixes/preview-default-editor-fix.md) · [sidebar-reopen-preview-duplicate-tab-fix](specifications/fixes/sidebar-reopen-preview-duplicate-tab-fix.md) · [webview-disposed-race-fix](specifications/fixes/webview-disposed-race-fix.md) · [preview-link-open-same-column-fix](specifications/fixes/preview-link-open-same-column-fix.md) |

### 調査記録

| ドキュメント | 説明 |
|-------------|------|
| [specifications/bug-hunt-2026-07-findings.md](specifications/bug-hunt-2026-07-findings.md) | バグハンティング調査記録（何を疑い・どう確かめ・結果どうだったか） |
| [specifications/preview-focus-jump-tests-overview.md](specifications/preview-focus-jump-tests-overview.md) | 「フォーカス/カーソルが飛ぶ」系バグの仕様・テスト棚卸し |

## テスト（testing/）

| ドキュメント | 説明 |
|-------------|------|
| [testing/testing-rules.md](testing/testing-rules.md) | **テストの掟** — レイヤーの信頼度序列（実 VS Code が主軸）・偽装カバレッジ禁止・アンチフレーク。他のテスト文書と矛盾したら本書が勝つ |
| [testing/test-directory-design.md](testing/test-directory-design.md) | テスト置き場所の設計思想（レイヤー × 症状カテゴリ）・全ファイルの移行マッピング |
| [testing/preview-test-catalog.md](testing/preview-test-catalog.md) | **テストカタログ（自動生成）** — 全テストのタイトル＝ユースケース一覧（生きた仕様書）。`npm run docs:test-catalog` で再生成 |
| [testing/spec-test-coverage.md](testing/spec-test-coverage.md) | 仕様 ⇄ テスト対応表（どの仕様がどのテストで担保されるか・既知のギャップ） |
| [testing/preview-usage-flow-test-backlog.md](testing/preview-usage-flow-test-backlog.md) | まだテスト化していないユースケース候補のバックログ |
| [../test/README.md](../test/README.md) | テストの実行方法 |

## 開発者向け（developer/）

| ドキュメント | 説明 |
|-------------|------|
| [developer/architecture.md](developer/architecture.md) | アーキテクチャ概要 |
| [developer/contributing.md](developer/contributing.md) | コントリビューション |
| [developer/adr/0001-hexagonal-shared-core.md](developer/adr/0001-hexagonal-shared-core.md) | ADR: 共有コアの分離 |

## 利用者向け・サンプル

| ドキュメント | 説明 |
|-------------|------|
| [../README.ja.md](../README.ja.md) | クイックスタート（プロジェクト概要） |
| [user-guide/keyboard-shortcuts.md](user-guide/keyboard-shortcuts.md) | ショートカット早見表 |
| [examples/test-table.md](examples/test-table.md) · [examples/test-lists.md](examples/test-lists.md) | 手動確認用サンプル（テーブル / リスト） |
