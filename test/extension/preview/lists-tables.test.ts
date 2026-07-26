/**
 * Preview モード（実 VS Code）でのチェックボックス操作が、実ドキュメント・実ディスクまで
 * 正しく書き戻されることを検証する。
 *
 * `test/browser`/`test/webview` はチェックボックスのトグル・改行・降格ロジック自体を
 * 大量にカバーしているが、それらは webview バンドル単体（実ファイル無し）のレイヤーで、
 * `enqueueWebviewChange → applyMarkdownFromWebview` 以降の実ホスト処理（ディスク read・
 * WorkspaceEdit・save・fileWatcher）を経由しない。ここでは webview からの `change`
 * メッセージ受信経路を直接叩けるテスト専用フック（`markdownInline.__test.injectWebviewChange`、
 * `external-sync.test.ts` 12.7 と同じ仕組み）を使い、チェックボックス操作の結果として
 * webview が送るであろう markdown 全文を模して、実ドキュメント・実ディスクへの反映を確認する。
 *
 * 発端: 2026-07-08、`docs/testing/preview-usage-flow-test-backlog.md` 4.2 の監査で
 * `test/extension/preview/` に lists-tables カテゴリ（チェックボックス関連）が
 * 1件も存在しないことが判明した。
 *
 * 実行: `node ./out-test/test/runTest.js`（VS Code を1回起動し、extension/ 配下の
 * 全テストファイルと同じインスタンス内で実行する）。`MOCHA_GREP` でテスト名の絞り込みが可能。
 */
import assert from "assert";
import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { closeAllEditors } from "../helpers";

const PREVIEW_VIEW_TYPE = 'ipreview.preview';

suite('Preview: lists-tables（実 VS Code end-to-end）', () => {

    teardown(async () => {
        await closeAllEditors();
    });

    let tmpDir: string | undefined;
    teardown(() => {
        if (tmpDir) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
            tmpDir = undefined;
        }
    });

    function sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function previewTabsForUri(uri: vscode.Uri): vscode.Tab[] {
        const tabs: vscode.Tab[] = [];
        for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
                if (tab.input instanceof vscode.TabInputCustom
                    && tab.input.viewType === PREVIEW_VIEW_TYPE
                    && tab.input.uri.toString() === uri.toString()) {
                    tabs.push(tab);
                }
            }
        }
        return tabs;
    }

    async function openRealFileInPreview(content: string): Promise<{ editor: vscode.TextEditor; filePath: string; uri: vscode.Uri }> {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-checkbox-e2e-'));
        const filePath = path.join(tmpDir, 'doc.md');
        fs.writeFileSync(filePath, content, 'utf-8');
        const uri = vscode.Uri.file(filePath);
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);

        await vscode.commands.executeCommand('markdownInline.togglePreview');
        await sleep(800);
        assert.strictEqual(previewTabsForUri(uri).length, 1,
            `前提: Preview タブが開いていない（アクティブタブ: ${vscode.window.tabGroups.activeTabGroup.activeTab?.label})`);

        return { editor, filePath, uri };
    }

    async function injectAndSettle(uri: vscode.Uri, markdown: string): Promise<void> {
        const ok = await vscode.commands.executeCommand(
            'markdownInline.__test.injectWebviewChange', uri.toString(), markdown
        );
        assert.strictEqual(ok, true, 'テスト用フック（injectWebviewChange）が Preview の webview を見つけられなかった');
        await sleep(600);
    }

    test('13.1 チェックボックスのトグル（未チェック→チェック済み→未チェック）が実ドキュメント・実ディスクへ反映される', async function () {
        this.timeout(20000);
        const { editor, filePath, uri } = await openRealFileInPreview('- [ ] task\n');

        await injectAndSettle(uri, '- [x] task\n');
        assert.strictEqual(editor.document.getText(), '- [x] task\n',
            `チェック後の document モデルが反映されていない: ${JSON.stringify(editor.document.getText())}`);
        assert.strictEqual(fs.readFileSync(filePath, 'utf-8'), '- [x] task\n',
            `チェック後のディスク内容が反映されていない: ${JSON.stringify(fs.readFileSync(filePath, 'utf-8'))}`);

        await injectAndSettle(uri, '- [ ] task\n');
        assert.strictEqual(editor.document.getText(), '- [ ] task\n',
            `再度の未チェックが document モデルへ反映されていない: ${JSON.stringify(editor.document.getText())}`);
        assert.strictEqual(fs.readFileSync(filePath, 'utf-8'), '- [ ] task\n',
            `再度の未チェックがディスクへ反映されていない: ${JSON.stringify(fs.readFileSync(filePath, 'utf-8'))}`);
    });

    test('13.2 Enter でチェックボックス項目を継続して増やした結果が実ドキュメント・実ディスクへ反映される', async function () {
        this.timeout(20000);
        const { editor, filePath, uri } = await openRealFileInPreview('- [x] first\n');

        // webview 側は Enter のたびに「その時点の全文」を送る（postChange の設計）。
        const steps = [
            '- [x] first\n- [ ] \n',
            '- [x] first\n- [ ] second\n'
        ];
        for (const markdown of steps) {
            await injectAndSettle(uri, markdown);
        }

        const expected = steps[steps.length - 1];
        assert.strictEqual(editor.document.getText(), expected,
            `Enter で増えた項目が document モデルへ正しく反映されていない: ${JSON.stringify(editor.document.getText())}`);
        assert.strictEqual(fs.readFileSync(filePath, 'utf-8'), expected,
            `Enter で増えた項目がディスクへ正しく反映されていない: ${JSON.stringify(fs.readFileSync(filePath, 'utf-8'))}`);
    });

    test('13.3 行頭 Backspace によるチェックボックス→箇条書きの降格が実ドキュメント・実ディスクへ反映される', async function () {
        // markerBackspace.ts の降格バグ（2026-07-08 発見・修正、
        // docs/testing/preview-usage-flow-test-backlog.md 4.2）の host 側回帰確認。
        // webview 側での降格結果（"- [ ] second" → "- second"）を模した markdown を
        // そのまま受信させ、記法の混線やタブ増殖なく実ファイルへ保存されることを確認する。
        this.timeout(20000);
        const { editor, filePath, uri } = await openRealFileInPreview('- [x] first\n- [ ] second\n');

        await injectAndSettle(uri, '- [x] first\n- second\n');

        const expected = '- [x] first\n- second\n';
        assert.strictEqual(editor.document.getText(), expected,
            `降格後の document モデルが正しくない: ${JSON.stringify(editor.document.getText())}`);
        assert.strictEqual(fs.readFileSync(filePath, 'utf-8'), expected,
            `降格後のディスク内容が正しくない: ${JSON.stringify(fs.readFileSync(filePath, 'utf-8'))}`);
        assert.strictEqual(previewTabsForUri(uri).length, 1,
            'この操作で Preview タブが増殖・消失してはいけない');
    });
});
