/**
 * Raw モード（実 VS Code）のインデント調整（Tab/Shift+Tab）を検証する。
 *
 * 対象: Tab/Shift+Tab によるインデント増減と番号再整形、最左項目での境界ケース。
 *
 * 実行: `node ./out-test/test/runTest.js`（VS Code を1回起動し、extension/ 配下の
 * 全テストファイルと同じインスタンス内で実行する）。`MOCHA_GREP` でテスト名の絞り込みが可能。
 */
import assert from "assert";
import * as vscode from "vscode";
import { createTestDocument, closeAllEditors, waitFor } from "../helpers";

suite('Raw: editing-core', () => {

    teardown(async () => {
        await closeAllEditors();
    });

    suite('14. インデント調整機能', () => {

        test('14.1 Tab押下でインデント追加と番号整形', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('1. アイテム1\n2. アイテム2\n3. アイテム3');
            const doc = editor.document;

            // 2行目にカーソルを配置
            editor.selection = new vscode.Selection(1, 3, 1, 3);

            await vscode.commands.executeCommand('markdownInline.increaseIndent');
            // 固定の 500ms 待ちでは Windows の CI で間に合わなかった（2026-09-30）。変わるまで待つ
            await waitFor(() => doc.lineAt(1).text === '  1. アイテム2' && doc.lineAt(2).text === '2. アイテム3');

            assert.strictEqual(doc.lineAt(0).text, '1. アイテム1');
            assert.strictEqual(doc.lineAt(1).text, '  1. アイテム2', '2行目がインデントされて番号が1になっていません');
            assert.strictEqual(doc.lineAt(2).text, '2. アイテム3', '3行目の番号が2になっていません');
        });

        test('14.2 Shift+Tab押下でインデント削除と番号整形', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('1. アイテム1\n  1. アイテム2\n2. アイテム3');
            const doc = editor.document;

            // 2行目にカーソルを配置
            editor.selection = new vscode.Selection(1, 4, 1, 4);

            await vscode.commands.executeCommand('markdownInline.decreaseIndent');
            await waitFor(() => doc.lineAt(1).text === '2. アイテム2');

            assert.strictEqual(doc.lineAt(0).text, '1. アイテム1');
            assert.strictEqual(doc.lineAt(1).text, '2. アイテム2', '2行目のインデントが削除されて番号が2になっていません');
            assert.strictEqual(doc.lineAt(2).text, '3. アイテム3', '3行目の番号が3になっていません');
        });
    });

    suite('14b. インデント幅の設定（markdownInline.indentation）', () => {
        const config = () => vscode.workspace.getConfiguration('markdownInline');

        teardown(async () => {
            // 他のテストに設定を残さない
            await config().update('indentation', undefined, vscode.ConfigurationTarget.Global);
        });

        test('14.3 indentation=editor で tabSize 4 なら、Tab は半角スペース 4 つでインデントする', async function() {
            this.timeout(8000);
            await config().update('indentation', 'editor', vscode.ConfigurationTarget.Global);
            const editor = await createTestDocument('- a\n- b');
            editor.options = { tabSize: 4, insertSpaces: true };
            editor.selection = new vscode.Selection(1, 3, 1, 3);
            await vscode.commands.executeCommand('markdownInline.increaseIndent');
            await waitFor(() => editor.document.lineAt(1).text === '    - b');
            assert.strictEqual(editor.document.lineAt(1).text, '    - b');
            // カーソルも、増えた分だけ右へ
            assert.strictEqual(editor.selection.active.character, 7);
        });

        test('14.4 indentation=editor で insertSpaces が false なら、Tab はタブ文字でインデントする', async function() {
            this.timeout(8000);
            await config().update('indentation', 'editor', vscode.ConfigurationTarget.Global);
            const editor = await createTestDocument('- a\n- b');
            editor.options = { tabSize: 4, insertSpaces: false };
            editor.selection = new vscode.Selection(1, 3, 1, 3);
            await vscode.commands.executeCommand('markdownInline.increaseIndent');
            await waitFor(() => editor.document.lineAt(1).text === '\t- b');
            assert.strictEqual(editor.document.lineAt(1).text, '\t- b');
        });

        test('14.5 indentation=editor で tabSize 4 なら、Shift+Tab は半角スペース 4 つを取り除く', async function() {
            this.timeout(8000);
            await config().update('indentation', 'editor', vscode.ConfigurationTarget.Global);
            const editor = await createTestDocument('- a\n    - b');
            editor.options = { tabSize: 4, insertSpaces: true };
            editor.selection = new vscode.Selection(1, 7, 1, 7);
            await vscode.commands.executeCommand('markdownInline.decreaseIndent');
            await waitFor(() => editor.document.lineAt(1).text === '- b');
            assert.strictEqual(editor.document.lineAt(1).text, '- b');
        });

        test('14.6 既定（indentation=default）では VS Code の tabSize を見ず、従来どおり半角スペース 2 つ', async function() {
            this.timeout(8000);
            const editor = await createTestDocument('- a\n- b');
            editor.options = { tabSize: 8, insertSpaces: false };
            editor.selection = new vscode.Selection(1, 3, 1, 3);
            await vscode.commands.executeCommand('markdownInline.increaseIndent');
            await waitFor(() => editor.document.lineAt(1).text === '  - b');
            assert.strictEqual(editor.document.lineAt(1).text, '  - b');
        });

        test('14.7 範囲選択した複数行も、設定の幅でインデントする', async function() {
            this.timeout(8000);
            await config().update('indentation', 'editor', vscode.ConfigurationTarget.Global);
            const editor = await createTestDocument('- a\n- b\n- c');
            editor.options = { tabSize: 4, insertSpaces: true };
            editor.selection = new vscode.Selection(1, 0, 2, 3);
            await vscode.commands.executeCommand('markdownInline.increaseIndent');
            await waitFor(() => editor.document.lineAt(2).text === '    - c');
            assert.strictEqual(editor.document.getText().replace(/\r\n/g, '\n'), '- a\n    - b\n    - c');
        });
    });

    suite('11. 実 VS Code 環境でのバグハンティング', () => {

        test('11.3 最左（インデント0）の番号付きリスト項目で Shift+Tab してもクラッシュせず内容が変化しない', async function () {
            this.timeout(5000);

            const content = '1. アイテム1\n2. アイテム2\n3. アイテム3';
            const editor = await createTestDocument(content);
            const doc = editor.document;

            // 既にインデント0（最左）の2行目でこれ以上減らせないはず。
            editor.selection = new vscode.Selection(1, 3, 1, 3);
            await vscode.commands.executeCommand('markdownInline.decreaseIndent');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, '1. アイテム1');
            assert.strictEqual(doc.lineAt(1).text, '2. アイテム2', '最左でのインデント削除が内容を壊した');
            assert.strictEqual(doc.lineAt(2).text, '3. アイテム3');
        });
    });

    suite('20. 二重フェンスのコードブロック修復コマンド', () => {

        // コードブロックの中へフェンス付きテキストを貼ると、内容にフェンスが入り込み
        // 保存時に外側が4連へ広がって「二重フェンス」になる（2026-07-27 ユーザー報告）。
        // 貼り付け側は防止済みだが、既に壊れたファイルを直す手段が要る。
        test('20.1 二重フェンスのブロックを1重に戻す', async function () {
            this.timeout(10000);

            const content = '前の段落\n\n````\n```\nAnimate the attached image.\n```\n````\n\n後の段落\n';
            const editor = await createTestDocument(content);

            await vscode.commands.executeCommand('markdownInline.repairNestedCodeFences');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(
                editor.document.getText(),
                '前の段落\n\n```\nAnimate the attached image.\n```\n\n後の段落\n',
                '二重フェンスが1重に修復されていない'
            );
        });

        test('20.2 正常なファイルではコマンドを実行しても内容が変わらない', async function () {
            this.timeout(10000);

            const content = '# 見出し\n\n```js\nconst a = 1;\n```\n\n本文\n';
            const editor = await createTestDocument(content);

            await vscode.commands.executeCommand('markdownInline.repairNestedCodeFences');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(editor.document.getText(), content, '正常なファイルを書き換えてしまった');
        });
    });
    suite('41. コマンドは編集を終えてから戻る', () => {
        // Windows の CI（遅い環境）で、実行直後に内容を見るテストが毎回違う箇所で落ちた（14.1・1.4・6.3、2026-09-30）。
        // 原因はコマンドが editor.edit の完了を待たずに戻っていたこと。executeCommand の完了＝編集の完了にする
        // （キーバインドやほかの拡張からコマンドを続けて呼んだときに、前の編集と競合しないためにも要る）。
        // ここでは実行後に一切待たずに内容を見る。

        test('41.1 番号の振り直し（renumberLists）', async function() {
            this.timeout(5000);
            const editor = await createTestDocument('3. a\n5. b\n9. c');
            editor.selection = new vscode.Selection(1, 0, 1, 0);
            await vscode.commands.executeCommand('markdownInline.renumberLists');
            assert.strictEqual(editor.document.getText().replace(/\r\n/g, '\n'), '1. a\n2. b\n3. c');
        });

        test('41.2 インデント（increaseIndent）は、続く番号の振り直しまで終えてから戻る', async function() {
            this.timeout(5000);
            const editor = await createTestDocument('1. a\n2. b\n3. c');
            editor.selection = new vscode.Selection(1, 3, 1, 3);
            await vscode.commands.executeCommand('markdownInline.increaseIndent');
            assert.strictEqual(editor.document.getText().replace(/\r\n/g, '\n'), '1. a\n  1. b\n2. c');
        });

        test('41.3 番号付きリストへの変換（convertToNumbered）は、続く番号の振り直しまで終えてから戻る', async function() {
            this.timeout(5000);
            const editor = await createTestDocument('a\nb\nc');
            editor.selection = new vscode.Selection(0, 0, 2, 1);
            await vscode.commands.executeCommand('markdownInline.convertToNumbered');
            assert.strictEqual(editor.document.getText().replace(/\r\n/g, '\n'), '1. a\n2. b\n3. c');
        });

        test('41.4 チェックボックスの切り替え（toggleCheckbox）', async function() {
            this.timeout(5000);
            const editor = await createTestDocument('- [ ] a');
            editor.selection = new vscode.Selection(0, 3, 0, 3);
            await vscode.commands.executeCommand('markdownInline.toggleCheckbox');
            assert.strictEqual(editor.document.lineAt(0).text, '- [x] a');
        });
    });
});
