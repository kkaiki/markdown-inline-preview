# アーキテクチャ概要

最終更新: 2026-06-21

機能仕様は [preview-features.md](../specifications/preview-features.md) / [inline-preview-features.md](../specifications/inline-preview-features.md) を参照。

---

## システム構成（現行）

1 パッケージ・**2 ランタイム**:

| モード | エントリ | 実行環境 |
|--------|----------|----------|
| **Raw** | `src/raw/activate.ts` | Extension Host |
| **Preview** | `src/preview/activate.ts` → `preview/host/previewPanel.ts` | Extension Host + WebView |

```
src/
├── extension.ts              # 薄いエントリ（raw + preview を起動）
├── core/                     # ランタイム状態・設定解決（vscode 非依存部分あり）
├── shared/                   # Raw / Preview 共有（markdown, slash, table, toc）
├── raw/                      # TextEditor + Decoration + コマンド
│   ├── activate.ts
│   ├── decorations/
│   ├── list/ · table/
│   ├── completion/           # スラッシュ補完・適用
│   └── handlers/             # ドキュメント/選択/設定イベント
└── preview/
    ├── host/                 # CustomTextEditorProvider, HTML, 同期
    └── webview/              # milkdownApp.ts（esbuild → media/milkdown.bundle.js）
```

ビルド出力: `out/`（Extension Host）、`media/milkdown.bundle.js`（WebView）。

---

## Raw: イベントフロー

```
onDidChangeTextDocument
  ├── コードブロック ``` 自動補完（設定 ON 時）
  ├── debounce 50ms → updateAllDecorations()
  └── 見出し変更 → debounce 500ms → TOC 自動更新

onDidChangeTextEditorSelection
  ├── 行変更 → 前行テーブル整形（autoFormatTables）
  ├── チェックボックス領域クリック → toggle
  └── currentEditingLine 更新 → 装飾再計算

onDidChangeConfiguration → 装飾タイプ再構築・再適用
```

設定は `core/markdownInlineSettings.ts` で解決し、`raw/settings.ts` が vscode ラッパーを提供。

---

## Preview: データフロー

```
TextDocument (Markdown)
  ↔ debounce 200ms ↔ Milkdown WebView (milkdownApp.ts)
  ↔ debounce 100ms ↔ Raw 側の外部変更を WebView に push

WebView プラグイン例:
  focusSyntaxPlugin      # フォーカスブロックで ## ** 等を表示
  headingBackspacePlugin # 見出し先頭 Backspace → #text 段落へ
  previewSlashMenu       # / メニュー（shared/slash/slashMenuItems）
```

---

## 装飾（Raw）

`raw/decorations/factory.ts` が `TextEditorDecorationType` を生成。  
見出しスキームは `headingSchemes.ts`。画像サムネ・テーブル折り返しも Decoration。

---

## コマンド登録

`raw/commands/` — `package.json` の `contributes.commands` と対応。  
スラッシュ定義の単一ソース: `shared/slash/slashMenuItems.ts`。

---

## パフォーマンス

| 処理 | デバウンス |
|------|-----------|
| 装飾更新 | 50ms |
| TOC 自動更新 | 500ms |
| Preview → ファイル | 200ms |
| Raw → Preview 反映 | 100ms |

---

## 拡張の追加方法

| 追加したいもの | 触る場所 |
|---------------|----------|
| Raw コマンド | `raw/commands/` + `package.json` contributes |
| 装飾 | `raw/decorations/` + `updateAllDecorations` |
| スラッシュ項目 | `shared/slash/slashMenuItems.ts` |
| Preview 挙動 | `preview/webview/*.ts` + `build:webview` |
| 共有ロジック | `shared/`（vscode 非依存を維持） |
