# Live モード — Obsidian と同じ操作感の Markdown 編集モード

VS Code 上で **Obsidian の Live Preview と同じ操作感**を実現する、3つ目のモードの設計文書群。

## 文書構成

| 文書 | 内容 |
|---|---|
| [obsidian-observed-spec.md](obsidian-observed-spec.md) | **実測仕様**。Obsidian 1.13.4 を CDP 接続で総当たり調査した結果。要素ごとの展開規則・キー操作の実測値 |
| [requirements.md](requirements.md) | **要件定義**。MUST / SHOULD / WON'T、受け入れ基準、テスト計画、未決事項 |
| [architecture.md](architecture.md) | **実装方針**。CodeMirror 6 を webview に載せる構成、同期方式、段階的な実装計画 |

## 3行まとめ

1. Obsidian の Live Preview は **Markdown をいっさい変換せず**、生テキストに装飾を重ねているだけ。
   だから記法の展開/収縮でカーソルもファイル内容もズレない。
2. 記法の展開スコープは要素ごとに **トークン / 行 / ブロック / 常時変換** の4種類。
   インライン記法は `from <= cursor <= to`（両端含む）という厳密な境界を持つ。
3. したがって Live モードは **CodeMirror 6 + decoration** で作る。
   既存 Preview（Milkdown/ProseMirror）とは思想が違うので、置き換えずに並存させる。

## 3つのモードの位置づけ

| モード | 実装 | ドキュメントモデル | 記法の扱い |
|---|---|---|---|
| **Raw** | VS Code 標準エディタ + decoration | 生 Markdown | 常に表示。装飾のみ |
| **Preview** | webview + Milkdown (ProseMirror) | ノードツリー（往復変換） | 常に実テキスト表示（`4af4491` でフォーカス展開を廃止） |
| **Live モード**（新規） | webview + CodeMirror 6 | 生 Markdown | **カーソル位置で展開/収縮**（Obsidian と同一） |

## 実装状況

| Phase | 内容 | 状態 |
|---|---|---|
| 0 | CM6 の器・host 差分同期・バイト不変 | **完了**（2026-08-05） |
| 1 | 展開スコープ判定・見出し・インライン記法・リンク | **完了**（2026-08-05） |
| 2 | リスト・チェックボックス・引用・キーマップ（Enter/Home/Tab） | **完了**（2026-08-05） |
| 3 | コードフェンス（ブロックスコープ・言語ラベル・背景） | **完了**（2026-08-05）※言語別シンタックスハイライトは未着手 |
| 4 | 表（実 table 描画） | **完了**（2026-08-05） |
| 4.5 | 見た目の調整（組版・引用の視認性・リストの揃え） | **完了**（2026-08-05） |
| 5 | ブロックウィジェット（hr / 数式 / コールアウト）・画像・インライン数式・frontmatter | **完了**（2026-08-05） |
| 6 | 行番号ガター・IME・パフォーマンス | **完了**（2026-08-05） |
| 4b | 表のセル内直接編集（Obsidian と同じ「畳んだまま編集」） | **完了**（2026-08-05） |
| 6b | Git 差分ガター（Obsidian 由来ではない独自機能） | **完了**（2026-08-05） |

### 使い方（現時点）

コマンドパレットから **`Markdown Inline Preview: Live`**（`markdownInline.openLive`）。
Raw との往復は **`Toggle Live / Raw`**（`markdownInline.toggleLive`）。

```bash
npm run build:livewebview   # webview バンドル（media/live.bundle.js）
npm run test:unit           # 純関数テスト
npm run test:browser        # 実 Chromium での統合テスト
```

### 実装ファイル

| ファイル | 役割 |
|---|---|
| `src/live/shared/revealScope.ts` | 展開スコープ判定（**Live モードの中核**） |
| `src/live/shared/syntaxRanges.ts` | 生 Markdown → 記法トークン範囲の走査 |
| `src/live/shared/documentSync.ts` | 差分 ⇄ 行/桁の変換・エコーバック抑止 |
| `src/live/shared/liveEditing.ts` | Enter / スマートホームの解決（純関数） |
| `src/live/webview/liveDecorations.ts` | CM6 decoration の組み立て・チェックボックスウィジェット |
| `src/live/webview/liveKeymap.ts` | Enter / Home / Tab のキーバインド |
| `src/live/webview/liveLineNumbers.ts` | 行番号ガター（畳まれたブロックは先頭のソース行番号） |
| `src/live/webview/liveDiffGutter.ts` | Git 差分ガター（追加=緑 / 変更=青 / 削除=赤三角） |
| `src/live/shared/tableCells.ts` | 表のセル範囲解析（セル内編集の土台） |
| `src/live/shared/lineDiff.ts` | HEAD との行差分 |
| `src/live/shared/liveWebviewHtml.ts` | webview HTML の組み立て（純関数・スタイル読み込み漏れ防止） |
| `media/live-preview.css` | 固定パレット（背景は常に白）・記法の装飾 |
| `src/live/webview/liveApp.ts` | webview エントリ（CM6 EditorView + host 通信） |
| `src/live/host/liveEditorProvider.ts` | CustomTextEditorProvider・コマンド登録 |
| `test/browser/liveBrowserHarness.ts` | 実 Chromium テストのハーネス |

## 調査の再現

Obsidian の挙動を再確認したくなったら:

```bash
/Applications/Obsidian.app/Contents/MacOS/Obsidian --remote-debugging-port=9222 &
```

その後 Playwright の `chromium.connectOverCDP('http://localhost:9222')` で
`app://obsidian.md/index.html` に接続すると、`window.app.workspace.getActiveFileView().editor.cm`
から CodeMirror 6 の状態を直接読める。詳細は
[obsidian-observed-spec.md §7](obsidian-observed-spec.md)。
