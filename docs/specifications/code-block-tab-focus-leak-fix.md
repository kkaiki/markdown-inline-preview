# コードブロック内で Tab キーを押すとフォーカスがエディタ外へ飛ぶバグ

## 症状（ユーザー報告）

「``` の中を編集していると、次の見出し(H2)に移動することがよく起こる」

## 再現・原因

Milkdown（ProseMirror）は `code_block` に対して Tab キーの挙動を何も割り当てて
いない。`previewKeymapPlugin.ts` / `previewSlashMenu.ts` にも Tab のハンドラは
無かった（Enter・矢印キー等は個別にハンドルされているが Tab は素通り）。

コードを書く際は自然に Tab キー（インデント）を多用するため、コードブロック内で
Tab を押すと `event.preventDefault()` されないままブラウザのネイティブ挙動
「次のフォーカス可能要素へ移動」が発動する。

実 Chromium で検証したところ、Tab を押すと DOM フォーカスが **そのコードブロック
自身の言語選択 `<select aria-label="Code block language">`**（`class="code-lang-select"`、
コードブロックの上に絶対配置されているシンタックスハイライト用の言語ピッカー）へ
移動することを確認した。これによりエディタの caret が見えなくなり、次に何か操作
すると別のブロック（ユーザー報告では次の見出し）にいるように見える体験になる。

## 修正

`src/shared/preview/previewShortcuts.ts` の `classifyPreviewShortcut` に
`Tab`（Mod/Alt 修飾なし）を `{ kind: 'codeBlockTab', shift: boolean }` として
追加。Cmd/Ctrl/Alt+Tab（OS・ブラウザのウィンドウ/タブ切替）は対象外。

`src/preview/webview/previewKeymapPlugin.ts` に `handleCodeBlockTab` を追加し、
`code_block` 内でのみ:
- Tab: カーソル位置にタブ文字 `\t` を挿入
- Shift+Tab: 現在行の行頭にあるタブ1つ、または半角スペース最大4つを削除

のいずれかを行い `event.preventDefault()` する。`code_block` の外では何もせず
`false` を返し、ブラウザ既定の挙動（フォーム要素間のフォーカス移動等）に委ねる
（この修正の対象範囲外）。

## テスト

`test/browser/codeBlockTabFocus.test.ts`:
- コードブロック内で Tab キーを押してもフォーカスがエディタ外へ出ない
- Tab キーでタブ文字が挿入される
- Shift+Tab で行頭のインデントを1段階解除できる
- コードブロック外の Tab は既存動作のまま（クラッシュしない）

`test/suite/preview/previewShortcuts.test.ts`: `classifyPreviewShortcut` の
`codeBlockTab` 分類（Tab/Shift+Tab/Cmd+Tab/Ctrl+Tab/Alt+Tab の判定）。
