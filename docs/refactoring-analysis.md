# リファクタリング調査書

**調査日**: 2026-01-14
**対象プロジェクト**: markdown-inline-preview
**バージョン**: 1.4.6

---

## 1. プロジェクト概要

VSCode拡張機能で、Markdownファイルのインラインプレビューとリスト操作、テーブル編集などの機能を提供する。

### ファイル構成

| ファイル | 行数 | 説明 |
|---------|------|------|
| `src/extension-markdown-inline.js` | 3,250行 | メインソースファイル（全機能） |
| `test/extension.test.js` | 551行 | 統合テスト |
| `test/suite/tableCellNavigation.test.js` | 165行 | テーブルナビゲーションのユニットテスト |

---

## 2. テストカバレッジ

### 2.1 カバレッジ概要

| 指標 | 値（更新前） | 値（更新後） |
|------|------|------|
| **機能カバレッジ** | 約30% (7/23機能) | **約80%** (18/23機能) |
| **テストケース総数** | 39件 | **158件** |

### 2.2 テストされている機能

| 機能　　　　　　　　　　　　　　　　　　 | テストファイル　　　　　　　| テストケース数 |
| ------------------------------------------| -----------------------------| ----------------|
| renumberLists（番号付きリスト整形）　　　| extension.test.js　　　　　 | 13件　　　　　 |
| smartEnter（スマートEnter）　　　　　　　| extension.test.js　　　　　 | 7件　　　　　　|
| convertToNumbered/Bullet/Checkbox/Normal | extension.test.js　　　　　 | 5件　　　　　　|
| increaseIndent / decreaseIndent　　　　　| extension.test.js　　　　　 | 2件　　　　　　|
| toggleCheckbox　　　　　　　　　　　　　 | extension.test.js　　　　　 | 2件　　　　　　|
| getTableCellInfo　　　　　　　　　　　　 | tableCellNavigation.test.js | 7件　　　　　　|
| smartMoveLeft（テーブルセルナビ）　　　　| tableCellNavigation.test.js | 3件　　　　　　|

### 2.3 テストされていない機能

以下の16機能はテストカバレッジがない：

- `formatTable` - テーブル自動整形
- `clickCheckbox` - チェックボックスクリック
- `toggleCheckboxAtLine` - 行指定チェックボックストグル
- `smartSelectLeft` - スマート選択（左）
- `smartMoveRight` - スマートカーソル移動（右）
- `tableNavigateRight` / `tableNavigateLeft` - Tab/Shift+Tabナビゲーション
- `smartMoveDown` / `smartMoveUp` - 上下ナビゲーション
- `smartSelectAll` - コードブロック内全選択
- `moveLineUp` / `moveLineDown` - 行移動
- `updateTableOfContents` - 目次更新
- Decorations（見出し、コードブロック、水平線の装飾）
- CodeLens機能

### 2.4 カバレッジ改善の推奨

1. **優先度高**: テーブル整形機能のテスト追加
2. **優先度高**: 目次更新機能のテスト追加
3. **優先度中**: スマートカーソル移動の全方向テスト
4. **優先度低**: 装飾機能のビジュアルテスト

---

## 3. 設計原則への準拠度

### 3.1 SOLID原則

| 原則 | 準拠度 | 評価 |
|------|--------|------|
| **S** - Single Responsibility | ⚠️ 20% | 1ファイルに全機能が集約（3,250行） |
| **O** - Open/Closed | ⚠️ 40% | 装飾タイプは拡張可能だが、主要ロジックはハードコード |
| **L** - Liskov Substitution | ➖ N/A | クラス継承構造なし |
| **I** - Interface Segregation | ➖ N/A | インターフェース定義なし |
| **D** - Dependency Inversion | ⚠️ 30% | VS Code APIへの直接依存が全体に散在 |

#### 詳細分析

**S (単一責任原則) - 大きく違反**

`extension-markdown-inline.js` が以下の責務を全て担っている：
- リスト操作（番号付き、箇条書き、チェックボックス）
- テーブル整形とナビゲーション
- 装飾（見出し、コードブロック、水平線）
- 目次生成
- カーソル移動/選択
- イベントハンドリング

**推奨**: 以下のモジュールに分割
```
src/
├── extension.js          # エントリーポイント
├── commands/
│   ├── list.js           # リスト操作
│   ├── table.js          # テーブル操作
│   ├── navigation.js     # カーソル移動
│   └── toc.js            # 目次機能
├── decorations/
│   ├── heading.js        # 見出し装飾
│   ├── codeBlock.js      # コードブロック装飾
│   └── checkbox.js       # チェックボックス装飾
└── utils/
    ├── regex.js          # 正規表現パターン
    └── width.js          # 文字幅計算
```

**O (開放閉鎖原則) - 部分的違反**

- 装飾タイプは動的に生成可能だが、コマンドハンドラは全てハードコード
- 新しいマーカータイプ追加時にsmartMoveLeft等の複数箇所を修正が必要

**D (依存性逆転原則) - 違反**

- `vscode` モジュールへの直接依存が全ての関数に散在
- テストで困難（VS Code環境が必須）

### 3.2 YAGNI原則（You Aren't Gonna Need It）

| 準拠度 | 評価 |
|--------|------|
| ✅ **80%** | 概ね準拠 |

**良い点**:
- 使用されている機能のみが実装されている
- 過度な抽象化やフレームワーク的なコードがない
- 設定可能な項目は実際に使用されるもののみ

**注意点**:
- デバッグ用のログ出力チャンネルが常に作成される
- 一部の正規表現パターンが複雑すぎる可能性

### 3.3 UNIX原則（Do One Thing Well）

| 準拠度 | 評価 |
|--------|------|
| ❌ **20%** | 大きく違反 |

**違反点**:
- 1ファイルで7つ以上の異なる機能ドメインを処理
- 関数の粒度が不均一（20行〜400行）
- グローバル変数による状態管理

**推奨**:
- 機能ごとに独立したモジュールに分割
- 各モジュールは単一の責務を持つ
- 状態管理を明示的なコンテキストオブジェクトに

### 3.4 OOAO原則（Once and Only Once）

| 準拠度 | 評価 |
|--------|------|
| ⚠️ **50%** | 部分的準拠 |

**重複が見られるコード**:

1. **正規表現パターンの重複** (5箇所以上)
```javascript
// smartMoveLeft内
const headingMatch = text.match(/^(#{1,6}\s+)/);
// smartSelectLeft内
const headingMatch = text.match(/^(#{1,6}\s+)/);
// collectHeadings内
const headingMatch = lineText.match(/^(#{1,6})\s+(.+)$/);
```

2. **リスト判定ロジックの重複** (4箇所)
```javascript
// パターンが微妙に異なる形で複数箇所に存在
text.match(/^(\s*)-\s\[[\sx]?\]\s*/)
text.match(/^(\s*-\s\[[xX ]?\]\s+.*)$/)
```

3. **セル情報取得の重複**
- `getTableCellInfo` と `getAllTableCells` で類似ロジック

**推奨**:
- 正規表現パターンを定数として一元管理
- パーサー関数の共通化

---

## 4. 具体的な問題箇所

### 4.1 グローバル状態

```javascript
// 問題: グローバル変数による状態管理（12個）
let checkedDecoration = null;
let headingDecorations = [];
let codeBlockDecoration = null;
let horizontalRuleDecoration = null;
let updateTimer = null;
let tocUpdateTimer = null;
let currentEditingLine = -1;
let isDragging = false;
let lastSelectionRange = null;
let isHandlingEnter = false;
let languageDecorations = new Map();
let debugChannel = null;
```

**問題点**: テスト困難、競合状態のリスク

### 4.2 巨大な関数

| 関数名 | 行数 | 問題 |
|--------|------|------|
| `registerCommands` | 約800行 | 全コマンドを1関数で登録 |
| `smartEnterCommand` | 約250行 | 複雑な条件分岐 |
| `smartSelectLeft` | 約300行 | ネストが深い |

### 4.3 マジックナンバー

```javascript
// 問題例
setTimeout(() => { ... }, 50);  // なぜ50ms?
setTimeout(() => { ... }, 500); // なぜ500ms?
const MAX_EMPTY_LINES = 1;      // ドキュメントなし
```

---

## 5. リファクタリング優先度

| 優先度 | 項目 | 工数見積 | 効果 |
|--------|------|----------|------|
| 🔴 高 | モジュール分割（SOLID-S対応） | 大 | 保守性大幅向上 |
| 🔴 高 | 正規表現パターンの一元化 | 小 | バグ削減 |
| 🟡 中 | グローバル状態の整理 | 中 | テスト容易性向上 |
| 🟡 中 | テストカバレッジ向上（30%→70%） | 中 | 品質向上 |
| 🟢 低 | マジックナンバーの定数化 | 小 | 可読性向上 |
| 🟢 低 | 巨大関数の分割 | 中 | 保守性向上 |

---

## 6. まとめ

### スコアカード

| 項目 | スコア |
|------|--------|
| テストカバレッジ | 30% |
| SOLID準拠度 | 30% |
| YAGNI準拠度 | 80% |
| UNIX原則準拠度 | 20% |
| OOAO準拠度 | 50% |
| **総合評価** | **42%** |

### 主要な改善ポイント

1. **モジュール分割が最優先** - 3,250行の単一ファイルを機能別に分割
2. **テストカバレッジの向上** - 特にテーブル整形と目次機能
3. **正規表現パターンの共通化** - 重複を排除しバグを防止
4. **グローバル状態の整理** - 依存注入パターンの導入検討

---

*このドキュメントは自動生成されました。*
