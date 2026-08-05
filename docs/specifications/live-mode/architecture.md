# Live モード 実装方針

**前提**: [requirements.md](requirements.md) の要件を満たすための技術方針。
実測仕様は [obsidian-observed-spec.md](obsidian-observed-spec.md)。

---

## 1. 結論: CodeMirror 6 を webview に載せる

### 1.1 なぜ Milkdown（既存 Preview）を流用しないのか

要件 R1.1（ドキュメント = 生 Markdown）と R1.2（オフセット 1:1）は、
**ProseMirror ベースでは原理的に満たせない**。

| 論点 | ProseMirror / Milkdown | CodeMirror 6 |
|---|---|---|
| ドキュメントモデル | ノードツリー。Markdown とは別表現 | 文字列そのもの |
| Markdown との関係 | パース ⇄ シリアライズの**往復変換** | 変換なし（装飾のみ） |
| オフセット | ノード位置。ソースの文字オフセットとは別体系 | ソースの文字オフセットそのもの |
| 空行・記法ゆらぎ | 往復で正規化されて失われる | 原理的に失われない |

既存 Preview がこれまで戦ってきた不具合群（空行の消失 `7791f9e`、
フォーカス展開による Git 差分の誤検知 `63d6074`、コードフェンスの表示長ズレ、
入れ子フェンスの直列化崩れ）は、いずれも**往復変換に起因する構造的なもの**である。
Obsidian が同じ問題を持たないのは、そもそも変換していないからにほかならない。

したがって Live モードは **CodeMirror 6 + decoration** で作る。
これは Obsidian と同じ土台を選ぶということでもある。

### 1.2 なぜ VS Code の標準エディタ（既存 Raw モード）を拡張しないのか

Raw モードは VS Code のテキストエディタに `TextEditorDecorationType` を当てる方式で、
オフセット 1:1 という利点は同じ。しかし以下が実現できない。

- **文字を消す**装飾ができない（`#` を非表示にできない。`opacity: 0` にしても幅が残る）
- **ブロックウィジェット**を差し込めない（表・数式・コールアウトを描画できない）
- 行内に任意 DOM を埋め込めない（チェックボックス UI・画像）

Obsidian と同じ見た目・操作感には decoration の表現力が足りない。

---

## 2. 全体構成

```
src/
├─ live/
│  ├─ host/                       … 拡張ホスト側（Node）
│  │   ├─ liveEditorProvider.ts   CustomTextEditorProvider (viewType: ipreview.live)
│  │   ├─ documentSync.ts              TextDocument ⇄ webview の差分同期
│  │   └─ commands.ts                  openObPreview / toggleObPreview
│  ├─ webview/                    … webview 側（ブラウザ）
│  │   ├─ liveApp.ts                     CM6 EditorView の組み立て（バンドルのエントリ）
│  │   ├─ decorations/                 記法ごとの decoration ビルダ
│  │   │   ├─ heading.ts                 行スコープ
│  │   │   ├─ inlineMark.ts              トークンスコープ（太字・斜体・コード・リンク…）
│  │   │   ├─ list.ts                    常時変換（bullet 透明化）
│  │   │   ├─ quote.ts                   常時変換
│  │   │   ├─ task.ts                    トークンスコープ + クリック処理
│  │   │   ├─ codeFence.ts               ブロックスコープ
│  │   │   ├─ table.ts                   常時変換（セル内編集）
│  │   │   └─ blockWidget.ts             hr / 数式ブロック / コールアウト
│  │   ├─ revealScope.ts               ★展開スコープ判定の中核（純関数）
│  │   ├─ keymap.ts                    Enter / Backspace / Tab / Home / ⌘B …
│  │   └─ lineNumberGutter.ts          視覚行ベースのガター
│  └─ shared/                     … host / webview 双方から使う純ロジック
│      └─ syntaxRanges.ts              ソース文字列 → トークン範囲の抽出
```

既存の `src/preview/`（Milkdown）と `src/raw/` は**触らない**。
`src/shared/markdown/` の純関数のうち再利用できるものだけを参照する。

### 2.1 ビルド

```jsonc
// package.json scripts に追加
"build:livewebview": "esbuild src/live/webview/liveApp.ts --bundle --minify --outfile=media/live.bundle.js --format=iife --platform=browser --target=es2020"
```

`compile` にも追加する。CM6 は `@codemirror/*` + `@lezer/markdown` を dependencies に入れる
（`@codemirror/state` / `view` / `language` / `commands` / `search` / `lang-markdown` /
`@lezer/highlight`）。既存の `katex` / `mermaid` / `highlight.js` はそのまま流用できる。

---

## 3. 中核設計: 展開スコープ判定

要件 R1.3 の4スコープを、**1つの純関数**に集約する。ここがテストの主戦場になる。

```ts
// src/live/webview/revealScope.ts
export type RevealScope = 'token' | 'line' | 'block' | 'never';

export interface SyntaxRange {
    /** ソース上のトークン開始オフセット */
    from: number;
    /** ソース上のトークン終了オフセット（最終文字の次） */
    to: number;
    /** どの粒度で展開するか */
    scope: RevealScope;
    /** 'block' のとき、ブロック全体の範囲 */
    blockFrom?: number;
    blockTo?: number;
    /** 'line' のとき、行の範囲 */
    lineFrom?: number;
    lineTo?: number;
}

/**
 * この記法範囲が「今、生テキストとして見えているべきか」を返す。
 * 判定式は Obsidian 実測（obsidian-observed-spec.md §1 原則2）に一致させること。
 */
export function isRevealed(
    range: SyntaxRange,
    selections: readonly { from: number; to: number }[],
    hasFocus: boolean
): boolean {
    if (!hasFocus) return false;            // R1.4: blur したら全収縮
    if (range.scope === 'never') return false;
    const [lo, hi] = boundsOf(range);       // scope に応じた判定範囲
    // R1.5: 選択が範囲に触れていれば展開（両端を含む）
    return selections.some((s) => s.to >= lo && s.from <= hi);
}
```

**境界規則の要点（実測どおりに実装すること）**

- `token`: `from <= cursor <= to`。**`to` は「最後の記法文字の次」で、そこも展開に含む**。
  `from - 1` は含まない。
- `line`: その行の `[lineFrom, lineTo]`。
- `block`: ブロック全体の `[blockFrom, blockTo]`。
- `never`: 常に false。

### 3.1.1 decoration は StateField から供給する（CodeMirror の制約）

表のようなブロックウィジェット（`Decoration.replace({ block: true })`）は
**ViewPlugin から供給できない**（CodeMirror が
"Block decorations may not be specified via plugins" で拒否する）。

そのため decoration は `StateField<DecorationSet>` から供給する。
フォーカス状態は decoration の計算に必要なので、`StateEffect` で state に載せる。

```
setLiveFocus (StateEffect)  →  liveFocusField (StateField<boolean>)
                                        ↓
       docChanged / selection / focus 変化 → liveDecorationField (StateField<DecorationSet>)
                                        ↓
                             EditorView.decorations
```

`liveFocusWatcher`（updateListener）が `update.focusChanged` を拾って
`setLiveFocus` を dispatch する。

この構成の副作用として、view しか知らない情報（ビューポート・composing 状態）が
StateField からは見えない。Phase 6 で以下のように解決した。

- **IME**: `EditorView.domEventHandlers` で `compositionstart` / `compositionend` を拾い、
  `setLiveComposing` effect で state に載せる。変換中は decoration を作り直さず、
  `deco.map(tr.changes)` で位置だけ追従させる（未確定文字列の DOM を壊さないため）。
- **パフォーマンス**: ビューポート制限の代わりに**走査結果をキャッシュ**する。
  decoration は選択が動くたびに作り直す必要があるが、`scanSyntaxRanges` は
  文書が変わったときだけでよい。ドキュメント文字列をキーにキャッシュすることで、
  1万行でもカーソル移動 1 回あたり 60ms を下回る（`performance.test.ts` で固定）。

### 3.2 decoration の適用方式

| 目的 | CM6 の手段 |
|---|---|
| 記法文字を消す | `Decoration.replace({})` — DOM から消える（Obsidian と同じ） |
| 記法文字を透明化して残す | `Decoration.mark({ class: 'ob-transparent' })` + CSS。**リスト・引用はこちら** |
| 装飾を付ける | `Decoration.mark({ class: … })` |
| 行に装飾を付ける | `Decoration.line({ class: … })` |
| インライン置換（画像・チェックボックス・インライン数式） | `Decoration.replace({ widget })` |
| ブロック置換（表・コールアウト・数式ブロック・hr） | `Decoration.replace({ widget, block: true })` |

#### 組版の所有権は CSS 側にある

フォント・文字サイズ・色は `media/live-preview.css` に一本化する。
`EditorView.theme({...})` で `font-family` などを指定すると CodeMirror が生成する
クラス付きルールになり、**スタイルシート側の指定を上書きしてしまう**
（2026-08-05 に実際に踏んだ）。JS 側のテーマはレイアウト（高さ・スクロール）だけに留める。

#### 表のセル内編集（Phase 4b）

表は `never` スコープ（常時ウィジェット）にしたうえで、ウィジェット内の `<th>`/`<td>` を
`contenteditable` にする。編集は次の流れで CodeMirror の差分になる。

```
セルへの input
  → 該当セルの data-from / data-to（ソースの実オフセット）を読む
  → view.dispatch({ changes: { from, to, insert: セルのテキスト } })
  → ウィジェットに selfEdit マークを付けておく
  → updateDOM() が selfEdit を見て **DOM を作り直さず**オフセットだけ振り直す
```

`updateDOM` で DOM を作り直さないのが要点。作り直すと編集中のキャレットが飛ぶ。
外部要因（Raw モードや Git 操作）で表が変わったときは selfEdit が付いていないので
通常どおり作り直される。

**`atomicRanges` は使わない。** 要件 R1.2（1文字ずつ通過する）を壊すため。
Obsidian も使っていない。

### 3.3 再計算のタイミング

`ViewPlugin` で以下のときに decoration を作り直す。

- `update.docChanged`
- `update.selectionSet`
- `update.focusChanged`
- ビューポート変更（`update.viewportChanged`）— 要件 §5「画面外は計算しない」

**IME 中は再計算しない**（R4.6）。`compositionstart` 〜 `compositionend` の間はフラグを立て、
`compositionend` 後に1回だけ再構築する。

---

## 4. ドキュメント同期（host ⇄ webview）

要件 R4.2 のため、**全体置換を絶対に使わない**。

```
[VS Code TextDocument]  ←─ WorkspaceEdit(range, text) ──  [host]
          │                                                  ↑
          │ onDidChangeTextDocument                          │ { type: 'edit', changes: [...] }
          ↓                                                  │
       [host] ── { type: 'apply', changes: [...] } ──→  [webview CM6]
```

- webview → host: CM6 の `transaction.changes.iterChanges()` を
  `{ fromA, toA, insert }` の配列にして送る。host は `WorkspaceEdit.replace()' に変換。
- host → webview: `TextDocumentChangeEvent.contentChanges` を CM6 の
  `ChangeSpec` に変換して `dispatch`。
- **エコーバック抑止**: host 側で自分が起点の変更にリビジョン番号を振り、
  webview は自分が送ったリビジョンの反映を無視する。
- Undo/Redo は **VS Code 側に一本化**する（CM6 の history は無効化）。
  webview 内の `⌘Z` は host へ転送して `undo` コマンドを実行させる。

> 既存 Preview で発生した「フォーカス展開だけで Git 差分が変更扱いになる」不具合
> （`63d6074`）は、展開が TextDocument を触っていたことが原因。Live モード では
> **展開/収縮は decoration のみで、ドキュメントには一切触れない**という不変条件を守る。
> これはテストで固定する（受け入れテスト #9）。

---

## 5. キーマップ

CM6 の `keymap.of([...])` に、要件 §3 の各挙動を優先度付きで登録する。

| キー | ハンドラ | 備考 |
|---|---|---|
| `Enter` | `obEnter` | リスト継続 / 空項目のマーカー削除 / 番号採番 / チェック項目は未チェックで継続 |
| `Backspace` | **登録しない** | CM6 既定の1文字削除に委ねる（R3.2） |
| `Tab` / `Shift-Tab` | `obIndent` / `obOutdent` | コードブロック内は文字挿入にフォールバック |
| `Home` | `obSmartHome` | リスト系のみ2段階 |
| `Mod-b` / `Mod-i` | `toggleInlineMark` | 選択維持・解除対応 |
| `Mod-z` / `Mod-Shift-z` | host へ転送 | VS Code の Undo に一本化 |

`Enter` のロジックは既存 `src/raw/` の smartEnter と**要件が異なる**（見出しを引き継がない、
チェック項目を必ず未チェックにする等）ので、流用せず Live モード 用に書き起こす。

---

## 6. 行番号ガター

要件 R4.3 のとおり**視覚行ベース**にする。CM6 の `gutter()` は既定で行単位に呼ばれるが、
ブロックウィジェットで置換された範囲は1つの block として扱われるため、
`lineMarker` にソース行番号（`state.doc.lineAt(block.from).number`）を返せば
Obsidian と同じ「畳まれた中間行の番号は出ない」表示になる。

---

## 7. 段階的な実装計画

TDD（失敗テスト → 仕様更新 → 実装 → 成功確認）で、この順に積む。

| Phase | 内容 | 完了条件 |
|---|---|---|
| **0** | webview に CM6 を載せて生 Markdown を編集できるだけの器を作る。host 同期・Undo・保存 | 開いて閉じてバイト不変（受け入れ #1） |
| **1** | `revealScope.ts` + 見出し + インライン記法（太字・斜体・コード・打ち消し・リンク） | 受け入れ #2 #3 #7 |
| **2** | リスト・チェックボックス・引用（常時変換とトークンの混在） | 受け入れ #4 #5 #6 #10 |
| **3** | コードフェンス（ブロックスコープ + ハイライト） | フェンス両端の同時展開 |
| **4** | 表（常時レンダリング + セル内編集） | 受け入れ #8 |
| **5** | ブロックウィジェット（hr / 数式 / コールアウト）・画像 | ↓ で入って先頭行 C0 着地 |
| **6** | 行番号ガター・Git 差分ガター・IME・パフォーマンス | 受け入れ #9、1万行 1秒 |

各 Phase の頭で `docs/specifications/live-mode/` に fix / 機能仕様を追記し、
`docs/testing/spec-test-coverage.md` の対応表を更新する。
テストを足したら `npm run docs:test-catalog` を実行してカタログを再生成する。

---

## 8. リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| CM6 のバンドルサイズ | webview 起動が遅くなる | 必要な `@codemirror/*` パッケージだけ入れる。lang は markdown のみ |
| 表のセル内編集の実装難度 | Phase 4 が長引く | Phase 3 までで一度リリースし、表は生表示（`never` ではなく `line` スコープ）で暫定運用する退避案を持つ |
| 既存 Preview との設定・コマンドの混乱 | ユーザーが迷う | 名前空間を完全分離（`markdownInline.live.*`）。README に3モードの使い分けを明記 |
| 3モード並存による保守コスト | 開発が遅くなる | Live モード が既存 Preview を置き換えられると判断できた時点で、Preview の廃止を検討（未決事項 #4） |
