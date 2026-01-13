const assert = require('assert');
const vscode = require('vscode');

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
});
