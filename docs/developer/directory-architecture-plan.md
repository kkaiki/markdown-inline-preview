# ディレクトリ構成計画

**作成日**: 2026-06-20  
**対象**: markdown-inline-preview（iPreview）  
**関連ドキュメント**:

- [architecture.md](./architecture.md) — イベントフロー・装飾の挙動（一部古い記述あり）
- [../refactoring-plan.md](../refactoring-plan.md) — Phase 1–4 完了までの履歴
- [../current-status-audit.md](../current-status-audit.md) — 実装済み機能の棚卸し
- [../specifications/preview-raw-toggle.md](../specifications/preview-raw-toggle.md) — Preview / Raw 設計

---

## 1. 前提：2つの編集モード

本拡張は **1パッケージ・2ランタイム** です。ディレクトリ設計はこの境界を軸にします。

| モード | UI名 | 実装 | 実行環境 |
|------|------|------|----------|
| **Raw** | Raw | 通常 `TextEditor` + `TextEditorDecoration` | Extension Host のみ |
| **Preview** | Preview | `CustomTextEditorProvider` + Milkdown WebView | Extension Host + Browser |

用語の注意:

- 設定 `markdownInline.enablePreview` は **Preview モードではなく Raw のインライン装飾** の ON/OFF
- 製品名の "Inline Preview" は歴史的に Raw 装飾を指すが、現在は Preview（WYSIWYG）も含む

```
┌─────────────────────────────────────────────────────────────┐
│  extension.ts（薄いエントリ）                                │
├──────────────────────────┬──────────────────────────────────┤
│  raw/                    │  preview/                         │
│  TextEditor 編集体験      │  WebView WYSIWYG                  │
│  decorations, providers  │  host + webview bundle            │
├──────────────────────────┴──────────────────────────────────┤
│  shared/  … Extension Host と WebView の両方で使える純粋ロジック │
│  core/    … 設定・型・Extension 専用の共通基盤                │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 現状（2026-06-20 時点）

### 2.1 ディレクトリツリー

```
markdown-inline-preview/
├── src/
│   ├── extension-markdown-inline.ts   # ★ 約 2,470 行。activate・装飾・イベントの大半
│   ├── commands/                      # ✅ コマンド登録・ハンドラ（Raw）
│   ├── decorations/                   # △ 一部のみ抽出（heading, image, tableWrap）
│   ├── providers/                     # ✅ CodeLens / Hover（Raw）
│   ├── utils/                         # ✅ ドメインロジック（主に Raw、一部 Preview も利用）
│   ├── types/                         # ✅ 型定義（主に Raw / commands 向け）
│   └── webview/
│       ├── previewPanel.ts            # Preview ホスト側
│       ├── milkdownApp.ts             # Preview ブラウザ側（esbuild 単独バンドル）
│       └── types.ts                   # WebView メッセージ型
├── media/                             # CSS + milkdown.bundle.js
├── test/suite/
├── commands/                          # ⚠ 旧 JS 残骸（src/ 移行前）
└── utils/                             # ⚠ 旧 JS 残骸（patterns.js のみ）
```

### 2.2 ビルド構成

| 対象 | ツール | 出力 | 備考 |
|------|--------|------|------|
| Extension Host | `tsc` | `src/*.js`（`outDir: ./src`） | `milkdownApp.ts` は exclude |
| WebView | `esbuild` | `media/milkdown.bundle.js` | ブラウザ向け IIFE |
| 型チェック（WebView） | `tsconfig.webview.json` | emit なし | DOM lib 使用 |

### 2.3 コード共有の現状

| モジュール | Raw | Preview ホスト | Preview WebView |
|-----------|-----|----------------|-----------------|
| `utils/patterns.ts` 等 | ○ | △（scrollAnchor 経由） | × |
| `utils/frontmatter.ts` | △ | ○ | × |
| `utils/markdownAssets.ts` | △ | ○ | × |
| `utils/scrollAnchor.ts` | ○ | ○ | ×（slug は webview 内で重複） |
| `webview/types.ts` | × | ○ | ○ |

**`share/` ディレクトリは存在しない。** 共用は `src/utils/` に寄せているが、名前が「汎用 utils」に見えるため、今後の拡張では役割を分けた方がよい。

### 2.4 主な課題

1. **`extension-markdown-inline.ts` が God ファイル** — 装飾定義・更新・TOC・スラッシュ補完・イベント購読が集中
2. **Raw / Preview の境界がディレクトリ名に出ていない** — `webview/` は Preview 専用だが、Raw 側に相当するまとまりがない
3. **WebView と Host でロジックが重複しうる** — 例: `slugify` / `scrollAnchor`
4. **レガシー残骸** — ルート `commands/`, `utils/` が残存
5. **`outDir: ./src`** — `.ts` と `.js` が同居し、見通しが悪い（将来的に `out/` へ）

---

## 3. 目標ディレクトリ構成

`share` という名前は使わず、**役割で名前を付ける** 方針とする。

```
src/
├── extension.ts                 # エントリ（activate / deactivate のみ、~100 行目標）
│
├── core/                        # Extension Host 全体の基盤
│   ├── config.ts                # getMarkdownInlineConfig, 設定ヘルパの再エクスポート
│   ├── context.ts               # 装飾・タイマー・編集状態のコンテナ（Phase 6）
│   ├── debug.ts                 # debugLog / OutputChannel
│   └── index.ts
│
├── shared/                      # ランタイム非依存の純粋ロジック（★ 新設）
│   ├── markdown/
│   │   ├── patterns.ts          # utils/patterns から移動
│   │   ├── frontmatter.ts
│   │   ├── slug.ts              # generateSlug / slugify を統合
│   │   └── inlineEmphasis.ts
│   ├── structure/
│   │   ├── toc.ts               # 見出し収集・TOC 生成
│   │   ├── scrollAnchor.ts
│   │   └── list.ts
│   ├── table/
│   │   ├── table.ts
│   │   ├── width.ts
│   │   └── tableWrap.ts
│   └── index.ts                 # バレルエクスポート
│
├── raw/                         # Raw モード専用（旧「インライン preview」本体）
│   ├── activate.ts              # Raw 側の activate 処理を集約
│   ├── decorations/
│   │   ├── index.ts             # updateAllDecorations のオーケストレーション
│   │   ├── heading.ts
│   │   ├── checkbox.ts
│   │   ├── codeBlock.ts
│   │   ├── horizontalRule.ts
│   │   ├── inlineEmphasis.ts
│   │   ├── imageInline.ts
│   │   └── tableWrapInline.ts
│   ├── providers/
│   │   ├── checkboxCodeLens.ts
│   │   ├── imageHover.ts
│   │   └── tableWrapHover.ts
│   ├── commands/                # 現 src/commands/ を移動
│   │   ├── index.ts
│   │   ├── list.ts
│   │   ├── table.ts
│   │   ├── navigation.ts
│   │   └── toc.ts
│   ├── completion/
│   │   └── slashCommands.ts     # スラッシュ補完 provider
│   └── handlers/
│       ├── onDidChangeTextDocument.ts
│       ├── onDidChangeSelection.ts
│       └── onDidChangeActiveEditor.ts
│
├── preview/                     # Preview モード専用（現 webview/ をリネーム・整理）
│   ├── activate.ts              # activatePreviewFeature
│   ├── host/
│   │   ├── previewPanel.ts      # CustomTextEditorProvider
│   │   ├── scrollSync.ts        # ratio / anchor の受け渡し
│   │   └── markdownTransform.ts # 画像 URI・frontmatter（Host 専用）
│   ├── webview/
│   │   ├── milkdownApp.ts
│   │   ├── scroll.ts            # scrollToAnchor, findVisibleAnchor
│   │   └── types.ts             # postMessage 型
│   └── assets/                  # 参照用（実体は media/ にビルド出力）
│
├── types/                       # Extension Host 向けの VS Code 依存型
│   └── index.ts
│
└── (廃止予定)
    ├── extension-markdown-inline.ts
    └── utils/                   # → shared/ + core/ に分割後削除
```

### 3.1 ディレクトリの責務ルール

| ディレクトリ | 入れてよいもの | 入れてはいけないもの |
|-------------|---------------|---------------------|
| `shared/` | 純関数、正規表現、文字列処理、DocumentLike 抽象 | `vscode` import、`document.getElementById` |
| `core/` | 設定読み取り、ログ、Extension ライフサイクル状態 | Raw / Preview 固有 UI |
| `raw/` | TextEditorDecoration、コマンド、Hover | Milkdown / WebView |
| `preview/` | CustomEditor、postMessage、Milkdown | TextEditorDecoration |
| `types/` | インターフェース・型エイリアス | 実装ロジック |

### 3.2 WebView との `shared/` 共有方針

WebView は Node の `vscode` を使えないため、共有方法は **段階的に** 選ぶ。

| 段階 | 方法 | 向いているケース |
|------|------|-----------------|
| A（現状維持可） | Host のみ `shared/` を import。WebView は必要最小限をローカル実装 | slug 1 関数など小さい重複 |
| B（推奨・中期） | `esbuild --bundle` で `shared/markdown/slug.ts` 等を WebView に inject | slug, frontmatter パース |
| C（将来） | `shared/` 用の小さな esbuild エントリ `shared/browser.ts` を追加 | 共有範囲が広がったとき |

**当面は A → B** とし、`shared/` にはブラウザ安全なコードだけ置く（`path`, `fs` 禁止）。

---

## 4. 段階的移行計画

各 Phase は **独立してマージ可能** にする。完了条件に `npm run lint:error && npm run compile && npm run test:unit` を必ず含める。

---

### Phase 0: 足場の固定（1 PR・低リスク）

**目的**: 以降の移動を安全にする。

| 作業 | 詳細 |
|------|------|
| レガシー削除 | ルート `commands/`, `utils/` を削除（`src/` が正） |
| ドキュメント更新 | `architecture.md` の古いパス記述を修正 |
| エイリアス確認 | `package.json` の `"main"` がビルド後も有効か確認 |

**完了条件**: テスト全通過、ルートに重複 JS がない。

---

### Phase 1: `shared/` の新設と utils の移動（2–3 PR）

**目的**: 共用ロジックの置き場を明確化。Preview / Raw 両方から参照しやすくする。

#### Step 1-1: ブラウザ共有可能なモジュールから

```
src/utils/toc.ts          → src/shared/structure/toc.ts
src/utils/scrollAnchor.ts → src/shared/structure/scrollAnchor.ts
```

- `src/utils/index.ts` から **再エクスポート** して既存 import を壊さない
- テストの import パスは後回しで可（バレル経由）

#### Step 1-2: 残りの utils を分類して移動

| 現ファイル | 移動先 |
|-----------|--------|
| `patterns.ts`, `inlineEmphasis.ts` | `shared/markdown/` |
| `frontmatter.ts` | `shared/markdown/` |
| `list.ts` | `shared/structure/` |
| `table.ts`, `width.ts`, `tableWrap.ts` | `shared/table/` |
| `slashCommands.ts` | `raw/completion/`（Raw 専用） |
| `markdownAssets.ts` | `preview/host/markdownTransform.ts`（Preview 専用） |
| `settings.ts` | `core/config.ts` |

#### Step 1-3: slug の統合

- `shared/markdown/slug.ts` に `generateSlug` を集約
- `milkdownApp.ts` 内の `slugify` を削除し、esbuild で `slug.ts` をバンドル（Phase 1 完了時 or Phase 4 で可）

**完了条件**: `utils/` が空または再エクスポートのみ。挙動変更なし。

---

### Phase 2: `raw/decorations/` の抽出（3–5 PR）

**目的**: God ファイルから装飾を切り出す（旧 refactoring-plan Phase 5 の完遂）。

推奨 PR の分割:

| PR | 移動するもの | 目安行数 |
|----|-------------|---------|
| 2a | `codeBlockDecoration` + `updateCodeBlockDecorations` | ~200 |
| 2b | `horizontalRuleDecoration` + 更新 | ~100 |
| 2c | checkbox / strikethrough 装飾 | ~250 |
| 2d | inline emphasis 装飾 | ~150 |
| 2e | `decorations/index.ts` に `updateAllDecorations` を集約 | ~100 |

各 PR で:

1. 装飾 `createTextEditorDecorationType` を専用ファイルへ
2. 対応する `updateXxxDecorations(editor)` を同ファイルへ
3. `extension-markdown-inline.ts` から呼び出しのみ残す

**完了条件**: 装飾定義が `raw/decorations/` に集約。`decorationTheme.test.ts` がパス。

---

### Phase 3: イベントハンドラの抽出（2 PR）

**目的**: activate からイベント購読ブロックを分離。

```
raw/handlers/
├── onDidChangeTextDocument.ts   # デバウンス・装飾・TOC・コードブロック補完
├── onDidChangeSelection.ts      # テーブル整形・チェックボックスクリック
└── registerRawListeners.ts      # まとめて subscriptions に push
```

**完了条件**: `extension-markdown-inline.ts` が 1,500 行以下。

---

### Phase 4: `preview/` へのリネームと整理（1–2 PR）

**目的**: Preview 関連を一箇所にまとめ、名前でモードが分かるようにする。

| 現パス | 新パス |
|--------|--------|
| `src/webview/previewPanel.ts` | `src/preview/host/previewPanel.ts` |
| `src/webview/milkdownApp.ts` | `src/preview/webview/milkdownApp.ts` |
| `src/webview/types.ts` | `src/preview/webview/types.ts` |

- `package.json` の esbuild パス、`tsconfig.webview.json` の include を更新
- `preview/activate.ts` を新設し `extension.ts` から呼ぶ

**完了条件**: `src/webview/` 削除。Preview 機能の手動スモーク（Raw ↔ Preview 切替）OK。

---

### Phase 5: `core/context.ts` による状態整理（2 PR）

**目的**: グローバル変数を減らしテスト容易性を上げる（旧 Phase 6）。

```typescript
// core/context.ts（イメージ）
export class RawEditorContext {
    readonly decorations = new DecorationRegistry();
    readonly timers = new DebounceTimers();
    editingLine = -1;
    isDragging = false;
}
```

移行順:

1. 装飾タイプの `let xxxDecoration` を `DecorationRegistry` へ
2. `updateTimer` / `tocUpdateTimer` を `DebounceTimers` へ
3. `extension-markdown-inline.ts` のトップレベル `let` を削除

**完了条件**: グローバル `let` が `core/` と `RawEditorContext` インスタンスのみ。

---

### Phase 6: エントリの薄型化（1 PR）

**目的**: メインファイルを `extension.ts` に置き換え。

```typescript
// src/extension.ts
export function activate(context: vscode.ExtensionContext): void {
    const ctx = createExtensionContext(context);
    activateRawMode(ctx);
    activatePreviewMode(ctx);
}
export function deactivate(): void {
    disposeExtensionContext();
}
```

- `package.json` の `"main"` を `./src/extension.js` に変更
- `extension-markdown-inline.ts` を削除

**完了条件**: エントリ ~100 行。全テスト・VSIX パッケージ成功。

---

### Phase 7（任意）: ビルド出力の整理

**目的**: `src/` に `.js` を混在させない。

| 変更 | 影響 |
|------|------|
| `outDir: "./out"` | `package.json` main パス、テスト runner の調整が必要 |
| `.gitignore` で `src/**/*.js` を除外 | 現状コミットされている `.js` の扱いを決める |

リスクが高いため **機能移行完了後** に実施。別 Phase として切り出す。

---

## 5. 移行時のルール（チーム合意用）

1. **1 PR = 1 つの移動単位** — リネームとロジック変更を混ぜない
2. **再エクスポートで互換を保つ** — `utils/index.ts` → `shared/index.ts` への段階的リダイレクト
3. **テストを先に足す** — 移動前に対象関数のユニットテストがない場合は追加
4. **pre-commit を通す** — `lint:error` / `compile` / `test:unit`
5. **`shared/` 禁止事項** — `vscode` / `path`（Node）/ DOM API の混在禁止。必要なら Host 側ラッパに分離

---

## 6. 判断に迷ったときの早見表

| 質問 | 置き場所 |
|------|----------|
| 正規表現で Markdown 行をパースする | `shared/markdown/` |
| `TextEditorDecorationType` を作る | `raw/decorations/` |
| Milkdown のプラグイン | `preview/webview/` |
| 画像パスを `webview.asWebviewUri` に変換 | `preview/host/` |
| `markdownInline.*` コマンドを登録 | `raw/commands/` |
| 設定 `getConfiguration` | `core/config.ts` |
| Raw と Preview の両方で使う slug / TOC | `shared/`（WebView は esbuild で取り込み） |

---

## 7. マイルストーン一覧

| Phase | 成果物 | 目安 | 優先度 |
|-------|--------|------|--------|
| 0 | レガシー削除・足場固定 | 0.5 日 | 高 |
| 1 | `shared/` 新設 | 2–3 日 | 高 |
| 2 | `raw/decorations/` 完遂 | 3–5 日 | 高 |
| 3 | イベントハンドラ抽出 | 1–2 日 | 中 |
| 4 | `preview/` 整理 | 1 日 | 中 |
| 5 | `core/context.ts` | 2 日 | 中 |
| 6 | `extension.ts` 薄型化 | 0.5 日 | 中 |
| 7 | `out/` ビルド移行 | 1 日 | 低 |

---

## 8. 現状から見た「やらないこと」

- **`share/` という名前のディレクトリは作らない** — `shared/` で十分明確
- **いきなり全ファイルを移動しない** — God ファイルを一度に解体するとレビュー不能
- **WebView に `vscode` を import しない** — バンドル事故の元
- **Preview と Raw で別々の TOC 実装を増やさない** — `shared/structure/toc.ts` に集約

---

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-06-20 | 初版作成（現状棚卸し + 目標構成 + Phase 0–7） |
| 2026-06-20 | **Phase 1 仕上げ + Phase 7** — slug 共有、ビルド出力 `out/` |
| 2026-06-20 | **Phase 3, 5** — handlers 抽出、core/runtime + debug |

---

## 実施済み（2026-06-20）

| Phase | 状態 | 内容 |
|-------|------|------|
| 0 | ✅ | ルート `commands/`, `utils/` 削除 |
| 1 | ✅ | `shared/`, `core/` 新設。`utils/` は再エクスポート層に |
| 2 | ✅ | 装飾を `raw/decorations/`（factory, state, updaters）へ抽出 |
| 3 | ✅ | `raw/handlers/` へイベントハンドラ抽出、`core/runtime.ts` + `core/debug.ts` |
| 4 | ✅ | `webview/` → `preview/`（host + webview） |
| 5 | ✅ | タイマー・ドラッグ状態を `core/runtime.ts` へ（装飾状態は `raw/decorations/state.ts`） |
| 6 | ✅ | `extension.ts` エントリ + `raw/activate.ts` 本体 |
| 1 仕上げ | ✅ | WebView が `shared/markdown/slug.ts` を esbuild バンドル |
| 7 | ✅ | `outDir: out/`、`main: ./out/extension.js` |

### 現在のディレクトリ（抜粋）

```
src/                          # TypeScript ソースのみ
├── extension.ts              # エントリ（activate/deactivate を re-export）
├── core/
│   ├── config.ts
│   ├── markdownInlineSettings.ts
│   ├── runtime.ts
│   └── debug.ts
├── shared/{markdown,structure,table}/
├── raw/
│   ├── activate.ts
│   ├── handlers/
│   ├── commands/
│   ├── decorations/
│   ├── providers/
│   ├── completion/
│   ├── list/                   # smartEnter, toggle, indent, convert, renumber, moveLine
│   ├── table/                  # formatTableAtLine（shared/table 利用）
│   ├── toc/                    # updateTableOfContents
│   └── settings.ts             # markdownInline 設定ヘルパー
├── preview/
│   ├── host/
│   └── webview/              # milkdownApp → shared/{frontmatter,scrollAnchor}
├── types/
└── utils/                    # 後方互換の再エクスポート

out/                          # tsc ビルド出力（package.json main）
├── extension.js
├── raw/
├── shared/
└── preview/
```

### 残タスク（次の PR 候補）

1. **`utils/` 再エクスポート層の縮小**: 本番コードの `utils` import を `shared/` / `core/` / `raw/` へ移行後、層を削除検討
2. **レガシーテスト整理**: `tableOfContents.test.ts` などソース複製ベースのテストを `shared/` 直参照へ

### 2026-06-21 追記（slash 統一 / テスト import 移行）

| 項目 | 状態 | 内容 |
|------|------|------|
| Raw スラッシュ補完 | ✅ | `slashCompletion.ts` が `shared/slash/slashMenuItems` を利用 |
| テスト import | ✅ | `utils/` 依存 9 ファイル → `shared/` / `core/` / `raw/` / `preview/host/` |
| slash テスト | ✅ | `slashMenuItems.test.ts` 追加 |

### 2026-06-21 追記（設定 core 化 / scrollAnchor 共有）

| 項目 | 状態 | 内容 |
|------|------|------|
| 設定解決 | ✅ | `core/markdownInlineSettings.ts` — vscode 非依存の `resolve*` 関数 |
| `raw/settings.ts` | ✅ | vscode ラッパー + `applyMarkdownSettings` / `rebuildHeadingDecorations` のみ |
| scrollAnchor 共有 | ✅ | `createScrollAnchor`, `headingMatchesScrollAnchor` — WebView がバンドル |
| `ScrollAnchorPayload` | ✅ | `shared/structure/scrollAnchor.ScrollAnchor` の型エイリアス |

### 2026-06-20 追記（TOC / スラッシュ / テーブル / リスト / WebView）

| 項目 | 状態 | 内容 |
|------|------|------|
| TOC | ✅ | `raw/toc/updateTableOfContents.ts` — `shared/structure/toc.ts` を利用 |
| スラッシュコマンド適用 | ✅ | `raw/completion/applySlashCommand.ts` |
| テーブル整形 | ✅ | `raw/table/formatTableAtLine.ts` — `shared/table/table.ts` を利用 |
| リスト操作 | ✅ | `raw/list/`（smartEnter, toggle, indent, convert, renumber, moveLine） |
| 設定ヘルパー | ✅ | `raw/settings.ts` |
| WebView 共有 | ✅ | `milkdownApp.ts` が `shared/markdown/frontmatter.ts` をバンドル |
| `activate.ts` | 約 1,390 行 → **約 120 行**（配線のみ） |
