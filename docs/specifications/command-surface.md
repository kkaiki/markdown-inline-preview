# コマンド面仕様

## 概要

Markdown Inline Preview が提供する操作面を、次の 3 系統に分けて定義する。

1. Markdown 文書内に書くスラッシュコマンド（`/command` 形式）
2. VS Code のコマンドパレットやキーバインドから呼ぶ拡張コマンド
3. エディタ内の文脈依存キーボード操作（Cmd+A 等）

この文書は、コマンドの入口、期待動作、現在の実装状態をひとまとめにする基準資料である。

## 設計方針

- 文書内コマンドは、Markdown の通常本文を壊さない行単位 directive として扱う
- コマンドパレット用コマンドは、編集操作を明示的に呼び出す入口として扱う
- 文脈依存操作は、カーソルがどの「ブロック」にいるかで挙動を変える（コードブロック / テーブル / 通常行）
- 既存動作は維持し、曖昧な入力は破壊的に変換しない
- 仕様は「理想」ではなく「公開面の真実」を表す

---

## 文書内スラッシュコマンド

| コマンド | 用途 | 状態 |
|---|---|---|
| `/heading <level> [title]` | 見出しを挿入または変換 | 実装済み |
| `/h1`〜`/h6` | 見出し（メニュー / 補完。Raw では `/heading N` に展開） | 実装済み |
| `/table` | テーブルを作成または整形 | 実装済み |
| `/table normalize on\|off` | テーブル自動整形の切り替え | 実装済み |
| `/toc` / `/目次` | 目次を生成・更新 | 実装済み |
| `/code [language]` | コードブロックを挿入 | 実装済み |
| `/quote` | 引用ブロックを挿入 | 実装済み |
| `/divider` | 水平線を挿入 | 実装済み |
| `/callout`（warning / danger / info） | コールアウトブロック | 実装済み |
| `/bullet` / `/numbered` / `/todo` | リスト行を開始 | 実装済み |

---

## コマンドパレット用コマンド

| コマンド ID | 表示名 | 用途 | 状態 |
|---|---|---|---|
| `markdownInline.smartEnter` | Smart Enter: Continue/Exit List | リスト継続・終了 | 実装済み |
| `markdownInline.toggleCheckbox` | Toggle Markdown Checkbox | チェックボックス切替 | 実装済み |
| `markdownInline.clickCheckbox` | Click Checkbox | マウスクリック向け | 実装済み |
| `markdownInline.toggleCheckboxAtLine` | Toggle Checkbox at Specific Line | 指定行のチェックボックス切替 | 実装済み |
| `markdownInline.formatTable` | Format Markdown Table | テーブル整形 | 実装済み |
| `markdownInline.increaseIndent` | Increase List/Checkbox Indent | インデント増加 | 実装済み |
| `markdownInline.decreaseIndent` | Decrease List/Checkbox Indent | インデント減少 | 実装済み |
| `markdownInline.smartMoveLeft` | Smart Move Left | マーカー後ろへ移動 | 実装済み |
| `markdownInline.smartSelectLeft` | Smart Select Left | マーカー末尾まで選択 | 実装済み |
| `markdownInline.smartMoveRight` | Smart Move Right | テーブルセル内右移動 | 実装済み |
| `markdownInline.tableNavigateRight` | Navigate to Next Table Cell | 次のテーブルセルへ移動 | 実装済み |
| `markdownInline.tableNavigateLeft` | Navigate to Previous Table Cell | 前のテーブルセルへ移動 | 実装済み |
| `markdownInline.smartMoveDown` | Smart Move Down | テーブルセル内下移動 | 実装済み |
| `markdownInline.smartMoveUp` | Smart Move Up | テーブルセル内上移動 | 実装済み |
| `markdownInline.smartSelectAll` | Smart Select All | 文脈依存の全選択（後述） | 実装済み |
| `markdownInline.moveLineUp` | Move Line/Selection Up | 行/選択範囲を上へ移動 | 実装済み |
| `markdownInline.moveLineDown` | Move Line/Selection Down | 行/選択範囲を下へ移動 | 実装済み |
| `markdownInline.renumberLists` | Renumber Ordered Lists | 番号付きリスト再採番 | 実装済み |
| `markdownInline.convertToBullet` | Convert to Bullet List | 箇条書きへ変換 | 実装済み |
| `markdownInline.convertToNumbered` | Convert to Numbered List | 番号付きへ変換 | 実装済み |
| `markdownInline.convertToCheckbox` | Convert to Checkbox | チェックボックスへ変換 | 実装済み |
| `markdownInline.convertToNormal` | Convert to Normal Text | 通常テキストへ変換 | 実装済み |
| `markdownInline.updateTableOfContents` | Update Table of Contents | 目次更新 | 実装済み |

---

## 文脈依存キーボード操作

### `markdownInline.smartSelectAll`（Cmd+A / Ctrl+A）

カーソルの位置に応じて、選択範囲を段階的に拡大する。

#### コードブロック内での動作

```
カーソルがコードブロック内（``` ～ ``` の間）にある場合:

1 回目の Cmd+A → コードブロック内のコンテンツ全体を選択
                  （フェンスの ``` 行は含まない）

2 回目の Cmd+A → ドキュメント全体を選択（通常の全選択）
```

**例:**

```bash
#!/bin/bash       ← フェンス開始行（選択されない）
echo "hello"      ← 選択される
echo "world"      ← 選択される
                  ← 選択される（末尾の空行含む）
```

2 回押すと `editor.action.selectAll` にフォールスルー。

#### テーブルセル内での動作

```
カーソルがテーブルのセル内にある場合:

1 回目 → セルのコンテンツ部分を選択（| の内側のみ）
2 回目 → テーブルの行全体を選択（| を含む行頭〜行末）
3 回目 → ドキュメント全体を選択
```

#### 通常行での動作

- コードブロック・テーブル以外の場所では `editor.action.selectAll` に委譲

---

## コードブロックシンタックスハイライト（Raw モード）

VSCode エディタ内で Markdown を編集中、コードブロックの言語識別子に応じて
トークンに色付けを行う（**TextEditorDecoration** による独自実装）。

### 実装方針（確定）

独自正規表現ベースの `TextEditorDecoration` による実装を継続・拡張する。
VSCode の TextMate grammar（`embedded-language`）は Markdown ファイルには適用できないため、
コードブロック内のハイライトは独自実装が必要となる。

Shiki / highlight.js は Preview モード（WebView）側でのみ使用し、
Raw モードでは引き続き独自正規表現ベースで対応する。

### 対応言語（現行 + 拡張予定）

| 識別子 | エイリアス | 状態 |
|--------|-----------|------|
| `bash` | `sh`, `shell`, `zsh` | 実装済み |
| `javascript` | `js` | 実装済み |
| `typescript` | `ts` | 実装済み |
| `python` | `py` | 実装済み |
| `css` | — | 実装済み |
| `html` | — | 実装済み |
| `json` | — | 実装済み |
| `rust` | `rs` | 拡張候補 |
| `go` | — | 拡張候補 |
| `yaml` | `yml` | 拡張候補 |
| `sql` | — | 拡張候補 |

### ハイライト対象

各言語で以下の要素を色分けする:

| カテゴリ | 対象トークン例 |
|---------|--------------|
| キーワード | `if`, `else`, `function`, `class`, `return` 等 |
| 文字列 | `"..."`, `'...'`, `` `...` `` |
| コメント | `//`, `#`, `<!-- -->` |
| 数値 | `42`, `3.14`, `0xFF` |
| 演算子・記号 | `=`, `=>`, `{`, `}` |

### コードブロック背景

言語の有無にかかわらず、コードブロック全体に背景色を適用する
（`isCodeBlockDecorationsEnabled()` が `true` のとき）。

```
設定キー: markdownInline.advanced.enableCodeBlockDecorations
デフォルト: true
```

---

## スラッシュコマンド仕様

### `/heading <level> [title]`（実装済み）

#### 入力形式

```markdown
/heading 1
/heading 2 仕様
/heading 3 使い方
```

#### 動作

- `level` は `1` から `6`
- `title` がある場合は見出し本文として使う
- `title` がない場合は見出しマーカーのみを残す
- 既存行の置換を基本とし、本文を壊さない

#### 無効入力

- `/heading 0`, `/heading 7`, `/heading abc` → 変換せず、入力エラーとして扱う

---

### `/h1` `/h2` `/h3`（提案: Notion スタイル）

`/heading <level>` の省略形。カーソル行を即座に見出しへ変換する。

```markdown
/h1  →  # 
/h2  →  ## 
/h3  →  ### 
```

- タイトルの指定はできない（引数なし）
- `title` が必要な場合は従来の `/heading <level> title` を使う

---

### `/table`（実装済み）

#### 動作

- 既存テーブル上では整形を行う
- テーブル外では 2 列の初期テーブルを挿入する

#### 既定テンプレート

```markdown
| Header 1 | Header 2 |
| --- | --- |
|  |  |
```

---

### `/table normalize on|off`（実装済み）

- `on`: 自動整形を有効にする
- `off`: 自動整形を抑止する
- `normilize` は typo alias として同等扱い

---

### `/toc` / `/目次`（実装済み）

- 見出しから目次を生成する
- 既存の目次があれば更新する
- 自動更新の起点にも使う

---

### `/code [language]`（提案）

コードフェンスブロックを挿入し、カーソルをブロック内に移動する。

```markdown
/code       →  ```
               [カーソル位置]
               ```

/code bash  →  ```bash
               [カーソル位置]
               ```

/code ts    →  ```typescript
               [カーソル位置]
               ```
```

- `language` を省略した場合はフェンスのみ挿入
- 言語エイリアス（`sh` → `bash`、`js` → `javascript` 等）を展開して挿入
- コードブロック自動補完（`enableCodeBlockAutoComplete`）と共存

---

### `/quote`（提案）

引用ブロックを挿入またはカーソル行を引用に変換する。

```markdown
/quote        →  > [カーソル位置]

（現在行がテキストの場合）
/quote
"Hello World" →  > Hello World
```

---

### `/divider`（提案）

水平線を挿入する。

```markdown
/divider  →  ---
             [次行にカーソル]
```

`---` / `***` / `___` のいずれかを設定で選択可能。

---

### `/callout`（提案）

コールアウトブロック（注意書き）を挿入する。
Markdown ネイティブ表現として引用ブロック＋絵文字を使う。

```markdown
/callout          →  > 💡 [カーソル位置]

/callout warning  →  > ⚠️ [カーソル位置]

/callout danger   →  > 🚨 [カーソル位置]

/callout info     →  > ℹ️ [カーソル位置]
```

| 種別 | 絵文字 | エイリアス |
|------|-------|-----------|
| `note`（デフォルト）| 💡 | （省略時） |
| `warning` | ⚠️ | `warn` |
| `danger` | 🚨 | `error` |
| `info` | ℹ️ | `tip` |

Preview モードでは、スタイル付きのボックスとして表示する（FR-03-2 に準拠）。

---

### `/bullet`（提案）

箇条書きリストを開始する。

```markdown
/bullet  →  - [カーソル位置]
```

- カーソル行がすでにリストの場合は何もしない
- 選択範囲がある場合は選択行すべてを `- ` に変換（`convertToBullet` の相当動作）

---

### `/numbered`（提案）

番号付きリストを開始する。

```markdown
/numbered  →  1. [カーソル位置]
```

- 直前の番号付きリストが存在する場合は次の番号を自動補完
- 選択範囲がある場合は選択行すべてを番号付きに変換（`convertToNumbered` の相当動作）

---

### `/todo`（提案）

チェックボックスリストを開始する。

```markdown
/todo  →  - [ ] [カーソル位置]
```

- 選択範囲がある場合は選択行すべてを `- [ ] ` に変換（`convertToCheckbox` の相当動作）

---

## グループ別コマンド一覧

### リスト操作

- `markdownInline.smartEnter`
- `markdownInline.renumberLists`
- `markdownInline.convertToBullet`
- `markdownInline.convertToNumbered`
- `markdownInline.convertToCheckbox`
- `markdownInline.convertToNormal`
- `markdownInline.toggleCheckbox`
- `markdownInline.increaseIndent`
- `markdownInline.decreaseIndent`

### テーブル操作

- `markdownInline.formatTable`
- `markdownInline.tableNavigateRight`
- `markdownInline.tableNavigateLeft`
- `markdownInline.smartMoveRight`
- `markdownInline.smartMoveDown`
- `markdownInline.smartMoveUp`

### ナビゲーション・選択

- `markdownInline.smartMoveLeft`
- `markdownInline.smartSelectLeft`
- `markdownInline.smartSelectAll`（文脈依存: コードブロック → テーブル → 全選択）
- `markdownInline.moveLineUp`
- `markdownInline.moveLineDown`

### 目次

- `markdownInline.updateTableOfContents`

---

## 現在の実装状態

### 実装済み

- `markdownInline.smartEnter`
- `markdownInline.toggleCheckbox`
- `markdownInline.clickCheckbox`
- `markdownInline.toggleCheckboxAtLine`
- `markdownInline.formatTable`
- `markdownInline.increaseIndent`
- `markdownInline.decreaseIndent`
- `markdownInline.smartMoveLeft`
- `markdownInline.smartSelectLeft`
- `markdownInline.smartMoveRight`
- `markdownInline.tableNavigateRight`
- `markdownInline.tableNavigateLeft`
- `markdownInline.smartMoveDown`
- `markdownInline.smartMoveUp`
- `markdownInline.smartSelectAll`（コードブロック・テーブル・通常行の文脈切替）
- `markdownInline.moveLineUp`
- `markdownInline.moveLineDown`
- `markdownInline.renumberLists`
- `markdownInline.convertToBullet`
- `markdownInline.convertToNumbered`
- `markdownInline.convertToCheckbox`
- `markdownInline.convertToNormal`
- `markdownInline.updateTableOfContents`
- コードブロックシンタックスハイライト（bash / js / ts / python / css / html / json）
- コードブロック背景色デコレーション

### 確定・未実装（次フェーズで実装）

- 補完メニュー（`CompletionItemProvider` による `/` トリガー Notion スタイル）
- `/h1`〜`/h6`（前処理で `/heading N` に展開する省略形）
- `/code [language]`（コードブロック挿入、言語エイリアス展開あり）
- `/quote`（引用ブロック挿入）
- `/divider`（水平線挿入）
- `/callout [type]`（コールアウト挿入：note / warning / danger / info）
- `/bullet`（箇条書き開始）
- `/numbered`（番号付きリスト開始）
- `/todo`（チェックボックス開始）

### 補足

`markdownInline.clickCheckbox` はマウスクリック経由のチェックボックス切替を再利用する内部入口としても使われる。

`markdownInline.toggleCheckboxAtLine` は、コマンド実行時に指定行番号が渡された場合はその行を、渡されなければ現在行を切り替える。

---

## 受け入れ条件

- 文書内コマンドとコマンドパレットコマンドが一覧できる
- 既存コマンドの公開面が実装状態と一致する
- `/heading`、`/table`、`/toc` の仕様が一貫している
- `smartSelectAll` のコードブロック内・テーブル内・通常行の動作が明示されている
- コードブロックのシンタックスハイライト対応言語が明示されている
- ユーザーがどのコマンドをどの入口で使うべきか判断できる
