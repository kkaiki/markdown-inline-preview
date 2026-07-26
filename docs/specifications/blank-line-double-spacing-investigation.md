# 調査: 「Preview で Enter を押すと 2 行改行になる／2 行が 1 行として表示される」

調査日: 2026-07-26。実 Chromium（`test/browser/previewBrowserHarness.ts` のハーネスを
scratch スクリプトから直接叩く）で実測した結果のログをそのまま残す。

## 結論（3行）

1. **Enter そのものは 2 行改行しない**。段落内 Enter は hardbreak 1 個で、ファイルには
   行末バックスラッシュ（`abc\` + 改行 + `def`）として 1 改行ぶんだけ書かれる。
2. **本当に起きているのは「ソースの空行 1 行が、Preview 上で “見える空段落” 1 行を占有する」**。
   Markdown の普通の段落区切り（`AAA\n\nBBB`）が Preview では `AAA` / 空段落 / `BBB` の
   3 ブロックになり、段落間が常に 1 行余分に空いて見える。
3. これは `blankLineRemarkPlugin.ts` の実装が仕様（`blank-line-preservation.md` §1 の
   「空行 1 行は追加ノード無し、N 行 → N-1 個」）と食い違い、**N 行 → N 個**の空段落を
   入れているため。空段落自体はファイルには保存されない（往復は成立している）。

## 実測ログ

### ケース1: `AAA\n\nBBB\n` を開いただけ（空行 1 行 = 普通の段落区切り）

```
outline: paragraph["AAA"] | paragraph | paragraph["BBB"]
docText: "AAA\n\nBBB"
lastChangeMarkdown: null
blocks:
  P h=26 text="1AAA"
  P h=26 text="2"        ← ソースの空行 1 行に対応する空段落（26px の実ブロック）
  P h=26 text="3BBB"
```

### ケース2: `AAA\n\n\nBBB\n`（空行 2 行）

```
outline: paragraph["AAA"] | paragraph | paragraph | paragraph["BBB"]
blocks:
  P h=26 text="1AAA"
  P h=26 text="2"
  P h=26 text="3"
  P h=26 text="4BBB"
```

### ケース3: `abc\n\nTAIL\n` の `abc` 末尾で Enter

```
--- Enter 直後（未入力）
outline: paragraph["abc", hardbreak] | paragraph | paragraph["TAIL"]
lastChangeMarkdown: null
blocks:
  P h=51 text="1abc2"    ← 同じ段落が 2 行ぶん（hardbreak）
  P h=26 text="2"
  P h=26 text="3TAIL"

--- 続けて "def" を入力
outline: paragraph["abc", hardbreak, "def"] | paragraph | paragraph["TAIL"]
lastChangeMarkdown: "abc\\\ndef\n\nTAIL\n"
```

保存される Markdown は

```
abc\
def

TAIL
```

つまり **Enter 1 回 = 改行 1 個 + 行末バックスラッシュ**。空行は増えていない。

### ケース4: Enter の直後に `## head` と入力（自動変換パス）

```
outline: paragraph["abc"] | paragraph | heading(2)["## head"] | paragraph | paragraph["TAIL"]
blocks:
  P  h=26 text="1abc"
  P  h=26 text="2"       ← splitAtPrecedingHardbreak が作る空段落プレースホルダ
  H2 h=33 text="3## head"
  P  h=26 text="4"
  P  h=26 text="5TAIL"
```

Enter → Markdown 自動変換（`## ` / `- ` / スラッシュメニュー）を通ると、hardbreak が
「空段落プレースホルダ + 本物のブロック分割」に置き換わる（`hardbreakLine.ts` の
`splitAtPrecedingHardbreak`）。この空段落が見えるため、**ユーザー視点では「Enter したら
2 行空いた」ように見える**。保存される Markdown 自体は `abc\n\n## head\n\nTAIL\n` で
正常（空行 1 行）。

### ケース5: Enter 2 回 + `zzz`

```
outline: paragraph["abc", hardbreak, hardbreak, "zzz"] | paragraph | paragraph["TAIL"]
lastChangeMarkdown: "abc\\\n\\\nzzz\n\nTAIL\n"
```

ファイル上は

```
abc\
\
zzz
```

空行のつもりの行に裸の `\` が残る。

### ケース6: 見出し末尾で Enter → `text`

```
outline: heading(1)["Title"] | paragraph["text"] | paragraph | paragraph["body"]
markdown: "# Title\n\ntext\n\nbody\n"
```

見出しの Enter は従来どおり段落分割（`handleParagraphEnter` は paragraph のみ対象）。

### ケース7: Enter → `- item`

```
outline: paragraph["abc"] | paragraph | bullet_list[list_item[paragraph["- item"]]] | paragraph | paragraph["TAIL"]
```

ケース4 と同じく空段落プレースホルダが残る。

### ケース9: `line1\nline2\n`（空行なしの 2 行）

```
outline: paragraph["line1", hardbreak, "line2"]
blocks:
  P h=51 text="1line1 2line2"
```

ソース 2 行 → Preview 上も 1 段落 2 行（hardbreak）。ここは仕様どおり。

## 原因（実装と仕様の食い違い）

`src/preview/webview/blankLineRemarkPlugin.ts`:

```ts
const blankLines = startLine - endLine - 1;
for (let k = 0; k < blankLines; k++) {
    result.push({ type: 'paragraph', children: [] });
}
```

`AAA`（1行目終わり）と `BBB`（3行目始まり）なら `blankLines = 1` → 空段落 1 個。
一方 `blank-line-preservation.md` §1 は

> 空行1行は従来どおり「ブロック間の既定の余白」として扱う（追加ノードなし）。
> 空行2行なら空 `paragraph` を1つ、3行なら2つ

としており、**実装は仕様より 1 個多い**。往復（保存）は
`lineBreaks.ts` の `collapseBlankLineChains`（`<br />` 1 個 → 改行 2 個）が実装側の
数え方に合わせてあるため、ファイルの空行本数は保たれている＝表示だけが 1 行多い状態。

## データの所在

| もの | どこにあるか | ファイルに残るか |
|---|---|---|
| 空行に対応する**空段落ノード** | webview の ProseMirror doc のみ。生成は [blankLineRemarkPlugin.ts:32](src/preview/webview/blankLineRemarkPlugin.ts#L32)（remark パース後に mdast へ挿入）、登録は [milkdownApp.ts](src/preview/webview/milkdownApp.ts) | **残らない**。保存時に commonmark の `remark-preserve-empty-line` が `<br />` として直列化 → [lineBreaks.ts:27](src/shared/markdown/lineBreaks.ts#L27) `collapseBlankLineChains` / `stripPlaceholderLineBreaks` が普通の空行へ戻す |
| Enter の **hardbreak** | ProseMirror の `hardbreak` ノード。挿入は [previewKeymapPlugin.ts:456](src/preview/webview/previewKeymapPlugin.ts#L456) `handleParagraphEnter` | **残る**。行末 `\`（CommonMark のハード改行）としてファイルに書かれる |
| 自動変換時の**空段落プレースホルダ** | [hardbreakLine.ts:32](src/preview/webview/hardbreakLine.ts#L32) `splitAtPrecedingHardbreak` が hardbreak を空段落へ変換 | 空行 1 行として残る（＝普通の段落区切り） |
| 仕様書 | [blank-line-preservation.md](docs/specifications/blank-line-preservation.md)（§1 が空行実体化、§5 が Delete/Backspace 透過スキップ） | — |

行番号ガター（`lineNumberGutterPlugin.ts`）もこの空段落を 1 行として数えて番号を振っている
（§3 の補間式）。表示仕様を変えるならガター側の補間も合わせて直す必要がある。

## やめる場合の変更範囲（未着手・TDD 前提）

1. `blankLineRemarkPlugin.ts`: `blankLines - 1` 個だけ挿入する（空行 1 行 = 追加ノード無し＝仕様どおり）。
2. `lineBreaks.ts` `collapseBlankLineChains`: `'\n'.repeat(brCount + 1)` → `brCount + 2`（N-1 個の
   `<br />` を N 行の空行に戻す）。
3. `hardbreakLine.ts` `splitAtPrecedingHardbreak`: 空段落を挟まず素直に 2 段落へ分割する
   （分割そのものが空行 1 行になるため）。`hardbreakLineInputRules.ts` の同種の分岐も同様。
4. `blankLinePlaceholderSkip.ts` / `codeBlockArrowKeymap.ts` の `skipBlankPlaceholders`:
   スキップ対象が減るので期待値を見直す。
5. `lineNumberGutterPlugin.ts` §3 の空段落補間（`直前の実ノード終了行 + 2 + k`）を
   新しい対応関係へ。
6. `applyExternalContent.ts` のブロック差分（空行プレースホルダの有無を前提にしている箇所）。
7. `blank-line-preservation.md` §1 と、`preview-test-catalog.md` の再生成。

## 別件だと思ったもの（調査の結果、正常だった）

リスト末尾で Enter → `three` と入力した直後の保存 Markdown が
`"- one\n- two\n- \n\nTAIL\n"` となり、入力した `three` が保存内容に現れなかった
（doc 側は `list_item[paragraph["- three"]]`）。データ欠落ではなく、
**プレフィックス展開中（`isBlockPrefixActive()`）は `markdownUpdated` → `postChange` を
意図的に抑制している**ため（`milkdownApp.ts` の `markdownUpdated` リスナー。展開中は
`## ## Hello` のように二重直列化されるのを避ける仕様）。カーソルがブロックを抜けて
折りたたみが完了した時点で `setOnCollapseSync` 経由の再シリアライズが走り、正しい内容が
ホストへ届く。

この仕様のため、ブラウザテストで「入力直後の保存 Markdown」を検証するときは、
先に別ブロックへカーソルを移して折りたたみを起こす必要がある
（`test/browser/rendering/blankLineDisplay.test.ts` はそうしている）。

## 修正（2026-07-26 実施）

仕様（`blank-line-preservation.md` §1）どおり「空行 N 行 → 空 paragraph N-1 個」へ実装を
合わせた。詳細は同仕様書 §9。変更点:

- `blankLineRemarkPlugin.ts`: 挿入個数を `blankLines - 1` に。
- `lineBreaks.ts` `collapseBlankLineChains`: 改行本数を `brCount + 2` に。
- `hardbreakLine.ts`: `splitTrAtHardbreak` を新設し、hardbreak を削除してその位置で
  1 回 split するだけ（空段落プレースホルダを挟まない）に変更。
  `hardbreakLineInputRules.ts` も同関数を共有。
