/**
 * 実 VS Code でのモード記憶とタブ制御。
 *
 * ユーザー指示（2026-08-05）:
 *   「デフォルトで開くときに live にしたときは、そのあとは live で開き、
 *    raw にどこかでしたものがあれば、それは以降は raw で開き続ける」
 *   「上部のタブに、raw live どちらかのタブだけが開かれるように制御して欲しい」
 *
 * 記憶はファイルごとなので、あるファイルを Raw にしても他のファイルは Live のまま
 * であることまで確認する。ここは実 VS Code でしか検証できない層。
 */
import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

const LIVE_VIEW_TYPE = 'ipreview.live';

/** 一時ディレクトリに Markdown を作る（未保存文書では custom editor を開けないため）。 */
function makeFile(name: string, body: string): vscode.Uri {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-live-ext-'));
    const file = path.join(dir, name);
    fs.writeFileSync(file, body, 'utf8');
    return vscode.Uri.file(file);
}

/** 開いているタブを (uri, viewType) の配列で返す。 */
function openTabs(): { uri: string; viewType?: string }[] {
    const out: { uri: string; viewType?: string }[] = [];
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            const input = tab.input as { uri?: vscode.Uri; viewType?: string } | undefined;
            if (input?.uri) out.push({ uri: input.uri.toString(), viewType: input.viewType });
        }
    }
    return out;
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

suite('Live モード: モード記憶とタブ制御（実 VS Code）', () => {
    setup(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await wait(200);
    });

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await wait(200);
    });

    test('openLive で Live のカスタムエディタが開く', async () => {
        const uri = makeFile('live1.md', '# A\n');
        await vscode.commands.executeCommand('markdownInline.openLive', uri);
        await wait(1200);
        const tabs = openTabs().filter((t) => t.uri === uri.toString());
        assert.ok(
            tabs.some((t) => t.viewType === LIVE_VIEW_TYPE),
            `Live タブが無い: ${JSON.stringify(openTabs())}`
        );
    });

    test('同じファイルの Raw タブと Live タブが同時に開かない', async () => {
        const uri = makeFile('live2.md', '# B\n');
        await vscode.commands.executeCommand('vscode.open', uri);
        await wait(600);
        await vscode.commands.executeCommand('markdownInline.openLive', uri);
        await wait(1200);
        const tabs = openTabs().filter((t) => t.uri === uri.toString());
        assert.strictEqual(tabs.length, 1, `同じファイルのタブが複数ある: ${JSON.stringify(tabs)}`);
        assert.strictEqual(tabs[0].viewType, LIVE_VIEW_TYPE);
    });

    test('toggleLive で Raw にすると、次に開いても Raw のまま', async () => {
        const uri = makeFile('live3.md', '# C\n');
        await vscode.commands.executeCommand('markdownInline.openLive', uri);
        await wait(1200);
        // Live → Raw へ明示的に切り替える
        await vscode.commands.executeCommand('markdownInline.toggleLive', uri);
        await wait(1200);
        let tabs = openTabs().filter((t) => t.uri === uri.toString());
        assert.ok(
            tabs.every((t) => t.viewType !== LIVE_VIEW_TYPE),
            `Raw に切り替わっていない: ${JSON.stringify(tabs)}`
        );

        // 閉じて開き直しても Raw のまま（ファイル単位の記憶）
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await wait(400);
        await vscode.commands.executeCommand('vscode.openWith', uri, LIVE_VIEW_TYPE);
        await wait(1500);
        tabs = openTabs().filter((t) => t.uri === uri.toString());
        assert.ok(
            tabs.every((t) => t.viewType !== LIVE_VIEW_TYPE),
            `Raw の記憶が効いていない: ${JSON.stringify(tabs)}`
        );
    });

    test('Raw にしたのは そのファイルだけで、他のファイルは Live のまま', async () => {
        const rawFile = makeFile('live4-raw.md', '# D\n');
        const liveFile = makeFile('live4-live.md', '# E\n');

        await vscode.commands.executeCommand('markdownInline.openLive', rawFile);
        await wait(1000);
        await vscode.commands.executeCommand('markdownInline.toggleLive', rawFile);
        await wait(1200);

        await vscode.commands.executeCommand('markdownInline.openLive', liveFile);
        await wait(1200);
        const tabs = openTabs().filter((t) => t.uri === liveFile.toString());
        assert.ok(
            tabs.some((t) => t.viewType === LIVE_VIEW_TYPE),
            `別ファイルまで Raw になっている: ${JSON.stringify(openTabs())}`
        );
    });
});
