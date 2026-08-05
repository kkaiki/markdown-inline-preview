# Preview 探索的監査レポート（2026-07-26）

対象ブランチ: `feat/preview-default-editor-and-blank-lines`（HEAD `e0bcec6`）
手法: `preview-exploratory-audit` skill 段階B。実 VS Code 拡張ホスト（`test/extension/`）と
実 Chromium（`test/browser/`）を実際に起動して操作し、既存テストが触れていない操作の
組み合わせを総当たりした。使い捨てのスクラッチテスト
（`test/extension/preview/_audit-scratch.test.ts`、`test/browser/rendering/_audit-scratch.test.ts`）で確認。

## ベースライン

- 実 VS Code フルスイート（監査前）: **119 passing / 2 pending / 0 failing**（既知の順序依存 flake も再現せず）
- 実 Chromium フルスイート: **332 passing / 0 failing**

つまり以下の指摘はすべて「既存テストが1件も見ていなかった穴」。

監査後（後述の昇格テスト16件を追加した状態）: **133 passing / 2 pending / 2 failing**。
失敗2件は Raw の既知の順序依存 flake（backlog §4.1b の `8.5` / `8.22`）で、今回の追加とは無関係。

---

## 発見1（実バグ・優先度高）: 「テキストエディタで開き直す」が握り潰され、Preview に戻される

### 症状

Preview で開いている `.md` に対して VS Code 標準の
**「Reopen Editor With… → Text Editor」**（コマンド `workbench.action.reopenTextEditor`、
タブ右クリックメニューにもある）を実行すると、Raw のテキストタブが**一瞬開いた直後に
拡張機能自身によって閉じられ**、Preview タブに戻ってしまう。ユーザーから見ると
「VS Code の標準機能が効かない」。`markdownInline.preview.controlDefaultEditor` を
`false` にしても回避できない。

### 再現（実 VS Code）

```
B12 コマンド workbench.action.reopenTextEditor（=「テキストエディタで開き直す」）で Raw 化できる:
  [B12] final tabs: group0[b12.md:custom(ipreview.preview)*]
  AssertionError [ERR_ASSERTION]: 「テキストエディタで開き直す」を実行したのに Raw タブにならない: group0[b12.md:custom(ipreview.preview)*]

A4 「テキストエディタで開き直す」(openWith default) で Raw 化した後、Preview タブが残らず togglePreview で戻せる:
  AssertionError [ERR_ASSERTION]: テキストエディタで開き直したのに Raw タブが1枚でない: group0[a4.md:custom(ipreview.preview)*]
  0 !== 1

A4b Preview 化直後（500ms 未満）に openWith default すると Raw タブが残る（A4 との timing 差分の確認）:
  [A4b] tab events: opened:a4b.md:custom(ipreview.preview) | closed:a4b.md:text | opened:a4b.md:text | closed:a4b.md:text
  [A4b] final tabs: group0[a4b.md:custom(ipreview.preview)*]
  AssertionError [ERR_ASSERTION]: Preview 直後の openWith default でも Raw タブが残らない

B3 controlDefaultEditor=false でも openWith default による Raw 化は握りつぶされるか:
  AssertionError [ERR_ASSERTION]: controlDefaultEditor=false でも Raw 化が取り消される: group0[b3.md:custom(ipreview.preview)*]
```

A4b のタブイベント列が決定的な証拠:
`opened:text`（ユーザーの開き直しで Raw タブが生まれる）→ `closed:text`（拡張が閉じる）。

### 原因

`src/preview/host/previewPanel.ts` の重複タブ解消:

- `vscode.window.tabGroups.onDidChangeTabs` の `event.opened` で
  `collapseDuplicateRawTabsInGroup()` を呼ぶ（`previewPanel.ts:1205`）
- 同関数は「同じグループに Preview タブがある URI の Raw タブ」を無条件に閉じる
  （`previewPanel.ts:1115-1130`）

これは `sidebar-reopen-preview-duplicate-tab-fix.md` の対策（Explorer からの再オープンで
Raw タブが重複する問題）だが、**「サイドバーからの意図しない再オープン」と
「ユーザーが明示的に選んだ Reopen with Text Editor」を区別していない**。
`inFlightSwitch`（自前の切替中）と `previewSettledAt`（500ms 猶予）の2つの除外条件は
どちらもこのケースに掛からない。

### 影響

- Preview を一時的に Raw で見たいときの VS Code 標準の逃げ道が塞がる
  （`markdownInline.togglePreview` を知らないユーザーは「このファイルだけ開けない」と感じる）。
- `controlDefaultEditor` で `.md` の既定エディタが `ipreview.preview` に固定されている
  分だけ、この逃げ道の重要性は上がっている。

### 想定される直し方（未着手）

「Raw タブが `opened` で出現した」だけでは意図が判別できないため、
`workbench.action.reopenTextEditor` / `vscode.openWith(..., 'default')` 由来のものを
除外する何らかの印が要る。案:
- 直前に自分が Preview へ切り替えた／サイドバー起点だと分かるケースだけに絞る
  （現在の「Preview があれば常に閉じる」から「Preview タブがアクティブでない状態で
  現れた Raw タブだけ」等へ条件を狭める）
- あるいは Raw タブが**アクティブとして**開かれた場合はユーザーの意図とみなして残す
  （サイドバーの単発クリック 13.5 との両立を要検証）

---

## 発見2（実バグ・優先度高）→ **修正済み（2026-07-27）**: 本文先頭の空行が Preview で消える（frontmatter 直後の空行が保存で失われる）

> 修正内容は `docs/specifications/blank-line-preservation.md` §11。
> `blankLineRemarkPlugin.ts` が先頭・末尾の空行も復元するようにし、直列化側
> （`lineBreaks.ts` の端の連鎖処理・`milkdownApp.ts` の末尾空行の本数補正）も合わせた。
> 実 VS Code（serve-web）の Preview に実際にキーボードで入力して、
> `---` 直後の空行が保たれること・ガター番号が Raw と一致すること（1,2,3,4）を確認済み。

### 症状

ソース Markdown の**先頭にある空行**が Preview 上に実体化されず、その状態で編集して
保存すると、その空行がファイルから消える。とくに frontmatter 付きファイルで顕著:

```
---
title: テスト
---
                 ← この空行が
# 本文
```

`splitFrontmatter()` は本文を `"\n# 本文\n"`（先頭に空行を含む形）として webview へ渡すため、
**frontmatter 付きファイルは常にこの条件に当たる**。Preview で1文字でも編集すると
保存結果は `---\n...\n---\n# 本文` になり、`---` と本文がくっつく。

同じ理由で**末尾の連続空行**も失われる。

### 再現（実 Chromium / webview）

```
C1 先頭が空行で始まる本文（frontmatter 直後の形）を編集すると、先頭の空行が保たれる:
  [C1] initial topTypes=["heading","paragraph","paragraph"]
  [C1] change markdown = "# 本文\n\nあいうえおX\n"
  AssertionError [ERR_ASSERTION]: 本文先頭の空行が直列化で失われた: "# 本文\n\nあいうえおX\n"

C2 末尾に空行が続く本文を編集しても、末尾の空行が保たれる:
  [C2] change markdown = "# 本文\n\nあいうえおX\n"
  AssertionError [ERR_ASSERTION]: 本文末尾の空行が直列化で失われた: "# 本文\n\nあいうえおX\n"

C3 先頭の空行は Preview 上でも1行として表示される:
  [C3] blocks=["# 本文"]
  AssertionError [ERR_ASSERTION]: 先頭の空行が Preview 上に表示されていない（ソースと行が 1:1 でない）: ["# 本文"]
  1 !== 2
```

### 再現（実 VS Code end-to-end）

```
B7 frontmatter 付きファイルを Preview 経由で編集しても frontmatter が保たれる:
  AssertionError [ERR_ASSERTION]: frontmatter の再結合結果が想定と違う:
  + actual   '---\ntitle: テスト\ntags: [a, b]\n---\n# 本文\n\n追記した段落\n'
  - expected '---\ntitle: テスト\ntags: [a, b]\n---\n\n# 本文\n\n追記した段落\n'
```

### 原因

`src/preview/webview/blankLineRemarkPlugin.ts` の `insertBlankLineParagraphs()` は
**ノードとノードの「間」だけ**を見て空段落を補う（`children[i]` と `children[i+1]` の
`position` の差分）。したがって

- 最初のノードより**前**の空行（＝先頭の空行）
- 最後のノードより**後**の空行（＝末尾の空行）

は復元対象に入っていない。`blank-line-preservation.md` §1 の「ソースの空行と Preview の行を
1:1 に対応させる」という仕様に対する取りこぼし。

### 副次的な影響: 行番号ガターが全行ズレる

先頭が空行のファイルでは、以降のすべての行番号が 1 ずつズレる（Raw の行番号と一致しない）。

```
C7 先頭が空行のファイルでも、行番号ガターが Raw の行番号と一致する:
  [C7] gutter=["1","2","3"]
  AssertionError [ERR_ASSERTION]: 先頭空行のぶん行番号がズレている: ["1","2","3"]
  （Raw の実行番号は 1=空行, 2="# 本文", 3=空行, 4="あいうえお" の4行）
```

これは直前のコミット `6b03f35`（「Previewでソースの空行を省略せず1:1で表示し、
フォーカス展開中の行番号ズレも修正」）が狙った症状そのものの、未修正の残りケース。

---

## 発見3（テスト基盤の罠・優先度中）: `placeCursorAtLineEnd` が macOS の実 Chromium で機能しない

`test/browser/previewBrowserHarness.ts:283` の `placeCursorAtLineEnd()` は
「行頭付近をクリック → `End` キー」でカーソルを行末に置く実装だが、macOS の Chromium では
`End` がキャレットを動かさないため、**カーソルは行頭のまま**になる。

```
C4 末尾段落の行末（End）で打った文字は行末に入る:
  行末で打った文字が行末に入っていない: "# 本文\n\nXあいうえお\n"
C5 中間段落の行末（End）で打った文字は行末に入る:
  行末で打った文字が行末に入っていない: "# 本文\n\nXあいうえお\n\nかきくけこ\n"
C6 ASCII 段落の行末（End）で打った文字は行末に入る:
  行末で打った文字が行末に入っていない: "# Title\n\nXhello world\n"
```

幸い**現在このヘルパーを使っている実テストは1件も無い**（`grep` 済み。実テストは
`placeCursorAfterText` / `moveToEnd` を使っている）ので偽装カバレッジは発生していないが、
今後これを使ったテストを書くと「行末での挙動」を謳いながら実際は行頭を検証する
テストになる。`testing-rules.md` の偽装カバレッジ禁止に照らして、削除するか
`placeCursorAfterText` ベースへ直すべき。

---

## 実際に動かして問題が無かったもの（仕様として固定してよい）

すべて実 VS Code / 実 Chromium で実行して green:

| ID | 内容 |
|---|---|
| A1 | `controlDefaultEditor` を on→off にすると、拡張が書いた `*.md` / `*.markdown` の関連付けが撤去される |
| A2 | Preview 表示中にファイルが外部から削除されても例外にならず、他ファイルの Preview 化を続けられる |
| A3 | Preview タブを閉じて「閉じたエディタを再度開く」で復元してもタブが重複しない |
| A5 | 空行を多数含む本文の Raw→Preview→Raw 往復で内容が 1:1 のまま・dirty 化もしない |
| A6 | 空行を含む本文を webview から送り返しても、空行がそのままディスクへ保存される（**中間**の空行は正しい） |
| A7 | `togglePreview` を 80ms 間隔で10回連打してもタブが1枚に収束し、内容もディスクも壊れない |
| A8 | Preview 表示中の外部書き換え後に Raw へ戻すと、古い内容で上書きせず最新内容が出る |
| A9 | Preview 中に同じファイルを右グループへ Raw で開くと「左 Preview・右 Raw」の2画面構成が保てる |
| A10 | Preview 表示中の外部リネームでも例外にならず、後続操作ができる |
| A11 | Preview 表示中の revert でタブが壊れず、ディスク内容も変わらない |
| A14 | Preview 表示中の「エディタを分割」で例外にならない（両グループが独立した Preview になる。13.2 の仕様どおり） |
| A16 | モード記憶が preview のとき、5ファイルを続けて開いても Raw タブが1枚も残らない |
| B5 | 空（0バイト）の `.md` も Preview 化でき、往復で内容が変わらない |
| B8 | CRLF ファイルを Preview 経由で編集しても改行コードが混在しない |
| B9 | 末尾に改行が無いファイルの Raw→Preview→Raw で内容が変わらない |
| B10 | 日本語・スペース入りのファイル名でも Preview 化と保存ができる |
| B11 | 相対パスの画像リンクが webview URI のまま保存されたりしない |

---

上記のうち緑だったシナリオは、この監査で正式なテストとして昇格済み（16件、全て passing）:

- `test/extension/preview/editing-core.test.ts`（新規）— 19.1〜19.7（A5/A6/B5/B8/B9/B10/B11）
- `test/extension/preview/tabs-editors.test.ts` — スイート 18（18.1〜18.7。A2/A10/A3/A9/A11/A7/A16）
- `test/extension/preview/external-sync.test.ts` — 12.8（A8）
- `test/extension/preview/settings.test.ts` — 16.5（A1）

スクラッチ（`_audit-scratch.test.ts` 2ファイル）は削除済み。

## 次のアクション

1. 発見2（先頭・末尾の空行）を `tdd-browser-preview` の TDD ループで修正する。
   失敗テストは本レポートの C1/C2/C3/C7/B7 をそのまま書き起こせる
   （`test/browser/rendering/blankLineDisplay.test.ts` と
   `test/extension/preview/editing-core.test.ts` へ置くのが自然）。
2. 発見1（Reopen with Text Editor）は、13.5（Explorer 単発クリック）と両立する条件を
   設計してから修正する。仕様は `sidebar-reopen-preview-duplicate-tab-fix.md` へ追記。
3. 発見3 はヘルパー削除 or `placeCursorAfterText` ベースへの修正。
