/**
 * Raw モード（実 VS Code）のカーソル移動・スマート選択を検証する。
 *
 * 対象: スマート Enter（リスト継続・空項目脱出）、Smart Select All（段階的選択拡大）、
 * テーブルセル内の上下移動（列位置維持）。
 *
 * 実行: `node ./out-test/test/runTest.js`（VS Code を1回起動し、extension/ 配下の
 * 全テストファイルと同じインスタンス内で実行する）。`MOCHA_GREP` でテスト名の絞り込みが可能。
 */
import assert from "assert";
import * as vscode from "vscode";
import { getAllTableCells } from "../../../src/utils/table";
import { createTestDocument, closeAllEditors, assertSelection } from "../helpers";

suite('Raw: navigation', () => {

    teardown(async () => {
        await closeAllEditors();
    });

    suite('3. スマートEnter機能', () => {

        test('3.1 番号リスト継続', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('1. アイテム1');
            const doc = editor.document;

            // カーソルを行末に配置
            const line = doc.lineAt(0);
            editor.selection = new vscode.Selection(0, line.text.length, 0, line.text.length);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineCount, 2, '行数が2になっていません');
            assert.strictEqual(doc.lineAt(1).text, '2. ', '2行目に "2. " が挿入されていません');
        });

        test('3.2 箇条書きリスト継続（カーソルが末尾）', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('- アイテム1');
            const doc = editor.document;

            const line = doc.lineAt(0);
            editor.selection = new vscode.Selection(0, line.text.length, 0, line.text.length);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineCount, 2, '行数が2になっていません');
            assert.strictEqual(doc.lineAt(1).text, '- ', '2行目に "- " が挿入されていません');
        });

        test('3.2.1 箇条書き（*マーカー）の継続', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('* アイテム1');
            const doc = editor.document;

            const line = doc.lineAt(0);
            editor.selection = new vscode.Selection(0, line.text.length, 0, line.text.length);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineCount, 2, '行数が2になっていません');
            assert.strictEqual(doc.lineAt(1).text, '* ', '2行目に "* " が挿入されていません');
        });

        test('3.2.2 箇条書き（+マーカー）の継続', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('+ アイテム1');
            const doc = editor.document;

            const line = doc.lineAt(0);
            editor.selection = new vscode.Selection(0, line.text.length, 0, line.text.length);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineCount, 2, '行数が2になっていません');
            assert.strictEqual(doc.lineAt(1).text, '+ ', '2行目に "+ " が挿入されていません');
        });

        test('3.2.3 空の箇条書きでEnter（マーカー削除）', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('- アイテム1\n- ');
            const doc = editor.document;

            // 2行目（空の箇条書き）の末尾にカーソルを配置
            const line = doc.lineAt(1);
            editor.selection = new vscode.Selection(1, line.text.length, 1, line.text.length);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineCount, 2, '行数が2のままであるべきです');
            assert.strictEqual(doc.lineAt(1).text, '', '2行目が空行になっていません');
        });

        test('3.2.4 インデントされた箇条書きの継続', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('- アイテム1\n  - ネストされたアイテム');
            const doc = editor.document;

            // 2行目（ネストされた箇条書き）の末尾にカーソルを配置
            const line = doc.lineAt(1);
            editor.selection = new vscode.Selection(1, line.text.length, 1, line.text.length);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineCount, 3, '行数が3になっていません');
            assert.strictEqual(doc.lineAt(2).text, '  - ', '3行目に "  - " が挿入されていません（インデントが保持されていません）');
        });

        test('3.2.5 箇条書き - カーソルがマーカー内にある場合', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('- アイテム1');
            const doc = editor.document;

            // カーソルをマーカー内（位置0）に配置
            editor.selection = new vscode.Selection(0, 0, 0, 0);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineCount, 2, '行数が2になっていません');
            // カーソルがマーカー内の場合、VSCodeの標準動作に任せるため、
            // 継続は追加されない（空行になる）
            assert.ok(doc.lineAt(1).text === '' || doc.lineAt(1).text === '- アイテム1',
                '期待される動作: 空行またはVSCodeがコピーした行');
        });

        test('3.2.6 箇条書き - カーソルがテキストの途中にある場合', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('- アイテム1の長いテキスト');
            const doc = editor.document;

            // カーソルを「1」の後（位置9）に配置: "- アイテム1|の長いテキスト"
            // "- " = 2文字 + "アイテム1" = 5文字 = 位置7、その次の位置9
            const cursorPos = '- アイテム1'.length;
            editor.selection = new vscode.Selection(0, cursorPos, 0, cursorPos);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineCount, 2, '行数が2になっていません');
            // 1行目は分割された前半
            assert.strictEqual(doc.lineAt(0).text, '- アイテム1', '1行目が正しく分割されていません');
            // 2行目は継続マーカー + 分割された後半
            assert.strictEqual(doc.lineAt(1).text, '- の長いテキスト', '2行目に継続マーカーと後半テキストが挿入されていません');
        });

        test('3.3 チェックボックス継続', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('- [ ] タスク1');
            const doc = editor.document;

            const line = doc.lineAt(0);
            editor.selection = new vscode.Selection(0, line.text.length, 0, line.text.length);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineCount, 2);
            assert.strictEqual(doc.lineAt(1).text, '- [ ] ');
        });
    });

    suite('4. Smart Select All', () => {

        test('4.1 テーブルセル内の最初の選択でセル内容のみを選択する', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('| Name | Value |\n| Foo | Bar baz |');

            editor.selection = new vscode.Selection(1, 10, 1, 10);

            await vscode.commands.executeCommand('markdownInline.smartSelectAll');
            await new Promise(resolve => setTimeout(resolve, 300));

            assertSelection(editor, 1, 8, 1, 15, 'セル内容の選択範囲が正しくありません');
            assert.strictEqual(editor.document.getText(editor.selection), 'Bar baz');
        });

        test('4.2 テーブルセル選択後の2回目で行全体を選択する', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('| Name | Value |\n| Foo | Bar baz |');
            const rowText = editor.document.lineAt(1).text;

            editor.selection = new vscode.Selection(1, 10, 1, 10);

            await vscode.commands.executeCommand('markdownInline.smartSelectAll');
            await new Promise(resolve => setTimeout(resolve, 300));

            await vscode.commands.executeCommand('markdownInline.smartSelectAll');
            await new Promise(resolve => setTimeout(resolve, 300));

            assertSelection(editor, 1, 0, 1, rowText.length, '行全体の選択範囲が正しくありません');
            assert.strictEqual(editor.document.getText(editor.selection), rowText);
        });

        test('4.3 テーブル行選択後の3回目でテーブル全体を選択する', async function() {
            this.timeout(5000);

            const editor = await createTestDocument(
                '前置きの段落\n| Name | Value |\n| --- | --- |\n| Foo | Bar baz |\n後書きの段落'
            );
            const tableText = [1, 2, 3].map(line => editor.document.lineAt(line).text).join('\n');

            editor.selection = new vscode.Selection(3, 10, 3, 10);

            await vscode.commands.executeCommand('markdownInline.smartSelectAll');
            await new Promise(resolve => setTimeout(resolve, 300));

            await vscode.commands.executeCommand('markdownInline.smartSelectAll');
            await new Promise(resolve => setTimeout(resolve, 300));

            await vscode.commands.executeCommand('markdownInline.smartSelectAll');
            await new Promise(resolve => setTimeout(resolve, 300));

            assertSelection(editor, 1, 0, 3, editor.document.lineAt(3).text.length, 'テーブル全体の選択範囲が正しくありません');
            assert.strictEqual(editor.document.getText(editor.selection), tableText);
        });

        test('4.4 テーブル全体選択後の4回目で文書全体を選択する', async function() {
            this.timeout(5000);

            const editor = await createTestDocument(
                '前置きの段落\n| Name | Value |\n| --- | --- |\n| Foo | Bar baz |\n後書きの段落'
            );

            editor.selection = new vscode.Selection(3, 10, 3, 10);

            for (let i = 0; i < 4; i++) {
                await vscode.commands.executeCommand('markdownInline.smartSelectAll');
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            assert.strictEqual(editor.document.getText(editor.selection), editor.document.getText(), '文書全体が選択されていません');
        });
    });

    suite('4.3 Table Vertical Navigation', () => {

        test('上下移動で同じセル内オフセットを維持する', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('| Name | Value |\n| Foo  | Bar baz |');

            editor.selection = new vscode.Selection(0, 11, 0, 11);

            await vscode.commands.executeCommand('markdownInline.smartMoveDown');
            await new Promise(resolve => setTimeout(resolve, 300));

            assertSelection(editor, 1, 11, 1, 11, '下移動後のカーソル位置が正しくありません');

            await vscode.commands.executeCommand('markdownInline.smartMoveUp');
            await new Promise(resolve => setTimeout(resolve, 300));

            assertSelection(editor, 0, 11, 0, 11, '上移動後のカーソル位置が正しくありません');
        });

        test('移動先セルが短い場合はセル末尾でクランプする', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('| Name | Longer Value |\n| Foo  | Bar |');

            editor.selection = new vscode.Selection(0, 18, 0, 18);

            await vscode.commands.executeCommand('markdownInline.smartMoveDown');
            await new Promise(resolve => setTimeout(resolve, 300));

            assertSelection(editor, 1, 12, 1, 12, '短いセルへの下移動でコンテンツ末尾に収まっていません');
        });

        test('上下移動でセル内容の相対位置を維持する', async function() {
            this.timeout(5000);

            const content = [
                '| 18:00 ~ |          | 開発、ミーティング |',
                '| 19:00 ~ | 夜ご飯　新歓 | ご飯 |'
            ].join('\n');
            const editor = await createTestDocument(content);
            const firstRowCells = getAllTableCells(editor.document.lineAt(0).text);
            const secondRowCells = getAllTableCells(editor.document.lineAt(1).text);

            assert.ok(firstRowCells && secondRowCells, 'テーブルセルの取得に失敗しました');

            const sourcePos = firstRowCells[2].contentStart + 2;
            const expectedTarget = secondRowCells[2].contentEnd;
            editor.selection = new vscode.Selection(0, sourcePos, 0, sourcePos);

            await vscode.commands.executeCommand('markdownInline.smartMoveDown');
            await new Promise(resolve => setTimeout(resolve, 300));

            assertSelection(editor, 1, expectedTarget, 1, expectedTarget, '下移動後のカーソル位置がセル内容基準で揃っていません');
        });

        test('空セルへ移動した時は入力用の空白を1つ残す', async function() {
            this.timeout(5000);

            const content = [
                '| 18:00 ~ |          | 開発、ミーティング |',
                '| 19:00 ~ | 夜ご飯　新歓 |          |'
            ].join('\n');
            const editor = await createTestDocument(content);
            const targetRowCells = getAllTableCells(editor.document.lineAt(0).text);
            const sourceRowCells = getAllTableCells(editor.document.lineAt(1).text);

            assert.ok(targetRowCells && sourceRowCells, 'テーブルセルの取得に失敗しました');

            const sourcePos = sourceRowCells[1].contentStart + 2;
            const expectedTarget = targetRowCells[1].start + 1;
            editor.selection = new vscode.Selection(1, sourcePos, 1, sourcePos);

            await vscode.commands.executeCommand('markdownInline.smartMoveUp');
            await new Promise(resolve => setTimeout(resolve, 300));

            assertSelection(editor, 0, expectedTarget, 0, expectedTarget, '空セルへの上移動後に入力余白が確保されていません');
        });
    });
});
