# Slash Commands 仕様

## 概要

Markdown ファイル内で `/` を入力すると **補完メニュー** が表示され、
見出し・テーブル・コードブロックなどのブロックを Notion と同じ操作感で挿入できる。

| モード | 実装 | 備考 |
|--------|------|------|
| **Raw** | VS Code `CompletionItemProvider` | 行頭 `/` で候補表示 |
| **Preview** | Milkdown WebView スラッシュメニュー | 空行または `/` のみの行で候補表示。`preview.enableSlashMenu` |

Raw / Preview 共通のコマンド定義は `src/shared/slash/slashMenuItems.ts`。

既存の `/toc` / `/目次` を起点に、Notion スタイルのブロック挿入コマンドを追加する。

## 目的

- `/` を入力するだけで候補メニューを出し、矢印キーと Enter だけでブロックを挿入できる
- `heading`・`table`・`code` のような頻出操作をコマンドパレットなしで扱えるようにする
- Notion と同等の「書きながら操作できる」体験を VSCode の Markdown エディタで実現する
- 既存の `/toc` 動作を壊さずに、同じ枠組みで機能を追加する

## 非目的

- 一般的なチャット式 UI の実装
- すべての Markdown 構文の自動変換
- 文書全体を別フォーマットへ変換する大規模リライト

## 基本方針

1. **`/` を入力した瞬間にフローティング補完メニューを表示する**（`CompletionItemProvider` による実装）
2. 続けて文字を打つと候補をリアルタイムにフィルタリングする
3. `Enter` または `Tab` で確定し、行全体をコマンドの結果に置き換える
4. `Escape` でメニューを閉じ、`/` のまま通常テキストとして残す
5. コードブロック内では補完メニューを表示しない
6. 未知のコマンドは破壊的に変換しない
7. 既存の `toc` 系は後方互換を維持する
8. `normilize` は入力ミスとして `normalize` のエイリアス扱いにする

## 補完メニューの動作

### トリガー条件

- 行頭で `/` を入力したとき（`CompletionItemProvider` のトリガー文字: `/`）
- 先頭に空白がない行
- Markdown ファイル（`.md` / `.markdown`）
- fenced code block 内では **表示しない**

### メニューの見た目（モックアップ）

```
# Hello World
/                          ← / を入力した直後
┌──────────────────────────────────┐
│ 🔡 h1     Big heading            │
│ 🔡 h2     Medium heading         │  ← 矢印で選択
│ 🔡 h3     Small heading          │
│ ➕ table  Insert table           │
│ 💻 code   Code block             │
│ 💬 quote  Quote                  │
│ ─  divider Horizontal rule       │
│ 💡 callout Callout               │
│ •  bullet  Bullet list           │
│ 1. numbered Numbered list        │
│ ☑  todo   To-do list             │
│ 📑 toc    Table of contents      │
└──────────────────────────────────┘

/co                        ← 続けてタイプするとフィルタリング
┌──────────────────────────────────┐
│ 💻 code   Code block             │
│ 💡 callout Callout               │
└──────────────────────────────────┘
```

### 確定・キャンセル

| 操作 | 動作 |
|------|------|
| `Enter` / `Tab` | 選択中のコマンドを実行し、行を置換 |
| `↑` / `↓` | 候補を移動 |
| `Escape` | メニューを閉じ、`/text` のまま通常テキストとして残す |
| そのまま Enter（補完なし） | 既存の行単位 directive として処理（後方互換） |

### 基本構文（直接入力 / 後方互換）

```text
/<command> [args...]
```

メニューを使わず直接入力して Enter でも実行できる（既存の `/toc` 等と同じ動作）。

### 例

```markdown
/h1
/h2
/heading 2 セクション名
/table
/table normalize on
/toc
/目次
/code bash
/quote
/divider
/callout warning
/bullet
/numbered
/todo
```

### 無効な例

```markdown
本文 /heading 1   ← 行頭でないため補完メニューが出ない
  /table          ← 先頭に空白があるため無効
```

---

## コマンド一覧

### 見出し系

#### `/toc` / `/目次`（実装済み）

目次を生成・更新する。既存仕様を維持する。

#### `/heading <level> [title]`（実装済み）

Markdown 見出しを挿入または変換する。

```markdown
/heading 1        →  # 
/heading 2 仕様   →  ## 仕様
/heading 3 使い方 →  ### 使い方
```

- `level` は `1` から `6`
- `title` がある場合は見出し本文として使う
- `title` がない場合は見出しマーカーのみを挿入し、カーソルを本文位置へ移動する
- 現在行を通常テキストから見出しへ変換する
- 無効 level（0, 7, 文字列）は変換せずエラー扱い

#### `/h1` `/h2` `/h3` `/h4` `/h5` `/h6`（確定: Notion スタイル）

`/heading <level>` の省略形。パーサーの前処理で `/h2` → `/heading 2` に展開してから既存ロジックに流す。

```markdown
/h1  →  # 
/h2  →  ## 
/h3  →  ### 
```

- タイトルの指定は不可（引数なし専用）
- タイトルつきで挿入したい場合は `/heading <level> title` を使う
- 前処理での展開: `parseSlashCommandLine` より前段で `/h[1-6]` を `/heading [1-6]` に変換
- 既存の `/heading` パーサーへの影響はゼロ

---

### テーブル系

#### `/table`（実装済み）

テーブルの作成または整形を行う。

- 選択範囲またはカーソル位置が既存テーブル内なら `formatTable` と同等の整形を実行
- テーブル外なら **2列固定** の初期テーブルを挿入する

```markdown
| Header 1 | Header 2 |
| --- | --- |
|  |  |
```

> 初期列数は 2 列に固定。選択範囲のセル数に追従する動作は行わない。

#### `/table normalize on|off`（実装済み）

テーブルの正規化モードを切り替える。

- `on`: 既存の整形ロジックで列幅を揃える。ワークスペース設定 `markdownInline.advanced.autoFormatTables` を `true` に更新する
- `off`: 列幅の整形を抑える。ワークスペース設定を `false` に更新する
- `normilize` は typo alias として同じ意味に解決する
- **設定への反映は永続**（セッションをまたいで有効。一時モードではない）

---

### コードブロック系

#### `/code [language]`（提案）

コードフェンスブロックを挿入し、カーソルをブロック内に移動する。

```markdown
/code       →  ```
               ▌（カーソル）
               ```

/code bash  →  ```bash
               ▌
               ```

/code ts    →  ```typescript
               ▌
               ```
```

**言語エイリアス展開（挿入時に正規名に変換）:**

| 入力 | 展開後 |
|------|--------|
| `sh` | `bash` |
| `js` | `javascript` |
| `ts` | `typescript` |
| `py` | `python` |

- `language` を省略した場合はフェンスのみ挿入
- 挿入後、コードブロック自動補完（`enableCodeBlockAutoComplete`）との競合はしない
- 既存の `` ``` `` 入力補完と組み合わせて使える

---

### テキスト構造系

#### `/quote`（提案）

引用ブロックを挿入またはカーソル行を引用に変換する。

```markdown
/quote        →  > ▌（カーソル）

（現在行がテキストの場合）
Hello World
/quote         →  > Hello World
```

- カーソル行が空の場合は `> ` を挿入してカーソルをその後に置く
- カーソル行にテキストがある場合は、そのテキストを引用行に変換する
- 複数行選択時は各行を引用行へ変換する

#### `/divider`（提案）

水平線を挿入する。

```markdown
/divider  →  ---
             ▌（次行にカーソル）
```

- 設定 `markdownInline.slashCommands.dividerStyle` で `---` / `***` / `___` を選択可能
- デフォルトは `---`

#### `/callout [type]`（提案）

コールアウト（注意書き）ブロックを挿入する。
Markdown ネイティブ表現として引用ブロック＋絵文字を使用する。

```markdown
/callout          →  > 💡 ▌（カーソル）
/callout warning  →  > ⚠️ ▌
/callout danger   →  > 🚨 ▌
/callout info     →  > ℹ️ ▌
```

| 種別 | 絵文字 | エイリアス |
|------|-------|-----------|
| `note`（省略時） | 💡 | — |
| `warning` | ⚠️ | `warn` |
| `danger` | 🚨 | `error` |
| `info` | ℹ️ | `tip` |

- Preview モードでは種別に応じたスタイル付きボックスとして表示する
- Raw モードでは通常の引用ブロックとして機能する（他のエディタで崩れない）

---

### リスト系

#### `/bullet`（提案）

箇条書きリストを開始する。

```markdown
/bullet  →  - ▌（カーソル）
```

- カーソル行がすでにリストの場合は何もしない
- 複数行選択時は `convertToBullet` と同等の変換を行う

#### `/numbered`（提案）

番号付きリストを開始する。

```markdown
/numbered  →  1. ▌（カーソル）
```

- 直前の番号付きリストが存在する場合は次の番号を自動補完
- 複数行選択時は `convertToNumbered` と同等の変換を行う

#### `/todo`（提案）

チェックボックスリストを開始する。

```markdown
/todo  →  - [ ] ▌（カーソル）
```

- 複数行選択時は `convertToCheckbox` と同等の変換を行う

---

## 優先順位

1. 完全一致する既知コマンドを優先する
2. コマンド名が長いものを優先する
3. その後に引数解釈を行う

### 競合回避

- `/toc` と `/table` のように先頭一致するケースでも、完全一致または最長一致で判定する
- `/h1` と `/heading` は完全一致で個別判定するため競合しない
- 未知コマンドはそのまま plain text として残す

---

## エラーハンドリング

### 無効な heading level

- `/heading 0`, `/heading 7`, `/heading abc` → 変換せず、入力エラーとして扱う

### 無効な normalize 値

- `/table normalize maybe` → 変換せず、警告を出す

### 無効な callout 種別

- `/callout unknown` → デフォルトの `note`（💡）として扱う

### 非 Markdown ファイル

- コマンドは無視する

---

## 実装方針メモ

### 補完メニューの実装（Notion 方式）

VSCode の `vscode.languages.registerCompletionItemProvider` を使い、`/` をトリガー文字として登録する。

```typescript
vscode.languages.registerCompletionItemProvider(
  { language: 'markdown' },
  {
    provideCompletionItems(document, position) {
      // コードブロック内なら null を返す（補完しない）
      if (isInFencedCodeBlock(document, position.line)) return null;

      const line = document.lineAt(position.line).text;
      if (!line.startsWith('/')) return null;

      return [
        makeItem('h1', '# '),
        makeItem('h2', '## '),
        makeItem('code', '```\n\n```'),
        makeItem('quote', '> '),
        makeItem('divider', '---'),
        makeItem('callout', '> 💡 '),
        makeItem('bullet', '- '),
        makeItem('numbered', '1. '),
        makeItem('todo', '- [ ] '),
        makeItem('toc', '/toc'),  // 既存ロジックにフォールスルー
        // ...
      ];
    }
  },
  '/'  // トリガー文字
);
```

- `CompletionItem` の `insertText` で行全体を置換（`additionalTextEdits` で `/` を削除）
- フィルタリングは VSCode の IntelliSense エンジンが自動で行う
- 既存の行単位 directive（Enter で実行）とは独立して共存する

### `/h1`〜`/h6` の前処理展開

`parseSlashCommandLine` を呼ぶ前段に展開ステップを追加する。

```typescript
function expandShorthandHeading(line: string): string {
  const m = line.match(/^\/h([1-6])$/);
  if (m) return `/heading ${m[1]}`;
  return line;
}
```

既存の `/heading` パーサーへの変更はゼロ。

### `/table normalize` のワークスペース設定反映

```typescript
await vscode.workspace.getConfiguration('markdownInline.advanced')
  .update('autoFormatTables', value, vscode.ConfigurationTarget.Workspace);
```

- `ConfigurationTarget.Workspace` で `.vscode/settings.json` に書き込む
- グローバル設定を変えずにプロジェクト単位で有効・無効を切り替えられる

### 既存コードとの接続点

- `/toc` の更新ロジックは既存の `updateTableOfContents` を再利用する
- `/table` は既存の `formatTableAtLine` と `src/utils/table.ts` を再利用する
- `/heading` は既存の `buildHeadingLine` / `parseHeadingSlashCommand` を再利用する
- `/bullet`, `/numbered`, `/todo` は既存の `convertToBullet` / `convertToNumbered` / `convertToCheckbox` を再利用する
- `/code` は既存のコードブロック自動補完ロジック（`enableCodeBlockAutoComplete`）と同じ行パターンを活用する

### 将来拡張しやすい形

```typescript
const commandHandlers: Record<string, CommandHandler> = {
  'h1': headingHandler(1),
  'h2': headingHandler(2),
  'code': codeHandler,
  'quote': quoteHandler,
  // 追加するだけで補完候補にも自動で乗る
};
```

`/image`, `/toggle`, `/columns` などを追加するとき、handler を追記するだけで補完メニューにも反映される。

---

## 実装状態サマリー

| コマンド | 状態 | 補完メニュー |
|---------|------|------------|
| `/toc` / `/目次` | 実装済み | ○ |
| `/heading <level> [title]` | 実装済み | ○ |
| `/table` | 実装済み（初期列数2列固定確定） | ○ |
| `/table normalize on\|off` | 実装済み（ワークスペース設定反映確定） | ○ |
| `/h1` ～ `/h6` | 確定（前処理展開方式） | ○ |
| `/code [language]` | 確定 | ○ |
| `/quote` | 確定 | ○ |
| `/divider` | 確定 | ○ |
| `/callout [type]` | 確定 | ○ |
| `/bullet` | 確定 | ○ |
| `/numbered` | 確定 | ○ |
| `/todo` | 確定 | ○ |
| 補完メニュー（CompletionItemProvider） | 新規実装 | — |

---

## テスト方針

### ユニットテスト

対象:

- コマンド文字列のパース
- `normalize` / `normilize` の alias 解決
- `heading` の level 判定
- `h1`〜`h6` の省略形パース
- `callout` 種別の alias 解決（`warn` → `warning` 等）
- `code` 言語エイリアスの展開（`ts` → `typescript` 等）
- 未知コマンドの非破壊扱い

### 統合テスト

対象:

1. `/heading 1` が `# ` に変換される
2. `/heading 2 仕様` が `## 仕様` に変換される
3. `/h3` が `### ` に変換される
4. `/table` がテーブル雛形を挿入する
5. `/table normalize on` 実行後にテーブル整形が有効になる
6. `/table normalize off` 実行後に整形が抑制される
7. `/toc` が従来通り目次を生成する
8. `/code bash` が ` ```bash ... ``` ` ブロックを挿入する
9. `/quote` が `> ` を挿入する
10. `/divider` が `---` を挿入する
11. `/callout warning` が `> ⚠️ ` を挿入する
12. `/bullet` が `- ` を挿入する
13. `/todo` が `- [ ] ` を挿入する
14. コードブロック内の `/heading 1` は無視される

### 回帰テスト

対象:

- 既存の `/toc` 自動更新
- テーブル自動整形
- 見出し装飾

---

## 受け入れ条件

- `/` を入力した瞬間に補完メニューが表示される（**Raw**: CompletionItemProvider / **Preview**: WebView メニュー）
- タイプで候補がリアルタイムフィルタリングされる
- `Enter` / `Tab` で確定し、行がブロックに置き換わる
- `Escape` でキャンセルし、`/text` がそのまま残る
- `/heading` と `/h1`〜`/h6`（前処理展開）が見出し操作として機能する
- `/table` が 2列固定テーブルを挿入する
- `/table normalize on|off` がワークスペース設定 `autoFormatTables` を更新する
- `/code [language]` がコードブロックを挿入し、カーソルが内側に入る
- `/quote`, `/divider`, `/callout` が対応する Markdown 構造を挿入する
- `/bullet`, `/numbered`, `/todo` がリスト行を開始する
- `/toc` / `/目次` の既存仕様が維持される
- コードブロック内では補完メニューが表示されず、コマンドが無視される

---

## ユーザーガイド（クイックリファレンス）

> コマンドパレット・キーバインドの一覧は [command-surface.md](./command-surface.md) を参照。

### まず覚える 5 つ

1. `/` → `table` / `h1` / `code` 等（メニューから選択）
2. `/toc` または `/目次`
3. `Tab` / `Shift+Tab`（リストインデント）
4. `Cmd+Enter` / `Ctrl+Enter`（チェックボックス）
5. `Cmd+Shift+M`（Raw ↔ Preview）

### `/heading` の例

```markdown
/heading 1
/heading 2 仕様
```

- レベル `1`〜`6`。タイトル省略可。
- `/h1`〜`/h6` は Raw で `/heading N` に展開される。

### `/table normalize`

```markdown
/table normalize on
/table normalize off
```

`markdownInline.advanced.autoFormatTables` をワークスペース設定に保存する。`normilize` は typo エイリアス。

### 使い分け

| やりたいこと | 使うもの |
|-------------|----------|
| ブロックを素早く挿入 | `/` スラッシュメニュー |
| 既存行をまとめて変換 | コマンドパレット（Convert to …） |
| ショートカットで操作 | [keyboard-shortcuts.md](../user-guide/keyboard-shortcuts.md) |

## 未決事項

1. `/callout` の Preview モード表示スタイルをどのクラスで管理するか（CSS モジュール vs インラインスタイル）
