/**
 * Preview モード（実 VS Code）の VS Code 本体設定との連携を検証する。
 *
 * 対象: `alwaysOpenNewTab` → `workbench.editor.enablePreview`、
 * `wordWrap` → markdown 言語スコープの `editor.wordWrap`、
 * `wrapTabs` → `workbench.editor.wrapTabs` への反映、
 * `controlDefaultEditor` → `workbench.editorAssociations` へのモード追従。
 *
 * 実行: `node ./out-test/test/runTest.js`（VS Code を1回起動し、extension/ 配下の
 * 全テストファイルと同じインスタンス内で実行する）。`MOCHA_GREP` でテスト名の絞り込みが可能。
 */
import assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { closeAllEditors, createTestDocument, updateMarkdownInlineSetting } from "../helpers";

suite('Preview: settings', () => {

    teardown(async () => {
        await closeAllEditors();
    });

    suite('10. VS Code 本体設定との連携', () => {

        function getRawGlobal(section: string, key: string): unknown {
            return vscode.workspace.getConfiguration(section).get(key);
        }

        function getMarkdownWordWrap(): unknown {
            return vscode.workspace.getConfiguration('editor', { languageId: 'markdown' }).get('wordWrap');
        }

        teardown(async () => {
            // 実 VS Code 本体設定を触るテストなので、他のテストへ影響しないよう必ず既定へ戻す。
            await updateMarkdownInlineSetting('preview.alwaysOpenNewTab', undefined);
            await updateMarkdownInlineSetting('preview.wordWrap', undefined);
            await updateMarkdownInlineSetting('preview.wrapTabs', undefined);
            await vscode.workspace.getConfiguration().update(
                'workbench.editor.enablePreview', undefined, vscode.ConfigurationTarget.Global
            );
            await vscode.workspace.getConfiguration('editor', { languageId: 'markdown' }).update(
                'wordWrap', undefined, vscode.ConfigurationTarget.Global, true
            );
            await vscode.workspace.getConfiguration().update(
                'workbench.editor.wrapTabs', undefined, vscode.ConfigurationTarget.Global
            );
        });

        test('10.1 alwaysOpenNewTab を true にすると workbench.editor.enablePreview が false になる', async function () {
            this.timeout(8000);

            await updateMarkdownInlineSetting('preview.alwaysOpenNewTab', true);

            const enablePreview = getRawGlobal('workbench.editor', 'enablePreview');
            assert.strictEqual(enablePreview, false, 'alwaysOpenNewTab=true のとき workbench.editor.enablePreview が false になっていません');
        });

        test('10.2 alwaysOpenNewTab を false にすると workbench.editor.enablePreview が true に戻る', async function () {
            this.timeout(8000);

            await updateMarkdownInlineSetting('preview.alwaysOpenNewTab', true);
            await updateMarkdownInlineSetting('preview.alwaysOpenNewTab', false);

            const enablePreview = getRawGlobal('workbench.editor', 'enablePreview');
            assert.strictEqual(enablePreview, true, 'alwaysOpenNewTab=false のとき workbench.editor.enablePreview が true に戻っていません');
        });

        test('10.3 wordWrap を true にすると markdown 言語の editor.wordWrap が on になる', async function () {
            this.timeout(8000);

            await updateMarkdownInlineSetting('preview.wordWrap', true);

            const wordWrap = getMarkdownWordWrap();
            assert.strictEqual(wordWrap, 'on', 'wordWrap=true のとき [markdown] の editor.wordWrap が on になっていません');
        });

        test('10.4 wordWrap を false にすると markdown 言語の editor.wordWrap が off になる', async function () {
            this.timeout(8000);

            await updateMarkdownInlineSetting('preview.wordWrap', true);
            await updateMarkdownInlineSetting('preview.wordWrap', false);

            const wordWrap = getMarkdownWordWrap();
            assert.strictEqual(wordWrap, 'off', 'wordWrap=false のとき [markdown] の editor.wordWrap が off になっていません');
        });

        test('10.5 wrapTabs を true にすると workbench.editor.wrapTabs が true になる', async function () {
            this.timeout(8000);

            await updateMarkdownInlineSetting('preview.wrapTabs', true);

            const wrapTabs = getRawGlobal('workbench.editor', 'wrapTabs');
            assert.strictEqual(wrapTabs, true, 'wrapTabs=true のとき workbench.editor.wrapTabs が true になっていません');
        });

        test('10.6 wrapTabs を false にすると workbench.editor.wrapTabs が false に戻る', async function () {
            this.timeout(8000);

            await updateMarkdownInlineSetting('preview.wrapTabs', true);
            await updateMarkdownInlineSetting('preview.wrapTabs', false);

            const wrapTabs = getRawGlobal('workbench.editor', 'wrapTabs');
            assert.strictEqual(wrapTabs, false, 'wrapTabs=false のとき workbench.editor.wrapTabs が false に戻っていません');
        });
    });

    // コマンドパレットから `markdownInline.preview.showLineNumbers` を素早く切り替えたい
    // という要望（設定 UI で毎回検索するのが手間）に応え、コマンドパレットに現れる
    // 専用トグルコマンドを追加した。設定 UI の検索とは別に、コマンド名（日本語/英語とも
    // 「行番号」「line numbers」でヒットする）から直接呼べる。
    suite('11. 行番号表示のコマンドパレット・トグル', () => {

        teardown(async () => {
            await updateMarkdownInlineSetting('preview.showLineNumbers', undefined);
        });

        function getShowLineNumbers(): unknown {
            return vscode.workspace.getConfiguration('markdownInline').get('preview.showLineNumbers');
        }

        test('11.1 markdownInline.toggleLineNumbers はコマンドパレットに登録されている', async function () {
            this.timeout(8000);

            // 拡張は onLanguage:markdown で遅延アクティベートされる。他スイートより先に
            // 単体で実行されると未アクティベートで getCommands に載らないことがあるため、
            // まず Markdown 文書を開いてアクティベーションを確定させてから確認する。
            await createTestDocument('# doc');
            await new Promise(resolve => setTimeout(resolve, 1000));

            const commands = await vscode.commands.getCommands(true);
            assert.ok(
                commands.includes('markdownInline.toggleLineNumbers'),
                'markdownInline.toggleLineNumbers コマンドが登録されていません'
            );
        });

        test('11.2 既定値(true)から実行すると showLineNumbers が false になる', async function () {
            this.timeout(8000);

            await updateMarkdownInlineSetting('preview.showLineNumbers', true);
            await vscode.commands.executeCommand('markdownInline.toggleLineNumbers');
            await new Promise(resolve => setTimeout(resolve, 250));

            assert.strictEqual(getShowLineNumbers(), false, '実行後に showLineNumbers が false になっていません');
        });

        test('11.3 false から実行すると showLineNumbers が true に戻る', async function () {
            this.timeout(8000);

            await updateMarkdownInlineSetting('preview.showLineNumbers', false);
            await vscode.commands.executeCommand('markdownInline.toggleLineNumbers');
            await new Promise(resolve => setTimeout(resolve, 250));

            assert.strictEqual(getShowLineNumbers(), true, '実行後に showLineNumbers が true に戻っていません');
        });
    });

    // Raw/Preview のモードを、VS Code 本体の「.md をどのエディタで開くか」
    // （workbench.editorAssociations）へ同期させる。これにより Raw モードのときは
    // ファイルを開いた瞬間から標準テキストエディタが解決され、Preview の Custom Editor が
    // 一度生成されてから跳ね返る（bounceToRawEditor）経路を通らなくなる。
    // 同時に、同じく priority: "default" を名乗る他拡張との解決の揺れも無くなる。
    suite('16. .md の既定エディタをモードに追従させる（editorAssociations）', () => {
        const PREVIEW_VIEW_TYPE = 'ipreview.preview';
        let tmpDir: string | undefined;

        function getAssociations(): Record<string, string> | undefined {
            return vscode.workspace.getConfiguration('workbench').get<Record<string, string>>('editorAssociations');
        }

        function sleep(ms: number): Promise<void> {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        async function openRealMdFile(name: string, content: string): Promise<vscode.Uri> {
            if (!tmpDir) tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-16-'));
            const filePath = path.join(tmpDir, name);
            await fs.promises.writeFile(filePath, content, 'utf-8');
            const uri = vscode.Uri.file(filePath);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preview: false });
            return uri;
        }

        /** アクティブなタブが Preview（Custom Editor）になるまで togglePreview する。 */
        async function ensurePreview(): Promise<void> {
            for (let i = 0; i < 3; i++) {
                if (vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputCustom) return;
                await vscode.commands.executeCommand('markdownInline.togglePreview');
                await sleep(600);
            }
        }

        /** アクティブなタブが Raw（テキストエディタ）になるまで togglePreview する。 */
        async function ensureRaw(): Promise<void> {
            for (let i = 0; i < 3; i++) {
                if (vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputText) return;
                await vscode.commands.executeCommand('markdownInline.togglePreview');
                await sleep(600);
            }
        }

        teardown(async () => {
            // 実 VS Code のグローバル設定を触るため、他スイートへ影響しないよう必ず戻す。
            await updateMarkdownInlineSetting('preview.controlDefaultEditor', undefined);
            await vscode.workspace.getConfiguration('workbench').update(
                'editorAssociations', undefined, vscode.ConfigurationTarget.Global
            );
            await closeAllEditors();
            if (tmpDir) {
                fs.rmSync(tmpDir, { recursive: true, force: true });
                tmpDir = undefined;
            }
        });

        test('16.1 Raw へ切り替えると *.md の既定エディタが VS Code 標準テキストエディタになる', async function () {
            this.timeout(30000);

            await openRealMdFile('assoc-raw.md', '# Raw 既定化\n');
            await ensurePreview();
            await ensureRaw();
            await sleep(500);

            const associations = getAssociations();
            assert.strictEqual(
                associations?.['*.md'], 'default',
                `Raw へ切り替えたのに *.md の既定エディタが標準テキストエディタになっていません: ${JSON.stringify(associations)}`
            );
        });

        test('16.2 Preview へ切り替えると *.md の既定エディタが Preview に戻る', async function () {
            this.timeout(30000);

            await openRealMdFile('assoc-preview.md', '# Preview 既定化\n');
            await ensureRaw();
            await ensurePreview();
            await sleep(500);

            const associations = getAssociations();
            assert.strictEqual(
                associations?.['*.md'], PREVIEW_VIEW_TYPE,
                `Preview へ切り替えたのに *.md の既定エディタが Preview になっていません: ${JSON.stringify(associations)}`
            );
        });

        test('16.3 controlDefaultEditor=false のときはモードを切り替えても既定エディタを書き換えない', async function () {
            this.timeout(30000);

            await updateMarkdownInlineSetting('preview.controlDefaultEditor', false);
            await vscode.workspace.getConfiguration('workbench').update(
                'editorAssociations', undefined, vscode.ConfigurationTarget.Global
            );
            await sleep(300);

            await openRealMdFile('assoc-off.md', '# 制御 OFF\n');
            await ensurePreview();
            await ensureRaw();
            await sleep(500);

            const associations = getAssociations();
            assert.ok(
                !associations || associations['*.md'] === undefined,
                `controlDefaultEditor=false なのに *.md の既定エディタが書き換えられました: ${JSON.stringify(associations)}`
            );
        });

        test('16.4 他拡張のための関連付け（*.pdf など）はモード切替で消えない', async function () {
            this.timeout(30000);

            await vscode.workspace.getConfiguration('workbench').update(
                'editorAssociations', { '*.pdf': 'cweijan.pdfViewer' }, vscode.ConfigurationTarget.Global
            );
            await sleep(300);

            await openRealMdFile('assoc-keep.md', '# 他の関連付けを壊さない\n');
            await ensurePreview();
            await ensureRaw();
            await sleep(500);

            const associations = getAssociations();
            assert.strictEqual(
                associations?.['*.pdf'], 'cweijan.pdfViewer',
                `無関係な関連付けがモード切替で失われました: ${JSON.stringify(associations)}`
            );
        });
    });
});
