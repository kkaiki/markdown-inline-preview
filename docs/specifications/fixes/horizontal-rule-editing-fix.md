# Preview: 水平線（`---`）を編集できるようにする

最終更新: 2026-07-27

## 1. 症状（ユーザー報告 2026-07-27）

> ここの横棒も編集できるようにしたいです。`---` を編集できるようにしたい preview でも

Preview に表示される水平線（`<hr>`）が「触れない飾り」になっていた。

## 2. 原因

### 2.1 クリック判定領域が 1px しかない

`media/milkdown-preview.css` の

```css
.milkdown hr {
    border: none;
    border-top: 1px solid var(--preview-border);
    margin: 1.6em 0;
}
```

は content 高さ 0 + 上ボーダー 1px なので、要素の矩形は **高さ 1px**（実測
`{"x":50,"y":92.78,"width":800,"height":1}`）。ProseMirror 自体は leaf ノードのクリックを
`NodeSelection` に変換できる（`hr` の schema は `selectable` を切っていない）が、
1px の帯を狙ってクリックするのは実質不可能で、クリックは上下の段落に吸われていた。

### 2.2 選択されても見た目が変わらない

ProseMirror は選択中の leaf ノードに `.ProseMirror-selectednode` を付けるが、
CSS 側にこのクラスのスタイルが**一切なかった**（`media/milkdown-preview.css` に
`selectednode` の記述なし）。そのため仮に選択できても、選択されているのか・
Backspace で消せる状態なのかがユーザーから見えなかった。

### 2.3 `---` が `***` に書き換わる（内容破壊）

remark-stringify の `rule` オプション既定値は `*` で、`ruleRepetition` 既定 3。
そのため Preview で**水平線と無関係な場所を 1 文字編集しただけ**で、書き戻される
Markdown の水平線が `---` → `***` に変わっていた。実測:

```
入力ソース: 'above\n\n---\n\nbelow\n'
"above" の末尾に "X" を入力 → ホストへ送られた markdown:
  "aboveX\n\n***\n\nbelow\n"
```

箇条書きについては既に `remarkStringifyOptionsCtx` で `bullet: '-'` を指定してあったが、
水平線の `rule` は未指定のままだった。

## 3. 仕様

### 3.1 水平線は掴めるクリック判定領域を持つ

`<hr>` は罫線 1px を**中央に描いた高さのある帯**として描画する。罫線の見た目
（1px・`--preview-border` 色）と占有する縦方向のスペースは従来と変わらないが、
要素の矩形が十分な高さ（8px 以上）になるため実マウスで掴める。カーソルは
`pointer` にして掴めることを示す。

### 3.2 選択中の水平線は見た目で分かる

`.milkdown hr.ProseMirror-selectednode` に選択スタイル（罫線色をアクセント色へ、
選択範囲と同じ背景）を当て、非選択時と計算済みスタイルが変わるようにする。

### 3.3 編集操作

水平線に対して以下がすべて効く（大半は ProseMirror 標準の NodeSelection 経由で、
3.1 の判定領域確保により初めて実用になる）:

| 操作 | 結果 |
|---|---|
| 罫線をクリック | 水平線が選択される（選択表示が出る） |
| 選択中に Backspace / Delete | 水平線が削除される |
| 選択中に文字入力 | 水平線が入力した文字の段落に置き換わる |
| 直後のブロック先頭で Backspace | （1 回目で水平線が選択され）2 回目で削除される |
| 直前のブロック末尾で Delete | 水平線が削除される |
| 削除後に Undo | 水平線が戻る |
| 空段落で `---` と入力 | 水平線になる（commonmark の input rule。従来どおり） |

削除しても前後の空行（空行保持のプレースホルダ段落）は保たれるため、
`above\n\n---\n\nbelow\n` から水平線を消すと `above\n\n\nbelow\n` になる
（`blank-line-preservation.md` の 1:1 保持に従う）。

### 3.4 水平線は `---` で書き戻す

`remarkStringifyOptionsCtx` に `rule: '-'` を追加し、thematicBreak を常に `---` として
直列化する。これにより Preview 上のどこを編集してもソースの `---` は `---` のまま保たれる。

> 記法そのもの（`---` の文字列）を Preview 上に出すことはしない。
> `no-focus-expand.md` の「フォーカスで本文は一切変化しない」に従う。
> ソースの `***` / `___` を書きたい場合は Raw モード（⇧⌘.）で編集する。

## 4. 実装

| ファイル | 変更 |
|---|---|
| `media/milkdown-preview.css` | `.milkdown hr` を「高さのある帯 + 中央に 1px の罫線（`background` のグラデーションで描画）」へ変更し `cursor: pointer` を追加。`.milkdown hr.ProseMirror-selectednode` の選択スタイルを追加 |
| `src/preview/webview/milkdownApp.ts` | `remarkStringifyOptionsCtx` に `rule: '-'` を追加 |

## 5. テスト

`test/browser/editing-core/horizontalRuleEdit.test.ts`（実 Chromium・実バンドル・実マウスクリック）

- 水平線には実マウスで掴めるだけのクリック判定領域がある（RED: `height=1px`）
- 水平線をクリックすると水平線が選択される
- 選択中の水平線は非選択時と見た目が変わる（RED: 計算済みスタイルが同一）
- 選択した水平線を Backspace で削除でき Markdown からも消える
- 選択した水平線を Delete で削除できる
- 水平線の直後のブロック先頭で Backspace を続けると水平線が削除される
- 水平線の直前のブロック末尾で Delete すると水平線が削除される
- 水平線を選択して文字を入力すると水平線が段落に置き換わる
- 水平線を削除しても Undo で元に戻せる
- 別の場所を編集しても水平線は `---` のまま保存される（RED: `***` になる）
- 段落で `---` と入力すると水平線になる
