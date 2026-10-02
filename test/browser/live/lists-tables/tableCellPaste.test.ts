/**
 * 表のセルへの貼り付けを実 Chromium（実クリップボード + 実キーの ⌘V）で固定する。
 *
 * 何を: タブ区切り（表計算ソフトや表の範囲コピー）はフォーカス中のセル（範囲選択中は範囲の左上）から
 *       右下へ各セルに流し込み、表より大きければ行・列を足す。タブの無い文字列は1セルに入れ、
 *       改行は空白に、`|` は `\|` にする。
 * なぜ: 2026-10-03 の監査（docs/testing/audits/2026-10-03-table-keyboard-audit.md #6・#8〜#10）で、
 *       タブ区切りを貼ると1セルにタブ文字ごと入って行がくっつき、改行やパイプが黙って消えていた。
 * どの層で: ブラウザ既定の貼り付け動作は合成イベントでは起きないので、実クリップボードと実キーで確かめる。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

// セルの DOM 順: 0 h1 1 h2 2 h3 / 3 a1 4 a2 5 a3 / 6 b1 7 b2 8 b3
const T = '前\n\n| h1 | h2 | h3 |\n| --- | --- | --- |\n| a1 | a2 | a3 |\n| b1 | b2 | b3 |\n\n後\n';

async function center(h: LiveHandle, i: number): Promise<{ x: number; y: number }> {
    return h.page.evaluate((n: number) => {
        const r = Array.from(document.querySelectorAll('.cm-live-table [contenteditable="true"]'))[n].getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, i);
}

async function clickCell(h: LiveHandle, i: number): Promise<void> {
    const p = await center(h, i);
    await h.page.mouse.click(p.x, p.y);
    await h.page.waitForTimeout(80);
}

async function drag(h: LiveHandle, a: number, b: number): Promise<void> {
    const p = await center(h, a);
    const q = await center(h, b);
    await h.page.mouse.move(p.x, p.y);
    await h.page.mouse.down();
    await h.page.mouse.move(q.x, q.y, { steps: 6 });
    await h.page.mouse.up();
    await h.page.waitForTimeout(150);
}

async function pasteText(h: LiveHandle, text: string): Promise<void> {
    await h.page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await h.page.evaluate(async (t: string) => navigator.clipboard.writeText(t), text);
    await h.page.keyboard.press('ControlOrMeta+v');
    await h.page.waitForTimeout(200);
}

/** 表の行（ソース）。 */
async function tableLines(h: LiveHandle): Promise<string[]> {
    return (await h.doc()).split('\n').filter((l) => l.startsWith('|'));
}

describe('Live モード: 表のセルへの貼り付け（実ブラウザ）', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: LiveHandle | undefined;

    before(async () => {
        browser = await launchBrowser();
    });
    after(async function () {
        this.timeout(60000);
        await browser?.close();
    });
    afterEach(async () => {
        if (h) {
            assert.deepStrictEqual(h.errors, [], 'ページ内でエラーが出た');
            await h.close();
            h = undefined;
        }
    });

    it('タブ区切りを貼ると、フォーカス中のセルから右下へ各セルに入る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await clickCell(h, 4);
        await pasteText(h, 'P\tQ\nR\tS');
        assert.deepStrictEqual((await tableLines(h)).slice(2), ['| a1 | P | Q |', '| b1 | R | S |']);
    });

    it('範囲選択中にタブ区切りを貼ると、範囲の左上から入る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await drag(h, 7, 3); // 右下から左上へドラッグしても左上は a1
        await pasteText(h, 'P\tQ\nR\tS');
        assert.deepStrictEqual((await tableLines(h)).slice(2), ['| P | Q | a3 |', '| R | S | b3 |']);
    });

    it('表より大きい範囲を貼ると、行と列を足して全部入れる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await clickCell(h, 8);
        await pasteText(h, 'P\tQ\nR\tS');
        const lines = await tableLines(h);
        assert.strictEqual(lines.length, 5, JSON.stringify(lines));
        assert.match(lines[3], /^\| b1 \| b2 \| P \| Q +\|$/);
        assert.match(lines[4], /^\| +\| +\| R +\| S +\|$/);
        // 足した表も表として描画される（パイプの生表示に戻らない）
        const n = await h.page.evaluate<number>(`document.querySelectorAll('.cm-live-table [contenteditable="true"]').length`);
        assert.strictEqual(n, 16);
    });

    it('表の範囲をコピーして別のセルへ貼ると、同じ形で入る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await h.page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
        await drag(h, 0, 1);
        await h.page.keyboard.press('ControlOrMeta+c');
        await h.page.waitForTimeout(100);
        await clickCell(h, 7);
        await h.page.keyboard.press('ControlOrMeta+v');
        await h.page.waitForTimeout(200);
        assert.match((await tableLines(h))[3], /^\| b1 \| h1 \| h2 +\|$/);
    });

    it('タブの無い改行入りの文字列は1セルに入り、改行は空白になる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await clickCell(h, 3);
        await pasteText(h, 'x\ny');
        assert.strictEqual((await tableLines(h))[2], '| a1x y | a2 | a3 |');
    });

    it('| を含む文字列を貼ると、\\| にエスケープして入る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await clickCell(h, 3);
        await pasteText(h, 'x|y');
        assert.strictEqual((await tableLines(h))[2], '| a1x\\|y | a2 | a3 |');
        const n = await h.page.evaluate<number>(`document.querySelectorAll('.cm-live-table [contenteditable="true"]').length`);
        assert.strictEqual(n, 9, '列が増えてしまった');
    });

    it('普通の文字列はキャレットの位置に入る（従来どおり）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await clickCell(h, 3);
        await h.page.keyboard.press('Home');
        await pasteText(h, 'Z');
        assert.strictEqual((await tableLines(h))[2], '| Za1 | a2 | a3 |');
    });
});
