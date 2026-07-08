# Preview: コードフェンス言語名の自由テキスト編集化 仕様

最終更新: 2026-07-08

## 1. 背景

コードフェンス（`` ```lang `` 〜 `` ``` ``）は、バッククォート自体を実テキスト化すると
直列化（保存）時にコード本文へ紛れ込む恐れがあるため、`focusSyntaxPlugin` は widget
表示のみに留め、編集不可としている（`code-fence-focus-markers.md`）。

一方、言語名（`lang` の部分）は `code_block` ノードの `language` **属性**であり、内容
テキストとは別管理のため、実テキスト化と同じ懸念（コード本文への紛れ込み）が無い。
既存の `codeLanguagePlugin`（フォーカス中にブロック右上へ浮かぶ言語セレクタ、
`document.body` 直下のフロート要素として ProseMirror の外側に実装）はこの属性を
`<select>` の固定リストからしか変更できず、自由な文字列への打ち替えや Backspace に
よる編集ができなかった（手動確認で見つかったギャップの一部）。

## 2. 仕様

`codeLanguagePlugin` のフロート要素を `<select>` から `<input type="text">`（`<datalist>`
でプリセット言語を提案）へ変更する。

- コードブロックにフォーカスがあるあいだ、ブロック右上に言語入力欄が浮かぶ（既存と同じ
  位置・タイミング）。
- 自由なテキストを打てる。プリセットに無い文字列（例: `mylang`）もそのまま
  `language` 属性に反映される。
- Backspace で1文字ずつ削除でき、削除するたびに `language` 属性が更新される。
- `<datalist>` で既知言語（`bash`/`python`/`typescript` 等、既存の `LANGUAGES` 一覧）を
  入力候補として提案する（ブラウザネイティブのオートコンプリート UI）。
- 入力欄は ProseMirror の `contenteditable` 領域の**外**（`document.body` 直下）に
  実装されているため、ここでのキー入力は ProseMirror の keymap 系プラグイン
  （`markerBackspace` 等）には一切渡らない（既存の `<select>` 版と同じ隔離設計を維持）。

## 3. 実装

- `src/preview/webview/codeLanguagePlugin.ts`:
  - `<select>` → `<input type="text" list="code-lang-datalist-<id>">` + 共有 `<datalist>`。
  - `change` イベント（select 特有、値確定時のみ発火）ではなく `input` イベント
    （打鍵のたびに発火）で `updateCodeBlockLanguageCommand` を呼ぶ。
  - `sync(view)` は、入力欄が**フォーカスされていない**時だけ `input.value` をモデルの
    `language` へ同期する（フォーカス中に外部同期で上書きしてカーソル位置を壊さないため。
    `blockPrefixEditPlugin` 等、既存の「編集中は外部同期を止める」方針と同じ考え方）。

## 4. スコープ外

- コードフェンスのバッククォート自体（`` ``` ``）は引き続き widget 表示のみ、実テキスト化
  しない（`code-fence-focus-markers.md` の判断を維持）。
- `<datalist>` の候補一覧は既存の `LANGUAGES` 定数をそのまま使う（追加・変更なし）。

## 5. 副次的に発見した既存バグ: `updateCodeBlockLanguageCommand` が未登録だった

実装中、`<input>` の `input` イベントから `ctx.get(commandsCtx).call(updateCodeBlockLanguageCommand.key, ...)`
を呼ぶと `TypeError: Cannot read properties of undefined (reading 'id')` で例外が発生することが
判明した。原因を追ったところ、`@milkdown/preset-commonmark` の `commonmark` プリセット
（`.use(commonmark)`）が内部でバンドルする `commands` 配列に **`updateCodeBlockLanguageCommand`
が含まれていない**（`node_modules/@milkdown/preset-commonmark/lib/index.js` の `commands` 配列を
確認）ことが分かった。Milkdown の `$command()` はプラグインとして `.use()` されて初めて
`plugin.key` が設定される実装になっており、`.use(commonmark)` だけでは `updateCodeBlockLanguageCommand`
自体が一度も `.use()` されないため、`.key` が `undefined` のままだった。

これは今回の `<input>` 化以前から存在した**既存のバグ**で、以前の `<select>` の `change`
ハンドラも全く同じ呼び出し方をしていたため、**言語ドロップダウンから言語を選択する機能は
リリース当初から一度も機能していなかった**と考えられる（`codeLanguagePlugin.ts` は
`docs/testing-rules.md` に「テスト0件」と記載されており、これまで気づかれていなかった）。

修正: `src/preview/webview/milkdownApp.ts` で `updateCodeBlockLanguageCommand` を
`commonmark` の直後に明示的に `.use()` する。

## 6. テスト

`test/browser/focus-expand/codeFenceLanguageEdit.test.ts`（実 Chromium）:
- フォーカス中、言語欄が `<input>` になっている（`<select>` ではない）
- プリセットに無い文字列を打つとそのまま `language` 属性になる
- Backspace で1文字ずつ削除でき、`language` 属性に反映される
- `<datalist>` に既知言語（python/typescript 等）が候補として含まれる
