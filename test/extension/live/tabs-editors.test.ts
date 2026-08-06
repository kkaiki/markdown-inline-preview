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

    test('素のテキストエディタで開いても、既定（Live）へ切り替わる', async () => {
        const uri = makeFile('live0.md', '# Z\n');
        // CLI やクイックオープンと同じ経路（vscode.open = 既定のエディタ）
        await vscode.commands.executeCommand('vscode.open', uri);
        await wait(2000);
        const tabs = openTabs().filter((t) => t.uri === uri.toString());
        assert.ok(
            tabs.some((t) => t.viewType === LIVE_VIEW_TYPE),
            `既定の Live へ切り替わっていない: ${JSON.stringify(openTabs())}`
        );
    });

    test('Raw と覚えたファイルは、素のエディタで開いても Live へ変えない', async () => {
        const uri = makeFile('live5.md', '# Y\n');
        await vscode.commands.executeCommand('markdownInline.openLive', uri);
        await wait(1200);
        await vscode.commands.executeCommand('markdownInline.toggleLive', uri);
        await wait(1500);
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await wait(400);
        await vscode.commands.executeCommand('vscode.open', uri);
        await wait(2000);
        const tabs = openTabs().filter((t) => t.uri === uri.toString());
        assert.ok(
            tabs.every((t) => t.viewType !== LIVE_VIEW_TYPE),
            `Raw の記憶を無視して Live になっている: ${JSON.stringify(tabs)}`
        );
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

    test('toggleLive で Raw に切り替わる', async () => {
        const uri = makeFile('live3.md', '# C\n');
        await vscode.commands.executeCommand('markdownInline.openLive', uri);
        await wait(1200);
        await vscode.commands.executeCommand('markdownInline.toggleLive', uri);
        await wait(1500);
        const tabs = openTabs().filter((t) => t.uri === uri.toString());
        assert.ok(
            tabs.every((t) => t.viewType !== LIVE_VIEW_TYPE),
            `Raw に切り替わっていない: ${JSON.stringify(tabs)}`
        );
    });

    test('明示的に Live を指定したときは記憶より優先される（逃げ道）', async () => {
        // 通常の open は記憶に従う（別テストで担保）。
        // 一方 `openWith(Live)` は「今 Live で見たい」という明示指定なので、
        // Raw と覚えていても Live で開き、以降は Live として覚え直す。
        const uri = makeFile('live6.md', '# F\n');
        await vscode.commands.executeCommand('markdownInline.openLive', uri);
        await wait(1000);
        await vscode.commands.executeCommand('markdownInline.toggleLive', uri);
        await wait(1200);
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await wait(400);

        await vscode.commands.executeCommand('vscode.openWith', uri, LIVE_VIEW_TYPE);
        await wait(1500);
        const tabs = openTabs().filter((t) => t.uri === uri.toString());
        assert.ok(
            tabs.some((t) => t.viewType === LIVE_VIEW_TYPE),
            `明示指定が効いていない: ${JSON.stringify(tabs)}`
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
