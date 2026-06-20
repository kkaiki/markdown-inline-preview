# iPreview 機能一覧（索引）

最終更新: 2026-06-20  
現在バージョン: **1.8.1**

モード別の詳細は次の2ファイルに分けています。

| ドキュメント | 内容 |
|-------------|------|
| **[inline-preview-features.md](./inline-preview-features.md)** | Inline Preview（Raw）だけの機能・残タスク・将来 |
| **[preview-features.md](./preview-features.md)** | Preview（WYSIWYG）だけの機能・残タスク・将来 |

---

## モードの違い（概要）

| | **Raw** | **Preview** |
|---|---------|-------------|
| 別名 | Inline / ソースモード | WYSIWYG モード |
| 見た目 | Markdown 記法（`##`, `**` 等）をそのまま表示 | レンダリング結果を直接編集 |
| エンジン | VS Code テキストエディタ + 装飾（Decoration） | Milkdown WebView |
| 向いている作業 | 精密な記法編集、Git diff、大規模置換 | 読みやすさ重視の執筆・推敲 |
| 切替 | タイトルバーの `Preview` ボタン / `Cmd+Shift+M` | タイトルバーの `Raw` ボタン / `Cmd+Shift+M` |

**原則:** どちらのモードでも同じ `.md` ファイルを編集します。

---

## 関連ドキュメント

| ファイル | 内容 |
|----------|------|
| [inline-preview-features.md](./inline-preview-features.md) | Inline Preview 機能一覧 |
| [preview-features.md](./preview-features.md) | Preview 機能一覧 |
| [implementation-status.md](./implementation-status.md) | 実装マトリクス |
| [keyboard-shortcuts.md](./user-guide/keyboard-shortcuts.md) | ショートカット一覧 |
