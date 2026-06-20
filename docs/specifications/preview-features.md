# Preview（WYSIWYG モード）仕様

最終更新: 2026-06-21  
バージョン: **1.8.5**

**Preview** = Milkdown ベースの **WYSIWYG モード**（Custom Text Editor）です。  
レンダリング結果をそのまま編集し、変更は自動で `.md` ファイルに保存されます。

Inline Preview（Raw モード）は [inline-preview-features.md](./inline-preview-features.md) を参照してください。

---

## モード概要

| 項目 | 内容 |
|------|------|
| 別名 | Preview / WYSIWYG モード |
| エンジン | Milkdown（WebView） |
| 記法の表示 | **レンダリング結果**（非フォーカス時）。フォーカス中ブロックでは `##`・`**` 等の記法マーカーを表示 |
| Raw への切替 | タイトルバー `Raw` / `Cmd+Shift+M` |
| 保存 | 編集後 約 200ms でファイルへ自動反映 |
| 向いている作業 | 読みやすさ重視の執筆・推敲 |

### Raw との比較

| | **Raw** | **Preview** |
|---|---------|-------------|
| 見た目 | 記法 + 装飾 | レンダリング結果を直接編集 |
| エンジン | TextEditor + Decoration | Milkdown WebView |
| 数式・Mermaid | なし（ソースのみ） | KaTeX / Mermaid 表示 |
| スラッシュ | VS Code 補完 | WebView 内メニュー |

### 設計原則

1. **非破壊** — 保存形式は CommonMark / GFM 準拠の Markdown
2. **双方向同期** — Raw 変更を約 100ms 後に反映。循環更新を防止
3. **編集優先** — フォーカスブロックでは記法を見せて精密編集を支援

### 制限事項

- Wiki リンク、Obsidian コールアウト等は未対応（CommonMark/GFM 中心）
- WebView バンドル（Mermaid + KaTeX）は約 4MB
- XSS 対策は CSP + Milkdown 依存。明示的サニタイズは残タスク

---

## 編集・レンダリング

| 機能 | 説明 |
|------|------|
| CommonMark | 見出し、段落、引用、コード、リンク等 |
| GFM | テーブル、チェックボックス、取り消し線等 |
| テーブル操作（Notion 風） | 行は左端、列は上端のグリップをクリックで選択 → 削除（列は整列も）。セル境界の `+` で行/列を追加 |
| WYSIWYG 編集 | レンダリング結果を直接編集 |
| ファイル同期 | Markdown ソースとして保存 |
| Raw → Preview 反映 | 約 100ms デバウンス |
| チェックボックス | クリックでトグル → `- [x]` として保存 |
| Undo / Redo | VS Code 標準のテキスト履歴 |
| フォーカス時記法表示 | カーソルブロックで Markdown 記法を表示（`preview.showFocusSyntax`） |
| 見出し Backspace 降格 | 見出し先頭で Backspace → 通常行へ（`#` は残して続けて削除可能） |

---

## リッチコンテンツ

| 機能 | 説明 | 設定キー |
|------|------|----------|
| シンタックスハイライト | highlight.js（主要言語） | 常時 on |
| KaTeX 数式 | `$...$`（インライン）、`$$...$$`（ブロック） | `preview.enableMath` |
| Mermaid 図 | ` ```mermaid ` コードブロック | `preview.enableMermaid` |
| 画像表示 | `![alt](./path)` を本文中に表示。ワークスペース相対パス解決 | 自動 |
| Frontmatter | YAML を整形パネルで表示（本文は Milkdown） | `preview.showFrontmatter` |

画像は Raw と異なり、行末サムネイルではなく**本文中にフル表示**されます。

---

## スラッシュメニュー（Preview）

空行または `/` のみの行でメニュー表示（`preview.enableSlashMenu`）。  
コマンド定義は Raw と共通（`src/shared/slash/slashMenuItems.ts`）。

| コマンド | Preview での動作 |
|----------|------------------|
| `h1`〜`h6` | 見出しブロック挿入 |
| `table` | 2 列表挿入 |
| `code` | コードブロック挿入 |
| `quote` / `divider` / `callout` | 対応ブロック挿入 |
| `bullet` / `numbered` / `todo` | リスト挿入 |
| `heading` | レベル指定見出し |

`/table normalize` は Raw 専用（ワークスペース設定の切替）。

---

## UI・ナビゲーション

| 機能 | 説明 | 設定キー |
|------|------|----------|
| リンククリック | 相対パス → VS Code でファイルを開く | 常時 |
| 外部リンク | `https://` → 既定ブラウザ | 常時 |
| テーマ | VS Code 追従 or light/dark 固定 | `preview.theme` |
| フォント | ファミリー・サイズ | `preview.fontFamily`, `fontSize` |
| 最大幅 | 本文の最大表示幅 | `preview.maxWidth` |
| スクロール同期 | Raw 切替時に見出しアンカーで位置復元 | `preview.syncScroll` |
| 切替アニメーション | Preview 表示時のフェードイン | `preview.enableTransitions` |
| モード記憶 | ファイルごとに最後のモードを記憶 | `preview.rememberMode` |
| 既定モード | 初回オープン時 Raw or Preview | `preview.defaultMode` |

---

## モード切替

| 操作 | 説明 |
|------|------|
| タイトルバー | Raw 中は `Preview`、Preview 中は `Raw` の 1 ボタン |
| `Cmd+Shift+M` | Raw ↔ Preview トグル |
| 同一タブ切替 | 別タブを開かず `vscode.openWith` で切替 |

スクロール同期: Raw 側の見出しスラッグと Preview の DOM を突き合わせ、切替時に近い位置へ復元（`preview.syncScroll`）。

---

## コマンド

| コマンド ID | 用途 |
|-------------|------|
| `markdownInline.openPreview` | Raw から Preview へ |
| `markdownInline.openRaw` | Preview から Raw へ |
| `markdownInline.togglePreview` | トグル |

---

## 設定一覧

```jsonc
// モード
"markdownInline.preview.defaultMode": "raw",     // raw | preview
"markdownInline.preview.rememberMode": true,
"markdownInline.preview.editable": true,

// 見た目
"markdownInline.preview.theme": "auto",
"markdownInline.preview.fontFamily": "",
"markdownInline.preview.fontSize": 12,
"markdownInline.preview.maxWidth": 800,
"markdownInline.preview.enableTransitions": true,
"markdownInline.preview.showFocusSyntax": true,
"markdownInline.preview.enableSlashMenu": true,

// リッチコンテンツ
"markdownInline.preview.enableMath": true,
"markdownInline.preview.enableMermaid": true,
"markdownInline.preview.showFrontmatter": true,

// Raw との連携
"markdownInline.preview.syncScroll": true
```

Raw モード共通の `markdownInline.enablePreview` が `false` の場合、装飾・画像サムネイル等の Raw 機能も無効になります。

---

## ショートカット

| 機能 | Mac | Windows/Linux |
|------|-----|---------------|
| Raw ↔ Preview 切替 | `Cmd+Shift+M` | `Ctrl+Shift+M` |

書式操作は `/` スラッシュメニューを使用。詳細: [keyboard-shortcuts.md](../user-guide/keyboard-shortcuts.md)

---

## 残タスク

| 項目 | 現状 | これから |
|------|------|----------|
| テーブル編集 | Notion 風グリップで行/列の追加・削除・整列・選択 | セルのドラッグ移動・結合 |
| Frontmatter | 表示のみ | Preview 内での YAML 編集 |
| アクセシビリティ | aria-label 一部 | キーボード・スクリーンリーダー対応 |
| XSS サニタイズ | CSP + Milkdown 依存 | 出力の明示的サニタイズ |
| 統合テスト | なし | 切替・保存・同期の E2E |
| WebView サイズ | ~4MB | Mermaid/KaTeX の遅延ロード |
| Obsidian 互換 | 未対応 | コールアウト、ウィキリンクの WYSIWYG（検討） |

---

## これからの機能

1. テーブル UI 強化 — セルのドラッグ移動・結合（行/列の追加・削除・整列は実装済み）
2. Frontmatter 編集 — パネル上で YAML を直接編集
3. バンドル最適化 — Mermaid / KaTeX の遅延ロード
4. 共同編集プレビュー — 同期基盤完成後のライブ更新（未実装）

Notion / Obsidian との差分: [notion-obsidian-gap.md](../notion-obsidian-gap.md)

---

## 関連ドキュメント

| ファイル | 内容 |
|----------|------|
| [inline-preview-features.md](./inline-preview-features.md) | Raw モード仕様 |
| [implementation-status.md](../implementation-status.md) | 実装マトリクス（開発者向け） |
| [user-guide/getting-started.md](../user-guide/getting-started.md) | クイックスタート |
