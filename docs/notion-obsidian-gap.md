# Notion / Obsidian との機能差分

最終更新: 2026-06-20  
バージョン: **1.8.4**

iPreview が目指すのは「VS Code / Cursor 上で Notion・Obsidian に近い Markdown 体験」です。  
このドキュメントは **まだ入っていない機能** と **すでに入っているもの** を整理します。

---

## Preview で見えるもの（実装済み）

| 機能 | 状態 | 設定 / 備考 |
|------|------|-------------|
| **画像** | ✅ | `![alt](./relative/path.png)` — ワークスペース相対パスを解決して表示。`https://` も可。保存時は元の相対パスに戻す |
| **Mermaid** | ✅ | ` ```mermaid ` コードブロック → 図としてレンダリング | `preview.enableMermaid`（既定: on） |
| **KaTeX 数式** | ✅ | `$...$` / `$$...$$` | `preview.enableMath`（既定: on） |
| **チェックボックス** | ✅ | クリックでトグル、ファイルに `- [x]` 保存 | |
| **テーブル** | 🟡 | GFM テーブルの表示・セル内編集は Milkdown 基本機能 | 行列追加 UI はなし |
| **コードハイライト** | ✅ | highlight.js | |
| **Frontmatter** | 🟡 | YAML を上部パネルに表示 | 編集は Raw の `---` ブロック |
| **スラッシュメニュー** | ✅ | Raw / Preview 両方。`/table` `code` `quote` 等 | `preview.enableSlashMenu`（Preview） |

### 画像・Mermaid の使い方（Preview）

```markdown
![スクリーンショット](./images/sample.png)

```mermaid
graph LR
  A --> B
```

$$E = mc^2$$
```

Preview モードで上記がそのまま表示・編集できます（設定が on の場合）。

### Inline Preview（Raw）での画像

| 機能 | 状態 |
|------|------|
| 行末サムネイル（48px） | ✅ `imagePreview.showThumbnail` |
| ホバー拡大 | ✅ `imagePreview.enabled` |

Raw では Markdown ソースの横に小さなプレビューが付きます。Preview では本文中にフル表示されます。

---

## Notion にあって iPreview にないもの

| カテゴリ | Notion | iPreview 現状 |
|---------|--------|---------------|
| ブロック単位 UI | 1行1ブロック、左の `⋮⋮` ドラッグ | Markdown 行ベース。ブロック ID なし |
| スラッシュコマンド | エディタ内で `/` から何でも挿入 | **Raw のみ**（Preview にはスラッシュメニューなし） |
| データベース | テーブルビュー・カンバン・カレンダー | なし（GFM テーブルのみ） |
| プロパティ | ページ横のメタデータ列 | Frontmatter 表示のみ（Preview）、編集は Raw |
| 埋め込み | YouTube, Twitter, Figma, PDF 等 | なし |
| トグルブロック | 折りたたみ見出し | なし（HTML details も非対応） |
| コールアウト | 色付き callout ブロック | Raw でスラッシュ挿入のみ。Preview では WYSIWYG 未対応 |
| 2カラム / レイアウト | 列分割 | なし |
| コメント・メンション | `@` ユーザー | なし |
| ページ階層 | サイドバーのツリー | VS Code エクスプローラーに依存 |
| テンプレートギャラリー | UI から選んで挿入 | スラッシュの一部テンプレのみ（Raw） |
| リアルタイム共同編集 | 複数人同時編集 | なし（未実装） |
| 同期・クラウド | Notion ホスト | ローカルファイルのみ |
| アイコン・カバー画像 | ページ装飾 | なし |
| 数式 | ブロック数式 | ✅ Preview で KaTeX |
| シンタックス | 各種コードブロック | ✅ Preview でハイライト |

---

## Obsidian にあって iPreview にないもの

| カテゴリ | Obsidian | iPreview 現状 |
|---------|----------|---------------|
| ウィキリンク | `[[ページ]]` 自動補完・バックリンク | 標準 Markdown リンクのみ。`[[ ]]` 専用処理なし |
| グラフビュー | ノート間の関係を可視化 | なし |
| コールアウト | `> [!note]` 等の装飾表示 | Raw ソースのみ。Preview で専用スタイルなし |
| タグペイン | `#tag` の一覧・検索 | VS Code 検索に依存 |
| プロパティ UI | フロントマターを GUI 編集 | Preview は表示のみ |
| キャンバス | 自由配置ボード | なし |
| プラグイン | コミュニティ拡張 | VS Code 拡張エコシステムは別 |
| デイリーノート | 日付ノート自動作成 | なし |
| ブロック参照 | `^block-id` | なし |
| Dataview / Bases | クエリでノート集約 | なし |
| ページプレビュー | リンクホバーで内容表示 | なし（ファイルを開くのみ） |
| Excalidraw 等 | 描画埋め込み | なし |
| Vim モード | 編集キーバインド | VS Code Vim 拡張に依存 |
| ライブプレビュー | 編集しながら WYSIWYG | ✅ Preview モードが相当 |
| Mermaid | 組み込み or プラグイン | ✅ Preview（`enableMermaid`） |
| 数式 | LaTeX | ✅ Preview（`enableMath`） |
| 画像 | 埋め込み表示 | ✅ Preview + Raw サムネイル |

---

## iPreview 独自（Notion / Obsidian にない強み）

| 機能 | 説明 |
|------|------|
| Git 連携 | そのまま `.md` をバージョン管理 |
| VS Code エコシステム | LSP, ターミナル, デバッグ, 他拡張 |
| Raw 精密編集 | パイプ表・記法の直接編集、diff フレンドリー |
| テーブルナビ | Excel 的なセル移動（Raw） |
| TOC 自動更新 | 見出しから目次生成（Raw） |
| 二モード切替 | 同一タブで Raw ↔ Preview（`Cmd+Shift+M`） |

---

## 優先して足すと Notion / Obsidian に近づくもの

### 高インパクト

1. **Preview スラッシュコマンド** — Notion 的な `/` メニューを WYSIWYG 側にも
2. **ウィキリンク `[[ ]]`** — 補完・クリック・バックリンク（Obsidian 核心）
3. **コールアウト WYSIWYG** — `> [!note]` を Preview で色付き表示
4. **リンクホバープレビュー** — ページ内容をポップアップ（Obsidian 的）
5. **Preview テーブル UI** — 行・列の追加ボタン

### 中インパクト

6. **トグル / 折りたたみブロック**
7. **Frontmatter の Preview 内編集**
8. **タグペイン / `#tag` 装飾**
9. **埋め込み**（YouTube, iframe 制限付き）
10. **ブロックドラッグ並べ替え**

### 長期（別プロジェクト寄り）

11. **クラウド同期・共同編集**
12. **データベース / カンバンビュー**
13. **グラフビュー**

---

## スコープ外（実装しない方針）

| 項目 | 理由 |
|------|------|
| `Y:` / `W:` / `T:` ラベル付きリスト | ロードマップから除外。Notion/Obsidian 優先機能に集中 |

---

## 関連ドキュメント

| ファイル | 内容 |
|----------|------|
| [inline-preview-features.md](./inline-preview-features.md) | Raw 機能一覧 |
| [preview-features.md](./preview-features.md) | Preview 機能一覧 |
