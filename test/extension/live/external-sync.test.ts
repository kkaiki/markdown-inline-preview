/**
 * Live モードで開いている最中の「外部からの書き換え」と「保存」を実 VS Code で確かめる。
 *
 * バックログ §1（実 VS Code 層が薄い）への対応。webview の中は覗けないので、
 * ここで守るのは **host 側の経路**:
 *   ファイル（ディスク） ⇄ TextDocument ⇄ Live のカスタムエディタ（タブ）
 * が壊れないこと。webview の描画そのものは `test/browser/live/**` が見る。
 */
import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

const LIVE_VIEW_TYPE = 'ipreview.live';
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function makeFile(name: string, body: string): vscode.Uri {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-live-sync-'));
    const file = path.join(dir, name);
    fs.writeFileSync(file, body, 'utf8');
    return vscode.Uri.file(file);
}

/** そのファイルの Live タブの数。 */
function liveTabs(uri: vscode.Uri): number {
    let n = 0;
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            const input = tab.input as { uri?: vscode.Uri; viewType?: string } | undefined;
            if (input?.uri?.toString() === uri.toString() && input.viewType === LIVE_VIEW_TYPE) n += 1;
        }
    }
    return n;
}

/** 開いている TextDocument（Live のカスタムエディタが背後で持っているもの）。 */
async function docText(uri: vscode.Uri): Promise<string> {
    return (await vscode.workspace.openTextDocument(uri)).getText();
}

suite('Live モード: 外部との同期と保存（実 VS Code）', () => {
    setup(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await wait(200);
    });

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await wait(200);
    });

    test('Live で開いている最中に外部でファイルが書き換わると、内容が追従する', async () => {
        const uri = makeFile('sync1.md', '# もとの内容\n');
        await vscode.commands.executeCommand('markdownInline.openLive', uri);
        await wait(1500);
        assert.strictEqual(liveTabs(uri), 1, 'Live タブが開いていない');

        fs.writeFileSync(uri.fsPath, '# 外から書き換えた\n', 'utf8');
        // ファイル監視 → TextDocument 更新は非同期
        for (let i = 0; i < 20; i++) {
            if ((await docText(uri)).includes('外から書き換えた')) break;
            await wait(250);
        }

        assert.strictEqual(await docText(uri), '# 外から書き換えた\n');
        assert.strictEqual(liveTabs(uri), 1, '外部書き換えでタブが増えた/消えた');
    });

    test('Live で開いている文書への編集が保存でディスクまで届く', async () => {
        const uri = makeFile('sync2.md', '# 見出し\n');
        await vscode.commands.executeCommand('markdownInline.openLive', uri);
        await wait(1500);

        // webview → host の `edit` メッセージと同じ経路（WorkspaceEdit）で本文を足す
        const document = await vscode.workspace.openTextDocument(uri);
        const edit = new vscode.WorkspaceEdit();
        edit.insert(uri, document.positionAt(document.getText().length), '追記した行\n');
        assert.ok(await vscode.workspace.applyEdit(edit), 'applyEdit が失敗した');
        assert.ok(await document.save(), '保存に失敗した');
        await wait(300);

        assert.strictEqual(fs.readFileSync(uri.fsPath, 'utf8'), '# 見出し\n追記した行\n');
        assert.strictEqual(liveTabs(uri), 1, '保存でタブが増えた');
    });

    test('外部書き換えのあとに保存しても、外部の内容を巻き戻さない', async () => {
        const uri = makeFile('sync3.md', '# A\n');
        await vscode.commands.executeCommand('markdownInline.openLive', uri);
        await wait(1500);

        fs.writeFileSync(uri.fsPath, '# B（外部）\n', 'utf8');
        for (let i = 0; i < 20; i++) {
            if ((await docText(uri)).includes('外部')) break;
            await wait(250);
        }

        const document = await vscode.workspace.openTextDocument(uri);
        assert.strictEqual(document.isDirty, false, '外部書き換えで dirty になっている');
        await document.save();
        await wait(200);

        assert.strictEqual(fs.readFileSync(uri.fsPath, 'utf8'), '# B（外部）\n');
    });

    test('設定を変えても Live タブは開いたまま、内容も変わらない', async () => {
        const uri = makeFile('sync4.md', '# 設定\n本文\n');
        await vscode.commands.executeCommand('markdownInline.openLive', uri);
        await wait(1500);

        const config = vscode.workspace.getConfiguration('markdownInline');
        await config.update('live.showLineNumbers', false, vscode.ConfigurationTarget.Global);
        await wait(600);
        await config.update('live.showLineNumbers', undefined, vscode.ConfigurationTarget.Global);
        await wait(600);

        assert.strictEqual(liveTabs(uri), 1, '設定変更でタブが増えた/消えた');
        assert.strictEqual(await docText(uri), '# 設定\n本文\n');
    });
});
