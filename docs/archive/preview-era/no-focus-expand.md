# Preview: フォーカスしても見た目が変わらない（記法の実テキスト展開の廃止）

最終更新: 2026-07-27

## 1. 背景

ユーザー要望（2026-07-26）:

> Preview 機能では、Raw と同じような見た目にして欲しいです。例えば `## ` となっているときに
> 文字の大きさだけ変わって `##` が見えない、だけど、フォーカスした時に変わるのをなくして
> みていいのかなと思いました。この時に起こるエラーが多いからです。

2026-07-26 まで、Preview には **Typora 風のフォーカス展開** があった。カーソルがブロックに
入ると、そのブロックの Markdown 記法を**実テキストとしてドキュメントへ挿入**し、フォーカスが
抜けると削除する（collapse）という仕組みで、3 つのプラグインが担当していた。

| プラグイン | 挿入していた実テキスト |
|---|---|
| `blockPrefixEditPlugin` | `## ` `- ` `1. ` `> ` |
| `inlineMarkEditPlugin` | `` ` `` `**` `*` `~~` `[` `](url)` |
| `codeFenceEditPlugin` | `` ```lang `` / `` ``` `` |

### この設計が生んでいた不具合（すべて実報告）

「カーソルを置いただけでドキュメント本文が変わる」ため、本文が変わらない前提で書かれた
あらゆる機能と衝突していた:

- **Git 差分ガターの誤判定** — 未編集のブロックにカーソルを入れただけで「変更（青バー）」。
  テーブルセル内のインラインコードではテーブル全体が青くなる（`fixes/inline-mark-focus-edit-fix.md` §3.2）
- **行番号のズレ** — 展開中の内容を直列化すると行数が変わるため、以降の全ブロックの行番号がずれる
- **カーソル飛び・選択の崩壊** — ドラッグ選択中の collapse で選択が空になる（`fixes/drag-select-during-expand-fix.md`）
- **保存内容の破損** — 展開中の直列化が `## ## Hello` のように二重化する／collapse の
  transaction が `markdownUpdated` から見えず保存が落ちる（`fixes/collapse-markdown-sync-fix.md`）
- **マークの継承** — 挿入したプレフィックスがリンクの内側に入る（`fixes/prefix-expand-mark-inheritance-fix.md`）
- **Markdown の直列化破損** — インラインコードに ``` が含まれる行を Preview で開くと
  区切りのバッククォート数が足りない形で書き戻され、ファイルが壊れる

これらは個別に修正されてきたが、**「フォーカスで本文が変わる」こと自体が不具合の温床**で
あり、新機能を足すたびに同じ形のバグが再生産されていた。

## 2. 仕様

### 2.1 フォーカスで本文は一切変化しない

カーソルをどのブロックへ移動しても、ドキュメント（ProseMirror doc）は **1 文字も変わらない**。
Markdown 記法は実テキストとして挿入されない。見た目はフォーカスの有無で変わらず、
常に「記法は見えず、スタイルだけが付いた」表示になる:

| ソース | Preview の表示（フォーカス中も同じ） |
|---|---|
| `## 見出し` | 大きな文字の「見出し」（`##` は見えない） |
| `` `code` `` | 等幅・背景付きの「code」（`` ` `` は見えない） |
| `**bold**` | 太字の「bold」 |
| ` ```js ` … ` ``` ` | 背景付き・シンタックスハイライト付きのコードブロック（フェンス行は見えない） |

### 2.2 記法を外す操作はリアルタイムで見た目へ反映する

記法が見えない代わりに、**記法を外す操作をした瞬間に見た目が変わる**（展開時代は
フォーカスを外すまで反映されなかった）。担当は従来からある 3 つの Backspace ハンドラで、
展開中はスキップされていたものが常時有効になった:

| 操作 | 結果（その場で反映） | 担当 |
|---|---|---|
| コードブロックの**先頭**で Backspace | 背景・シンタックス色が消えて普通の段落になる | `codeBlockBackspace.ts` |
| インラインコード/太字等の**端**で Backspace / Delete | その装飾が外れて普通の文字になる | `inlineMarkBackspace.ts` |
| 見出しの**行頭**で Backspace | `H2 → H1 → 段落` と 1 段階ずつ降格 | `markerBackspace.ts` |
| 箇条書き・チェックボックスの**行頭**で Backspace | `- [ ] → - → 段落` と 1 段階ずつ解除 | `markerBackspace.ts` |

記法を**付ける**操作は従来どおりショートカット（⌥⌘1-6 等）・ツールバー・スラッシュメニュー・
入力ルール（`## ` と打つ、`- ` と打つ、`` ``` `` + Enter）で行える。

### 2.3 薄字マーカー表示は既定 off

`focusSyntaxPlugin`（カーソル行だけ記法を薄字の widget で見せる機能）は残すが、
`markdownInline.preview.showFocusSyntax` の既定値を **`false`** に変更する。既定のままだと
「フォーカスで見た目が変わらない」という本仕様の目的を満たさないため。記法を見たい利用者は
設定で on にできる（widget 表示なのでドキュメント本文は変わらず、§1 の不具合は再発しない）。

ソースそのものを見たいときは Raw モード（⇧⌘.）へ切り替える。

## 3. 実装

### 削除

- `src/preview/webview/blockPrefixEditPlugin.ts`
- `src/preview/webview/inlineMarkEditPlugin.ts`
- `src/preview/webview/codeFenceEditPlugin.ts`

### 依存側から取り除いたもの

| ファイル | 取り除いた内容 |
|---|---|
| `milkdownApp.ts` | 3 プラグインの登録、`markdownUpdated` の展開中抑制、collapse 用の再直列化フック 3 つ |
| `previewDiffPlugin.ts` | 展開レンジの除外（`blockSignatures` が本文をそのまま比較する形に戻る） |
| `lineNumberGutterPlugin.ts` | 展開中フェンス/プレフィックスを再パース用に畳む 2 関数、`expandedNodePos` 引数 |
| `codeHighlightPlugin.ts` | 展開中のフェンス除去とハイライト範囲補正、`code-fence-broken` 判定 |
| `focusSyntaxPlugin.ts` | 展開中の widget 二重表示ガード |
| `markerBackspace.ts` | 展開中スキップ、空タスク時の強制 collapse、`markRecentCheckboxDemotion` |
| `codeBlockBackspace.ts` / `inlineMarkBackspace.ts` | 展開中スキップ |
| `previewKeymapPlugin.ts` | 展開抑制フラグ、`Cmd+←` の 2 段階行頭移動、選択範囲のプレフィックス補正 |
| `previewToolbarPlugin.ts` | 展開抑制フラグ、`liftListItem` 前の強制 collapse |

### 設定

- `markdownInline.preview.showFocusSyntax`: 既定 `true` → **`false`**（`package.json` と
  `previewPanel.ts` のフォールバックの両方）

## 4. テスト

`test/browser/focus-expand/noFocusExpand.test.ts`（実 Chromium・実バンドル・実クリック）

- 見出し / 箇条書き / 引用 / インライン記法 / コードブロックにカーソルを置いても本文が変化しない
- ブロック間を移動し続けても本文が 1 文字も変化しない
- コードブロック先頭 Backspace で背景がその場で消える
- インラインコード末尾 Backspace で装飾がその場で消える
- 見出し行頭 Backspace で H2 → H1
- 箇条書き行頭 Backspace でリスト解除

## 5. 廃止した仕様書

展開の存在を前提にした以下の fix 仕様は、対象コードが無くなったため**歴史的記録**として扱う
（`docs/specifications/fixes/` に残すが、現行の挙動を説明するものではない）:

`inline-mark-focus-edit-fix.md` / `block-prefix-selection-collapse-fix.md` /
`drag-select-during-expand-fix.md` / `prefix-expand-mark-inheritance-fix.md` /
`heading-prefix-live-level-update-fix.md` / `heading-prefix-zero-hash-collapse-fix.md` /
`heading-prefix-selectable-widget-fix.md` / `heading-blockquote-prefix-space-fix.md` /
`collapse-markdown-sync-fix.md` / `code-fence-real-text-edit-fix.md`
