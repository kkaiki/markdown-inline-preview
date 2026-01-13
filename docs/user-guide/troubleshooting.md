# トラブルシューティング

## 目次

1. [Enterキーが動作しない](#1-enterキーが動作しない)
2. [テーブル整形が動作しない](#2-テーブル整形が動作しない)
3. [目次が更新されない](#3-目次が更新されない)
4. [装飾が表示されない](#4-装飾が表示されない)
5. [日本語の幅がずれる](#5-日本語の幅がずれる)
6. [拡張機能が読み込まれない](#6-拡張機能が読み込まれない)

---

## 1. Enterキーが動作しない

### 症状
- リスト項目でEnterを押しても継続されない
- チェックボックスが自動追加されない

### 原因
**Markdown All in One** などの拡張機能がEnterキーをオーバーライドしている。

### 解決方法

#### 方法A: GUIで設定
1. `Cmd+K Cmd+S` (Mac) / `Ctrl+K Ctrl+S` (Win) でキーボードショートカット設定を開く
2. 検索ボックスに `enter` と入力
3. `markdown.extension.onEnterKey` を探す
4. 右クリック → 「Remove Keybinding」
5. VSCodeをリロード（`Cmd+Shift+P` → "Developer: Reload Window"）

#### 方法B: keybindings.jsonを編集
```json
[
  {
    "key": "enter",
    "command": "markdownInline.smartEnter",
    "when": "editorTextFocus && editorLangId == markdown && !suggestWidgetVisible"
  },
  {
    "key": "enter",
    "command": "-markdown.extension.onEnterKey",
    "when": "editorTextFocus && editorLangId == markdown"
  }
]
```

### 動作確認
1. Markdownファイルで `- テスト` と入力
2. Enterキーを押す
3. 新しいリストマーカーが追加されれば成功

---

## 2. テーブル整形が動作しない

### 症状
- テーブルの列幅が揃わない
- 編集後に自動整形されない

### 原因
- 他の拡張機能との競合
- テーブル形式が不正

### 解決方法

#### テーブル形式を確認
正しい形式:
```markdown
| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
```

不正な形式（セパレータ行がない）:
```markdown
| Header 1 | Header 2 |
| Cell 1   | Cell 2   |
```

#### 手動で整形
コマンドパレット（`Cmd+Shift+P`）→ 「Format Markdown Table」

#### デバッグログを確認
1. `Cmd+Shift+P` → "Developer: Toggle Developer Tools"
2. Consoleタブでエラーを確認
3. Output パネルで「Markdown Table Debug」チャンネルを確認

---

## 3. 目次が更新されない

### 症状
- `/目次` を書いても目次が生成されない
- 見出しを変更しても目次が更新されない

### 原因
- マーカーの形式が不正
- 自動更新が無効
- コードブロック内にマーカーがある

### 解決方法

#### マーカー形式を確認
正しい形式:
```markdown
/目次
```
または
```markdown
/toc
```

**注意**: 行頭から始め、他のテキストを含めない

#### 手動更新を試す
`Cmd+Shift+T` (Mac) / `Ctrl+Shift+T` (Win)

#### 自動更新設定を確認
```json
{
  "markdownInline.toc.autoUpdate": true
}
```

---

## 4. 装飾が表示されない

### 症状
- チェック済み項目に取り消し線がない
- 見出しの色が変わらない

### 原因
- プレビュー機能が無効
- テーマとの競合

### 解決方法

#### 設定を確認
```json
{
  "markdownInline.enablePreview": true,
  "markdownInline.enableHeadingDecorations": true
}
```

#### 拡張機能をリロード
1. `Cmd+Shift+P` → "Developer: Reload Window"

---

## 5. 日本語の幅がずれる

### 症状
- テーブルで日本語を含む列の幅がずれる

### 解決方法

#### 設定を調整
```json
{
  "markdownInline.table.widthCalculation": "smart",
  "markdownInline.table.japaneseCharWidth": 2.0
}
```

フォントによっては微調整が必要:
- 等幅フォント: `2.0`
- プロポーショナルフォント: `1.8` 〜 `2.2`

---

## 6. 拡張機能が読み込まれない

### 症状
- コマンドが見つからない
- ショートカットが効かない

### 解決方法

#### 1. 拡張機能の状態を確認
- Extensions パネル（`Cmd+Shift+X`）で「Markdown Inline Preview」を検索
- 「Enable」になっているか確認

#### 2. 出力ログを確認
- View → Output
- ドロップダウンから「Markdown Inline Preview」または「Extension Host」を選択

#### 3. VSCodeを再起動
- VSCodeを完全に終了して再起動

#### 4. 拡張機能を再インストール
```bash
code --uninstall-extension markdown-inline-preview
code --install-extension markdown-inline-preview-*.vsix
```

---

## デバッグ情報の取得

問題が解決しない場合、以下の情報を収集:

### 1. バージョン情報
```
VSCode: Help → About
拡張機能: Extensions パネルで確認
```

### 2. 設定
```bash
# settings.jsonの内容
cat ~/Library/Application\ Support/Code/User/settings.json | grep markdownInline
```

### 3. ログ
1. `Cmd+Shift+P` → "Developer: Toggle Developer Tools"
2. Consoleタブの内容をコピー

### 4. 再現手順
1. どのファイルで発生するか
2. どの操作で発生するか
3. 期待する動作と実際の動作

---

## お問い合わせ

上記で解決しない場合は、GitHubのIssueで報告してください:
- 上記のデバッグ情報を添付
- 再現手順を記載
