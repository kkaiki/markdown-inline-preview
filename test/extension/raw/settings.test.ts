/**
 * Raw モード（実 VS Code）の拡張設定連携を検証する。
 *
 * 対象: `advanced.autoFormatTables` のオン/オフによる、行移動時のテーブル自動整形の有無。
 *
 * 実行: `node ./out-test/test/runTest.js`（VS Code を1回起動し、extension/ 配下の
 * 全テストファイルと同じインスタンス内で実行する）。`MOCHA_GREP` でテスト名の絞り込みが可能。
 */
import assert from "assert";
import * as vscode from "vscode";
import { createTestDocument, closeAllEditors, updateMarkdownInlineSetting } from "../helpers";

suite('Raw: settings', () => {

    teardown(async () => {
        await closeAllEditors();
    });

    suite('7. Advanced Settings', () => {

        test('7.1 autoFormatTables がオンなら行移動時に表を整形する', async function() {
            this.timeout(8000);

            const content = '| A | B |\n| --- | --- |\n| C | D |\nText';
            await updateMarkdownInlineSetting('advanced.autoFormatTables', true);

            try {
                const editor = await createTestDocument(content);
                const doc = editor.document;

                editor.selection = new vscode.Selection(0, 0, 0, 0);
                await new Promise(resolve => setTimeout(resolve, 200));

                editor.selection = new vscode.Selection(3, 0, 3, 0);
                await new Promise(resolve => setTimeout(resolve, 700));

                assert.strictEqual(doc.lineAt(0).text, '| A   | B   |');
                assert.strictEqual(doc.lineAt(1).text, '| -----| -----|');
                assert.strictEqual(doc.lineAt(2).text, '| C   | D   |');
            } finally {
                await updateMarkdownInlineSetting('advanced.autoFormatTables', undefined);
            }
        });

        test('7.2 autoFormatTables がオフなら行移動時に表を整形しない', async function() {
            this.timeout(8000);

            const content = '| A | B |\n| --- | --- |\n| C | D |\nText';
            await updateMarkdownInlineSetting('advanced.autoFormatTables', false);

            try {
                const editor = await createTestDocument(content);
                const doc = editor.document;

                editor.selection = new vscode.Selection(0, 0, 0, 0);
                await new Promise(resolve => setTimeout(resolve, 200));

                editor.selection = new vscode.Selection(3, 0, 3, 0);
                await new Promise(resolve => setTimeout(resolve, 700));

                assert.strictEqual(doc.lineAt(0).text, '| A | B |');
                assert.strictEqual(doc.lineAt(1).text, '| --- | --- |');
                assert.strictEqual(doc.lineAt(2).text, '| C | D |');
            } finally {
                await updateMarkdownInlineSetting('advanced.autoFormatTables', undefined);
            }
        });
    });
});
