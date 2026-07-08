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
