# Preview: 段落末尾のスペースが不可視の NBSP としてファイルへ保存される不具合の修正 仕様

最終更新: 2026-07-08

## 1. 症状

Preview で段落やリスト項目などの**テキストの末尾**にスペースキーを1回打つと、その
瞬間の doc モデル・直列化 markdown の両方で、通常のスペース（U+0020）ではなく
**不可視の NBSP（U+00A0, No-Break Space）**として保存される。例えば空段落に
`hello` と打ってから続けてスペースを打つと、直列化 markdown は
`"hello \n"`（末尾が U+00A0）になる。後続の文字を打つと通常スペースに
戻るため、**「末尾で止まっている間だけ」再現する一過性の不具合**だが、
1打鍵ごとに autosave 相当の `change` メッセージがホストへ送られるこの拡張の
アーキテクチャでは、ユーザーがスペースを打った直後に少しでも間を置けば
（次の単語をまだ打っていない状態で保存が走れば）、そのままディスク上の
ファイルへ不可視文字として書き込まれてしまう。

発見経緯: 2026-07-08、`docs/specifications/typing-fidelity-test-proposal.md`
§4.1 の TDD 実装中（`test/browser/editing-core/typingFidelity.test.ts` の
「1文字ずつ打つたびに全文を厳密一致で比較する」テスト）で、末尾スペースを含む
複数のケースが `assert.strictEqual` の失敗として検出された（見た目は同じ
`"hello "` なのに不一致、という形で最初に気づいた）。

## 2. 根本原因

`#milkdown-root` 配下の `.ProseMirror`（エディタのルート要素）に
`white-space: pre-wrap` が設定されていなかった（CSS の初期値である
`white-space: normal` のままだった）。

`white-space: normal` の HTML レンダリングルールでは、行末（インライン
コンテンツの末尾）に来た半角スペースは表示上「無いもの」として折りたたまれる。
これを防ぐため、**ブラウザの contenteditable 実装は、ユーザーがスペースキーを
押してそれが現在のテキストノードの末尾に来る場合、自動的に通常スペースの代わりに
`&nbsp;`（NBSP, U+00A0）を DOM へ挿入する**（表示上消えてしまうのを防ぐための
ブラウザ側の代替措置）。ProseMirror の `DOMObserver` は DOM の変更をそのまま
doc モデルへ読み戻すため、この NBSP がそのまま doc のテキストノードに入り、
`serializerCtx` を通した markdown 直列化にもそのまま U+00A0 として現れる。

後続の文字を打つと、その瞬間からスペースはもう「末尾」ではなくなるため、
ブラウザは通常スペースで DOM を書き直し、ProseMirror もそれを読み戻して
通常スペースに戻る。つまり症状は「末尾に止まっている一瞬」だけ発生する。

`white-space: pre-wrap` であれば、ブラウザは行末のスペースも折りたたまずに
そのまま表示できるため、この代替措置自体が発火せず、常に通常スペースのまま
DOM に反映される。ProseMirror 系エディタ（ProseMirror 本体の基本スタイルシート
`prosemirror-view/style/prosemirror.css` を含む）で `.ProseMirror` に
`white-space: pre-wrap` を設定するのは一般的な標準対応だが、本プロジェクトは
独自 CSS（`media/milkdown-preview.css`）のみを読み込んでおり、この基本スタイルが
含まれていなかった。

## 3. 修正方針（初案とボツにした理由）

**初案（CSS のみ）**: `.milkdown .editor`（`.ProseMirror` 要素）に
`white-space: pre-wrap;` を追加し、ブラウザ側の代替措置自体を起こさせない案を
最初に試した。単純なタイピング（`test/browser/editing-core/typingFidelity.test.ts`）
は全て通ったが、既存の
`test/browser/focus-expand/headingBlockquotePrefixSpace.test.ts` が新たに
4件回帰した。原因を追ったところ、`white-space: normal`（既定値）の場合、
この NBSP 代替措置は**後続の入力があった瞬間に自己修復する**（ブラウザが行末
判定をやり直し、もう行末でなくなったスペースは通常スペースへ戻す）ことが
分かった。既存の `blockPrefixEditPlugin.ts` の `expandBlock()`（見出し等が
フォーカスされた際、装飾だったプレフィックスを実テキストとして再挿入する処理）は、
段落→見出しへの input rule 変換の直後に再挿入したプレフィックスの末尾スペースが
一瞬だけ「行末」になり NBSP 化されるが、直後にユーザーが本文を打ち続けることで
`white-space: normal` の自己修復に暗黙に助けられて正規スペースへ戻っていた。
`pre-wrap` にするとこの自己修復が起きなくなり、NBSP が恒久的に残ってしまう
（`test/browser/_debug` で1文字ずつ codepoint を追跡して確認）。CSS 1箇所の
変更で全経路をカバーしようとすると、こうした「意図せず自己修復に依存していた
既存挙動」を壊すリスクがあり、影響範囲を洗い出しきれなかったため採用しなかった。

**採用案（doc モデルレベルでの正規化）**:
`src/preview/webview/trailingNbspFixPlugin.ts` を新設し、`appendTransaction`
で文書変更後に**各テキストブロックの最後の子が NBSP で終わるテキストノード
であれば、その最終文字を通常スペースへ置換する**プラグインを追加した
（`imageIsolationPlugin.ts` と同じ「appendTransaction で監視して直後に
補正 transaction を返す」パターンに倣った）。`code_block` は逐語的な内容を
保持すべきなので対象から除外する。

ブロック**末尾**に限定するのは、NBSP 本来の役割（隣接する2単語間の行折り返し
防止）はブロックの終端では意味を持たない（終端の後には同じ行に続くものが
無い）ため、そこにある NBSP は経路によらずほぼ確実にこのブラウザ挙動由来の
アーティファクトであり、正規化しても実害が無いと判断したため（文中の NBSP は
意図的な使用の可能性があるため一切触らない）。この方式なら CSS の副作用を
一切気にせず、どの経路（直接タイピング・IME 確定・プレフィックス再挿入等）で
NBSP が紛れ込んでも同じロジックで取りこぼさない。

## 4. テスト

- `test/browser/editing-core/typingFidelity.test.ts`: 修正前に失敗していた
  「ASCII 小文字のみ」「大文字・数字混在」「連続スペース」「ASCII 句読点」
  「既存段落の末尾から続けて打つ」の各ケースで、1文字ごとの厳密一致を固定。
- 既存の `test/browser/focus-expand/headingBlockquotePrefixSpace.test.ts`・
  `cursor-focus/*`・`rendering/*`・`lists-tables/*` の既存スイート
  （計 100件超）が CSS 案では回帰したのに対し、本採用案ではノーリグレッションで
  通ることを確認した。
