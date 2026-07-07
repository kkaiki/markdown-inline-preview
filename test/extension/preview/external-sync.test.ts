/**
 * Preview モード（実 VS Code）の外部（ファイル）との内容同期を検証する。
 *
 * 対象: Raw⇄Preview ラウンドトリップでの内容不変・dirty 化なし、Preview 表示中の外部書き換えで
 * タブが維持されること、未保存の Raw 編集が往復で失われないこと、untitled 文書の Preview 化で
 * 本文が失われないこと。タブの増殖防止・no-op は tabs-editors.test.ts が担当する。
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

suite('Preview: external-sync', () => {

    teardown(async () => {
        await closeAllEditors();
    });

    suite('12. Preview 実利用フロー（実 VS Code でのタブ・保存・外部編集）', () => {
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

        async function openRealFile(content: string): Promise<{ editor: vscode.TextEditor; filePath: string }> {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-usage-test-'));
            const filePath = path.join(tmpDir, 'doc.md');
            fs.writeFileSync(filePath, content, 'utf-8');
            const uri = vscode.Uri.file(filePath);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc);
            // 直前のテストが Preview モードを「記憶」させていると、新規オープンのファイルは
            // 自動的に Preview へ切り替わる（モード記憶機能の正しい動作）。その場合、上で
            // 取得した TextEditor ハンドルが破棄されて後続の editor.edit が Illegal argument に
            // なる。このスイートは「Raw から始まる」前提なので、自動切替が遅れて発動しても
            // Raw に落ち着くまで明示的に Raw を強制し続ける。
            for (let i = 0; i < 10; i++) {
                await sleep(400);
                if (previewTabsForUri(uri).length === 0
                    && vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputText) {
                    break;
                }
                await vscode.commands.executeCommand('vscode.openWith', uri, 'default', vscode.ViewColumn.Active);
            }
            const editor = await vscode.window.showTextDocument(doc);
            assert.ok(
                vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputText,
                '前提条件: Raw（テキストエディタ）で開けていない'
            );
            return { editor, filePath };
        }

        function activeTab(): vscode.Tab | undefined {
            return vscode.window.tabGroups.activeTabGroup.activeTab;
        }

        function activeTabUri(): vscode.Uri | undefined {
            const input = activeTab()?.input;
            if (input instanceof vscode.TabInputText) return input.uri;
            if (input instanceof vscode.TabInputCustom) return input.uri;
            return undefined;
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

        test('12.1 Raw→Preview→Raw のラウンドトリップで内容が変わらず、dirty にもならない', async function () {
            this.timeout(20000);

            const original = '# ラウンドトリップ\n\n- [ ] item\n\n本文\n';
            const { editor, filePath } = await openRealFile(original);
            const uri = editor.document.uri;

            await vscode.commands.executeCommand('markdownInline.togglePreview');
            await sleep(800);
            assert.strictEqual(previewTabsForUri(uri).length, 1,
                `Preview タブが開いていない（アクティブタブ: ${activeTabUri()?.toString()}）`);

            await vscode.commands.executeCommand('markdownInline.togglePreview');
            await sleep(800);
            assert.ok(activeTab()?.input instanceof vscode.TabInputText,
                `Raw に戻っていない（アクティブタブ: ${activeTabUri()?.toString()}）`);

            const doc = vscode.window.activeTextEditor?.document;
            assert.strictEqual(doc?.getText(), original, 'ラウンドトリップで文書内容が変化した');
            assert.strictEqual(doc?.isDirty, false, '何も編集していないのに dirty になった');
            assert.strictEqual(fs.readFileSync(filePath, 'utf-8'), original, 'ディスク上のファイルが書き換わった');
        });

        test('12.2 Preview 表示中に外部ツールがファイルを書き換えても、Preview タブは開いたまま維持される', async function () {
            this.timeout(20000);

            const { editor, filePath } = await openRealFile('# 外部編集前\n\n本文\n');
            const uri = editor.document.uri;
            await vscode.commands.executeCommand('markdownInline.togglePreview');
            await sleep(800);
            assert.strictEqual(previewTabsForUri(uri).length, 1, '前提: Preview タブが開いていない');

            // LLM やターミナル上のツールが .md を直接書き換える状況を模す。
            fs.writeFileSync(filePath, '# 外部編集後\n\n外部ツールが書き換えた本文\n', 'utf-8');
            await sleep(2500);

            assert.strictEqual(previewTabsForUri(uri).length, 1,
                '外部書き換え後に Preview タブが消えた/増殖した');
        });

        test('12.3 未保存（dirty）の Raw 編集がある状態で Preview→Raw と往復しても編集内容が失われない', async function () {
            this.timeout(20000);

            const { editor } = await openRealFile('# Dirty往復\n\n本文\n');
            const uri = editor.document.uri;
            await editor.edit(builder => builder.insert(new vscode.Position(2, 0), '未保存の追記行\n'));
            assert.strictEqual(editor.document.isDirty, true, '前提: 編集が dirty になっていない');

            await vscode.commands.executeCommand('markdownInline.togglePreview');
            await sleep(800);
            assert.strictEqual(previewTabsForUri(uri).length, 1,
                `前提条件: Preview に切り替わっていない（アクティブタブ: ${activeTabUri()?.toString()}）`);

            await vscode.commands.executeCommand('markdownInline.togglePreview');
            // Raw のエディタが返ってくるまで粘る（切替の非同期処理の完了待ち）。
            let doc: vscode.TextDocument | undefined;
            for (let i = 0; i < 10; i++) {
                await sleep(400);
                doc = vscode.window.activeTextEditor?.document;
                if (doc?.uri.toString() === uri.toString()) break;
            }
            assert.strictEqual(doc?.uri.toString(), uri.toString(),
                `Raw に戻っていない（アクティブタブ: ${activeTabUri()?.toString()}）`);
            assert.ok(doc.getText().includes('未保存の追記行'),
                `Preview 往復で未保存の編集が失われた: ${JSON.stringify(doc.getText())}`);
        });

        test('12.6 未保存の新規（untitled）ファイルを Preview 化しても本文が失われない', async function () {
            this.timeout(15000);

            // ディスク実体を持たない「新規ファイル」（保存していない .md）で togglePreview する、
            // ごく普通の操作（新規メモを書き始めてすぐ Preview で見る）を再現する。
            const doc = await vscode.workspace.openTextDocument({ content: '# タイトル\n\n本文\n', language: 'markdown' });
            await vscode.window.showTextDocument(doc);
            assert.strictEqual(doc.getText(), '# タイトル\n\n本文\n', '前提: 初期本文が正しくない');

            await vscode.commands.executeCommand('markdownInline.togglePreview');
            await sleep(600);

            assert.strictEqual(doc.getText(), '# タイトル\n\n本文\n',
                `未保存ファイルを Preview 化した直後に本文が失われた: ${JSON.stringify(doc.getText())}`);
        });
    });
});
