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
| テーブル操作（Notion 風） | 行は左端、列は上端のグリップをクリックすると、追加（上下/左右）・削除・整列（列）のラベル付きメニューが開く |
| テーブル挿入 | `/table` は空セルのテーブルを挿入し、カーソルを先頭セルに置く（`Header 1` 等のダミーは入れない） |
| 空行・空セル | 通常の空行／空セルとして保存（`<br />` プレースホルダは出力しない。既存ファイルの `<br />` は読み込み時に正規化） |
| テーブル内改行 | セル内で `Enter` → セル内に改行（GFM では `<br>`）。テーブル下に行は作らない |
| ソフトブレイク表示 | 単一改行（ソフトブレイク）を見た目の改行として表示。保存は `\n` のまま（非破壊） |
| リスト詰め（tight） | 連続するリスト項目の間の空行を除去し、tight なリストにして表示・保存（loose リストを残さない） |
| WYSIWYG 編集 | レンダリング結果を直接編集 |
| ファイル同期 | Markdown ソースとして保存 |
| Raw → Preview 反映 | 約 100ms デバウンス |
| チェックボックス | クリックでトグル → `- [x]` として保存 |
| Undo / Redo | VS Code 標準のテキスト履歴 |
| フォーカス時記法表示 | カーソルブロックで Markdown 記法（`**` `*` 等）を表示（`preview.showFocusSyntax`）。マーカーは本文と同色の薄字で表示（テーマの金色などは使わない）。リスト項目はフォーカス中アイコンを隠し `- ` / `- [ ] ` を表示 |
| URL 貼り付けでリンク化 | テキストを選択して URL を貼ると、選択範囲をリンクにする（テキストは保持） |
| 見出し Backspace 降格 | 見出し先頭で Backspace → 通常行へ（`#` は残して続けて削除可能） |

---

## リッチコンテンツ

| 機能 | 説明 | 設定キー |
|------|------|----------|
| シンタックスハイライト | highlight.js（主要言語）。**編集中は無効**（DOM 書き換えでカーソルが先頭へ飛ぶのを防ぐため、非編集時のみ着色） | 常時 on |
| コードブロック言語選択 | コードブロック右上のドロップダウンで言語（`bash`/`js`/`python` 等）を選択。`language` 属性に保存（` ```js ` 等） | 自動 |
| KaTeX 数式 | `$...$`（インライン）、`$$...$$`（ブロック） | `preview.enableMath` |
| Mermaid 図 | ` ```mermaid ` コードブロック | `preview.enableMermaid` |
| 画像表示 | `![alt](./path)` を本文中に表示。ワークスペース相対パス解決 | 自動 |
| 画像の貼り付け / ドロップ | クリップボード画像やファイルを Preview に貼る/ドロップすると、ドキュメント隣の `assets/` に保存し `![](assets/…)` を挿入 | 自動 |
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
| フォント | ファミリー・サイズ（既定は CJK 対応の比例フォント。等幅だと ASCII と日本語で太さが不揃いに見えるため） | `preview.fontFamily`, `fontSize` |
| 最大幅 | 本文の最大表示幅 | `preview.maxWidth` |
| スクロール同期 | Raw 切替時に見出しアンカーで位置復元 | `preview.syncScroll` |
| 切替アニメーション | Preview 表示時のフェードイン | `preview.enableTransitions` |
| モード記憶 | 最後のモードを全 Markdown ファイル横断で記憶（**双方向**: Preview/Raw どちらに切り替えても、開く/アクティブにした Markdown ファイルへ同じモードを適用） | `preview.rememberMode` |
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
| 段階選択（セル/コードブロック） | `Cmd+A` | `Ctrl+A` |
| Preview 内検索 | `Cmd+F` | `Ctrl+F` |

### Notion 風ブロック変換（`Cmd+Opt+<数字>`）

カーソル位置のブロックを変換する。Raw モードと共通の体系（Raw 側は VS Code キーバインド、Preview 側は WebView 内キーマップで実装）。

| キー | ブロック |
|------|----------|
| `Cmd+Opt+0` | 本文（段落） |
| `Cmd+Opt+1` | 見出し H1 |
| `Cmd+Opt+2` | 見出し H2 |
| `Cmd+Opt+3` | 見出し H3 |
| `Cmd+Opt+4` | チェックボックス（ToDo） |
| `Cmd+Opt+5` | 箇条書きリスト |
| `Cmd+Opt+6` | 番号付きリスト |
| `Cmd+Opt+8` | コードブロック（Preview のみ） |
| `Cmd+Opt+9` | 引用（Preview のみ） |

Windows/Linux は `Alt+Ctrl+<数字>`。

### `Cmd+A`（段階選択）

- **テーブルセル内**: セル内容 → テーブルの全セル選択（CellSelection）→ ドキュメント全体。
- **コードブロック内**: ブロック内容 → ドキュメント全体。
- それ以外: 通常の全選択。

### `Cmd+F`（Preview 内検索）

WebView 内に検索バーを表示し、レンダリング結果のテキストを検索する。一致箇所を CSS Custom Highlight API でハイライト（DOM 非破壊）。`Enter`/`Shift+Enter` で次/前へ、`Esc` で閉じる。

書式操作は `/` スラッシュメニューも使用可。詳細: [keyboard-shortcuts.md](../user-guide/keyboard-shortcuts.md)

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

---

## リッチエディタ化ロードマップ

「リッチで使いやすいエディタ」にするための施策一覧。優先度 高 → 中 → 低。
（このセクションは継続的に追記していく作業リスト）

### 入力・ブロック操作

| 項目 | 内容 | 優先 |
|------|------|------|
| ブロックのドラッグ並べ替え | 行頭グリップ（⠿）で段落・リスト・見出しを掴んで移動 | 高 |
| ペーストの賢い変換 | URL ペースト → 選択をリンク化（実装済み ✅）。HTML → Markdown、コード片保持は今後 | 中 |
| 画像のドラッグ&ドロップ / 貼り付け（実装済み） | クリップボード画像/ファイルを `assets/` に保存し `![](assets/…)` 挿入 | ✅ |
| 画像リサイズ | ハンドルで幅指定（`![]( ){width=...}` 等の拡張） | 低 |
| Markdown 直接ペースト | クリップボードの Markdown をパースして挿入 | 中 |
| 取り消し・やり直しの粒度改善 | IME 確定・装飾単位での履歴 | 中 |

### テーブル

| 項目 | 内容 | 優先 |
|------|------|------|
| セル内改行（実装済み） | セル内 Enter で `<br>` を挿入 | ✅ |
| 列幅ドラッグ | 境界ドラッグで列幅変更（columnResizing の UI 表面化） | 中 |
| セル結合・分割 | colspan/rowspan（標準 Markdown では非対応 → 拡張記法検討） | 低 |
| CSV/TSV 貼り付け → 表 | 表データを貼ると自動でテーブル化 | 中 |

### スラッシュ・コマンド

| 項目 | 内容 | 優先 |
|------|------|------|
| コマンド拡充 | callout 種別、トグル/折りたたみ、目次、日付、絵文字、区切り | 高 |
| アイコン・説明付き表示 | 各コマンドにアイコンとプレビュー | 中 |
| 最近使った項目 | 利用頻度順の並べ替え | 低 |

### インライン・記法

| 項目 | 内容 | 優先 |
|------|------|------|
| リンク編集ツールチップ | リンクにホバー/フォーカスで URL 編集・解除 UI | 高 |
| ソフトブレイク表示（実装済み） | 単一改行を見た目の改行として表示（保存は `\n` のまま） | ✅ |
| 絵文字ピッカー | `:` 入力で候補表示 | 低 |
| `@` メンション / `#` タグ | 補完と装飾 | 低 |
| 脚注・定義リスト | `[^1]` 等のサポート | 中 |
| Obsidian コールアウト / Wiki リンク | `> [!note]`、`[[link]]` の WYSIWYG | 中 |

### 体験・パフォーマンス

| 項目 | 内容 | 優先 |
|------|------|------|
| Find（実装済み ✅）/ Replace | `Cmd+F` 検索は実装済み。置換は今後 | 中 |
| 保存状態インジケータ | 保存中/保存済みの可視化 | 中 |
| コードブロック強化 | 言語ピッカー（実装済み ✅）。コピーボタン、行番号、編集中ハイライトは今後 | 中 |
| 遅延ロード | Mermaid / KaTeX を必要時のみ読み込みバンドル削減 | 中 |
| 大規模文書の仮想化 | 画面外ブロックの描画スキップ | 低 |
| アクセシビリティ | キーボード操作、ARIA、スクリーンリーダー対応 | 中 |

---

## 関連ドキュメント

| ファイル | 内容 |
|----------|------|
| [inline-preview-features.md](./inline-preview-features.md) | Raw モード仕様 |
| [developer/architecture.md](../developer/architecture.md) | アーキテクチャ概要（開発者向け） |
| [README.md](../README.md) | ドキュメント目次 |
