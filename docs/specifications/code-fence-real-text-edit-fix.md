# Preview: フェンスコードブロックのフォーカス時実テキスト編集化 仕様

最終更新: 2026-07-13

## 1. 背景・経緯

これまでフェンスコードブロック（`` ```lang `` 〜 `` ``` ``）は、フォーカス中でも
バッククォート自体を `focusSyntaxPlugin` の `Decoration.widget`（`contenteditable="false"`）
として表示するだけで、実テキストではなく編集（1文字ずつの打ち替え・削除）ができな
かった（`code-fence-focus-markers.md`）。これは意図的な設計判断で、理由は:

- `code_block` のシリアライズ（`toMarkdown`）は `node.textContent` をそのままコードの
  中身として扱うため、実テキストの `` ``` `` が保存時にコードの一部として紛れ込み、
  ネストしたフェンス扱いになって Markdown が壊れる懸念があった。

しかし、見出し（`## `）やインライン記法（`**` 等）は同じ懸念（展開中に保存されると
プレフィックスが直列化されてしまう）を、**展開中は `markdownUpdated` への同期を
抑制し、collapse 完了直後にのみ明示的に再直列化する**（`isBlockPrefixActive()` /
`isInlineMarkEditActive()`、`docs/specifications/collapse-markdown-sync-fix.md`）という
既存の仕組みで解決している。コードフェンスも同じ仕組みを転用すれば、実テキスト化
による保存時の紛れ込みリスクを回避できる。

「見出し・太字と同じように ``` の文字自体を1文字ずつ打ち替え・削除したい」という
ユーザー要望（2026-07-09、AskUserQuestion で明示的に確認済み）を受け、
`blockPrefixEditPlugin` と同じ「フォーカス中は実テキスト・フォーカスを外したら解析
して反映」方式に変更する。

## 2. 仕様

コードブロックにフォーカスすると、`codeFenceEditPlugin` がブロックの内容の先頭・末尾に
開き・閉じフェンスを**実テキスト**として挿入する:

- 開始: `` ```{language}\n ``（`getCodeFenceMarkers` の `open` + `\n`）
- 終了: `` \n``` ``

フォーカスが当該コードブロックから外れると、実テキスト全体
（`parseCodeFenceRealText`、`src/shared/markdown/focusSyntaxHelpers.ts`）を解析する:

- 開き `` ^```(\S*)\n `` ・閉じ `` \n```$ `` の両方が（重なり合わずに）揃っていれば、
  マーカー文字を削除し、開きフェンスから読み取った言語名を `language` 属性へ反映する
  （変化が無ければ `setNodeMarkup` 自体を呼ばない）。
- どちらか一方でも壊れている（`#` を全部消した見出しと同じ状況。バッククォートを
  1個でも消せば開き/閉じの判定は成立しなくなる）場合は、コードフェンス記法をやめた
  ものとみなし、`code_block` ノードを `paragraph` へ変換する
  （`codeBlockBackspace.ts` の「先頭 Backspace で解除」と同じ発想。中身のテキストは
  そのまま段落の内容として残す）。このとき、崩れていない側のマーカー（例: 開きだけ
  全部消して閉じ `` ``` `` はそのまま）は独立して判定・除去してから段落化する
  （`heading-prefix-zero-hash-collapse-fix.md` と同じく、区切り文字の残骸を段落内に
  残さないため）。

見出しの `#` のように「レベル（1〜6）」という中間的な強さの概念は無い
（フェンスは開閉とも常に3つのバッククォート）。マーカー文字が1文字でも欠けたり
崩れたりした時点で「フェンスとして成立しない」と判定し、部分的な強さの解釈は行わない。

### 選択中でも展開を維持する

`inline-mark-focus-edit-fix.md` §3.1 と同じ理由で、選択の両端が同じコードブロック内に
収まっていれば、選択中でも展開を維持する（選択範囲の开始/終了も同じ bias 規則で
マッピングし、選択が単一カーソルへ潰れないようにする）。

### 直列化への影響

`blockPrefixEditPlugin` / `inlineMarkEditPlugin` と同じく、展開中は `markdownUpdated`
リスナーへの同期を止める（`isCodeFenceEditActive()`）。collapse 完了直後に明示的な
再直列化（`setOnCollapseSync`）を行うことで、実テキストの `` ``` `` が保存 markdown へ
紛れ込むことはない。

### シンタックスハイライト（`codeHighlightPlugin`）への影響

展開中、`node.textContent` には開き・閉じマーカーの実テキストが含まれる。これを
そのまま hljs へ渡すとマーカー行が不正な構文としてハイライトされてしまうため、
`decorateCodeBlock` は `getExpandedCodeFence()` で自身が展開中かどうかを確認し、
展開中であれば `parseCodeFenceRealText` でマーカーを除いた実コード部分だけを
hljs へ渡す（マーカー行自体には特別な装飾を付けない — 見出しの展開中プレフィックスが
特別な装飾なしにその場の見出しフォントで見えるのと同じ扱い）。

### 副作用として発覚・修正した実装バグ: コード本文の先頭にいたカーソルが弾き飛ばされる

`expandBlock` の選択維持ロジックを `inlineMarkEditPlugin.expandBlock` から流用した際、
空選択（カーソルのみ）の場合に無条件で bias `-1` を使っていた。インライン記法は
挿入位置がマーク範囲の**両端2箇所**あるうちカーソルが一致しうるのは実質「閉じ側」の
1パターンのみだったため `-1` で十分だったが、コードフェンスは**開き側**
（`contentStart`）にカーソルが一致するケース（＝コード本文の一番先頭にフォーカスした
とき。既存 `codeBlockAtContentStart` の主対象そのもので、日常的に起きる）が別途あり、
この場合に `-1` を使うと、後から挿入する開きマーカーの**前**（ブロックの本当の先頭）へ
カーソルが弾き飛ばされてしまい、そこで Backspace しても何も起きない不具合になった
（`test/browser/editing-core/editingOperations.test.ts`「コードブロックの先頭で
Backspace」で発覚）。

修正: カーソル位置が `contentStart` 以下なら bias `+1`（開きマーカーの直後＝実際の
コード本文の先頭に留まる）、それ以外（`contentEnd` 側や本文中）なら従来どおり `-1`
を使う。

### mermaid コードブロックはスコープ外

`language === 'mermaid'` のブロックは実テキスト展開の対象にしない
（`getFocusedCodeBlockPos` が null を返す）。`mermaidDiagramPlugin` は `node.textContent`
を直接 mermaid ソースとしてパースして図を描画するため、フェンスの実テキストが
混ざるとパースが壊れ、図の再描画・ノードラベル編集・図内テキスト選択が壊れる
（フルブラウザ回帰で発覚、2026-07-09）。`codeHighlightPlugin` が同じ理由で mermaid の
シンタックスハイライトをスキップしているのと同じ判断。mermaid ブロックのフェンスは
従来どおり編集不可のまま。

### 常時表示フェンス widget（`lineNumberGutterPlugin`）との整合（2026-07-13）

開閉フェンスは非フォーカス時も `lineNumberGutterPlugin` の widget（`.code-fence-display`）
として常時表示される（`blank-line-preservation.md` 4節）。フォーカスで実テキスト展開した
ときは widget 側が消え、**常にフェンスは1組だけ見える**のが正しい表示。

2026-07-13 のユーザー報告（フォーカスすると開きフェンス `` ```tsx `` が2行並ぶ）の
真因はこの整合の破れで、次の2つの実装バグによる:

1. **widget の key 衝突による古い DOM の使い回し**: 行番号 widget の key が
   `ln-{index}-{pos}-{line}` だったため、preview 時の「開きフェンス widget」と展開直後の
   「1行目の行番号 widget」が同一 key になり、ProseMirror が古いフェンス DOM をそのまま
   使い回して実テキストのフェンスの上に重ねて表示していた。key にフェンス文字列を含めて
   区別することで解消。
2. **`expanded` の設定が dispatch の後だった**: `codeFenceEditPlugin.sync` が
   `expandBlock`（dispatch）→ `expanded = {...}` の順だったため、展開トランザクション中の
   decoration 再計算では `getExpandedCodeFence()` がまだ null で、`codeHighlightPlugin` が
   フェンスの実テキストを不正な構文としてハイライトし、`lineNumberGutterPlugin` も
   非展開ブロックとして描画していた。`expanded` の設定を dispatch 直前
   （`expandBlock` 内）へ移して解消。

また、gutter 側の「展開中かどうか」の検出が内容の文字列判定
（`` /^```[^\n]*\n/ `` かつ `` /\n```$/ ``）だったため、**内容自体が完全なネストフェンス形を
持つブロックで誤発動し、非フォーカス時に外側フェンス widget が消える**バグも併発していた。
検出を `getExpandedCodeFence()?.nodePos` との一致（`computeLineAnchors` の
`expandedNodePos` 引数）に置き換えて解消。

回帰テスト: `test/browser/rendering/lineNumberGutter.test.ts`
「フォーカスして実テキスト展開中は、フェンス widget が消えて ``` は1組だけ表示される」
「内容自体が完全なフェンス形のコードブロックでも、非フォーカス時は外側フェンス widget が
表示される」。

### 内容自体がフェンス行で始まる/終わるブロック（ネストフェンス）はスコープ外（2026-07-13）

コード内容の**1行目が `` ``` `` で始まる**、または**最終行が `` ``` `` で始まる**
code_block（典型例: 外側 `` ````md `` の中に `` ```tsx `` の例示を入れたネストフェンス）は、
実テキスト展開の対象にしない（`hasBoundaryFenceLine`、`focusSyntaxHelpers.ts`）。

理由: このようなブロックは preview の時点で内容の `` ```tsx `` 行がそのまま見えている。
フォーカスで外側フェンス（`` ```tsx ``）を実テキスト挿入すると、**同一に見えるフェンス行が
2行並ぶ**（開き側）／閉じ `` ``` `` が2行並ぶ（閉じ側）ことになり、どちらが本物のフェンスか
判別できない（2026-07-13 のユーザー報告の調査中に発見。報告自体の真因は上記
「常時表示フェンス widget との整合」の widget バグだったが、これはそれと独立して実在する
表示破綻）。

判定は `getFocusedCodeBlockPos` 側で行う（mermaid と同じ位置）。`expandBlock` 側だけで
抑止すると「挿入していないのに collapse だけが走り、`parseCodeFenceRealText` が失敗して
段落化＝内容破壊」という事故になるため、展開・collapse の対象判定の単一箇所で弾くことが
安全性の要。展開しないだけで編集・直列化は通常経路のまま動き、外側フェンスは
remark-stringify が内容の `` ``` `` を検出して4連バッククォート（`` ```` ``）で
直列化するため round-trip も壊れない（ブラウザテストで回帰ロック済み）。
言語の変更はフロート言語入力欄（`codeLanguagePlugin`）で引き続き可能。

境界（1行目・最終行）のみを判定し、**中間行**の `` ``` `` は対象にしない
（中間行は開き・閉じマーカーの隣に並ばないため、二重表示の混乱が起きない）。

### 言語入力欄（`codeLanguagePlugin`）との関係（スコープ外）

既存のフロート `<input>`（コードブロック右上に浮かぶ言語入力欄、
`code-fence-language-focus-edit-fix.md`）は変更しない。今回追加した実テキスト編集と
フロート入力欄は独立して `language` 属性を更新できるため、両方を同時に編集した場合
「最後に collapse／input した方が勝つ」という単純な後勝ちの整合性になる
（同時編集は稀なケースであり、既存のフロート入力欄自体も「フォーカスが無い間だけ
モデル値で上書きする」という同種の設計のため、新たな不整合クラスではない）。

## 3. 実装

- `src/shared/markdown/focusSyntaxHelpers.ts`: `parseCodeFenceRealText` を追加（純関数、
  `test/suite` でテスト）。
- `src/preview/webview/codeFenceEditPlugin.ts`（新規）: `blockPrefixEditPlugin` と対になる
  独立プラグイン。フォーカスの出入りに応じて対象コードブロックの展開・collapse を行う。
  追跡する状態は `nodePos` のみ（`contentStart`/`contentEnd` はコード内容の長さに応じて
  可変なので、都度 `state.doc.nodeAt(nodePos)` から計算する）。
- `src/preview/webview/focusSyntaxPlugin.ts`: `blockMarkerDecoration` の `code_block` 分岐
  （widget 表示）を削除。`codeFenceEditPlugin` の実テキスト展開が同じ役割を担う。
- `src/preview/webview/codeHighlightPlugin.ts`: `getExpandedCodeFence()` を見て、展開中の
  ブロックはマーカーを除いた実コード部分だけを hljs へ渡す。
- `src/preview/webview/codeBlockBackspace.ts`: `codeFenceEditPlugin` が展開中のブロックでは
  介入しない（マーカーの実テキストを普通に Backspace で編集させる。全消去時の
  段落化は `codeFenceEditPlugin` の collapse 側が担当する）。
- `src/preview/webview/milkdownApp.ts`: プラグイン登録、`markdownUpdated` 抑制条件へ
  `isCodeFenceEditActive()` を追加、`setOnCollapseSync` を配線。

## 4. テスト

`test/browser/focus-expand/codeFenceRealTextEdit.test.ts`:
- フォーカスすると開始・終了フェンスが実テキストとして見える
- フォーカスを外すと実テキストの ``` は消え、code_block・言語属性は維持される
  （編集していなければ change は増えない）
- 言語名部分を打ち替えると、フォーカスを外した時に新しい言語になる
- 開始フェンスを1文字 Backspace で削っても、フォーカス中は残りの文字がそのまま見える
- 開始フェンスを全部消してフォーカスを外すと、段落になる（中身のテキストは残る）
- 展開中に編集しても、保存 markdown には1組の ``` だけが直列化される（二重化しない）
- 内容の1行目/最終行が既に ``` のブロック（ネストフェンス）は展開されず二重表示にならない
- ネストフェンスブロックはフォーカスの出入りで内容が変化せず change も送られない
- ネストフェンスブロック内の編集後も外側フェンスは ```` のまま直列化される

`test/suite/preview/cursor-focus/previewFocusSyntax.test.ts`:
- `parseCodeFenceRealText` の正常系（言語あり/なし）・空コード・壊れた開き/閉じ・
  両方消去・境界の重なり（実コード無し）を網羅

## 5. 旧仕様との関係

`code-fence-focus-markers.md`（widget 方式）・`code-fence-language-focus-edit-fix.md`
（フロート入力欄）は、いずれも本仕様導入後も有効な記述として残す
（widget 方式の背景説明・フロート入力欄自体は削除していないため）。
ただし widget 方式が担っていた「フォーカス中にフェンスを見せる」という役割は
本仕様（実テキスト展開）に置き換わったため、`code-fence-focus-markers.md` の
「スコープ外」ではなくなったことを両ドキュメントに追記する。
