# Table Cell Navigation Test

このファイルでテーブルセル内のカーソル移動をテストできます。

## テスト用テーブル

| Header 1     | Header 2        | Header 3       |
|--------------|-----------------|----------------|
| Cell A1      | Cell B1         | Cell C1        |
| 日本語テスト | English Content | Mixed 混合     |
| Short        | This is a longer cell content | End |

## 動作確認

1. テーブルセル内にカーソルを置く
2. `Cmd+Left` (Mac) / `Home` (Win/Linux) を押す
   - セル内のコンテンツの先頭に移動
   - もう一度押すとセルの左端（|の直後）に移動
3. `Shift+Cmd+Left` (Mac) / `Shift+Home` (Win/Linux) を押す
   - カーソル位置からセル内のコンテンツ先頭まで選択
   - もう一度押すとセルの左端まで選択を拡張

## 通常のMarkdown要素のテスト

- リスト項目でのテスト
- [ ] チェックボックスでのテスト
1. 番号付きリストでのテスト

> 引用でのテスト

### 見出しでのテスト
