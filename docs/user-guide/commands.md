# コマンドガイド

このページは、Markdown Inline Preview の操作を「文書内に書くコマンド」と「コマンドパレットから実行するコマンド」に分けて説明する。

## 1. 文書内スラッシュコマンド

### `/heading`

```markdown
/heading 1
/heading 2 仕様
/heading 3 使い方
```

#### 使い方

- `/heading 1` で H1 を作る
- `/heading 2 仕様` で H2 見出し「仕様」を作る
- `/heading 3` のようにタイトルなしでも使える

#### ポイント

- `level` は `1` から `6`
- タイトルなしの場合は見出しマーカーだけを残す
- 無効な値は変換されない

### `/table`

```markdown
/table
```

#### 使い方

- テーブルのひな形を作る
- すでにテーブルがある場所で使うと整形を行う

### `/table normalize on|off`

```markdown
/table normalize on
/table normalize off
/table normilize on
/table normilize off
```

#### 使い方

- `on` で自動整形を有効にする
- `off` で自動整形を止める
- `normilize` は typo でも同じ意味として扱う

### `/toc` / `/目次`

```markdown
/toc
```

```markdown
/目次
```

#### 使い方

- 文書内の見出しから目次を作る
- 既存の目次も更新できる

## 2. コマンドパレットのコマンド

### リスト編集

- `Renumber Ordered Lists`
- `Convert to Bullet List`
- `Convert to Numbered List`
- `Convert to Checkbox`
- `Convert to Normal Text`
- `Toggle Markdown Checkbox`
- `Click Checkbox`
- `Toggle Checkbox at Specific Line`
- `Increase List/Checkbox Indent`
- `Decrease List/Checkbox Indent`

### テーブル編集

- `Format Markdown Table`
- `Navigate to Next Table Cell`
- `Navigate to Previous Table Cell`

### カーソル移動

- `Smart Move Left`
- `Smart Move Right`
- `Smart Move Up`
- `Smart Move Down`
- `Smart Select Left`
- `Smart Select All in Table Cell or Code Block`
- `Move Line/Selection Up`
- `Move Line/Selection Down`

### 目次

- `Update Table of Contents`

## 3. 使い分け

### 早く入力したいとき

文書内スラッシュコマンドを使う。

### 既存の行をまとめて変えたいとき

コマンドパレットの変換系コマンドを使う。

### ショートカットで済ませたいとき

キーバインドがある操作を使う。

## 4. 補足

- `Click Checkbox` はマウスクリックに近い操作をコマンドとして再利用する入口
- `Toggle Checkbox at Specific Line` は、行番号を渡してその行のチェックボックスを切り替える入口
- どちらも通常のコマンドパレットから実行できる

## 5. まず覚えるもの

1. `/heading`
2. `/table`
3. `/toc`
4. `Tab` と `Shift+Tab`
5. `Cmd+Enter` / `Ctrl+Enter`

この 5 つだけでも、Markdown 編集の多くをカバーできる。
