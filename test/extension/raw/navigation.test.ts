/**
 * Raw モード（実 VS Code）のカーソル移動・スマート選択を検証する。
 *
 * 対象: スマート Enter（リスト継続・空項目脱出）、Smart Select All（段階的選択拡大。
 * テーブル・コードフェンス双方）、テーブルセル内の上下移動（列位置維持）、文書端での
 * smartMoveUp/Down フォールバック、Smart Select Left のテーブルセル境界を跨ぐ選択拡大。
 *
 * これらは従来 `test/suite/raw/navigation/` で `src/raw/commands/navigation.ts` の
 * ロジックを複製した純関数としてのみ検証されており、実コマンド
 * （`markdownInline.smartSelectLeft` 等）を実 VS Code で実行する経路が無かった
 * （testing-rules.md ルール 2-1 の返済）。
 *
 * 実行: `node ./out-test/test/runTest.js`（VS Code を1回起動し、extension/ 配下の
 * 全テストファイルと同じインスタンス内で実行する）。`MOCHA_GREP` でテスト名の絞り込みが可能。
 */
import assert from "assert";
import * as vscode from "vscode";
import { getAllTableCells, getTableCellInfo } from "../../../src/utils/table";
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

    suite('4.6 Smart Move Up/Down 文書端フォールバック', () => {

        test('文書の1行目で smartMoveUp を実行しても既定の cursorUp に委譲され落ちない', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('1行目のテキスト\n2行目のテキスト');
            editor.selection = new vscode.Selection(0, 3, 0, 3);

            await vscode.commands.executeCommand('markdownInline.smartMoveUp');
            await new Promise(resolve => setTimeout(resolve, 300));

            // 上に行が無いため VS Code 既定の cursorUp に委譲される（同一行に留まる）。
            assert.strictEqual(editor.selection.active.line, 0, '1行目より上へ行ってしまった');
        });

        test('文書の最終行で smartMoveDown を実行しても既定の cursorDown に委譲され落ちない', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('1行目のテキスト\n2行目のテキスト');
            const lastLine = editor.document.lineCount - 1;
            editor.selection = new vscode.Selection(lastLine, 3, lastLine, 3);

            await vscode.commands.executeCommand('markdownInline.smartMoveDown');
            await new Promise(resolve => setTimeout(resolve, 300));

            // 下に行が無いため VS Code 既定の cursorDown に委譲される（最終行に留まる）。
            assert.strictEqual(editor.selection.active.line, lastLine, '最終行より下へ行ってしまった');
        });

        test('テーブル最終行で smartMoveDown を実行しても文書末で落ちない', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('| Name | Value |\n| Foo | Bar baz |');
            const lastLine = editor.document.lineCount - 1;
            editor.selection = new vscode.Selection(lastLine, 3, lastLine, 3);

            await vscode.commands.executeCommand('markdownInline.smartMoveDown');
            await new Promise(resolve => setTimeout(resolve, 300));

            assert.strictEqual(editor.selection.active.line, lastLine, 'テーブル最終行より下へ行ってしまった（次行が無いのに移動した）');
        });
    });

    suite('5. Smart Select Left（テーブルセル境界を跨ぐ選択拡大）', () => {

        test('5.1 セル内容の途中から1回目: コンテンツ開始位置まで選択', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('| Name | Value |\n| Foo | Bar baz |');
            const rowText = editor.document.lineAt(1).text;
            const cellInfo = getTableCellInfo(rowText, rowText.length - 1);
            assert.ok(cellInfo && cellInfo.isTable, '前提: テーブルセル内と判定されていません');
            const startChar = cellInfo.cellContentEnd - 1; // "baz" の途中

            editor.selection = new vscode.Selection(1, startChar, 1, startChar);
            await vscode.commands.executeCommand('markdownInline.smartSelectLeft');
            await new Promise(resolve => setTimeout(resolve, 300));

            assertSelection(editor, 1, cellInfo.cellContentStart, 1, startChar, '1回目でコンテンツ開始位置まで選択されていません');
        });

        test('5.2 続けて2回目: セル左端まで選択が拡大する', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('| Name | Value |\n| Foo | Bar baz |');
            const rowText = editor.document.lineAt(1).text;
            const cellInfo = getTableCellInfo(rowText, rowText.length - 1);
            assert.ok(cellInfo && cellInfo.isTable);
            const startChar = cellInfo.cellContentEnd - 1;

            editor.selection = new vscode.Selection(1, startChar, 1, startChar);
            await vscode.commands.executeCommand('markdownInline.smartSelectLeft');
            await new Promise(resolve => setTimeout(resolve, 300));
            await vscode.commands.executeCommand('markdownInline.smartSelectLeft');
            await new Promise(resolve => setTimeout(resolve, 300));

            assertSelection(editor, 1, cellInfo.cellStart, 1, startChar, '2回目でセル左端まで選択されていません');
        });

        test('5.3 さらに3回目: セル境界を跨いで前のセルの内容末尾まで選択が拡大する', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('| Name | Value |\n| Foo | Bar baz |');
            const rowText = editor.document.lineAt(1).text;
            const allCells = getAllTableCells(rowText);
            assert.ok(allCells && allCells.length >= 2, '前提: 2セル以上のテーブル行');
            const cellInfo = getTableCellInfo(rowText, rowText.length - 1);
            assert.ok(cellInfo && cellInfo.isTable && cellInfo.cellIndex > 0, '前提: 2番目以降のセルにいる');
            const startChar = cellInfo.cellContentEnd - 1;
            const prevCell = allCells[cellInfo.cellIndex - 1];
            const expectedTarget = prevCell.contentEnd > prevCell.contentStart ? prevCell.contentEnd : prevCell.contentStart;

            editor.selection = new vscode.Selection(1, startChar, 1, startChar);
            for (let i = 0; i < 3; i++) {
                await vscode.commands.executeCommand('markdownInline.smartSelectLeft');
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            assertSelection(editor, 1, expectedTarget, 1, startChar, '3回目で前のセルの内容末尾までセル境界を跨いで選択されていません');
        });

        test('5.4 先頭セルで左端に達したら、行頭までセル境界を越えて選択が拡大する', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('| Name | Value |\n| Foo | Bar baz |');
            const rowText = editor.document.lineAt(1).text;
            const allCells = getAllTableCells(rowText);
            assert.ok(allCells && allCells.length >= 1);
            const firstCell = allCells[0];
            const startChar = firstCell.contentEnd; // 先頭セル（"Foo"）の内容末尾

            editor.selection = new vscode.Selection(1, startChar, 1, startChar);
            // 1回目: コンテンツ開始位置へ、2回目: セル左端(cellIndex===0)へ、
            // 3回目: セル境界を越えて行頭(0)へ。
            for (let i = 0; i < 3; i++) {
                await vscode.commands.executeCommand('markdownInline.smartSelectLeft');
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            assertSelection(editor, 1, 0, 1, startChar, '先頭セルの左端からさらに実行しても行頭まで拡大されていません');
        });
    });

    suite('6. コードフェンス内 Smart Select All の段階的選択', () => {

        test('1回目: コードブロックの内容のみ選択される（フェンス行は含まない）', async function() {
            this.timeout(5000);

            const editor = await createTestDocument(
                '前置きの段落\n```js\nconst a = 1;\nconst b = 2;\n```\n後書きの段落'
            );
            // フェンス内の行（2行目 "const a = 1;"）にカーソルを置く
            editor.selection = new vscode.Selection(2, 3, 2, 3);

            await vscode.commands.executeCommand('markdownInline.smartSelectAll');
            await new Promise(resolve => setTimeout(resolve, 300));

            assertSelection(editor, 2, 0, 4, 0, 'コードブロック内容の選択範囲が正しくありません');
            assert.strictEqual(
                editor.document.getText(editor.selection),
                'const a = 1;\nconst b = 2;\n',
                'コードブロックの内容が正しく選択されていません'
            );
        });

        test('2回目: 文書全体を選択する', async function() {
            this.timeout(5000);

            const editor = await createTestDocument(
                '前置きの段落\n```js\nconst a = 1;\nconst b = 2;\n```\n後書きの段落'
            );
            editor.selection = new vscode.Selection(2, 3, 2, 3);

            await vscode.commands.executeCommand('markdownInline.smartSelectAll');
            await new Promise(resolve => setTimeout(resolve, 300));
            await vscode.commands.executeCommand('markdownInline.smartSelectAll');
            await new Promise(resolve => setTimeout(resolve, 300));

            assert.strictEqual(
                editor.document.getText(editor.selection),
                editor.document.getText(),
                'コードブロック内容選択後の2回目で文書全体が選択されていません'
            );
        });
    });
});
