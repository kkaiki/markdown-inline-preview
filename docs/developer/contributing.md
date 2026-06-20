# コントリビューションガイド

## 開発環境のセットアップ

### 必要なツール

- Node.js 16.x 以上
- VSCode 1.74.0 以上
- Git

### セットアップ手順

```bash
# リポジトリをクローン
git clone <repository-url>
cd markdown-inline-preview

# 依存関係をインストール
npm install

# 開発モードで起動
# VSCodeで F5 を押す
```

## 開発ワークフロー

### 1. ブランチ戦略

```
main          # 安定版
├── develop   # 開発版
├── feature/* # 新機能
├── fix/*     # バグ修正
└── docs/*    # ドキュメント
```

### 2. コミットメッセージ

```
<type>: <subject>

<body>
```

**type**:
- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメント
- `refactor`: リファクタリング
- `test`: テスト
- `chore`: その他

**例**:
```
feat: テーブルセル内ナビゲーションを追加

- Cmd+Leftでセル内コンテンツ開始位置に移動
- セル左端から左セルへの移動を実装
```

### 3. プルリクエスト

1. featureブランチを作成
2. 変更を実装
3. テストを追加/更新
4. ドキュメントを更新
5. PRを作成

## コーディング規約

### JavaScript

```javascript
// 関数の命名: キャメルケース
function updateDecorations() {}

// 定数: 大文字スネークケース
const MAX_LINE_COUNT = 10000;

// JSDoc コメント
/**
 * テーブルセル情報を取得
 * @param {string} lineText - 行のテキスト
 * @param {number} cursorChar - カーソル位置
 * @returns {Object|null} セル情報
 */
function getTableCellInfo(lineText, cursorChar) {}
```

### エラーハンドリング

```javascript
try {
    // 処理
} catch (error) {
    debugLog(`[ERROR] ${error.message}`);
    // フォールバック処理
}
```

### デバッグログ

```javascript
// 機能ごとにプレフィックスを付ける
debugLog('[smartMoveLeft] Called at position:', position);
debugLog('[TOC] Updating table of contents');
debugLog('[TABLE] Formatting table at line:', lineNumber);
```

## テストの書き方

### ユニットテスト

```javascript
// test/suite/featureName.test.js
const assert = require('assert');

describe('Feature Name', function() {
    describe('functionName', function() {
        it('should do something', function() {
            const result = functionName(input);
            assert.strictEqual(result, expected);
        });

        it('should handle edge case', function() {
            const result = functionName(edgeInput);
            assert.strictEqual(result, edgeExpected);
        });
    });
});
```

### テストの実行

```bash
# 全テスト実行
npm test

# 特定のテストのみ
npm test -- --grep "Table Cell"
```

## 新機能の追加手順

### 1. 仕様を定義

`docs/specifications/inline-preview-features.md`（Raw）または `preview-features.md`（Preview）に追記:
- 機能の目的
- 期待する動作
- エッジケース

### 2. 実装

```javascript
// 1. ヘルパー関数を追加（必要に応じて）
function helperFunction() {}

// 2. メイン処理を実装
function mainFeature() {}

// 3. コマンドを登録
safeRegister('markdownInline.newCommand', async () => {
    // ...
});
```

### 3. package.json を更新

```json
{
  "contributes": {
    "commands": [
      {
        "command": "markdownInline.newCommand",
        "title": "New Command",
        "enablement": "editorLangId == markdown"
      }
    ],
    "keybindings": [
      {
        "command": "markdownInline.newCommand",
        "key": "...",
        "when": "editorTextFocus && editorLangId == markdown"
      }
    ]
  }
}
```

### 4. テストを追加

```javascript
describe('New Feature', function() {
    it('should work correctly', function() {
        // テスト
    });
});
```

### 5. ドキュメントを更新

- `docs/specifications/inline-preview-features.md`（Raw）
- `docs/specifications/preview-features.md`（Preview）
- `docs/user-guide/keyboard-shortcuts.md`

## パッケージの作成

```bash
# ビルド
npm run compile

# パッケージ作成
vsce package

# テストインストール
code --install-extension markdown-inline-preview-*.vsix
```

## デバッグ方法

### 1. デバッグモードで起動

- VSCodeで `F5` を押す
- 新しいVSCodeウィンドウが開く
- ブレークポイントを設定可能

### 2. デバッグログを確認

- Output パネル → 「Markdown Table Debug」
- Developer Tools → Console

### 3. 問題の切り分け

1. 最小限の再現ケースを作成
2. デバッグログを追加
3. ステップ実行で確認

## よくある問題

### コマンドが登録されない

```javascript
// 競合チェック
const safeRegister = (commandId, handler) => {
    try {
        // ...
    } catch (error) {
        if (error.message.includes('already exists')) {
            debugLog(`[WARN] Command "${commandId}" already exists`);
        }
    }
};
```

### 装飾が表示されない

1. `setDecorations()` が呼ばれているか確認
2. 範囲（Range）が正しいか確認
3. 装飾タイプが破棄されていないか確認

### イベントが発火しない

1. `when` 条件を確認
2. 他の拡張機能との競合を確認
3. イベントハンドラが正しく登録されているか確認
