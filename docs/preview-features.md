# Preview 機能一覧

最終更新: 2026-06-20  
バージョン: **1.8.3**

**Preview** = Milkdown ベースの **WYSIWYG モード**（Custom Text Editor）の機能です。  
レンダリング結果をそのまま編集し、変更は自動で `.md` ファイルに保存されます。

Inline Preview（Raw モード）の機能は [inline-preview-features.md](./inline-preview-features.md) を参照してください。

---

## 概要

| 項目 | 内容 |
|------|------|
| モード名 | Preview / WYSIWYG モード |
| エンジン | Milkdown（WebView） |
| 記法の表示 | **レンダリング結果**（非フォーカス時）。**フォーカス中のブロック**では `##`・`**`・`[link](url)` 等の記法マーカーを表示 |
| Raw への切替 | タイトルバー `Raw` / `Cmd+Shift+M` |
| 保存 | 編集後 約 200ms でファイルへ自動反映 |

---

## 実装済み機能

### 編集・レンダリング

| 機能 | 説明 |
|------|------|
| CommonMark | 見出し、段落、引用、コード、リンク等 |
| GFM | テーブル、チェックボックス、取り消し線等 |
| WYSIWYG 編集 | レンダリング結果を直接編集 |
| ファイル同期 | 編集内容を Markdown ソースとして保存 |
| Raw → Preview 反映 | Raw 側の変更を約 100ms 後に反映 |
| 循環更新防止 | Raw / Preview 間の無限ループを防止 |
| チェックボックス | クリックでトグル → `- [x]` として保存 |
| Undo / Redo | VS Code 標準のテキスト履歴 |
| フォーカス時記法表示 | カーソルがあるブロックで見出し・強調・リンク等の Markdown 記法を表示 | `preview.showFocusSyntax` |
| スラッシュメニュー | `/` で Raw と同様のコマンド一覧（h1–h6, table, code, quote 等） | `preview.enableSlashMenu` |

### リッチコンテンツ

| 機能 | 説明 | 設定キー |
|------|------|----------|
| シンタックスハイライト | highlight.js（主要言語） | 常時 on |
| KaTeX 数式 | `$...$`（インライン）、`$$...$$`（ブロック） | `preview.enableMath` |
| Mermaid 図 | ` ```mermaid ` コードブロック | `preview.enableMermaid` |
| 画像表示 | `![alt](./path)` のワークスペース相対パス解決。**本文中にフル表示**（下記参照） | 自動 |
| Frontmatter 表示 | YAML を整形パネルで表示（本文は Milkdown） | `preview.showFrontmatter` |

### UI・ナビゲーション

| 機能 | 説明 | 設定キー |
|------|------|----------|
| リンククリック | 相対パス → VS Code でファイルを開く | 常時 |
| 外部リンク | `https://` → 既定ブラウザで開く | 常時 |
| テーマ | VS Code テーマ追従 or light/dark 固定 | `preview.theme` |
| フォント | フォントファミリー・サイズ | `preview.fontFamily`, `fontSize` |
| 最大幅 | 本文の最大表示幅 | `preview.maxWidth` |
| スクロール同期 | Raw 切替時に見出しアンカーで位置復元 | `preview.syncScroll` |
| 切替アニメーション | Preview 表示時のフェードイン | `preview.enableTransitions` |
| モード記憶 | ファイルごとに最後のモードを記憶 | `preview.rememberMode` |
| 既定モード | 初回オープン時 Raw or Preview | `preview.defaultMode` |
| aria-label | ツールバー・編集領域 | 一部 |

### モード切替

| 操作 | 説明 |
|------|------|
| タイトルバー | Raw 中は `Preview`、Preview 中は `Raw` の1ボタンのみ表示 |
| `Cmd+Shift+M` | Raw ↔ Preview トグル |
| 同一タブ切替 | 別タブを開かず `vscode.openWith` で切替 |

---

## 設定一覧

```jsonc
// モード
"markdownInline.preview.defaultMode": "raw",     // raw | preview
"markdownInline.preview.rememberMode": true,
"markdownInline.preview.editable": true,

// 見た目
"markdownInline.preview.theme": "auto",          // auto | light | dark
"markdownInline.preview.fontFamily": "",
"markdownInline.preview.fontSize": 13,
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

---

## ショートカット（Preview 関連）

| 機能 | Mac | Windows/Linux |
|------|-----|---------------|
| Raw ↔ Preview 切替 | `Cmd+Shift+M` | `Ctrl+Shift+M` |

Preview 内の書式操作は `/` スラッシュメニューを使用します。

---

## 残タスク（Preview のみ）

| 項目 | 現状 | これから |
|------|------|----------|
| テーブル編集 | Milkdown 基本編集のみ | 行・列追加 UI、セル操作強化 |
| Frontmatter | 表示のみ | Preview 内での YAML 編集 |
| ツールバー | 削除（スラッシュメニューで代替） | — |
| アクセシビリティ | aria-label 一部 | キーボード操作、スクリーンリーダー対応 |
| XSS サニタイズ | CSP + Milkdown 依存 | 出力の明示的サニタイズ |
| 統合テスト | なし | Preview 切替・保存・同期の E2E |
| WebView サイズ | Mermaid+KaTeX で ~4MB | 遅延ロード・分割バンドル |

---

## これからの機能（Preview）

1. **テーブル UI 強化** — 行/列の追加ボタン、セルフォーカス改善
2. **ツールバー拡張** — リンクダイアログ、箇条書き、番号付きリスト
3. **Frontmatter 編集** — パネル上で YAML を直接編集
4. **Frontmatter 以外のメタデータ** — tags, aliases 等の専用 UI（検討）
5. **バンドル最適化** — Mermaid / KaTeX の遅延ロード
6. **Obsidian 互換** — コールアウト、ウィキリンクの WYSIWYG 表示（検討）
7. **共同編集プレビュー** — 同期基盤完成後のライブ更新表示（[future-roadmap.md](./specifications/future-roadmap.md)）

Notion / Obsidian との機能差分は [notion-obsidian-gap.md](./notion-obsidian-gap.md) を参照。

---

## 関連ドキュメント

| ファイル | 内容 |
|----------|------|
| [inline-preview-features.md](./inline-preview-features.md) | Inline Preview（Raw）専用の機能一覧 |
| [notion-obsidian-gap.md](./notion-obsidian-gap.md) | Notion / Obsidian との差分・未実装一覧 |
| [preview-raw-toggle.md](./specifications/preview-raw-toggle.md) | Preview/Raw 切替の詳細仕様 |
| [implementation-status.md](./implementation-status.md) | 実装マトリクス（開発者向け） |
