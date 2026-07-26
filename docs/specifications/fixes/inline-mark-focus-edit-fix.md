# Preview: インライン記法マーク（`**` `*` `~~` `` ` `` `[..](..)`）のフォーカス時実テキスト編集化 仕様

最終更新: 2026-07-08

## 1. 背景・現状

見出し・箇条書き・引用の行頭プレフィックス（`## ` 等）は `blockPrefixEditPlugin` が
フォーカス時に**実テキスト**として挿入し、そのまま Backspace で1文字ずつ削除・打ち替え
できる。

一方、インライン記法マーカー（`**太字**` `*斜体*` `~~取り消し線~~` `` `コード` `` `[link](url)`）は
`focusSyntaxPlugin` が `Decoration.widget`（`contenteditable="false"`, `aria-hidden="true"`）
として表示するだけで、実テキストではなく編集・削除できなかった（手動確認で見つかったギャップ）。

`link`（`[text](url)`）は当初 href 編集の影響範囲が大きいとして本仕様の対象外だったが、
目次・見出しへのアンカーリンク等も含め「削除・打ち替えできるか」を他のインライン記法と
揃えてほしいというユーザー要望（2026-07-08）を受け、href（`](url)` の中身）も含めて
実テキスト編集の対象に含める。

## 2. 仕様

フォーカス中のブロック（`findFocusedBlockDepth` が対象とするテキストブロック）内にある
`strong` / `emphasis` / `inlineCode` / `strike_through` / `link` マークの範囲を、
`inlineMarkEditPlugin` が実テキストとして展開する。

- 展開: 各マーク範囲の直前に開きマーカー、直後に閉じマーカーを**マーク無しの実テキスト**
  として挿入する（`blockPrefixEditPlugin.expandBlock` と同じく `tr.insert(pos,
  schema.text(marker))` を使い、周辺マークを継承させない）。
- 同一ブロック内に複数のマーク範囲がある場合、全て同時に展開する（`focusSyntaxPlugin` が
  従来どれもまとめて widget 表示していたのと同じ挙動）。
- Backspace 等でマーカー文字を編集・削除できる（ProseMirror 既定の文字削除に委ねる。
  `markerBackspace`/`inlineMarkBackspace` は展開中はこの範囲をスキップする）。
- フォーカスが当該ブロックから外れると、各マーク範囲の**現在のマーカー文字**を読み取り、
  その内容に応じて最終的なマークを決定してから、マーカー文字を削除する（collapse）。

### collapse 時のマーク決定ルール

開き側・閉じ側それぞれについて「元のマーカー文字種（`*` or `` ` `` or `~`）が、展開時の
長さを上限として何文字残っているか」（`survived`）を数え、`min(openSurvived,
closeSurvived)` を最終的な「強さ」とみなす。左右非対称な編集（例: 閉じ側だけ1文字消す）
をしても、両側とも同じ強さに揃えてから該当マークを適用する。

| マーク種 | 判定 | 結果 |
|---|---|---|
| strong / emphasis（`*` 系） | `count = min(openSurvived, closeSurvived)` | `count >= 2` → strong、`count == 1` → emphasis、`count == 0` → マーク無し |
| inlineCode（`` ` ``） | `count = min(...)` | `count >= 1` → inlineCode、`count == 0` → マーク無し |
| strike_through（`~`） | `count = min(...)` | `count >= 1` → strike_through、`count == 0` → マーク無し |

「元の強さのまま何も編集しなかった」場合も同じ式で自然に元のマークへ戻る（openSurvived
== openLen かつ closeSurvived == closeLen なら count == openLen）。

collapse では、実際に残っているマーカー文字（`openSurvived`/`closeSurvived` 文字分）を
削除したうえで、上記ルールで決まったマークをコンテンツ範囲へ設定・除去する。

### link（`[text](url)`）の collapse 判定

`link` は他の3種と異なり、閉じマーカー `](href)` が固定文字の繰り返しではなく可変長の
href 文字列を含むため、上記の「文字種カウント」方式は使えない。かわりに、展開領域の
**外側の境界**（開きマーカーの直前 = `openMarkerStart`、閉じマーカーの直後 =
`closeMarkerEnd`）を `contentStart`/`contentEnd` と同様にトランザクションの
mapping で追跡し、collapse 時に `doc.textBetween` で現在の開き側・閉じ側テキストを
そのまま読み取る（固定長ウィンドウでのカウントではなく、可変長の実テキストを直接見る）。

判定ルール:

| 開き側テキスト（`openMarkerStart`〜`contentStart`） | 閉じ側テキスト（`contentEnd`〜`closeMarkerEnd`） | 結果 |
|---|---|---|
| ちょうど `[` | `^\]\(.*\)$` にマッチ（例: `](https://example.com)`） | `link` マークを維持、href を末尾の丸カッコ内の文字列で更新 |
| 上記以外（`[` が消えている・別の文字になっている 等） | 上記以外（丸カッコが壊れている 等） | `link` マーク除去（プレーンテキスト化） |

いずれの場合も、マッチした側の文字列は実テキストとして削除し（他の3種と同じく、
展開時に一時的に挿入した実テキストを消してからマークとして再構築する）、マッチしなかった
場合はそのまま残す（他の3種の「マーカー文字が中途半端に残る」ケースと同じ扱い）。

## 3. 実装

- `src/preview/webview/inlineMarkEditPlugin.ts`（新規）: `blockPrefixEditPlugin` と対になる
  独立プラグイン。フォーカス中ブロックが変わるたびに、旧ブロックの展開中マーク範囲を
  collapse → 新ブロックの対象マーク範囲を expand する。複数範囲がある場合は、位置がずれ
  ないよう常にドキュメント末尾側から処理する（1つの `tr` の中で高い位置から低い位置へ
  順に `insert`/`delete` することで、未処理の範囲の位置を再計算せずに済む）。
- `src/shared/markdown/focusSyntaxHelpers.ts`: 対象マーク種の列挙・`survived` 計算などの
  純関数を追加（`test/suite` で直接テストできるようにする）。
- `src/preview/webview/focusSyntaxPlugin.ts`: `collectInlineMarksInRange`（link 用インライン
  widget 表示）は不要になったため削除。strong/emphasis/inlineCode/strike_through/link の
  全てが `inlineMarkEditPlugin` の実テキスト展開でカバーされる。
- `markerBackspace.ts` 等、既存の「展開中はスキップ」ガード（`getExpandedBlock()`）と同様に、
  `inlineMarkEditPlugin` にも `isInlineMarkRangeActive(pos)` 相当の判定を用意し、展開中の
  範囲内での Backspace は素通しする。

## 3.1. 選択中は収縮させない（2026-07-08 追加）

### 症状

展開中のインラインマーク（例: `**bold**`）の範囲内でテキストを選択（ドラッグ選択）すると、
選択していないとき（カーソルのみ）と挙動が変わり、実テキスト表示（focus-expand: `**bold**`）
が widget 表示（view: `**` が隠れた `bold` の太字レンダリング）へ収縮してしまう。カーソルを
動かさずに選択しただけなのに表示が変わるため、かえって見づらい。

### 原因

`getFocusedInlineMarkBlock`（`inlineMarkEditPlugin.ts`）が `!state.selection.empty` の場合に
無条件で `null` を返していた。選択が発生するたびに「フォーカス対象ブロックなし」と判定され、
`sync()` が展開中のブロックを収縮させていた。

### 仕様

選択が空でなくても、選択の両端（`$from` / `$to`）が同一ブロック内に収まっている場合は、
そのブロックを引き続き「フォーカス中」とみなし、展開状態を維持する。選択が複数ブロックに
またがる場合のみ、従来どおり「フォーカス対象ブロックなし」として収縮する。

### 副作用として発覚・修正した回帰: expandBlock が範囲選択を単一カーソルに潰していた

`expandBlock` は元々「選択は常に空（カーソルのみ）」という前提で、`state.selection.from`
1点だけを保存し、挿入後にその1点へ `TextSelection.create(tr.doc, mappedSelFrom)`
（開始・終了が同じ＝カーソル）で復元していた。上記の修正で選択が空でなくても
`expandBlock` を呼べるようになったことで、この前提が崩れ、**選択範囲がマーカー挿入と
同時に単一カーソルへ潰れてしまう**回帰が発生した（`太字を選択して Cmd+B で解除できる`
テストが赤くなって発覚）。選択したまま `Cmd+B` を押しても、実際には空選択に対する
トグルになってしまい、既存テキストの strong マークが外れなかった。

修正: 選択が空でない場合は、選択の開始（bias +1）・終了（bias -1）をそれぞれ独立に
マッピングし、`anchor`/`head`（選択方向）を保った `TextSelection` を再構築する。
bias を開始側 +1・終了側 -1 にするのは、選択範囲の外側（マーカーが挿入される境界）を
選択に巻き込まないため（新しく現れた `**` まで選択が広がってしまうと、その後の
Cmd+B 等がマーカー文字自体を巻き込んで壊れる）。選択が空の場合は既存の単一カーソル
保存ロジック（bias -1）をそのまま使う。

### テスト

`test/browser/focus-expand/inlineMarkFocusEdit.test.ts`:
- 展開中の太字テキスト内を選択しても、実テキストの `**` が見えたまま維持される

回帰確認（既存テスト、修正前後で赤→緑）:
- `test/browser/editing-core/basicOperations.test.ts`「太字を選択して Cmd+B で解除できる（トグル）」

太字専用の回帰になっていないか（ユーザー確認要望、2026-07-09）を受け、斜体・インラインコード・
取り消し線・リンクの4種についても同様のケースを追加で検証した:
- 「太字以外（斜体・インラインコード・取り消し線・リンク）でも、展開中に選択しても収縮しない」
- 「太字以外（斜体・インラインコード・取り消し線・リンク）でも、選択範囲がマーカー挿入で
  単一カーソルへ潰れない（選択して Backspace で選択部分だけ消える）」— Cmd+B/Cmd+I に相当する
  トグルショートカットが無い3種（コード・取り消し線・リンク）向けに、選択→Backspaceで
  選択範囲だけが消えることを見て、選択が単一カーソルへ潰れていないか確認する形にした。

## 3.2. Git 差分ガターが「フォーカスしただけで変更（青バー）」になる（2026-07-26 追加）

### 症状

`` `docs/spec.md` `` のようなインラインコードを含む行（ユーザー報告時は**テーブルのセル内**）に
カーソルを入れただけで、まだ 1 文字も編集していないのに Git 差分ガターの**青バー
（`.diff-modified`）がブロック左に出る**。テーブルの場合、差分の単位はトップレベルノード
なのでテーブル全体の高さの青い縦線になる（＝「編集していないのに編集済みの表示が出る」）。

### 原因

2 つある。

1. `previewDiffPlugin.blockSignatures()` は、`blockPrefixEditPlugin` が挿入する行頭プレフィックス
   （`## ` 等）1 レンジしか比較から除外していなかった。`inlineMarkEditPlugin` が挿入する
   マーカー（`` ` `` / `**` / `*` / `~~` / `[` / `](url)`）と、`codeFenceEditPlugin` が挿入する
   フェンス行（`` ```lang `` / `` ``` ``）は除外対象外だったため、HEAD 側のシグネチャと必ず
   食い違う。**「フォーカスで実テキストを挿入する」プラグインは全部で 3 つあり、除外も
   3 つ揃っていなければならない**（この 3 つが今回の症状の全数）。
2. `inlineMarkEditPlugin.expandBlock()` が展開状態（`expandedBlockPos` / `expandedMarks`）を
   `view.dispatch()` の**後**に代入していた。展開の transaction を処理している最中に走る
   `previewDiffPlugin` の `decorations()` はまだ空の `expandedMarks` を見るため、たとえ (1) を
   直しても青バーが出たまま次の state 更新まで残る。

### 仕様

- `blockSignatures(doc, expandedRanges)` は**レンジの配列**を受け取り、各トップレベルブロックに
  内包されるレンジをすべて本文テキストから除外する（単一レンジのオブジェクト渡しも従来どおり
  受け付ける）。
- `inlineMarkEditPlugin` は `getExpandedInlineMarkRanges(doc)` を公開し、現在展開中の開き／閉じ
  マーカーの絶対位置レンジを返す。link は可変長の `](url)` を含むため `openMarkerStart` /
  `closeMarkerEnd`（外側境界）を使う。`doc` を渡した場合は collapse 時と同じ判定
  （`countTrailingMarkerChars` / `countLeadingMarkerChars` / `isLinkOpenMarkerIntact` /
  `parseLinkCloseMarkerHref`）で**今も残っているマーカー文字だけ**を範囲にする。展開中に
  マーカーを一部消したとき、挿入時の長さのままでは範囲が本文側へはみ出し、本文の文字が
  比較から欠落するため。
- `codeFenceEditPlugin` は `getExpandedCodeFenceRanges(doc)` を公開し、展開中のフェンス実テキスト
  （`` ```lang\n `` と `` \n``` ``）のレンジを返す。判定は collapse と同じ `parseCodeFenceRealText`
  で行い、フェンスを編集途中で崩している場合は除外しない（実編集として差分に出す）。
- `previewDiffPlugin` はブロックプレフィックス／インラインマーク／コードフェンスの 3 系統の
  レンジを合成して `blockSignatures()` に渡す。
- `expandBlock()` は展開状態を `view.dispatch()` の**前**に確定させる
  （`blockPrefixEditPlugin` と同じ方針）。
- マーカーの**外側**（本文）を実際に編集したブロックは、これまでどおり「変更」と判定される
  （除外しすぎない）。

### テスト

- `test/webview/focus-expand/previewDiffInlineMarkExpand.integration.test.ts`（jsdom + Milkdown 実エディタ）
- `test/browser/external-sync/diffGutterFocusExpand.test.ts`（実 Chromium・実バンドル・実クリック。テーブルセル / 段落 / 見出し / 見出し内インラインコード（プレフィックス展開と同時）/ 別ブロックへ移動後 / コードブロックのフェンス展開 / 実際に打鍵したら出ること）

## 4. スコープ外

- コードフェンス（```` ``` ````）の backtick 文字自体の実テキスト化は対象外
  （`code-fence-focus-markers.md` の直列化破損リスクの判断を維持）。言語名部分の編集は
  別仕様 `code-fence-language-focus-edit-fix.md` を参照。
- 隣接する2つの `link`（例: `[a](u1)[b](u2)` のように間に非リンクテキストを挟まない場合）は
  href の異なる別マークとして区別し、それぞれ独立した展開範囲として扱う（`focusSyntaxHelpers.ts`
  の range 収集で type 名だけでなく href の同一性もチェックする）。

## 5. テスト

`test/browser/focus-expand/inlineMarkFocusEdit.test.ts`:
- 太字にカーソルを合わせると `**` が実テキストとして見える／外すと消えてマーク維持
- 閉じ `**` を1文字 Backspace すると strong → emphasis に変わる
- `**` を両側とも全部消すとマーク除去
- リンクにカーソルを合わせると `[link](https://example.com)` が実テキストとして見える／外すと消えて link マーク維持
- リンクの href（URL部分）を打ち替えると、フォーカスを外した時に新しい href になる
- リンクの `[` と `](url)` を両方全部消すと、フォーカスを外した時に link マークが外れる
- インラインコード・取り消し線も同様の実テキスト表示・マーク除去
- リンクは対象外（widget のまま）の回帰確認
