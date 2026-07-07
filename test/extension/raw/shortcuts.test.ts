/**
 * Raw モード（実 VS Code）のスラッシュコマンドを検証する。
 *
 * 対象: `/heading N`・`/table`・`/table normalize on|off` の展開結果とカーソル位置。
 *
 * 実行: `node ./out-test/test/runTest.js`（VS Code を1回起動し、extension/ 配下の
 * 全テストファイルと同じインスタンス内で実行する）。`MOCHA_GREP` でテスト名の絞り込みが可能。
 */
import assert from "assert";
import * as vscode from "vscode";
import { createTestDocument, closeAllEditors, assertSelection } from "../helpers";

suite('Raw: shortcuts', () => {

    teardown(async () => {
        await closeAllEditors();
    });

    suite('8. Slash Commands', () => {

        test('8.1 /heading 1 を H1 に変換する', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('/heading 1');
            const doc = editor.document;

            editor.selection = new vscode.Selection(0, doc.lineAt(0).text.length, 0, doc.lineAt(0).text.length);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineCount, 1);
            assert.strictEqual(doc.lineAt(0).text, '# ');
            assertSelection(editor, 0, 2, 0, 2, 'heading 1 変換後のカーソル位置が正しくありません');
        });

        test('8.2 /heading 2 仕様 を H2 に変換する', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('/heading 2 仕様');
            const doc = editor.document;

            editor.selection = new vscode.Selection(0, doc.lineAt(0).text.length, 0, doc.lineAt(0).text.length);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineCount, 1);
            assert.strictEqual(doc.lineAt(0).text, '## 仕様');
        });

        test('8.3 /table で標準テーブルを挿入する', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('/table');
            const doc = editor.document;

            editor.selection = new vscode.Selection(0, doc.lineAt(0).text.length, 0, doc.lineAt(0).text.length);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineCount, 3);
            assert.strictEqual(doc.lineAt(0).text, '|  |  |');
            assert.strictEqual(doc.lineAt(1).text, '| --- | --- |');
            assert.strictEqual(doc.lineAt(2).text, '|  |  |');
        });

        test('8.4 /table normalize off で自動整形を抑止する', async function() {
            this.timeout(8000);

            const toggleEditor = await createTestDocument('/table normalize off');
            const toggleDoc = toggleEditor.document;

            toggleEditor.selection = new vscode.Selection(0, toggleDoc.lineAt(0).text.length, 0, toggleDoc.lineAt(0).text.length);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            const editor = await createTestDocument('| A | B |\n| --- | --- |\n| C | D |\nText');
            const doc = editor.document;
            const original = doc.lineAt(0).text;

            editor.selection = new vscode.Selection(0, 0, 0, 0);
            await new Promise(resolve => setTimeout(resolve, 200));
            editor.selection = new vscode.Selection(3, 0, 3, 0);
            await new Promise(resolve => setTimeout(resolve, 700));

            assert.strictEqual(doc.lineAt(0).text, original);
            assert.strictEqual(doc.lineAt(1).text, '| --- | --- |');
        });

        test('8.5 /table normalize on で自動整形を有効化する', async function() {
            this.timeout(8000);

            const toggleEditor = await createTestDocument('/table normalize on');
            const toggleDoc = toggleEditor.document;

            toggleEditor.selection = new vscode.Selection(0, toggleDoc.lineAt(0).text.length, 0, toggleDoc.lineAt(0).text.length);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            const editor = await createTestDocument('| A | B |\n| --- | --- |\n| C | D |\nText');
            const doc = editor.document;

            editor.selection = new vscode.Selection(0, 0, 0, 0);
            await new Promise(resolve => setTimeout(resolve, 200));
            editor.selection = new vscode.Selection(3, 0, 3, 0);
            await new Promise(resolve => setTimeout(resolve, 700));

            assert.notStrictEqual(doc.lineAt(0).text, '| A | B |');
            assert.notStrictEqual(doc.lineAt(2).text, '| C | D |');
        });

        test('8.7 無効な /heading は変換せずそのまま残る', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('/heading 0');
            const doc = editor.document;

            editor.selection = new vscode.Selection(0, doc.lineAt(0).text.length, 0, doc.lineAt(0).text.length);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineCount, 1);
            assert.strictEqual(doc.lineAt(0).text, '/heading 0');
        });
    });
});
