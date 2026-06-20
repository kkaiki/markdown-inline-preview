import assert from "assert";
import * as vscode from "vscode";
import { getAllTableCells } from "../src/utils/table";

suite('Markdown Inline Preview Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    // テストヘルパー関数
    async function createTestDocument(content) {
        const doc = await vscode.workspace.openTextDocument({
            content: content,
            language: 'markdown'
        });
        return await vscode.window.showTextDocument(doc);
    }

    async function closeAllEditors() {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    }

    async function updateMarkdownInlineSetting(key, value) {
        await vscode.workspace.getConfiguration('markdownInline').update(
            key,
            value,
            vscode.ConfigurationTarget.Global
        );
        await new Promise(resolve => setTimeout(resolve, 250));
    }

    function assertSelection(editor, startLine, startCharacter, endLine, endCharacter, message) {
        assert.strictEqual(editor.selection.start.line, startLine, `${message}: start line`);
        assert.strictEqual(editor.selection.start.character, startCharacter, `${message}: start character`);
        assert.strictEqual(editor.selection.end.line, endLine, `${message}: end line`);
        assert.strictEqual(editor.selection.end.character, endCharacter, `${message}: end character`);
    }

    // 各テスト後にエディタをクリーンアップ
    teardown(async () => {
        await closeAllEditors();
    });

    suite('1. 番号付きリスト自動整形機能', () => {

        test('1.1 基本的な番号整形', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('3. 最初のアイテム\n7. 2番目のアイテム\n1. 3番目のアイテム');
            const doc = editor.document;

            // カーソルを2行目に配置
            editor.selection = new vscode.Selection(1, 0, 1, 0);

            // renumberListsコマンドを実行
            await vscode.commands.executeCommand('markdownInline.renumberLists');

            // 少し待機
            await new Promise(resolve => setTimeout(resolve, 500));

            // 結果を検証
            assert.strictEqual(doc.lineAt(0).text, '1. 最初のアイテム', '1行目が正しく整形されていません');
            assert.strictEqual(doc.lineAt(1).text, '2. 2番目のアイテム', '2行目が正しく整形されていません');
            assert.strictEqual(doc.lineAt(2).text, '3. 3番目のアイテム', '3行目が正しく整形されていません');
        });

        test('1.2 インデントレベルごとの番号リセット', async function() {
            this.timeout(5000);

            const content = '3. 最初のアイテム\n7. 2番目のアイテム\n  5. ネストされたアイテム\n  2. ネストされた2番目\n1. 3番目のアイテム';
            const editor = await createTestDocument(content);
            const doc = editor.document;

            // カーソルを3行目（ネストされたアイテム）に配置
            editor.selection = new vscode.Selection(2, 0, 2, 0);

            await vscode.commands.executeCommand('markdownInline.renumberLists');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, '1. 最初のアイテム');
            assert.strictEqual(doc.lineAt(1).text, '2. 2番目のアイテム');
            assert.strictEqual(doc.lineAt(2).text, '  1. ネストされたアイテム');
            assert.strictEqual(doc.lineAt(3).text, '  2. ネストされた2番目');
            assert.strictEqual(doc.lineAt(4).text, '3. 3番目のアイテム');
        });

        test('1.3 括弧形式の番号リスト', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('3) 最初のアイテム\n7) 2番目のアイテム\n1) 3番目のアイテム');
            const doc = editor.document;

            editor.selection = new vscode.Selection(1, 0, 1, 0);

            await vscode.commands.executeCommand('markdownInline.renumberLists');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, '1) 最初のアイテム');
            assert.strictEqual(doc.lineAt(1).text, '2) 2番目のアイテム');
            assert.strictEqual(doc.lineAt(2).text, '3) 3番目のアイテム');
        });

        test('1.4 空行の後は番号を1から再開する', async function() {
            this.timeout(5000);

            const content = [
                '1. Plan（今日の目標）: 何をしようとしたか',
                '2. Do（やったこと）: 実際の結果は？',
                '3. Review（振り返り）: どこで詰まったか？',
                '4. Next（明日変えること）: 次回への具体的な改善策',
                '',
                '5. しっかりと、書き進めながら行うことができた',
                '6. まだまだみづらい部分はあって、そこの改善は必要だなと思った',
                '7. 書きずらさ、忘れる部分がある',
                '8. ちょっと修正を行う',
                '  4. markdownを修正してみる'
            ].join('\n');

            const editor = await createTestDocument(content);
            const doc = editor.document;

            editor.selection = new vscode.Selection(6, 0, 6, 0);

            await vscode.commands.executeCommand('markdownInline.renumberLists');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, '1. Plan（今日の目標）: 何をしようとしたか');
            assert.strictEqual(doc.lineAt(1).text, '2. Do（やったこと）: 実際の結果は？');
            assert.strictEqual(doc.lineAt(2).text, '3. Review（振り返り）: どこで詰まったか？');
            assert.strictEqual(doc.lineAt(3).text, '4. Next（明日変えること）: 次回への具体的な改善策');
            assert.strictEqual(doc.lineAt(5).text, '1. しっかりと、書き進めながら行うことができた');
            assert.strictEqual(doc.lineAt(6).text, '2. まだまだみづらい部分はあって、そこの改善は必要だなと思った');
            assert.strictEqual(doc.lineAt(7).text, '3. 書きずらさ、忘れる部分がある');
            assert.strictEqual(doc.lineAt(8).text, '4. ちょっと修正を行う');
            assert.strictEqual(doc.lineAt(9).text, '  1. markdownを修正してみる');
        });
    });

    suite('2. リストタイプ変換機能', () => {

        test('2.1 チェックボックスから番号付きリストへの変換', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('- [ ] タスク1\n- [x] タスク2\n- [ ] タスク3');
            const doc = editor.document;

            // 全ての行を選択
            editor.selection = new vscode.Selection(0, 0, 2, 100);

            await vscode.commands.executeCommand('markdownInline.convertToNumbered');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, '1. タスク1');
            assert.strictEqual(doc.lineAt(1).text, '2. タスク2');
            assert.strictEqual(doc.lineAt(2).text, '3. タスク3');
        });

        test('2.2 番号付きリストから箇条書きへの変換', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('1. アイテム1\n2. アイテム2\n3. アイテム3');
            const doc = editor.document;

            editor.selection = new vscode.Selection(0, 0, 2, 100);

            await vscode.commands.executeCommand('markdownInline.convertToBullet');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, '- アイテム1');
            assert.strictEqual(doc.lineAt(1).text, '- アイテム2');
            assert.strictEqual(doc.lineAt(2).text, '- アイテム3');
        });

        test('2.3 インデント保持の確認', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('- アイテム1\n  - ネストされたアイテム\n- アイテム2');
            const doc = editor.document;

            editor.selection = new vscode.Selection(0, 0, 2, 100);

            await vscode.commands.executeCommand('markdownInline.convertToNumbered');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, '1. アイテム1');
            assert.strictEqual(doc.lineAt(1).text, '  1. ネストされたアイテム');
            assert.strictEqual(doc.lineAt(2).text, '2. アイテム2');
        });

        test('2.4 ノーマルテキストへの変換', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('1. アイテム1\n2. アイテム2');
            const doc = editor.document;

            editor.selection = new vscode.Selection(0, 0, 1, 100);

            await vscode.commands.executeCommand('markdownInline.convertToNormal');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, 'アイテム1');
            assert.strictEqual(doc.lineAt(1).text, 'アイテム2');
        });

        test('2.5 箇条書きからチェックボックスへの変換', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('- アイテム1\n- アイテム2');
            const doc = editor.document;

            editor.selection = new vscode.Selection(0, 0, 1, 100);

            await vscode.commands.executeCommand('markdownInline.convertToCheckbox');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, '- [ ] アイテム1');
            assert.strictEqual(doc.lineAt(1).text, '- [ ] アイテム2');
        });
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

    suite('4. インデント調整機能', () => {

        test('4.1 Tab押下でインデント追加と番号整形', async function() {
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

        test('4.2 Shift+Tab押下でインデント削除と番号整形', async function() {
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

    suite('5. チェックボックス機能', () => {

        test('5.1 チェックボックストグル（未チェック→チェック済み）', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('- [ ] タスク1');
            const doc = editor.document;

            editor.selection = new vscode.Selection(0, 5, 0, 5);

            await vscode.commands.executeCommand('markdownInline.toggleCheckbox');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, '- [x] タスク1', 'チェックボックスがチェック済みになっていません');
        });

        test('5.2 チェックボックストグル（チェック済み→未チェック）', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('- [x] タスク1');
            const doc = editor.document;

            editor.selection = new vscode.Selection(0, 5, 0, 5);

            await vscode.commands.executeCommand('markdownInline.toggleCheckbox');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, '- [ ] タスク1', 'チェックボックスが未チェックになっていません');
        });

        test('5.3 clickCheckbox で現在行のチェックボックスを切り替える', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('- [ ] タスク1');
            const doc = editor.document;

            editor.selection = new vscode.Selection(0, 4, 0, 4);

            await vscode.commands.executeCommand('markdownInline.clickCheckbox');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, '- [x] タスク1', 'clickCheckbox が現在行を切り替えていません');
        });

        test('5.4 toggleCheckboxAtLine で指定行のチェックボックスを切り替える', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('Text\n- [ ] タスク1\n- [x] タスク2');
            const doc = editor.document;

            editor.selection = new vscode.Selection(0, 0, 0, 0);

            await vscode.commands.executeCommand('markdownInline.toggleCheckboxAtLine', 1);
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, 'Text');
            assert.strictEqual(doc.lineAt(1).text, '- [x] タスク1', 'toggleCheckboxAtLine が指定行を切り替えていません');
            assert.strictEqual(doc.lineAt(2).text, '- [x] タスク2');
        });
    });

    suite('6. エッジケース', () => {

        test('6.1 空行を含むリストの整形', async function() {
            this.timeout(5000);

            const content = '1. アイテム1\n2. アイテム2\n\n3. アイテム3';
            const editor = await createTestDocument(content);
            const doc = editor.document;

            // 1行目にカーソルを配置
            editor.selection = new vscode.Selection(0, 0, 0, 0);

            await vscode.commands.executeCommand('markdownInline.renumberLists');
            await new Promise(resolve => setTimeout(resolve, 500));

            // 空行より前のリストのみが整形される
            assert.strictEqual(doc.lineAt(0).text, '1. アイテム1');
            assert.strictEqual(doc.lineAt(1).text, '2. アイテム2');
            assert.strictEqual(doc.lineAt(2).text, '', '空行が保持されていません');
        });

        test('6.2 単一行のリスト', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('5. 単一アイテム');
            const doc = editor.document;

            editor.selection = new vscode.Selection(0, 0, 0, 0);

            await vscode.commands.executeCommand('markdownInline.renumberLists');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, '1. 単一アイテム');
        });

        test('6.3 深いネストのリスト', async function() {
            this.timeout(5000);

            const content = '3. レベル1\n  5. レベル2\n    7. レベル3\n  2. レベル2に戻る\n1. レベル1に戻る';
            const editor = await createTestDocument(content);
            const doc = editor.document;

            editor.selection = new vscode.Selection(2, 0, 2, 0);

            await vscode.commands.executeCommand('markdownInline.renumberLists');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, '1. レベル1');
            assert.strictEqual(doc.lineAt(1).text, '  1. レベル2');
            assert.strictEqual(doc.lineAt(2).text, '    1. レベル3');
            assert.strictEqual(doc.lineAt(3).text, '  2. レベル2に戻る');
            assert.strictEqual(doc.lineAt(4).text, '2. レベル1に戻る');
        });

        test('6.4 空行を含む複雑なリストの整形', async function() {
            this.timeout(5000);

            const content = '1. アイテム1\n2. アイテム2\n\n3. アイテム3\n4. アイテム4';
            const editor = await createTestDocument(content);
            const doc = editor.document;

            // 3行目（空行の後のアイテム3）にカーソルを配置
            editor.selection = new vscode.Selection(2, 0, 2, 0);

            await vscode.commands.executeCommand('markdownInline.renumberLists');
            await new Promise(resolve => setTimeout(resolve, 500));

            // 空行を挟んだ後のリストも含めて整形されるはず
            assert.strictEqual(doc.lineAt(0).text, '1. アイテム1');
            assert.strictEqual(doc.lineAt(1).text, '2. アイテム2');
            assert.strictEqual(doc.lineAt(2).text, '', '空行が保持されていません');
            assert.strictEqual(doc.lineAt(3).text, '3. アイテム3');
            assert.strictEqual(doc.lineAt(4).text, '4. アイテム4');
        });

        test('6.5 複数の空行で区切られたリスト', async function() {
            this.timeout(5000);

            const content = '1. アイテム1\n2. アイテム2\n\n\n3. アイテム3';
            const editor = await createTestDocument(content);
            const doc = editor.document;

            // 1行目にカーソルを配置
            editor.selection = new vscode.Selection(0, 0, 0, 0);

            await vscode.commands.executeCommand('markdownInline.renumberLists');
            await new Promise(resolve => setTimeout(resolve, 500));

            // 2つ以上の連続した空行があるので、別のリストとして扱われる
            assert.strictEqual(doc.lineAt(0).text, '1. アイテム1');
            assert.strictEqual(doc.lineAt(1).text, '2. アイテム2');
            assert.strictEqual(doc.lineAt(2).text, '', '1つ目の空行が保持されていません');
            assert.strictEqual(doc.lineAt(3).text, '', '2つ目の空行が保持されていません');
            // アイテム3は別のリストなので整形されない
            assert.strictEqual(doc.lineAt(4).text, '3. アイテム3');
        });

        test('6.6 インデントレベルが複雑に変化するリスト', async function() {
            this.timeout(5000);

            const content = '5. 親1\n  3. 子1\n    7. 孫1\n    2. 孫2\n  8. 子2\n10. 親2\n  1. 子3';
            const editor = await createTestDocument(content);
            const doc = editor.document;

            editor.selection = new vscode.Selection(3, 0, 3, 0);

            await vscode.commands.executeCommand('markdownInline.renumberLists');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, '1. 親1');
            assert.strictEqual(doc.lineAt(1).text, '  1. 子1');
            assert.strictEqual(doc.lineAt(2).text, '    1. 孫1');
            assert.strictEqual(doc.lineAt(3).text, '    2. 孫2');
            assert.strictEqual(doc.lineAt(4).text, '  2. 子2');
            assert.strictEqual(doc.lineAt(5).text, '2. 親2');
            assert.strictEqual(doc.lineAt(6).text, '  1. 子3');
        });

        test('6.7 タブとスペースが混在するインデント', async function() {
            this.timeout(5000);

            const content = '5. アイテム1\n\t3. アイテム2（タブ）\n  7. アイテム3（スペース2つ）\n    2. アイテム4（スペース4つ）';
            const editor = await createTestDocument(content);
            const doc = editor.document;

            editor.selection = new vscode.Selection(1, 0, 1, 0);

            await vscode.commands.executeCommand('markdownInline.renumberLists');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, '1. アイテム1');
            // タブ1つ = レベル1
            assert.strictEqual(doc.lineAt(1).text, '\t1. アイテム2（タブ）');
            // スペース2つ = レベル1
            assert.strictEqual(doc.lineAt(2).text, '  2. アイテム3（スペース2つ）');
            // スペース4つ = レベル2
            assert.strictEqual(doc.lineAt(3).text, '    1. アイテム4（スペース4つ）');
        });

        test('6.8 単一空行を含むネストリスト', async function() {
            this.timeout(5000);

            const content = '3. 親1\n  5. 子1\n\n  7. 子2\n9. 親2';
            const editor = await createTestDocument(content);
            const doc = editor.document;

            editor.selection = new vscode.Selection(1, 0, 1, 0);

            await vscode.commands.executeCommand('markdownInline.renumberLists');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, '1. 親1');
            assert.strictEqual(doc.lineAt(1).text, '  1. 子1');
            assert.strictEqual(doc.lineAt(2).text, '', '空行が保持されていません');
            assert.strictEqual(doc.lineAt(3).text, '  2. 子2');
            assert.strictEqual(doc.lineAt(4).text, '2. 親2');
        });
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
            assert.strictEqual(doc.lineAt(0).text, '| Header 1 | Header 2 |');
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

        test('8.6 /toc で目次を生成する', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('/toc\n# Title\n## Section');
            const doc = editor.document;

            editor.selection = new vscode.Selection(0, doc.lineAt(0).text.length, 0, doc.lineAt(0).text.length);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, '/toc');
            assert.strictEqual(doc.lineAt(1).text, '- [Title](#title)');
            assert.strictEqual(doc.lineAt(2).text, '  - [Section](#section)');
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
