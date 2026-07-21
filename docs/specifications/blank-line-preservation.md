# 空行の実体化とガター番号の実ソース行番号化

## 背景・課題

- Preview（Milkdown, WYSIWYG）は commonmark のブロックノードだけを doc として保持するため、ソース Markdown 上の空行はパース時点で消えていた。`A\n\nB` も `A\n\n\n\nB` も、doc 上は同じ「段落2つ」にしかならず、連続する空行の本数という情報が失われていた。
- 左ガターの行番号（`lineNumberGutterPlugin.ts`）はこれまで「ソース Markdown の開始行番号」を `serializeBlock` で近似計算していた。ブロック間の空行は常に1つと仮定していたため、複数行にまたがるブロック（コードブロック・引用等）や連続空行があると番号が飛んでいた（例: `1, 3, 5, 6, 8, 13, 15`）。

## 新仕様

### 1. 空行の実体化（トップレベルのみ）

- ドキュメント直下（トップレベル）の隣接する2ブロック間に **N 行の空行** があった場合、その間に **N-1 個の空 `paragraph` ノード** を復元して Preview 上に表示する。
  - 空行1行は従来どおり「ブロック間の既定の余白」として扱う（追加ノードなし）。
  - 空行2行なら空 `paragraph` を1つ、3行なら2つ、というように本数を史実どおり保持する。
- 空 `paragraph` は新しい独自ノード型ではなく、**通常の `paragraph` ノード**（中身が空なだけ）。そのため:
  - カーソルを置いて文字を入力すれば、そのまま本文段落になる。
  - Backspace で削除すれば、前のブロックと結合される（既存の ProseMirror 標準挙動をそのまま利用）。
- スコープは **トップレベルの空行のみ**。リスト項目間・blockquote内・テーブル内の空行は対象外（`tightenListSpacing` がリスト項目間の空行を意図的に tight リスト化して詰める既存仕様と衝突するため）。

### 2. round-trip（保存時に本数を保つ）

- 空 `paragraph` は commonmark preset 組み込みの `remark-preserve-empty-line` 機構により `<br />` プレースホルダとして直列化される。
- 連続する空 `paragraph` が N-1 個あるとき、素の remark-stringify 出力ではブロック間セパレータ（空行1行）と `<br />` プレースホルダ行が交互に並ぶため、単純に `<br />` 行を空行に戻すだけでは本数が合わない（`2*(N-1)+1` 行になってしまう）。
- `src/shared/markdown/lineBreaks.ts` に、`\n\n<br />` の連鎖をカウントして正しい本数の空行に一括変換する処理を追加し、`stripPlaceholderLineBreaks` 系の処理から呼び出す。

### 3. ガター番号のソース行番号化（2026-07-09 改訂）

> 補足（経緯）: 当初この節は「ソース行番号の近似計算（`serializeBlock` によるブロック開始行の推定）をやめ、1, 2, 3, ... の連番に簡略化する」という内容だった。連番化は「複数行ブロックや連続空行があると近似値がズレる」という不具合を回避するための一時的な対処であり、`preview-features.md` の `showLineNumbers` の既定コメント（「Raw の行番号との一貫性のため」）が示す本来の意図（Raw の行番号と一致させる）には反していた。2026-07-09、後述の「remark 再パース方式」で近似ではなく **正確な** ソース行番号を取得できるようにしたため、連番化は撤回し、Raw と一致する実ソース行番号を表示する仕様に戻す。4節も同じ日にこの方針へ合わせて改訂した。

- `lineNumberGutterPlugin.ts` の `computeLineAnchors()` は、文書順に走査した「番号を出すべき要素」（トップレベルブロック＋リスト項目の再帰。スコープは従来どおり）に対して、**ソース Markdown 上の実際の行番号**（Raw モード / CodeMirror が表示する行番号と一致する値）を割り当てる。
- 取得方法: milkdown は内部で `remarkCtx`（gfm・`blankLineRemarkPlugin` を含む、エディタに登録済みの全 remark プラグインが反映された unified プロセッサ）を使って Markdown テキストを mdast にパースしてから ProseMirror doc へ変換している（`@milkdown/transformer` の `ParserState.run` = `remark.runSync(remark.parse(text), text)`）。ただし milkdown 組み込みの `parseMarkdown` ランナー（`@milkdown/preset-commonmark` / `@milkdown/preset-gfm` 内、本リポジトリのソースではない）は、変換の過程で mdast の `.position`（行番号）を ProseMirror ノードの attrs に伝播しない。個々の組み込みノードスキーマを上書きするのは侵襲的で milkdown 内部実装に強く依存するため避け、代わりに **同じ `remarkCtx` を使ってもう一度、現在の doc を再パースする**（`ctx.get(serializerCtx)(state.doc)` で得た現在の Markdown テキストに対して行う）。得られる mdast 木から `.position` を読み取り、`computeLineAnchors` の ProseMirror 側の走査順序（トップレベル → リスト項目の再帰。4節の表・コードブロックはさらに細分化）と同じ順序で1要素ずつ対応付けて実行番号を割り当てる。
  - `serializerCtx` で得るテキストは「現在の doc の内容」であり、必ずしもディスク上のファイルそのものではないが、Preview の編集内容は都度 `postChange` でホスト側の文書モデルへ反映される設計のため、Raw 側の行番号（＝現在の文書モデルの内容）とも一致する。
  - 同じ `remarkCtx` を再利用するため、gfm の表拡張や `blankLineRemarkPlugin` による空 paragraph 復元も含めて、実際に doc を構築したときと同一のツリー構造・順序が得られる（パーサの二重実装によるズレが原理的に起きない）。
  - `serializerCtx` の素の出力は、milkdown の commonmark preset の直列化仕様により loose リスト形式（項目間に空行が入る）や空 paragraph の `<br />` プレースホルダを含む。これをそのまま再パースすると（特にリスト項目の）行番号が実ソースとズレるため、`postChange`（`milkdownApp.ts`）がファイルへ書き戻す際に使っているのと同じ正規化（`tightenListSpacing` → `stripPlaceholderLineBreaks` → `stripListItemPlaceholderBr`、`src/shared/markdown/lineBreaks.ts`）を適用してから remark で再パースする。
- 新しく生まれる「空行の空 paragraph」（1節）は合成ノード（remark の実パース結果ではない）のため `.position` を持たない。直前の実ノード（position を持つ最後のノード）の終了行から補間する: 空行1行はブロック間の既定セパレータとして番号を持たないノード無し区間に吸収されるため、この区間内の k 番目（0始まり）の空 paragraph の実行番号は `直前の実ノードの終了行 + 2 + k` となる（`insertBlankLineParagraphs` が「空行1行は追加ノード無し、2行目以降を空 paragraph 1個ずつに対応させる」という規則で挿入している順序とちょうど整合する）。

## 4. 構造的な複数行ブロックの行内番号（2026-07-09、実ソース行番号版に改訂）

### 背景・課題（不具合報告）

- 3節までの仕様で「トップレベルブロック＋リスト項目＝1要素＝1番号」とした結果、**表やコードブロックのように1ブロックが複数行にまたがる要素でも番号は1個しか振られない**。一方 Preview 上では表は複数行（`<tr>` ごと）、コードブロックも複数行として実際に表示されるため、ガター番号の位置と、ユーザーが目で数える「実際の行」との対応が取れていなかった（スクリーンショット報告: 番号がブロックの先頭にしか出ず、以降の行との対応がズレて見える）。
- さらに、Preview のガター番号と Raw（CodeMirror）の行番号を見比べると値そのものが食い違う、という別の不具合報告があった（例: Preview `28, 29, 30` に対し Raw は同じ内容で `74, 78, 80`）。これは3節が連番方式だったことが直接の原因であり、3節の改訂（実ソース行番号化）と合わせてこの4節も「複数行ブロックの行ごとの番号」を連番ではなく実ソース行番号で振るように改める。

### 新仕様

- **表（`table`）**: `table_header_row` と各 `table_row` の1行ごとに1番号を振る（ヘッダ行を含む）。番号は mdast の対応する `tableRow` ノード自身の `.position.start.line`（＝その行の実ソース行番号）を使う。
  - **アラインメント区切り行（`:---|:---` のような2行目）は mdast 上では独立したノードを持たない**（`table` ノードの `align` というメタ情報になるだけで、`tableRow` は生成されない）。対応する実行が描画されないため、**この行には番号を振らない**（意図的な選択。区切り行のためだけに存在しないノードを合成する複雑さを避けた）。
- **コードブロック（`code_block`）**: ノードのテキスト内容を `\n` で分割し、**物理行ごとに、その行の実ソース行番号**を振る（`lineRangeAt` と同じ「`\n` 区切り」の考え方を流用し、各行の開始オフセットに widget を置く）。空行（内容が空文字列の行）にも番号を振る。
  - 番号の算出は mdast `code` ノードの `.position.start.line`（フェンス開始行）+ 1 + 行インデックス。本 Preview の `code_block` の `toMarkdown`（`@milkdown/preset-commonmark`）は常にフェンス付きコードブロックとして直列化する（`remarkStringifyOptionsCtx` で `fences: false` を設定していないため、`mdast-util-to-markdown` の既定でフェンス出力になる）ため、「本文1行目 = フェンス開始行 + 1」という前提が常に成り立つ。インデント形式コードブロックのような、この前提が崩れるケースは 3節の remark 再パースの入力が常にこの Preview 自身のシリアライズ結果である以上発生しない。
- **地の文の段落（`paragraph`）は現状維持（変更しない）**: ソース上で空行を挟まず複数行に折り返されている1つの paragraph は、Preview では自動リフロー表示のため、ソースの行区切りに対応する視覚的な行が存在しない。これを無理に強制改行で1:1対応させることはしない（WYSIWYG のリフロー表示を維持する）。段落は引き続き1要素＝1番号（その段落の開始行）。
- **空行から復元された空 `paragraph`（1節）**: 番号は3節の補間式で求めた、その空行自身の実ソース行番号（連番ではない）。
- **リスト項目内の複数行ブロック（例: リスト項目内のコードブロック・表）は対象外**（今回のスコープ外。リスト項目自体は既存どおり1項目＝1番号のまま、項目内部の複数行ブロックへの再帰展開はしない）。
- **blockquote 内部の複数行ブロックも対象外**（同上の理由。blockquote 内の地の文はリフロー段落と同じ制約を持つため）。

### 実装メモ

- `table` は `table_header_row` / `table_row` の子ノードをそのまま列挙すればよい（`walkList` と同様の「子ノードを1つずつ数える」ループを追加）。widget の位置はリスト項目と同様、行ノードの直前オフセット +1（行の中、先頭セルの手前）に置く。番号は 3節の mdast 再パース結果（`table.children[i].position.start.line`）から、doc 側の行インデックスと対応付けて取る。
- `code_block` はテキストノードなので、`computeLineAnchors` 内でノードの `textContent` を取得し、`\n` の出現位置ごとに widget 位置（=ブロック内オフセット）を計算する専用ロジックが要る。番号は 3節の mdast 再パース結果（`code.position.start.line + 1 + 行インデックス`）から取る。
- mdast 側の実行番号配列と ProseMirror 側の doc 走査は、「トップレベル要素＋リスト項目再帰」の1要素につき mdast 側は1エントリ（表・コードブロックは複数行分の番号をまとめて持つ1エントリ）を消費する形でインデックス対応させる（表・コードブロックだけ1エントリが複数 widget を生む）。

## 5. 追記（2026-07-16）: Delete/Backspace/矢印キーでの透過スキップ

空 `paragraph` は「通常の `paragraph` ノード」であるため、Delete/Backspace によるブロック
マージや `codeBlockArrowKeymap.ts` のブロック脱出（ArrowUp/Down）が、本来ユーザーが
マージ/移動したい隣のブロックではなく、まずこの空段落自身にぶつかってしまう副作用が
あった（例: チェックリスト末尾で Delete → 直後の段落が新規項目として取り込まれるはずが、
間の空行プレースホルダを消すだけで1回余分にキー操作が必要になる）。

`src/preview/webview/blankLinePlaceholderSkip.ts`（他の全ての Backspace/Delete 系
ハンドラの後に登録）と `codeBlockArrowKeymap.ts` の `skipBlankPlaceholders` により、
隣接する空プレースホルダを黙って取り除いてから既定の処理へ委ねるようにし、ユーザーからは
元通り1回の操作で隣のブロックへ届くように見える。詳細・回帰テストは
`hardbreak-line-markdown-conversion-fix.md` を参照。

## 6. 追記（2026-07-19）: hardbreak 連打時のガター番号の順序崩れ修正

### 背景・不具合報告

- 段落内で Enter（hardbreak 挿入）を押した直後、まだ何も文字を入力していない状態では、その
  末尾 hardbreak は直列化された Markdown 上で「後に続く内容が無い改行」として commonmark
  シリアライザにより出力から**脱落する**（trailing hardbreak はテキストとして表現できない
  ため）。
- そのため3節の remark 再パース（`computeRealLineEntries`）はこの段落の実際の行数を
  過小に数える。`computeLineAnchors` がこの段落内の hardbreak 子ノードを ProseMirror 側で
  1つずつ辿るとき、mdast 側の `entry.lines[]` 配列が足りなくなり、末尾の hardbreak には
  対応する実行番号が存在しない状態になっていた。
- 従来はこの不足分を**文書全体で共有する1個のグローバルな `fallbackLine` カウンタ**
  （`realLines` 全体の最大行 + 1 から開始し、使うたびに++）で埋めていた。このカウンタは
  「まだ実ソース行を持たない要素に、とりあえず既存の最大値より大きい番号を割り振る」という
  設計だったが、Enter 連打 → 文字入力 → 再度 Enter、という操作を繰り返すと、直後の
  実ブロック（既に実ソース行番号を持つ後続段落）よりも**大きい**番号がこの段落の中間に
  割り当てられてしまい、ガター全体で見ると番号が前後する（例: `1, 2, 5, 3, 4` のように
  後退する）症状になっていた。

### 修正内容

- `src/preview/webview/lineNumberGutterPlugin.ts` の `computeLineAnchors()` 内、複数行
  段落の hardbreak を辿るループで、`entry.lines[lineIndex]` が無い（mdast 再パースが
  この hardbreak 分を数え損ねた）場合のフォールバックを、文書全体で共有するグローバルな
  `fallbackLine` から、**同じ段落内の直前の実行番号からの連番補完**に変更した:
  `entry.lines[entry.lines.length - 1] + (lineIndex - (entry.lines.length - 1))`。
- これにより、末尾 hardbreak の番号は必ず「同じ段落内の直前の実行番号の次」になり、
  後続の実ブロックの番号より小さくなることが保証される（少なくとも局所的な単調増加を
  維持する）。真の実ソース行番号（保存後に確定する値）とは1エディットサイクルの間だけ
  ズレうるが、そのズレは既存のガター表示の粒度では気づかれない範囲に収まる。

### テスト

`test/browser/rendering/lineNumberGutter.test.ts`:
「段落内でEnterを連続で押しても、行番号は昇順のまま・後続ブロックより手前の番号にならない」
（Enter → 文字入力 → 再度 Enter、という exact な再現条件でのみ症状が出ることを確認済み。
2回連続 Enter のみ・入力無し、では両方の trailing hardbreak が脱落して symptom が
再現しないため、意図的にこの順序でテストしている）。

## 対象外（今後の課題）

- リスト項目間・blockquote内・テーブルセル内の空行の復元。
- ネストしたリスト内の空行。
- リスト項目・blockquote内部にある複数行ブロック（表・コードブロック）の行内番号（4節参照）。
- インデント形式（4スペース）コードブロックでフェンス以外の入力があった場合の行番号ズレ（4節参照。本 Preview の直列化は常にフェンス形式になるため現状は発生しない）。
