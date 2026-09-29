/**
 * Raw モード（実 VS Code）で Notion 準拠のショートカットのコマンドが
 * 実際に登録され、実ドキュメントを期待どおり書き換えることを検証する。
 *
 * キー割り当てそのもの（⌘B が本当に押せるか）は VS Code のキーバインド解決の
 * 担当で拡張ホストテストからは駆動できないため、ここでは
 * **コマンドが登録されていて、実行すると文書が変わる**ことまでを守る。
 * 文字列の組み立ては純関数テスト（test/suite/shared/inlineFormat・blockOps）が担保する。
 *
 * 仕様: docs/specifications/notion-shortcuts.md
 */
import assert from "assert";
import * as vscode from "vscode";
import { createTestDocument, closeAllEditors, assertSelection, updateMarkdownInlineSetting, textLF } from "../helpers";

suite('Raw: Notion 準拠のショートカット', () => {

    teardown(async () => {
        await closeAllEditors();
    });

    suite('20. インライン書式', () => {

        test('20.1 選択して Bold コマンドを実行すると ** で囲まれ、中身が選択されたまま残る', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('選択テキスト');
            editor.selection = new vscode.Selection(0, 0, 0, 6);

            await vscode.commands.executeCommand('markdownInline.formatBold');

            assert.strictEqual(editor.document.lineAt(0).text, '**選択テキスト**');
            assertSelection(editor, 0, 2, 0, 8, 'Bold 後の選択範囲');
        });

        test('20.2 もう一度 Bold を実行すると ** が外れる（選択が記号の内側にあっても外せる）', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('選択テキスト');
            editor.selection = new vscode.Selection(0, 0, 0, 6);

            await vscode.commands.executeCommand('markdownInline.formatBold');
            await vscode.commands.executeCommand('markdownInline.formatBold');

            assert.strictEqual(editor.document.lineAt(0).text, '選択テキスト');
        });

        test('20.3 Underline は Markdown に下線が無いため <u></u> で囲む', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('下線');
            editor.selection = new vscode.Selection(0, 0, 0, 2);

            await vscode.commands.executeCommand('markdownInline.formatUnderline');

            assert.strictEqual(editor.document.lineAt(0).text, '<u>下線</u>');
        });

        test('20.4 Link は選択をリンクテキストにしてカーソルを URL の位置へ置く', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('リンク');
            editor.selection = new vscode.Selection(0, 0, 0, 3);

            await vscode.commands.executeCommand('markdownInline.formatLink');

            assert.strictEqual(editor.document.lineAt(0).text, '[リンク]()');
            assertSelection(editor, 0, 6, 0, 6, 'Link 後のカーソル位置（URL を打つ位置）');
        });

        test('20.5 Inline Code / Strikethrough / Highlight / Comment もそれぞれの記法で囲む', async function() {
            this.timeout(10000);

            const cases: [string, string][] = [
                ['markdownInline.formatCode', '`本文`'],
                ['markdownInline.formatStrikethrough', '~~本文~~'],
                ['markdownInline.formatHighlight', '==本文=='],
                ['markdownInline.formatComment', '<!-- 本文 -->']
            ];
            for (const [command, expected] of cases) {
                const editor = await createTestDocument('本文');
                editor.selection = new vscode.Selection(0, 0, 0, 2);
                await vscode.commands.executeCommand(command);
                assert.strictEqual(editor.document.lineAt(0).text, expected, `${command} の結果`);
                await closeAllEditors();
            }
        });

        test('20.6 markdown 以外のファイルでは何もしない', async function() {
            this.timeout(5000);

            const doc = await vscode.workspace.openTextDocument({ content: '選択', language: 'plaintext' });
            const editor = await vscode.window.showTextDocument(doc);
            editor.selection = new vscode.Selection(0, 0, 0, 2);

            await vscode.commands.executeCommand('markdownInline.formatBold');

            assert.strictEqual(editor.document.lineAt(0).text, '選択');
        });
    });

    suite('21. ブロック操作・ブロック変換', () => {

        test('21.1 Duplicate Block はカーソル行を直下に複製する', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('- 項目A\n- 項目B');
            editor.selection = new vscode.Selection(0, 1, 0, 1);

            await vscode.commands.executeCommand('markdownInline.duplicateBlock');

            assert.strictEqual(editor.document.getText(), '- 項目A\n- 項目A\n- 項目B');
        });

        test('21.2 Duplicate Block は子項目も一緒に複製する', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('- 親\n  - 子\n- 次');
            editor.selection = new vscode.Selection(0, 1, 0, 1);

            await vscode.commands.executeCommand('markdownInline.duplicateBlock');

            assert.strictEqual(editor.document.getText(), '- 親\n  - 子\n- 親\n  - 子\n- 次');
        });

        test('21.3 Convert to Toggle List は <details> で包む', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('たたむ');
            editor.selection = new vscode.Selection(0, 3, 0, 3);

            await vscode.commands.executeCommand('markdownInline.convertToToggleList');

            assert.strictEqual(
                textLF(editor.document),
                '<details>\n<summary>たたむ</summary>\n\n\n</details>'
            );
        });

        test('21.4 Convert to Code Block はコードフェンスで包む', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('const a = 1;');
            editor.selection = new vscode.Selection(0, 0, 0, 12);

            await vscode.commands.executeCommand('markdownInline.convertToCodeBlock');

            assert.strictEqual(textLF(editor.document), '```\nconst a = 1;\n```');
        });

        test('21.5 Convert to Quote は行頭に > を付ける', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('引用にする');
            editor.selection = new vscode.Selection(0, 0, 0, 0);

            await vscode.commands.executeCommand('markdownInline.convertToQuote');

            assert.strictEqual(editor.document.lineAt(0).text, '> 引用にする');
        });

        test('21.6 Convert to Quote は複数行選択で全行に当たる', async function() {
            this.timeout(5000);

            const editor = await createTestDocument('あ\nい');
            editor.selection = new vscode.Selection(0, 0, 1, 1);

            await vscode.commands.executeCommand('markdownInline.convertToQuote');

            assert.strictEqual(editor.document.getText(), '> あ\n> い');
        });
    });
    /**
     * 22. 設定 `markdownInline.notionKeymap.enabled`（仕様 notion-shortcuts.md §4）
     *
     * キー入力そのものは拡張ホストから駆動できないので、ここで守れるのは
     *   - 設定値がコンテキストキーの元になる関数まで届くこと
     *   - 設定を切っても**コマンド自体は残る**こと（外れるのはキーバインドだけ）
     * まで。`when` 句の宣言は `test/suite/shared/notionKeybindings.test.ts` が見る。
     */
    suite('22. Notion キーマップの設定', () => {
        teardown(async () => {
            await updateMarkdownInlineSetting('notionKeymap.enabled', undefined);
        });

        test('22.1 既定では有効', function () {
            this.timeout(5000);
            assert.strictEqual(
                vscode.workspace.getConfiguration('markdownInline').get<boolean>('notionKeymap.enabled', true),
                true
            );
        });

        test('22.2 設定を切ると無効になる（キーバインドの when が外れる）', async function () {
            this.timeout(5000);
            await updateMarkdownInlineSetting('notionKeymap.enabled', false);
            assert.strictEqual(
                vscode.workspace.getConfiguration('markdownInline').get<boolean>('notionKeymap.enabled', true),
                false
            );
        });

        test('22.3 設定を切ってもコマンドは実行できる（コマンドパレットからは使える）', async function () {
            this.timeout(5000);
            await updateMarkdownInlineSetting('notionKeymap.enabled', false);

            const editor = await createTestDocument('太字にする');
            editor.selection = new vscode.Selection(0, 0, 0, 5);
            await vscode.commands.executeCommand('markdownInline.formatBold');

            assert.strictEqual(editor.document.getText(), '**太字にする**');
        });
    });
});
