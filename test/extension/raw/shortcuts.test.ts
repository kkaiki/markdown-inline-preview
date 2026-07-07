/**
 * Raw モード（実 VS Code）のスラッシュコマンドを検証する。
 *
 * 対象: `/heading N`・`/table`・`/table normalize on|off`・`/code`・`/quote`・`/divider`・
 * `/callout`・`/bullet`・`/numbered`・`/todo` の展開結果とカーソル位置、
 * `/h1`〜`/h6` 省略形展開、複数カーソル時のスキップ、フェンスコードブロック内での抑止。
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

        // applySlashCommand.ts に実装があるが従来一件もテストが無かったコマンド群
        // （preview-usage-flow-test-backlog.md §4.2 の網羅監査で発見したギャップ）。

        test('8.8 /code でフェンスコードブロックを挿入し、カーソルは中の空行に置かれる', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('/code');
            const doc = editor.document;
            editor.selection = new vscode.Selection(0, doc.lineAt(0).text.length, 0, doc.lineAt(0).text.length);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineCount, 3);
            assert.strictEqual(doc.lineAt(0).text, '```');
            assert.strictEqual(doc.lineAt(1).text, '');
            assert.strictEqual(doc.lineAt(2).text, '```');
            assertSelection(editor, 1, 0, 1, 0, '/code 挿入後のカーソルがコードブロック内にありません');
        });

        test('8.9 /code js は言語エイリアスを正規名（javascript）に展開する', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('/code js');
            const doc = editor.document;
            editor.selection = new vscode.Selection(0, doc.lineAt(0).text.length, 0, doc.lineAt(0).text.length);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, '```javascript');
        });

        test('8.10 /quote 本文 は引用行に変換される', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('/quote 引用したい文章');
            const doc = editor.document;
            editor.selection = new vscode.Selection(0, doc.lineAt(0).text.length, 0, doc.lineAt(0).text.length);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineCount, 1);
            assert.strictEqual(doc.lineAt(0).text, '> 引用したい文章');
        });

        test('8.11 本文無しの /quote は空の引用行になる', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('/quote');
            const doc = editor.document;
            editor.selection = new vscode.Selection(0, doc.lineAt(0).text.length, 0, doc.lineAt(0).text.length);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, '> ');
        });

        test('8.12 /divider は水平線 --- に変換される', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('/divider');
            const doc = editor.document;
            editor.selection = new vscode.Selection(0, doc.lineAt(0).text.length, 0, doc.lineAt(0).text.length);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, '---');
        });

        test('8.13 /callout（種別省略）は note 用の絵文字プレフィックスになる', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('/callout');
            const doc = editor.document;
            editor.selection = new vscode.Selection(0, doc.lineAt(0).text.length, 0, doc.lineAt(0).text.length);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, '> 💡 ');
        });

        test('8.14 /callout warn はエイリアス経由で warning 用の絵文字になる', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('/callout warn');
            const doc = editor.document;
            editor.selection = new vscode.Selection(0, doc.lineAt(0).text.length, 0, doc.lineAt(0).text.length);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, '> ⚠️ ');
        });

        test('8.15 /bullet は箇条書きマーカーに変換される', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('/bullet');
            const doc = editor.document;
            editor.selection = new vscode.Selection(0, doc.lineAt(0).text.length, 0, doc.lineAt(0).text.length);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, '- ');
        });

        test('8.16 /numbered は番号付きリストマーカーに変換される', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('/numbered');
            const doc = editor.document;
            editor.selection = new vscode.Selection(0, doc.lineAt(0).text.length, 0, doc.lineAt(0).text.length);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, '1. ');
        });

        test('8.17 /todo は未チェックのチェックボックスマーカーに変換される', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('/todo');
            const doc = editor.document;
            editor.selection = new vscode.Selection(0, doc.lineAt(0).text.length, 0, doc.lineAt(0).text.length);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, '- [ ] ');
        });

        test('8.18 /h2 の省略形は /heading 2 と同じく H2 に展開される', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('/h2');
            const doc = editor.document;
            editor.selection = new vscode.Selection(0, doc.lineAt(0).text.length, 0, doc.lineAt(0).text.length);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, '## ');
        });

        test('8.19 複数カーソルがある場合はスラッシュコマンドを展開しない', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('/todo\n本文');
            const doc = editor.document;
            editor.selections = [
                new vscode.Selection(0, doc.lineAt(0).text.length, 0, doc.lineAt(0).text.length),
                new vscode.Selection(1, doc.lineAt(1).text.length, 1, doc.lineAt(1).text.length)
            ];

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(0).text, '/todo',
                '複数カーソル時にスラッシュコマンドが展開されてしまった');
        });

        test('8.20 フェンスコードブロック内では /todo をそのままの文字列として残す', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('```\n/todo\n```');
            const doc = editor.document;
            editor.selection = new vscode.Selection(1, doc.lineAt(1).text.length, 1, doc.lineAt(1).text.length);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineAt(1).text, '/todo',
                'フェンスコードブロック内なのにスラッシュコマンドが展開された');
        });

        test('8.21 /table normalize（on/off 引数なし）は警告のみで行を変更しない', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('/table normalize');
            const doc = editor.document;
            editor.selection = new vscode.Selection(0, doc.lineAt(0).text.length, 0, doc.lineAt(0).text.length);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(doc.lineCount, 1);
            assert.strictEqual(doc.lineAt(0).text, '/table normalize',
                '引数なしの normalize で行が変更されてしまった');
        });

        test('8.22 /table normilize on（typo エイリアス）でも normalize on と同じく設定が反映される', async function() {
            this.timeout(8000);

            const toggleEditor = await createTestDocument('/table normilize on');
            const toggleDoc = toggleEditor.document;
            toggleEditor.selection = new vscode.Selection(0, toggleDoc.lineAt(0).text.length, 0, toggleDoc.lineAt(0).text.length);

            await vscode.commands.executeCommand('markdownInline.smartEnter');
            await new Promise(resolve => setTimeout(resolve, 500));

            assert.strictEqual(toggleDoc.lineCount, 1);
            assert.strictEqual(toggleDoc.lineAt(0).text, '',
                'typo エイリアス normilize が normalize と同様に処理されなかった');

            const editor = await createTestDocument('| A | B |\n| --- | --- |\n| C | D |\nText');
            const doc = editor.document;

            editor.selection = new vscode.Selection(0, 0, 0, 0);
            await new Promise(resolve => setTimeout(resolve, 200));
            editor.selection = new vscode.Selection(3, 0, 3, 0);
            await new Promise(resolve => setTimeout(resolve, 700));

            assert.notStrictEqual(doc.lineAt(0).text, '| A | B |',
                'normilize on（typo）が自動整形を有効化していない');
        });
    });
});
