# 機能一覧

## 1. チェックボックス機能

### 自動生成
- チェックボックス行でEnterを押すと新しいチェックボックスを自動追加
- 空のチェックボックスでEnterを押すとマーカーを削除

### トグル操作
- **マウスクリック**: `[ ]` または `[x]` をクリック
- **キーボード**: `Cmd+Enter` (Mac) / `Ctrl+Enter` (Win)
- **Advanced設定**: `markdownInline.advanced.enableCheckboxMouseToggle`

### 装飾
- 完了タスク（`[x]`）は取り消し線と透明度を適用
- 編集中の行では装飾を一時的に非表示

---

## 2. リスト操作機能

### リストタイプ変換

| 変換先 | Mac | Windows/Linux |
|--------|-----|---------------|
| 箇条書き (`- `) | `Alt+Cmd+5` | `Alt+Ctrl+5` |
| 番号付き (`1. `) | `Alt+Cmd+6` | `Alt+Ctrl+6` |
| チェックボックス (`- [ ] `) | `Alt+Cmd+4` | `Alt+Ctrl+4` |
| 通常テキスト | `Alt+Cmd+0` | `Alt+Ctrl+0` |

### インデント操作
- **Tab**: インデント追加
- **Shift+Tab**: インデント削除
- 番号付きリストは自動的に再採番

### スマートEnter
- 番号付きリスト: 次の番号で継続
- チェックボックス: 新しいチェックボックスを追加
- 空のアイテム: マーカーを削除して終了

---

## 3. テーブル機能

### 自動整形
- テーブル行を編集後、別の行に移動すると自動整形（デフォルトはオフ）
- 列幅を揃え、アライメントを維持
- 自動整形を有効にしたい場合は `markdownInline.advanced.autoFormatTables` を `true` に設定
- 自動整形がオフでも、コマンドパレットの `Format Markdown Table` は利用可能

### 日本語対応
- 全角文字の幅を正確に計算
- 設定でカスタマイズ可能:
  - `markdownInline.table.japaneseCharWidth`: 2.0
  - `markdownInline.table.narrowCharWidth`: 0.8
  - `markdownInline.table.wideCharWidth`: 1.3

### セル内ナビゲーション
- `Cmd+Left`: セル内のコンテンツ開始位置に移動
- `Cmd+Right`: セル内のコンテンツ末尾または次セルへ移動
- `Up` / `Down`: 同じ列位置を維持して上下移動
- 詳細: [テーブルナビゲーション仕様](../specifications/table-navigation.md)

---

## 4. 目次機能

### 使い方
1. Markdownファイルで `/目次` または `/toc` と記述
2. コマンド実行で目次生成
3. 見出しを変更すると自動更新
4. その他の文書内コマンドは [コマンドガイド](commands.md) を参照

### 生成される目次
```markdown
/目次

- [セクション1](#セクション1)
  - [サブセクション](#サブセクション)
- [セクション2](#セクション2)
```

### 設定
| 設定 | デフォルト | 説明 |
|------|-----------|------|
| `markdownInline.toc.autoUpdate` | true | 自動更新の有効化 |
| `markdownInline.advanced.autoUpdateTableOfContents` | true | 自動更新のAdvancedトグル |
| `markdownInline.toc.minLevel` | 1 | 最小見出しレベル |
| `markdownInline.toc.maxLevel` | 6 | 最大見出しレベル |

---

## 5. 見出し装飾

### レベル別カラーリング
- H1〜H6まで異なる色と太さで表示
- フォーカス時は生のMarkdown構文を表示
- `markdownInline.advanced.enableHeadingDecorations` でオン・オフ可能

### カラースキーム
設定 `markdownInline.headingColorScheme`:
- `default`: レベル別に異なる色
- `monochrome`: グレースケール
- `vibrant`: 高コントラスト

---

## 6. コードブロック

### 自動補完
- ` ``` ` を入力すると自動的に閉じタグを追加
- カーソルを中央に配置
- `markdownInline.advanced.enableCodeBlockAutoComplete` でオン・オフ可能

### 装飾
- 背景色でコードブロックを視覚化
- 言語指定を認識
- `markdownInline.advanced.enableCodeBlockDecorations` でオン・オフ可能

---

## 7. スマートカーソル移動

### Cmd+Left / Home
- リスト: マーカーの後ろに移動
- 見出し: `#` の後ろに移動
- テーブル: セル内のコンテンツ開始位置に移動

### Shift+Cmd+Left / Shift+Home
- 上記位置まで選択を拡張

### Cmd+A
- テーブルセル内: セル内テキスト → 行全体 → ドキュメント全体
- コードブロック内: コード部分 → ドキュメント全体

---

## 8. その他の機能

### 横線表示
- `---`、`***`、`___` を装飾された横線として表示
- `markdownInline.advanced.enableHorizontalRuleDecorations` でオン・オフ可能

### IME対応
- 日本語入力中の誤動作を防止
- 変換確定後に処理を実行

---

## 9. Advanced設定

Advanced設定では、以下のような自動動作や装飾を個別に制御できます。

| 設定 | デフォルト | 主な用途 |
|------|-----------|----------|
| `markdownInline.advanced.autoFormatTables` | false | 表の自動整形を有効にしたい |
| `markdownInline.advanced.enableCheckboxMouseToggle` | true | クリックトグルを止めたい |
| `markdownInline.advanced.enableCodeBlockAutoComplete` | true | ``` の自動補完を止めたい |
| `markdownInline.advanced.enableHeadingDecorations` | true | 見出し装飾を止めたい |
| `markdownInline.advanced.enableCodeBlockDecorations` | true | コードブロック装飾を止めたい |
| `markdownInline.advanced.enableHorizontalRuleDecorations` | true | 横線装飾を止めたい |
| `markdownInline.advanced.autoUpdateTableOfContents` | true | TOCの自動更新を止めたい |
| `markdownInline.advanced.disableCompetingMarkdownFeatures` | true | 競合しやすいMarkdown補完設定の自動変更を止めたい |

例:

```json
{
  "markdownInline.advanced.autoFormatTables": false,
  "markdownInline.advanced.autoUpdateTableOfContents": false
}
```

## 10. コマンド一覧

コマンドの入口を整理した一覧は [コマンドガイド](commands.md) を参照。
