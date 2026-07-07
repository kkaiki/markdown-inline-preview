/**
 * Raw モード（実 VS Code）のリスト・チェックボックス固有の変換/整形機能を検証する。
 *
 * 対象: 番号付きリスト自動整形（renumberLists）、リスト種別変換（bullet⇄ordered⇄checkbox）、
 * チェックボックストグル、リスト整形のエッジケース、再採番の Undo。
 *
 * 実行: `node ./out-test/test/runTest.js`（VS Code を1回起動し、extension/ 配下の
 * 全テストファイルと同じインスタンス内で実行する）。`MOCHA_GREP` でテスト名の絞り込みが可能。
 */
import assert from "assert";
import * as vscode from "vscode";
import { createTestDocument, closeAllEditors } from "../helpers";

suite('Raw: lists-tables', () => {

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

    suite('11. 実 VS Code 環境でのバグハンティング', () => {

        test('11.2 ネストリストの空行を跨ぐ再採番を Undo で 1 段階戻すと、番号と空行の両方が元通りになる', async function () {
            this.timeout(8000);

            // ネストされた項目の間に空行が 1 つだけ挟まる構成（今回の renumberLists 修正対象）。
            const content = '1. 親1\n  1. 子1\n\n  3. 子2（空行後、番号がズレている）\n2. 親2';
            const editor = await createTestDocument(content);
            const doc = editor.document;

            editor.selection = new vscode.Selection(0, 0, 0, 0);
            await vscode.commands.executeCommand('markdownInline.renumberLists');
            await new Promise(resolve => setTimeout(resolve, 500));

            const afterRenumber = doc.getText();
            // 空行を跨いで子2の番号が振り直され、空行自体は保持されているはず。
            assert.ok(afterRenumber.includes('\n\n'), `再採番後に空行が消えている: ${JSON.stringify(afterRenumber)}`);
            assert.ok(afterRenumber.includes('2. 子2'), `子2 の番号が振り直されていない: ${JSON.stringify(afterRenumber)}`);

            await vscode.commands.executeCommand('undo');
            // undo コマンドの反映は非同期で遅れることがある（固定 500ms だと不安定）。
            // 内容が戻るまで最大 4 秒ポーリングする。
            let afterUndo = doc.getText();
            for (let i = 0; i < 10 && afterUndo !== content; i++) {
                await new Promise(resolve => setTimeout(resolve, 400));
                afterUndo = doc.getText();
            }
            assert.strictEqual(
                afterUndo,
                content,
                `Undo 1 回で再採番前の内容（番号・空行とも）に完全に戻っていない: ${JSON.stringify(afterUndo)}`
            );
        });
    });
});
