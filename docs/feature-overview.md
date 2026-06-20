# iPreview 機能一覧（索引）

最終更新: 2026-06-21  
現在バージョン: **1.8.5**

iPreview（ipreview）は、VS Code / Cursor 上で Notion・Obsidian に近い Markdown 編集体験を提供する拡張機能です。  
**Raw**（ソース + 装飾）と **Preview**（Milkdown WYSIWYG）の 2 モードで同じ `.md` を編集します。

---

## モード別の詳細

| ドキュメント | 内容 |
|-------------|------|
| **[inline-preview-features.md](./inline-preview-features.md)** | Raw モードの機能・設定・残タスク |
| **[preview-features.md](./preview-features.md)** | Preview モードの機能・設定・残タスク |

| | **Raw** | **Preview** |
|---|---------|-------------|
| 別名 | Inline / ソースモード | WYSIWYG モード |
| 見た目 | 記法を表示 + 装飾（見出し色、取り消し線等） | レンダリング結果を直接編集 |
| エンジン | VS Code `TextEditor` + Decoration | Milkdown WebView |
| 向いている作業 | 精密な記法編集、Git diff、大規模置換 | 読みやすさ重視の執筆・推敲 |
| 切替 | タイトルバー `Preview` / `Cmd+Shift+M` | タイトルバー `Raw` / `Cmd+Shift+M` |

---

## 主要機能（全体）

| 機能 | 説明 | 状態 |
|------|------|------|
| チェックボックス | クリック / `Cmd+Enter` でトグル、装飾 | ✅ Raw |
| リスト操作 | タイプ変換、インデント、スマート Enter | ✅ Raw |
| スラッシュコマンド | `/table` `code` `h1` 等 | ✅ Raw + Preview |
| テーブル整形・ナビ | 自動整形、セル移動、折り返し表示 | ✅ Raw |
| 目次（TOC） | `/toc` 自動生成・更新 | ✅ Raw |
| 見出し装飾 | レベル別カラー | ✅ Raw |
| 画像プレビュー | サムネイル・ホバー | ✅ Raw |
| Preview WYSIWYG | 数式・Mermaid・フォーカス時記法 | ✅ Preview |
| 同期・共同編集 | クラウド同期 | ❌ 未実装 |

---

## 設計原則

1. **非破壊的** — 装飾は表示のみ（編集内容は通常の Markdown として保存）
2. **直感的** — マウス・キーボード両対応、VS Code 操作との一貫性
3. **高性能** — デバウンス（装飾 50ms、TOC 500ms、Preview 同期 100–200ms）
4. **日本語対応** — テーブル幅の CJK 計算、IME 配慮

---

## 設定の入口

| 種別 | 参照 |
|------|------|
| Raw 装飾・リスト・テーブル | [inline-preview-features.md](./inline-preview-features.md) の設定一覧 |
| Preview テーマ・スラッシュ等 | [preview-features.md](./preview-features.md) の設定一覧 |
| Advanced トグル | `markdownInline.advanced.*` — 自動整形・装飾の個別 ON/OFF |

**優先順位:** 明示的な `advanced.*` > レガシー設定名。手動コマンドは自動トグルに影響されない。

---

## 制限事項

- VS Code Decoration API ではフォントサイズ変更不可（見出しは色・背景で区別）
- 1 万行超のファイルでは装飾更新に遅延の可能性
- Preview の Milkdown は CommonMark/GFM 中心（Wiki リンク等は未対応）
- 他 Markdown 拡張とのキーバインド競合に注意（[troubleshooting.md](./user-guide/troubleshooting.md)）

---

## 関連ドキュメント

| ファイル | 内容 |
|----------|------|
| [README.md](./README.md) | ドキュメント全体の索引 |
| [implementation-status.md](./implementation-status.md) | 実装マトリクス（開発者向け・正） |
| [notion-obsidian-gap.md](./notion-obsidian-gap.md) | Notion / Obsidian との差分 |
| [specifications/slash-commands.md](./specifications/slash-commands.md) | スラッシュコマンド仕様 + クイックリファレンス |
| [specifications/command-surface.md](./specifications/command-surface.md) | コマンドパレット・キーバインド一覧 |
| [user-guide/keyboard-shortcuts.md](./user-guide/keyboard-shortcuts.md) | ショートカット早見表 |
| [user-guide/getting-started.md](./user-guide/getting-started.md) | インストール・クイックスタート |

### 詳細仕様（specifications/）

[テーブルナビ](specifications/table-navigation.md) · [テーブル折り返し](specifications/table-inline-wrap.md) · [画像プレビュー](specifications/image-preview.md) · [目次](specifications/table-of-contents.md) · [リスト操作](specifications/list-operations.md) · [Preview/Raw 切替](specifications/preview-raw-toggle.md) · [テスト](specifications/test-specification.md)
