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

## レイヤー境界（ヘキサゴナル）

ポート&アダプタで整理する。詳細と決定理由は [ADR-0001](./adr/0001-hexagonal-shared-core.md)。

| レイヤー | ディレクトリ | 依存してよいもの |
|----------|--------------|------------------|
| **中心（純粋コア）** | `src/shared/**` | 標準ライブラリのみ。**`vscode` 禁止**（型も）。**Milkdown は実体禁止・型のみ可** |
| アダプタ（Raw） | `src/raw/**` | `vscode`、`shared` |
| アダプタ（Preview ホスト） | `src/preview/host/**` | `vscode`、`shared` |
| アダプタ（Preview WebView） | `src/preview/webview/**` | `@milkdown/*`、`shared` |
| 合成ルート | `src/raw/activate.ts` | 全層を組み立て注入 |

この境界は **eslint（`@typescript-eslint/no-restricted-imports`、`src/shared/**` 限定）で機械的に
強制**される。違反すると `npm run lint` が失敗する。`shared` は両ランタイム（Node / ブラウザ）から
import されるため、フレームワーク非依存を保つことが必須。

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
