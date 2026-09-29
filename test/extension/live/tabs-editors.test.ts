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

    test('サイドバー等の既定の開き方で開いたとき、素のテキストエディタを経由せず直接 Live で開く（ちらつき無し）', async () => {
        const uri = makeFile('live8.md', '# H\n');
        const seenViewTypes = new Set<string | undefined>();
        const sub = vscode.window.tabGroups.onDidChangeTabs(() => {
            for (const t of openTabs()) {
                if (t.uri === uri.toString()) seenViewTypes.add(t.viewType);
            }
        });
        try {
            // エクスプローラのクリックと同じ経路（既定の開き方 = vscode.open）
            await vscode.commands.executeCommand('vscode.open', uri);
            // 待機なし: priority: default なら、この時点で既に Live が開いているはず
            const tabs = openTabs().filter((t) => t.uri === uri.toString());
            assert.ok(
                tabs.some((t) => t.viewType === LIVE_VIEW_TYPE),
                `開いた直後に Live になっていない: ${JSON.stringify(tabs)}`
            );
        } finally {
            sub.dispose();
        }
        assert.ok(
            !seenViewTypes.has(undefined),
            `素のテキストエディタ（Raw）を経由してから Live へ切り替わった: ${JSON.stringify([...seenViewTypes])}`
        );
    });

    test('Claude やターミナルのパネルだけのグループで開かれても、Markdown は文書側のグループへ移る', async () => {
        // ユーザー報告 2026-09-12:「Claude やターミナルを開いている側のタブで .md が開いてしまう。
        // 本来は動いていない左側（文書を並べている方）で開いてほしい」
        const a = makeFile('group-a.md', '# A\n');
        const b = makeFile('group-b.md', '# B\n');
        await vscode.commands.executeCommand('vscode.open', a);
        await wait(1500);

        // 右側に Claude Code のセッションのような webview パネルだけのグループを作る
        const panel = vscode.window.createWebviewPanel('ipreview.testPanel', 'Panel', vscode.ViewColumn.Two, {});
        await wait(1200);
        assert.ok(vscode.window.tabGroups.all.length >= 2, 'パネル用のグループができていない');

        try {
            // パネルのグループがアクティブな状態で Markdown を開く
            await vscode.commands.executeCommand('vscode.open', b);
            await wait(2500);

            const groups = vscode.window.tabGroups.all;
            const where = groups.findIndex((g) =>
                g.tabs.some((t) => (t.input as { uri?: vscode.Uri } | undefined)?.uri?.toString() === b.toString())
            );
            assert.strictEqual(
                where,
                0,
                `Markdown がパネル側のグループに開かれた: ${JSON.stringify(
                    groups.map((g) => g.tabs.map((t) => t.label))
                )}`
            );
        } finally {
            panel.dispose();
        }
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

    test('openRaw（Live の右クリック「Raw モードで開く」）で Raw に切り替わり、Live タブは残らない', async () => {
        // ユーザー要望 2026-09-29: 本文の右クリックから Raw / Live を行き来できるようにする。
        // openRaw は以前から package.json に宣言だけあって実体が無かった（実行すると「コマンドが見つからない」）。
        const uri = makeFile('live7.md', '# G\n');
        await vscode.commands.executeCommand('markdownInline.openLive', uri);
        await wait(1200);
        await vscode.commands.executeCommand('markdownInline.openRaw');
        await wait(1500);
        const tabs = openTabs().filter((t) => t.uri === uri.toString());
        assert.ok(tabs.length > 0, `タブが無い: ${JSON.stringify(openTabs())}`);
        assert.ok(
            tabs.every((t) => t.viewType !== LIVE_VIEW_TYPE),
            `Raw に切り替わっていない: ${JSON.stringify(tabs)}`
        );
    });

    test('明示的に Live を指定したときは記憶より優先される（逃げ道）', async () => {
        // 通常の open は記憶に従う（別テストで担保）。
        // 一方 `openLive` コマンドは「今 Live で見たい」という明示指定なので、
        // Raw と覚えていても Live で開き、以降は Live として覚え直す。
        //
        // 素の `vscode.openWith(uri, LIVE_VIEW_TYPE)` を直接呼ぶ経路は、
        // priority: default 化に伴い resolveCustomTextEditor 側で Raw 記憶を検知して
        // 跳ね返すようになったため対象外（`resolveCustomTextEditor` には「なぜ呼ばれたか」を
        // 判別する手段が VS Code API 上に無く、既定解決による呼び出しと区別できない）。
        // 拡張が提供するコマンド（openLive/toggleLive）経由なら、呼び出し前に記憶を
        // 先に書き換えるため確実に区別できる。
        const uri = makeFile('live6.md', '# F\n');
        await vscode.commands.executeCommand('markdownInline.openLive', uri);
        await wait(1000);
        await vscode.commands.executeCommand('markdownInline.toggleLive', uri);
        await wait(1200);
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await wait(400);

        await vscode.commands.executeCommand('markdownInline.openLive', uri);
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
