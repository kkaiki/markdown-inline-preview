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

# ユニット（VS Code 非依存 + jsdom webview）
npm run test:unit

# 実ブラウザ回帰（Preview のキャレット/選択など、実レイアウトが必要なもの）
npm run test:browser
```

### 実ブラウザ回帰テスト（test/browser）

Preview は Milkdown（ProseMirror + `list-item-block` Web Component）で描画される。
**キャレットや選択の挙動には実レイアウト + 実コンポーネントが無いと再現しない不具合**があり
（例: チェックボックス行頭 Backspace でカーソルが上の行へ飛ぶ）、jsdom 系の
`test/webview` では原理的に検出できない。

`test/browser` は **ビルド済みの `media/milkdown.bundle.js` を本物の Chrome（Playwright）**で
起動し、実キー操作と実キャレット座標で検証する。`acquireVsCodeApi` をスタブして `init`
メッセージで本文を流し込む（ハーネス: `test/browser/previewBrowserHarness.ts`）。

- 実行: `npm run test:browser`（`build:webview` → `build:browser-test` → mocha）
- ブラウザはシステムの Google Chrome（`channel: 'chrome'`）を優先。無ければ Playwright 同梱
  Chromium（`npx playwright install chromium`）。どちらも無い環境では **skip**（CI を壊さない）。
- jsdom で再現できない描画レイヤの回帰は、必ずここに追加すること。

#### 構成（test/browser）

| ファイル | 内容 |
| --- | --- |
| `previewBrowserHarness.ts` | 実バンドル起動・操作・モデル観測・スクショのハーネス |
| `caretRegression.test.ts` | キャレット保持（markerBackspace 等）の回帰 |
| `basicOperations.test.ts` | Markdown ロード/構造・展開折りたたみ・インライン整形 |
| `editingOperations.test.ts` | Enter 継続・インデント・Backspace 解除・Undo/Redo |
| `visualShowcase.test.ts` | 各種要素をレンダリングしてスクショ撮影（目視確認） |

#### ブラウザ画面を見ながら実行（目視）

```bash
# 実ブラウザ画面を表示し、操作をゆっくり（slowMo）見せる
HEADED=1 npm run test:browser
# 速度調整（ミリ秒）
HEADED=1 SLOWMO=600 npm run test:browser
```

スクリーンショットは `visualShowcase.test.ts` が `test-screenshots/*.png`（.gitignore 済み）に
保存する。レイアウト崩れ・記号欠落・装飾異常などの **視覚的退行**を画像で確認できる。

#### カーソル配置の注意

Playwright→Milkdown では一部キー（`End`・`Cmd+A`）が効かないため、テストでカーソルを
行末や特定位置へ置くときは**キーに頼らず**ハーネスの `placeCursorAfterText` /
`selectText` /`placeCursorAtLineStart` を使う（DOM タイミングに依存せず確実）。

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

- Output パネル → 「Markdown Inline Preview」
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
