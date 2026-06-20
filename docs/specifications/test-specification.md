# Markdown Inline Preview - テスト仕様書

最終更新: 2026-06-21

## 概要

iPreview 拡張機能のテスト方針と実行方法を定義します。

## テスト環境

### 依存関係

`package.json` の devDependencies（`mocha`, `@vscode/test-electron`, `c8` 等）を `npm install` で導入。

### 実行コマンド

| コマンド | 内容 |
|----------|------|
| `npm run compile` | `src/` → `out/`、`test/` → `out-test/` |
| `npm run test:unit` | `out-test/test/suite/*.test.js` を Mocha で実行（**推奨**） |
| `npm test` | VS Code Electron 上で `extension.test.ts` を実行 |
| `npm run test:all` | ユニット + 統合 |
| `npm run test:coverage` | `out/shared/**` のカバレッジ（c8） |

```bash
# 特定スイートのみ
npm run test:unit -- --grep "tableFormatting"
```

## テストの種類

### 1. ユニットテスト（`test/suite/*.test.ts`）

`shared/`・`core/`・`raw/` の純粋関数を中心に検証。VS Code API 不要。

例: `slashMenuItems.test.ts`, `previewFocusSyntax.test.ts`, `markdownInlineSettings.test.ts`, `tableFormatting.test.ts`

### 2. 統合テスト（`test/extension.test.ts`）

Extension Host 上でコマンド・設定トグルを検証。`advanced.autoFormatTables` の ON/OFF 等。

### 3. E2E / 手動

`docs/examples/test-*.md` で手動確認。Preview WebView の自動 E2E は未整備。

## 実行上の注意

- **CI / サンドボックス**: まず `npm run test:unit` を使う
- `npm test` は GUI + Electron 依存のため、環境によって起動失敗することがある
- WebView コード（`src/preview/webview/`）は `tsconfig.webview.json` で別ビルド（esbuild バンドル）

## トグル系テストの方針

新しい `markdownInline.advanced.*` 設定を追加する場合:

1. `core/markdownInlineSettings.ts` の解決ロジックをユニットテスト
2. `true` / `false` それぞれで期待動作する統合テスト（該当する場合）

例: `advanced.autoFormatTables = false` では行移動時に表が整形されない。

## テストケース一覧

---

## 1. 番号付きリスト自動整形機能のテスト

### テストケース 1.1: 基本的な番号整形

**目的**: 番号付きリストの番号を1から連番に整形できることを確認

**入力**:
```markdown
3. 最初のアイテム
7. 2番目のアイテム
1. 3番目のアイテム
```

**期待される出力**:
```markdown
1. 最初のアイテム
2. 2番目のアイテム
3. 3番目のアイテム
```

**テスト手順**:
1. テストドキュメントを作成
2. 上記の入力テキストを挿入
3. カーソルを2行目に配置
4. `renumberLists()` 関数を呼び出し
5. 結果を期待される出力と比較

**実装例**:
```javascript
test('基本的な番号整形', async () => {
    const doc = await vscode.workspace.openTextDocument({
        content: '3. 最初のアイテム\n7. 2番目のアイテム\n1. 3番目のアイテム',
        language: 'markdown'
    });
    const editor = await vscode.window.showTextDocument(doc);

    // カーソルを2行目に配置
    editor.selection = new vscode.Selection(1, 0, 1, 0);

    // renumberLists関数を呼び出し
    await vscode.commands.executeCommand('markdownInline.renumberLists');

    // 結果を検証
    assert.strictEqual(doc.lineAt(0).text, '1. 最初のアイテム');
    assert.strictEqual(doc.lineAt(1).text, '2. 2番目のアイテム');
    assert.strictEqual(doc.lineAt(2).text, '3. 3番目のアイテム');
});
```

---

### テストケース 1.2: インデントレベルごとの番号リセット

**目的**: インデントレベルが変わると番号が1からリセットされることを確認

**入力**:
```markdown
3. 最初のアイテム
7. 2番目のアイテム
  5. ネストされたアイテム
  2. ネストされた2番目
1. 3番目のアイテム
```

**期待される出力**:
```markdown
1. 最初のアイテム
2. 2番目のアイテム
  1. ネストされたアイテム
  2. ネストされた2番目
3. 3番目のアイテム
```

**テスト手順**:
1. テストドキュメントを作成
2. 上記の入力テキストを挿入
3. カーソルをリスト内に配置
4. `renumberLists()` 関数を呼び出し
5. 各行の番号とインデントを検証

**実装例**:
```javascript
test('インデントレベルごとの番号リセット', async () => {
    const content = '3. 最初のアイテム\n7. 2番目のアイテム\n  5. ネストされたアイテム\n  2. ネストされた2番目\n1. 3番目のアイテム';
    const doc = await vscode.workspace.openTextDocument({
        content: content,
        language: 'markdown'
    });
    const editor = await vscode.window.showTextDocument(doc);

    editor.selection = new vscode.Selection(2, 0, 2, 0);
    await vscode.commands.executeCommand('markdownInline.renumberLists');

    assert.strictEqual(doc.lineAt(0).text, '1. 最初のアイテム');
    assert.strictEqual(doc.lineAt(1).text, '2. 2番目のアイテム');
    assert.strictEqual(doc.lineAt(2).text, '  1. ネストされたアイテム');
    assert.strictEqual(doc.lineAt(3).text, '  2. ネストされた2番目');
    assert.strictEqual(doc.lineAt(4).text, '3. 3番目のアイテム');
});
```

---

### テストケース 1.3: 括弧形式の番号リスト

**目的**: `1)` 形式の番号リストも正しく整形されることを確認

**入力**:
```markdown
3) 最初のアイテム
7) 2番目のアイテム
1) 3番目のアイテム
```

**期待される出力**:
```markdown
1) 最初のアイテム
2) 2番目のアイテム
3) 3番目のアイテム
```

---

## 2. リストタイプ変換機能のテスト

### テストケース 2.1: チェックボックスから番号付きリストへの変換

**目的**: チェックボックスを番号付きリストに変換できることを確認

**入力**:
```markdown
- [ ] タスク1
- [x] タスク2
- [ ] タスク3
```

**期待される出力**:
```markdown
1. タスク1
2. タスク2
3. タスク3
```

**テスト手順**:
1. テストドキュメントを作成
2. チェックボックスリストを挿入
3. 全ての行を選択
4. `convertToNumbered()` コマンドを実行
5. 結果を検証

**実装例**:
```javascript
test('チェックボックスから番号付きリストへの変換', async () => {
    const doc = await vscode.workspace.openTextDocument({
        content: '- [ ] タスク1\n- [x] タスク2\n- [ ] タスク3',
        language: 'markdown'
    });
    const editor = await vscode.window.showTextDocument(doc);

    // 全ての行を選択
    editor.selection = new vscode.Selection(0, 0, 2, 100);

    await vscode.commands.executeCommand('markdownInline.convertToNumbered');

    assert.strictEqual(doc.lineAt(0).text, '1. タスク1');
    assert.strictEqual(doc.lineAt(1).text, '2. タスク2');
    assert.strictEqual(doc.lineAt(2).text, '3. タスク3');
});
```

---

### テストケース 2.2: 箇条書きリストへの変換

**目的**: 番号付きリストを箇条書きリストに変換できることを確認

**入力**:
```markdown
1. アイテム1
2. アイテム2
3. アイテム3
```

**期待される出力**:
```markdown
- アイテム1
- アイテム2
- アイテム3
```

**実装例**:
```javascript
test('番号付きリストから箇条書きへの変換', async () => {
    const doc = await vscode.workspace.openTextDocument({
        content: '1. アイテム1\n2. アイテム2\n3. アイテム3',
        language: 'markdown'
    });
    const editor = await vscode.window.showTextDocument(doc);

    editor.selection = new vscode.Selection(0, 0, 2, 100);
    await vscode.commands.executeCommand('markdownInline.convertToBullet');

    assert.strictEqual(doc.lineAt(0).text, '- アイテム1');
    assert.strictEqual(doc.lineAt(1).text, '- アイテム2');
    assert.strictEqual(doc.lineAt(2).text, '- アイテム3');
});
```

---

### テストケース 2.3: インデント保持の確認

**目的**: 変換時にインデントレベルが保持されることを確認

**入力**:
```markdown
- アイテム1
  - ネストされたアイテム
- アイテム2
```

**期待される出力** (番号付きリストに変換後):
```markdown
1. アイテム1
  1. ネストされたアイテム
2. アイテム2
```

**実装例**:
```javascript
test('インデント保持の確認', async () => {
    const doc = await vscode.workspace.openTextDocument({
        content: '- アイテム1\n  - ネストされたアイテム\n- アイテム2',
        language: 'markdown'
    });
    const editor = await vscode.window.showTextDocument(doc);

    editor.selection = new vscode.Selection(0, 0, 2, 100);
    await vscode.commands.executeCommand('markdownInline.convertToNumbered');

    assert.strictEqual(doc.lineAt(0).text, '1. アイテム1');
    assert.strictEqual(doc.lineAt(1).text, '  1. ネストされたアイテム');
    assert.strictEqual(doc.lineAt(2).text, '2. アイテム2');
});
```

---

### テストケース 2.4: ノーマルテキストへの変換

**目的**: リストをノーマルテキストに変換できることを確認

**入力**:
```markdown
1. アイテム1
2. アイテム2
```

**期待される出力**:
```markdown
アイテム1
アイテム2
```

---

## 3. スマートEnter機能のテスト

### テストケース 3.1: 番号リスト継続

**目的**: Enter押下時に次の番号が自動的に挿入されることを確認

**初期状態**:
```markdown
1. アイテム1|
```
(|はカーソル位置)

**Enter押下後の期待される状態**:
```markdown
1. アイテム1
2. |
```

**実装例**:
```javascript
test('番号リスト継続', async () => {
    const doc = await vscode.workspace.openTextDocument({
        content: '1. アイテム1',
        language: 'markdown'
    });
    const editor = await vscode.window.showTextDocument(doc);

    // カーソルを行末に配置
    editor.selection = new vscode.Selection(0, 11, 0, 11);

    await vscode.commands.executeCommand('markdownInline.smartEnter');

    assert.strictEqual(doc.lineAt(1).text, '2. ');
    assert.strictEqual(editor.selection.active.character, 3); // "2. "の後
});
```

---

### テストケース 3.2: 空のリストアイテムで終了

**目的**: 空のリストアイテムでEnterを押すとリストが終了することを確認

**初期状態**:
```markdown
1. アイテム1
2. |
```

**Enter押下後の期待される状態**:
```markdown
1. アイテム1
|
```

---

## 4. インデント調整機能のテスト

### テストケース 4.1: Tab押下でインデント追加

**目的**: Tabでインデントが追加され、番号が自動整形されることを確認

**初期状態**:
```markdown
1. アイテム1
2. アイテム2|
3. アイテム3
```

**Tab押下後の期待される状態**:
```markdown
1. アイテム1
  1. アイテム2|
2. アイテム3
```

**実装例**:
```javascript
test('Tab押下でインデント追加と番号整形', async () => {
    const doc = await vscode.workspace.openTextDocument({
        content: '1. アイテム1\n2. アイテム2\n3. アイテム3',
        language: 'markdown'
    });
    const editor = await vscode.window.showTextDocument(doc);

    editor.selection = new vscode.Selection(1, 3, 1, 3);
    await vscode.commands.executeCommand('markdownInline.increaseIndent');

    assert.strictEqual(doc.lineAt(1).text, '  1. アイテム2');
    assert.strictEqual(doc.lineAt(2).text, '2. アイテム3');
});
```

---

### テストケース 4.2: Shift+Tab押下でインデント削除

**目的**: Shift+Tabでインデントが削除され、番号が自動整形されることを確認

**初期状態**:
```markdown
1. アイテム1
  1. アイテム2|
2. アイテム3
```

**Shift+Tab押下後の期待される状態**:
```markdown
1. アイテム1
2. アイテム2|
3. アイテム3
```

---

## 5. チェックボックス機能のテスト

### テストケース 5.1: チェックボックストグル

**目的**: Cmd+Enterでチェックボックスの状態が切り替わることを確認

**初期状態**:
```markdown
- [ ] タスク1|
```

**Cmd+Enter押下後の期待される状態**:
```markdown
- [x] タスク1|
```

**実装例**:
```javascript
test('チェックボックストグル', async () => {
    const doc = await vscode.workspace.openTextDocument({
        content: '- [ ] タスク1',
        language: 'markdown'
    });
    const editor = await vscode.window.showTextDocument(doc);

    editor.selection = new vscode.Selection(0, 5, 0, 5);
    await vscode.commands.executeCommand('markdownInline.toggleCheckbox');

    assert.strictEqual(doc.lineAt(0).text, '- [x] タスク1');
});
```

---

## 6. エッジケースのテスト

### テストケース 6.1: 空行を含むリスト

**目的**: リストの途中に空行がある場合、適切に処理されることを確認

**入力**:
```markdown
1. アイテム1
2. アイテム2

3. アイテム3
```

**期待される動作**: 空行でリストが分断され、それぞれ独立して整形される

---

### テストケース 6.2: 混在するリストタイプ

**目的**: 異なるリストタイプが混在する場合の動作を確認

**入力**:
```markdown
- 箇条書き
1. 番号リスト
- [ ] チェックボックス
```

**期待される動作**: 各行を選択して変換コマンドを実行すると、正しく変換される

---

## テストの実装ガイドライン

### 1. テストファイルの構造

```javascript
const assert = require('assert');
const vscode = require('vscode');

suite('Markdown Inline Preview Tests', () => {

    suite('番号リスト自動整形', () => {
        test('基本的な番号整形', async () => {
            // テストコード
        });

        test('インデントレベルごとの番号リセット', async () => {
            // テストコード
        });
    });

    suite('リストタイプ変換', () => {
        test('チェックボックスから番号付きリストへの変換', async () => {
            // テストコード
        });
    });
});
```

### 2. テストのベストプラクティス

1. **テストの独立性**: 各テストは他のテストに依存しない
2. **クリーンアップ**: テスト後はドキュメントを閉じる
3. **明確なアサーション**: 期待値と実際の値を明確に比較
4. **エッジケースのカバー**: 正常系だけでなく異常系もテスト

### 3. テストヘルパー関数

```javascript
// テストドキュメントを作成するヘルパー
async function createTestDocument(content) {
    const doc = await vscode.workspace.openTextDocument({
        content: content,
        language: 'markdown'
    });
    return await vscode.window.showTextDocument(doc);
}

// ドキュメントを閉じるヘルパー
async function closeAllEditors() {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}
```

---

## 手動テストチェックリスト

自動テストでカバーできない部分は手動でテストします。

### UI/UX テスト

- [ ] チェックボックスの装飾が正しく表示される
- [ ] 見出しの装飾が正しく表示される
- [ ] テーブルの自動整形が動作する
- [ ] カーソル位置が適切に保持される
- [ ] ショートカットキーが正しく動作する

### パフォーマンステスト

- [ ] 1000行のMarkdownファイルでスムーズに動作する
- [ ] 100個のチェックボックスがある場合でも遅延がない
- [ ] 大きなテーブル(20列×50行)でも整形が速い

### 互換性テスト

- [ ] macOSで正常に動作する
- [ ] Windowsで正常に動作する
- [ ] Linuxで正常に動作する

---

## テストカバレッジ目標

- **関数カバレッジ**: 80%以上
- **行カバレッジ**: 70%以上
- **分岐カバレッジ**: 60%以上

## CI/CD統合

### GitHub Actionsの設定例

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]

    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '16'
      - run: npm install
      - run: npm test
```

---

## トラブルシューティング

### テストが失敗する場合

1. **VSCodeのバージョンを確認**: `package.json`のenginesと一致するか
2. **依存関係を再インストール**: `npm clean-install`
3. **テスト環境をクリーンアップ**: テスト実行前に全てのエディタを閉じる

### デバッグ方法

1. VSCodeのデバッガを使用してテストを実行
2. `console.log()`でデバッグ情報を出力
3. テストを一つずつ実行して問題を特定

---

## まとめ

このテスト仕様書に従ってテストを実装することで、拡張機能の品質を保証し、リグレッションを防ぐことができます。新機能を追加する際は、必ずテストケースも追加してください。
