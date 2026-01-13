# テストディレクトリ

このディレクトリには、Markdown Inline Preview拡張機能のテストファイルが含まれています。

## ディレクトリ構造

```
test/
├── README.md              # このファイル
├── extension.test.js      # メインのテストファイル
├── runTest.js            # テスト実行スクリプト
└── suite/
    └── index.js          # Mochaテストランナーの設定
```

## テストの実行方法

### 1. 依存関係のインストール

```bash
npm install
```

### 2. テストの実行

```bash
npm test
```

### 3. 特定のテストのみ実行

```bash
npm test -- --grep "番号付きリスト"
```

## テストの追加方法

新しいテストを追加するには、`extension.test.js`ファイルに新しい`test()`ブロックを追加します。

```javascript
test('新しいテスト', async function() {
    this.timeout(5000);

    // テストコードをここに記述
    const editor = await createTestDocument('テストコンテンツ');
    const doc = editor.document;

    // アサーション
    assert.strictEqual(doc.lineAt(0).text, '期待される値');
});
```

## デバッグ方法

VSCodeのデバッガを使用してテストをデバッグできます。

1. `.vscode/launch.json`に以下の設定を追加:

```json
{
    "name": "Extension Tests",
    "type": "extensionHost",
    "request": "launch",
    "args": [
        "--extensionDevelopmentPath=${workspaceFolder}",
        "--extensionTestsPath=${workspaceFolder}/test/suite/index"
    ],
    "outFiles": [
        "${workspaceFolder}/out/test/**/*.js"
    ]
}
```

2. F5キーを押してデバッグを開始

## テストのベストプラクティス

- 各テストは独立して実行可能にする
- テスト後はエディタをクリーンアップする（`teardown`フックを使用）
- タイムアウトを適切に設定する（`this.timeout(5000)`）
- 非同期処理には`await`を使用する
- 明確なアサーションメッセージを記述する

詳細なテスト仕様については、プロジェクトルートの`TEST_SPECIFICATION.md`を参照してください。
