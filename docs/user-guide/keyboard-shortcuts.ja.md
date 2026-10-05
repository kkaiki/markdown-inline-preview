# キーボードショートカット一覧

最終更新: 2026-08-08（Notion 準拠のキー割り当てを実装）

**Notion と同じキー割り当て**をそのまま採用している。インストールした時点で有効で、
`keybindings.json` を書く必要はない。

- キーの一覧と設計判断: [../specifications/notion-shortcuts.md](../specifications/notion-shortcuts.md)
- VS Code 既定との衝突をどう解消しているか: [../research/notion-shortcuts.md](../research/notion-shortcuts.md)

Mac は `⌘`、Windows / Linux は `Ctrl`。

> **この表を覚えなくてもよい**: Live モードのツールバーのボタン（H1・B など）にマウスを
> 置くと、その操作の名前と対応するショートカットキーがその場に出る（チートシート）。
> 表示されるキーは使っている OS に合わせて切り替わる。

***

## インライン書式

選択してから押す。**同じキーをもう一度押すと外れる**。選択せずに押すと記号だけ入り、
カーソルはその内側に入る。

| 機能 | Mac | Windows/Linux | 入る Markdown |
|------|-----|---------------|---|
| 太字 | `⌘B` | `Ctrl+B` | `**text**` |
| 斜体 | `⌘I` | `Ctrl+I` | `*text*` |
| 下線 | `⌘U` | `Ctrl+U` | `<u>text</u>` |
| 取り消し線 | `⌘⇧S` | `Ctrl+Shift+S` | `~~text~~` |
| インラインコード | `⌘E` | `Ctrl+E` | `` `text` `` |
| リンク | `⌘K` | `Ctrl+K` | `[text]()`（カーソルは URL の位置） |
| ハイライト | `⌘⇧H` | `Ctrl+Shift+H` | `==text==` |
| コメント | `⌘⇧M` | `Ctrl+Shift+M` | `<!-- text -->` |
| ブロック内改行 | `⇧Enter` | `Shift+Enter` | 改行のみ（リストを継続しない） |

`<u>` `<!-- -->` `==` は CommonMark には無い記法だが、Notion のキーをそのまま使うため
HTML / 拡張記法（`==` は Obsidian 互換）で表現している。

## ブロック変換

| 機能 | Mac | Windows/Linux |
|------|-----|---------------|
| 通常テキストに戻す | `⌥⌘0` または `⌘⇧0` | `Ctrl+Shift+0` または `Alt+Ctrl+0` |
| 見出し 1 / 2 / 3 | `⌥⌘1` `⌥⌘2` `⌥⌘3` | `Ctrl+Shift+1〜3` または `Alt+Ctrl+1〜3` |
| チェックボックス | `⌥⌘4` | `Ctrl+Shift+4` または `Alt+Ctrl+4` |
| 箇条書き | `⌥⌘5` | `Ctrl+Shift+5` または `Alt+Ctrl+5` |
| 番号付きリスト | `⌥⌘6` | `Ctrl+Shift+6` または `Alt+Ctrl+6` |
| トグルリスト（`<details>`） | `⌥⌘7` | `Ctrl+Shift+7` または `Alt+Ctrl+7` |
| コードブロック | `⌥⌘8` | `Ctrl+Shift+8` または `Alt+Ctrl+8` |
| 引用 | `⌥⌘9` | `Ctrl+Shift+9` または `Alt+Ctrl+9` |

Windows は Notion と同じ `Ctrl+Shift+数字` に加えて、従来の `Alt+Ctrl+数字` も使える。

> `⌥⌘9` は Notion では「ページ化」。1 つの `.md` に表現できないため、Notion に
> 数字ショートカットが無い引用（`> `）を割り当てている。

## ブロック操作

| 機能 | Mac | Windows/Linux | 説明 |
|------|-----|---------------|------|
| チェックボックス切替 | `⌘Enter` | `Ctrl+Enter` | 箇条書きならチェックボックスに変える |
| ブロックを複製 | `⌘D` | `Ctrl+D` | インデントでぶら下がる子行も一緒に複製 |
| ブロックを上/下へ移動 | `⌘⇧↑` / `⌘⇧↓` | `Ctrl+Shift+↑` / `↓` | 子行も一緒に移動 |

## 編集・移動

| 機能 | Mac | Windows/Linux | Raw | Live |
|------|-----|---------------|:---:|:---:|
| リスト継続・終了（スマート Enter） | `Enter` | `Enter` | ✅ | ✅ |
| インデント追加 / 解除 | `Tab` / `⇧Tab` | 同 | ✅ | ✅ |
| 段階的な全選択 | `⌘A` | `Ctrl+A` | ✅ | ✅ |
| 行頭へ（スマート） | `⌘←` | `Home` | ✅ | `Home` のみ |
| 行末へ（スマート） | `⌘→` | `End` | ✅ | ❌ |
| 行頭まで選択 | `⇧⌘←` | `Shift+Home` | ✅ | ❌ |
| 上下移動（表では同じ列へ） | `↑` / `↓` | 同 | ✅ | ❌ |
| 表のセル内で改行 | `⇧Enter` | `Shift+Enter` | ❌ | ✅ |
| 表のセルを範囲選択 | `⇧←↑↓→` | `Shift+←↑↓→` | ❌ | ✅ |
| 表のセルを行・列の端まで範囲選択 | `⇧⌘←↑↓→` | `Ctrl+Shift+←↑↓→` | ❌ | ✅ |
| 検索・置換 | `⌘F` | `Ctrl+F` | VS Code 標準 | ✅ |
| 次 / 前の一致へ | `⌘G` / `⇧⌘G` | `Ctrl+G` / `Ctrl+Shift+G` | VS Code 標準 | ✅ |
| Live / Raw を切り替え | `⌘⇧.` | `Ctrl+Shift+.` | ✅ | ✅ |

> **Mac の注意**: Live のスマート行頭移動は `Home` にしか割り当てていない。
> Home キーの無い Mac のキーボードでは `fn+←` になる。

## キーバインドの無いコマンド

コマンドパレット（`⌘⇧P` →「Markdown Inline Preview:」）から実行する。

| コマンド | 内容 |
|---|---|
| `表を整形` | 表の整形 |
| `番号付きリストの番号を振り直す` | 番号付きリストの再採番 |
| `Navigate to Next / Previous Table Cell` | セル間移動 |
| `行番号の表示を切り替え` | 行番号ガターの表示切替 |
| `PDF に書き出す` | PDF 書き出し |
| `二重に囲まれたコードブロックを修復` | 二重フェンスの修復 |

***

## コンテキスト別の動作

### Enter キー（両モード）

| コンテキスト | 動作 |
|-------------|------|
| 番号付きリスト | 次の番号で継続 |
| チェックボックス | 新しい（未チェックの）チェックボックスを追加 |
| 箇条書き・引用 | マーカーを継続 |
| 空のマーカー行 | マーカーを削除 |
| 閉じていない開始フェンスの行末（Live） | 本文行と閉じフェンスを補う |

`⇧Enter` はどのコンテキストでもマーカーを継続せず、改行だけを入れる。表のセル（Live）では `Enter` は何もせず、`⇧Enter` は `<br>` を入れる。セルから出ると改行として表示される。

### `⌘←`（Mac）/ `Home`（Win）

| コンテキスト | 動作 |
|-------------|------|
| 通常テキスト | 行頭に移動 |
| リスト | マーカーの後ろに移動 |
| 見出し | `#` の後ろに移動 |
| テーブルセル | セル内コンテンツ開始位置に移動 |
| 引用 | `>` の後ろに移動 |

### `⌘A`（段階的な全選択）

押すたびに範囲が広がる。

| 現在地 | 1 回目 → 2 回目 → 3 回目 |
|---|---|
| コードフェンス内 | 中身 → ブロック全体 → 文書全体 |
| 表の中 | セル/行 → 表全体 → 文書全体 |
| それ以外 | 行 → 文書全体 |

***

## Notion 準拠のキーを切りたいとき

設定 `markdownInline.notionKeymap.enabled` を `false` にすると、**Raw モードでは**
VS Code 既定（`⌘B` = サイドバー開閉、`⌘D` = 次の一致を選択 など）に戻る。

```json
// settings.json
{
  "markdownInline.notionKeymap.enabled": false
}
```

**Live モードのキーは webview 内（CodeMirror）に持っているため、この設定を切っても
Live 側では効き続ける**（VS Code 既定を打ち消している負のキーバインドだけが外れる）。

## 個別にキーを変えたいとき（Raw モードのみ）

VS Code のキーボードショートカット設定（`⌘K ⌘S`）から変更できる。

```json
// keybindings.json — 例: ⌘B を VS Code 既定に戻し、太字は ⌥⌘B にする
[
  { "key": "cmd+b", "command": "-markdownInline.formatBold" },
  {
    "key": "alt+cmd+b",
    "command": "markdownInline.formatBold",
    "when": "editorTextFocus && editorLangId == markdown"
  }
]
```

Live モードのキーはこの方法では変更できない。
