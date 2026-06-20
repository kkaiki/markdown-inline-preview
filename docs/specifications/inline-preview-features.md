# Inline Preview（Raw モード）仕様

最終更新: 2026-06-21  
バージョン: **1.8.5**

**Inline Preview** = VS Code の通常テキストエディタ（**Raw モード**）で動く機能一式です。  
Markdown ソース（`##`, `*`*, `|` 等）をそのまま表示しつつ、装飾と編集支援を追加します。

Preview（WYSIWYG）モードは [preview-features.md](./preview-features.md) を参照してください。

---

## モード概要


| 項目           | 内容                                |
| ------------ | --------------------------------- |
| 別名           | Raw / Inline / ソースモード             |
| エンジン         | VS Code `TextEditor` + Decoration |
| 記法の表示        | **常にソースそのまま**（`##`, `*`* は隠さない）   |
| Preview への切替 | タイトルバー `Preview` / `Cmd+Shift+M`  |
| 向いている作業      | 精密な記法編集、Git diff、大規模置換            |


### 設計原則

1. **非破壊** — 装飾は表示のみ。保存内容は通常の Markdown
2. **編集優先** — 編集中の行ではサムネイル・折り返し・取り消し線を一時的に外す
3. **高性能** — 装飾更新は 50ms デバウンス
4. **日本語対応** — テーブル列幅の CJK 計算、IME 配慮

### 制限事項

- Decoration API ではフォントサイズ変更不可（見出しは色・背景で区別）
- 1 万行超のファイルでは装飾更新に遅延の可能性
- 他 Markdown 拡張とのキーバインド競合に注意（[keyboard-shortcuts.md](../user-guide/keyboard-shortcuts.md)）

---

## リスト・チェックボックス

### 対応リストタイプ


| タイプ      | 記法例          | マーカー              |
| -------- | ------------ | ----------------- |
| 箇条書き     | `- item`     | `-`, `*`, `+`     |
| 番号付き     | `1. item`    | `数字.` または `数字)`   |
| チェックボックス | `- [ ] task` | `- [ ]` / `- [x]` |


`Y:` / `W:` 形式のラベル付きリストは **スコープ外**（実装予定なし）。

### 操作一覧


| 機能           | 操作                            | 説明                          |
| ------------ | ----------------------------- | --------------------------- |
| スマート Enter   | `Enter`                       | リスト継続。空行 Enter でリスト終了       |
| 箇条書きに変換      | `Alt+Cmd+5`                   | `- アイテム` 形式へ                |
| 番号付きに変換      | `Alt+Cmd+6`                   | `1. アイテム` 形式へ               |
| チェックボックスに変換  | `Alt+Cmd+4`                   | `- [ ] タスク` 形式へ             |
| 通常テキストに変換    | `Alt+Cmd+0`                   | マーカーを削除                     |
| インデント追加      | `Tab`                         | 2 スペース。番号付きは再採番             |
| インデント削除      | `Shift+Tab`                   | 番号付きは再採番                    |
| チェックボックストグル  | `Cmd+Enter`                   | `[ ]` ↔ `[x]`               |
| チェックボックスクリック | マウス                           | `[`〜`]` 範囲（設定で変更可）          |
| 番号の再採番       | `renumberLists`               | 連番の修正                       |
| 行移動          | `moveLineUp` / `moveLineDown` | ブロック単位（キーバインド未割当）           |
| 完了タスクの取り消し線  | 自動                            | チェック済み行の本文                  |
| CodeLens     | 行上                            | Check / Uncheck（設定で on/off） |


### スマート Enter の要点


| リストタイプ   | 行末・内容あり     | 行末・空   |
| -------- | ----------- | ------ |
| 番号付き     | 次番号で継続      | マーカー削除 |
| チェックボックス | 新しい `- [ ]` | マーカー削除 |
| 箇条書き     | 通常改行        | マーカー削除 |


マーカー**前**または**内**で Enter → 通常改行（マーカー重複なし）。

### 変換ルール（抜粋）

- 変換時はインデントを保持する
- 複数行選択時は一括変換
- コードブロック内はスキップ
- 引用内リスト（`> - item`）は `>` を保持したまま変換

---

## テーブル

### 整形


| 機能     | 操作                     | 説明                                                      |
| ------ | ---------------------- | ------------------------------------------------------- |
| 手動整形   | タイトルバー / `formatTable` | 列幅を揃える                                                  |
| 自動整形   | テーブル行から離脱時             | `advanced.autoFormatTables` が `true` のときのみ（**既定: off**） |
| 日本語幅計算 | 設定                     | `table.widthCalculation: smart` で全角/半角を考慮               |


`/table normalize on|off` でワークスペース設定 `autoFormatTables` を永続切替可能。`normilize` は typo エイリアス。

**補足:** `smartEnter` と行移動では、行に `|` が含まれると設定に関係なく整形が走る場合があります。

### ナビゲーション


| 操作                  | 動作                                                            |
| ------------------- | ------------------------------------------------------------- |
| `↑` `↓`             | 上下行の**同じ列**へ。相対オフセットを維持（短いセルは末尾で止める）                          |
| `Cmd+←` / `Home`    | セル内先頭 → セル左端 → 左セルの末尾（先頭セルなら行頭）                               |
| `Cmd+→` / `End`     | セル内末尾 → セル右端 → 右セルの先頭（末尾セルなら行末）                               |
| `Tab` / `Shift+Tab` | テーブル内では次/前セルへ（リスト外ではインデント）                                    |
| `Cmd+A`             | テーブル内は セル内容 → 行 → テーブル全体 → ページ全体（段階的）。コードブロック内は ブロック内 → ページ全体 |


折り返し表示中も、上下移動は**元テキスト上のセル座標**を基準にする（見た目の継続行に吸われない）。

### インライン折り返し表示

横に長いテーブルを、Preview を開かずに読みやすくする**表示専用**機能。


| 方針  | 内容                                       |
| --- | ---------------------------------------- |
| 非破壊 | 元の 1 行テーブル記法は変更しない                       |
| 編集時 | カーソル行は折り返しを外しソースを表示                      |
| 表示  | 行末に `↳` 継続行、またはホバーでポップアップ                |
| 現状  | 行末 1 行 + ホバー。エディタ幅追従の複数行 decoration は未実装 |


有効条件: `enablePreview` + `table.inlineWrap.enabled` + 非編集行。

---

## 画像プレビュー


| フェーズ | 状態  | 内容              |
| ---- | --- | --------------- |
| 1    | ✅   | 行末サムネイル、ホバー拡大   |
| 2    | ❌   | 画像オーバーレイ（重ね合わせ） |




### フェーズ 1（実装済み）

- 対象: `![alt](path)` — ワークスペース相対パス、`http(s)://`
- 非編集行: 行末 48px サムネイル + ホバーで拡大
- 編集行: 生テキスト表示
- 読込失敗時: プレースホルダ表示（エディタ操作は継続）

### フェーズ 2（未実装・検討）

標準 Markdown ではオーバーレイ不可。拡張構文（属性付き `![base](...){overlay=...}` または directive ブロック）が必要。

---

## スラッシュコマンド（Raw）

行頭で `/` を入力すると補完メニューが開く（`CompletionItemProvider`）。  
コードブロック内では表示しない。メニューなしで `/command` と打って Enter でも実行可能。

定義の正: `src/shared/slash/slashMenuItems.ts`

### トリガー・操作


| 操作              | 動作                    |
| --------------- | --------------------- |
| `Enter` / `Tab` | 選択コマンドを実行し行を置換        |
| `↑` `↓`         | 候補移動                  |
| `Escape`        | メニューを閉じ `/text` のまま残す |


行頭以外・先頭空白ありの `/` は無効。

### コマンド一覧


| コマンド                              | 結果                             |
| --------------------------------- | ------------------------------ |
| `/h1`〜`/h6`                       | `#`〜`######`（`/heading N` に展開） |
| `/heading <1-6> [title]`          | 見出し挿入・変換。無効 level は警告          |
| `/table`                          | 2 列テーブル挿入、または既存表の整形            |
| `/table normalize on\|off`        | `autoFormatTables` をワークスペース設定に保存 |
| `/code [lang]`                    | フェンス挿入（`js`→`javascript` 等）    |
| `/quote [text]`                   | `>` 引用行                        |
| `/divider`                        | `---`                          |
| `/callout [warning\|danger\|info]` | `> 💡` 等の引用コールアウト              |
| `/bullet` / `/numbered` / `/todo` | リスト行開始                         |


---

## インライン装飾（Decoration）


| 対象         | 説明                             |
| ---------- | ------------------------------ |
| 見出し H1–H6  | レベル別の色・枠（`headingColorScheme`） |
| コードブロック    | 背景 + 簡易シンタックス色（独自 Decoration）  |
| 水平線        | 下線スタイル                         |
| チェックボックス完了 | 本文の取り消し線                       |
| 画像行        | 行末サムネイル（非編集行）                  |
| テーブル行      | 折り返しプレビュー                      |


コードブロックのシンタックス色は Raw 専用（`bash`, `js`, `ts`, `python`, `css`, `html`, `json` 等）。Preview 側は highlight.js を使用。

### コードブロック補助

- ````` 入力時に閉じフェンスを補完（`enableCodeBlockAutoComplete`）
- フェンス行はハイライト対象外

---

## コマンドパレット（Raw）


| コマンド ID                                                               | 用途            |
| --------------------------------------------------------------------- | ------------- |
| `markdownInline.smartEnter`                                           | リスト継続・終了      |
| `markdownInline.toggleCheckbox`                                       | チェックボックス切替    |
| `markdownInline.formatTable`                                          | テーブル整形        |
| `markdownInline.increaseIndent` / `decreaseIndent`                    | インデント         |
| `markdownInline.convertToBullet` / `Numbered` / `Checkbox` / `Normal` | リスト変換         |
| `markdownInline.renumberLists`                                        | 番号再採番         |
| `markdownInline.smartMoveLeft` / `Right` / `Up` / `Down`              | スマート移動・テーブルナビ |
| `markdownInline.tableNavigateLeft` / `Right`                          | セル間移動         |
| `markdownInline.smartSelectLeft` / `smartSelectAll`                   | 段階的選択         |
| `markdownInline.moveLineUp` / `Down`                                  | 行ブロック移動       |


タイトルバー: `formatTable`（整形ボタン）。

---

## 設定一覧

```jsonc
// 装飾全体
"markdownInline.enablePreview": true,

// 見出し
"markdownInline.enableHeadingDecorations": true,
"markdownInline.headingColorScheme": "default",  // default | monochrome | vibrant

// チェックボックス
"markdownInline.showCheckboxCodeLens": true,
"markdownInline.hideStrikethroughOnEdit": true,
"markdownInline.checkboxStyle": "icons",
"markdownInline.checkboxClickableArea": "checkbox",
"markdownInline.autoMoveCompletedTasks": false,
"markdownInline.advanced.enableCheckboxMouseToggle": true,

// 画像
"markdownInline.imagePreview.enabled": true,
"markdownInline.imagePreview.showThumbnail": true,

// テーブル
"markdownInline.table.inlineWrap.enabled": true,
"markdownInline.table.inlineWrap.maxWidth": 24,
"markdownInline.table.widthCalculation": "smart",
"markdownInline.advanced.autoFormatTables": false,

// コードブロック・水平線
"markdownInline.advanced.enableCodeBlockDecorations": true,
"markdownInline.advanced.enableHorizontalRuleDecorations": true,
"markdownInline.advanced.enableCodeBlockAutoComplete": true,

// 競合回避
"markdownInline.advanced.disableCompetingMarkdownFeatures": true
```

**優先順位:** 明示的な `advanced.`* > レガシー設定名。

---

## ショートカット


| 機能          | Mac                 | Windows/Linux      |
| ----------- | ------------------- | ------------------ |
| スマート Enter  | `Enter`             | `Enter`            |
| チェックボックストグル | `Cmd+Enter`         | `Ctrl+Enter`       |
| インデント       | `Tab` / `Shift+Tab` | 同左                 |
| 見出し変換 H1/H2/H3 | `Alt+Cmd+1/2/3`   | `Alt+Ctrl+1/2/3`   |
| リスト変換（ToDo/箇条書き/番号/本文） | `Alt+Cmd+4/5/6/0` | `Alt+Ctrl+4/5/6/0` |
| スマート移動      | `Cmd+←→`, `↑↓`      | `Home/End`, `↑↓`   |
| Preview へ切替 | `Cmd+Shift+M`       | `Ctrl+Shift+M`     |

`Cmd+Opt+<数字>`（Notion 風）のブロック変換体系は [preview-features.md](./preview-features.md#notion-風ブロック変換cmdopt数字) と共通。


詳細: [keyboard-shortcuts.md](../user-guide/keyboard-shortcuts.md)

---

### 残タスク


| 項目                   | 現状           | これから                        |
| -------------------- | ------------ | --------------------------- |
| テーブル折り返し             | 行末 1 行 + ホバー | エディタ幅に合わせた複数行 decoration    |
| 画像オーバーレイ             | 未実装          | 拡張構文 + 合成プレビュー              |
| 完了タスク自動移動            | 設定のみ         | 動作の安定化                      |
| smartEnter / 行移動の表整形 | 設定無視で整形あり    | `autoFormatTables` と整合させる検討 |
| E2E テスト              | ユニット中心       | Raw 装飾の統合テスト                |


---

## リッチエディタ化ロードマップ

Raw（ソース）モードを「リッチで使いやすく」するための施策一覧。優先度 高 → 中 → 低。
（継続的に追記していく作業リスト）

### 装飾・可読性


| 項目        | 内容                                 | 優先  |
| --------- | ---------------------------------- | --- |
| コールアウト装飾  | `> [!note]` / `> 💡` を色付きブロックとして装飾 | 中   |
| 引用・リンクの装飾 | 引用バー、リンク下線・ホバー                     | 中   |
| `#tag` 強調 | タグの色付け（コード/コードブロックは除外）             | 低   |
| Wiki リンク  | `[[link]]` の装飾とクリックでファイル遷移         | 中   |
| 見出し折りたたみ  | 見出し単位の folding、アウトライン連携            | 高   |


### 編集支援


| 項目                      | 内容                                     | 優先  |
| ----------------------- | -------------------------------------- | --- |
| テーブル行/列コマンド             | 追加・削除をコマンド＋キーバインドで（現状はナビ中心）            | 高   |
| スマートペースト                | URL → `[title](url)`、画像 → 保存して `![]()` | 高   |
| スニペット展開                 | 日付・定型文・テンプレート                          | 低   |
| Frontmatter 補助          | キー補完、tags/aliases の編集支援                | 中   |
| テーブル折り返しの複数行 decoration | エディタ幅に合わせて折り返し（残タスク参照）                 | 中   |


### パフォーマンス・基盤


| 項目        | 内容                           | 優先  |
| --------- | ---------------------------- | --- |
| 大規模ファイル対応 | 1 万行超での装飾更新遅延の改善（可視範囲のみ更新）   | 中   |
| 競合検出の改善   | 他 Markdown 拡張とのキーバインド競合の自動回避 | 低   |
| E2E テスト拡充 | Raw 装飾・スマート操作の統合テスト          | 中   |


---

## 関連ドキュメント


| ファイル                                                      | 内容               |
| --------------------------------------------------------- | ---------------- |
| [preview-features.md](./preview-features.md)              | Preview モード仕様    |
| [developer/architecture.md](../developer/architecture.md) | アーキテクチャ概要（開発者向け） |
| [README.md](../README.md)                                 | ドキュメント目次         |


