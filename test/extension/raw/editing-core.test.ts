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
import { createTestDocument, closeAllEditors } from "../helpers";

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
            await new Promise(resolve => setTimeout(resolve, 500));

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
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, '1. アイテム1');
            assert.strictEqual(doc.lineAt(1).text, '2. アイテム2', '2行目のインデントが削除されて番号が2になっていません');
            assert.strictEqual(doc.lineAt(2).text, '3. アイテム3', '3行目の番号が3になっていません');
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
});
