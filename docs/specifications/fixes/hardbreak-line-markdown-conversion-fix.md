# Enter の hardbreak 化で Markdown 自動変換が全滅していた不具合の修正

## 経緯

`7d0e907`（"通常段落のEnterを段落分割から単一改行(hardbreak)へ変更"）で、`previewKeymapPlugin.ts`
の `handleParagraphEnter` は通常段落内での Enter を「段落分割」ではなく「同じ段落内の
hardbreak 挿入」に変更した。CommonMark 上、単一の改行だけでは段落は分かれない（分けるには
空行が要る）という正しさを狙った意図的な変更で、コミット時点で `usage-flows` 等の既存
テスト期待値8件が未更新であることも明記されていた（EDIT-009/EDIT-010、本ディレクトリの
`input-editing-tdd-investigation-plan.md` §8.1 参照）。

## 発見した実際の症状（想定より遥かに広範囲だった）

「既存テスト8件の期待値更新」という想定で着手したところ、実際には
`npm run test:browser` のフルスイートで **31件**が失敗しており、その大半（約26件）が
単一の根本原因に起因することが判明した。

Milkdown 組み込みの `customInputRules`（`@milkdown/prose` の `run()`、実体は
`prosemirror-inputrules` と同じアルゴリズム）は、マッチ対象の `textBefore` を常に
`$from.parent.textBetween(...)`（＝カーソルが属する**テキストブロック全体**の内容）
から計算する。見出し（`^#{1,6}\s$`）・引用（`^\s*>\s$`）・箇条書き（`^\s*([-+*])\s$`）・
チェックボックス等の input rule はすべて `^` アンカー付きの正規表現で、これは
「テキストブロックの先頭から一致する」ことを要求する。

Enter が段落を分割しなくなったことで、「Enter を押した直後の行」はもう本当の
テキストブロック先頭ではなくなった。例えば "Start" の後で Enter して "## heading" と
タイプすると、内部的には1つの段落 `paragraph["Start", hardbreak, "## heading"]` に
なり、`textBefore` は `"Start\n## heading"` になる。これは `^#{1,6}\s$` にマッチしない
（先頭が `#` ではないため）。

結果として、**Enter を押してから見出し/引用/箇条書き/チェックボックス/スラッシュ
メニューを打つ**という最も日常的な操作のほぼ全てで自動変換が起きなくなっていた。
影響を受けた実際のカテゴリ:

- 見出し（`## `）・引用（`> `）の自動変換とプレフィックス末尾スペース保持
- 箇条書き（`-`/`*`/`+`）・番号付きリスト・チェックボックス（`[ ]`/`[x]`）の自動変換
- スラッシュメニュー（`/`）の起動・絞り込み・確定（`detectSlashMatch`/`applyItem` も
  同種の「テキストブロック先頭からの絶対テキスト」判定に依存していた）
- チェックボックス変換直後の外部 update 競合（`externalUpdateRace.test.ts`）
- ブロック構造を持つ Markdown（チェックボックス等）の貼り付け
  （`@milkdown/plugin-clipboard` の `handlePaste` も同じ「テキストブロック全体」基準）

## 採用した修正方針

Enter の hardbreak 仕様自体は変更しない（CommonMark 上の正しさを維持する）。
代わりに、hardbreak で継続している「行」であっても、そこで見出し/リスト/チェック
ボックス等のパターンが完成した瞬間に**その場で本物のブロック境界に分割してから**、
Milkdown 組み込みの変換ロジックをそのまま適用する。

### 1. `src/preview/webview/hardbreakLine.ts` / `src/shared/preview/hardbreakLine.ts`

- `virtualLineStart($pos)`: `$pos` が属するテキストブロック内で、直前の hardbreak
  （無ければテキストブロック先頭）の直後位置を「実質的な行頭」として返す純粋関数
  （`@milkdown` の型のみに依存するため `src/shared/` に置ける）。
- `splitAtPrecedingHardbreak(view, pos)`: hardbreak の前後で2回 `split` したあと
  hardbreak 自体を削除し、`paragraph[A]`, `paragraph[]`（真に空）, `paragraph[B]` の
  3段落にする。空段落は**中身が完全に空（`content.size === 0`）でなければならない**
  ——Milkdown 組み込みの `paragraphSchema.toMarkdown` は「空行を保存に残すか」を
  `content.size === 0`（かつ文書の最後の子でない）で判定しており（`blank-line-
  preservation.md` の空段落と同じ形）、hardbreak を中身として残すと空行として
  直列化されない（`applyExternalContent.ts` の外部更新ブロック差分が「本来あるはずの
  空行プレースホルダ」を欠けたものと誤認し、カーソルを無関係な場所へ飛ばす事故に
  つながった。詳細は下記の関連修正）。

### 2. `src/preview/webview/hardbreakLineInputRules.ts`（新規プラグイン）

- `handleTextInput`: まず既定（テキストブロック全体基準）でどれかの input rule が
  マッチするなら何もしない（hardbreak を挟まない既存の全ケースは無変更）。マッチ
  しないが、直前の hardbreak 以降だけを基準にすると入力ルールがマッチする場合、
  `splitAtPrecedingHardbreak` で分割してから、**同じ input rule の `handler` を
  そのまま呼ぶ**（ヒューリスティックな変換ロジックの再実装はせず、Milkdown 組み込み
  ルールを「本物のブロック境界」の上で実行させることで、リストのマージ規則・見出し
  レベル判定・チェック状態判定などの既存仕様をそのまま再利用する）。分割 + handler
  適用のどちらかが不成立なら、`state.apply` で仮の次状態を作って試すだけに留め、
  実際には分割前の状態に触れない。
- `handlePaste`: 同じ理由で `@milkdown/plugin-clipboard` の既定 `handlePaste` が
  ブロックのラッパーを剥がしてインラインテキストとして流し込んでしまうケースに
  対応。ブロック構造を持つ貼り付け内容を検出したら先に分割してから、既定と同じ
  パース手順（markdown→slice→DOM→再パース）を実行する。`milkdownApp.ts` で
  `.use(clipboard)` より前に登録し、先勝ちで本処理を優先する。

### 3. `src/preview/webview/previewSlashMenu.ts` / `src/shared/slash/slashMatch.ts`

- `detectSlashMatch`: `textBefore` の起点を「テキストブロック先頭（0）」から
  `virtualLineStart($from)` に変更。
- `applyItem`: hardbreak 継続行への確定時は、まず `splitAtPrecedingHardbreak` で
  本物のブロックに分割してから、既存の「ブロック全体を置換する」ロジックを適用する。

### 4. `src/preview/webview/previewKeymapPlugin.ts`

- スラッシュメニュー表示中は Enter を「候補確定」に譲る必要がある。`previewKeymapPlugin`
  は `createSlashMenuPlugin` より前に登録されているため、素の登録順ではメニュー側の
  `handleKeyDown` に Enter が届かない。`previewSlashMenu.ts` にモジュールレベルの
  `isSlashMenuOpen()` を追加し、`handleParagraphEnter` 等の Enter 処理の入口で
  `if (isSlashMenuOpen()) return false;` を先頭に置いて明示的に譲るようにした。

## 関連修正: 空行プレースホルダの透過スキップ（`blankLinePlaceholderSkip.ts`）

上記の調査中に、`blank-line-preservation.md` の空行実体化機能（空行1つごとに
`content.size === 0` の空 `paragraph` を挟む）が、Delete/Backspace でのブロック
マージや `codeBlockArrowKeymap.ts` のブロック脱出を「1回余分」にしてしまう副作用が
あることも発見した（例: チェックリスト末尾で Delete → 本来は直後の段落が新規項目と
して取り込まれるはずが、間の空行プレースホルダを消すだけで終わる）。

`src/preview/webview/blankLinePlaceholderSkip.ts`（新規プラグイン、他の全ての
Backspace/Delete 系ハンドラの後に登録）と `codeBlockArrowKeymap.ts` の
`skipBlankPlaceholders` により、隣接する空プレースホルダを透過的に読み飛ばしてから
既定の Delete/Backspace/ArrowUp/Down 処理へ委ねるようにした。

## 回帰テスト

- `test/browser/lists-tables/typedCheckboxConversion.test.ts`
- `test/browser/focus-expand/headingBlockquotePrefixSpace.test.ts`
- `test/browser/shortcuts/slashMenuDom.test.ts`
- `test/browser/cursor-focus/externalUpdateRace.test.ts`
- `test/browser/usage-flows/usageFlows.test.ts`
- `test/browser/cursor-focus/caretRegression.test.ts`（`blankLinePlaceholderSkip` の
  登録順序を誤ると壊れることを検出した回帰テスト）
- `test/browser/cursor-focus/codeBlockArrowUpJumpToTop.test.ts`
- `test/browser/lists-tables/checkboxEditDelete.test.ts`
- `test/browser/shortcuts/selectAllBrackets.test.ts`
- `test/webview/cursor-focus/cursorAnchor.integration.test.ts`
- `test/webview/rendering/whitespaceMarker.test.ts`
- `test/webview/editing-core/checkboxEditDelete.test.ts`
- `test/webview/editing-core/markerBackspace.integration.test.ts`（`- [ ] ` に本文が
  続かない場合、GFM パーサが `checked` 属性へ変換しきれずリテラル `"[ ]"` テキストを
  残す既存の別バグも合わせて修正）
- `test/webview/editing-core/paragraphEnter.integration.test.ts`
- `test/webview/shortcuts/previewKeymap.integration.test.ts`

`npm run test:unit`（926件）・`npm run test:browser`（308件）・`npm run lint:error` が
全てグリーンであることを確認済み。
