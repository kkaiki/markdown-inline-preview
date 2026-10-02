/**
 * 表でセルを範囲選択したときの編集（Backspace / Delete / ⌘X / 文字入力）と、範囲選択の解除、
 * セルから本文へのドラッグを実 Chromium で固定する。
 *
 * 何を: 範囲選択中の Backspace / Delete は選んだセルをすべて空にし、⌘X はコピーしてから空にする。
 *       文字を打つと範囲は解除され、ドラッグを始めたセルの中身を置き換える。本文をクリックすると
 *       範囲のハイライトは消える。セルから表の外の本文へドラッグすると、表ごと本文の選択になる。
 * なぜ: 2026-10-03 の監査（docs/testing/audits/2026-10-03-table-keyboard-audit.md #4・#5・#7・#11）で、
 *       範囲のハイライトは出ているのに編集が開始セルにしか効かない／⌘X が何もしない／
 *       ハイライトが残る／セルから本文へドラッグしても何も選べない、が見つかった。
 * どの層で: 実マウス・実キーと copy / cut イベントが要るので実ブラウザ。
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

async function drag(h: LiveHandle, a: number, b: number): Promise<void> {
    const p = await center(h, a);
    const q = await center(h, b);
    await h.page.mouse.move(p.x, p.y);
    await h.page.mouse.down();
    await h.page.mouse.move(q.x, q.y, { steps: 6 });
    await h.page.mouse.up();
    await h.page.waitForTimeout(150);
}

async function selectedCells(h: LiveHandle): Promise<number[]> {
    return h.page.evaluate(() =>
        Array.from(document.querySelectorAll('.cm-live-table [contenteditable="true"]'))
            .map((c, i) => (c.classList.contains('cm-live-cell-selected') ? i : -1))
            .filter((i) => i >= 0)
    );
}

async function hookClipboard(h: LiveHandle): Promise<void> {
    await h.page.evaluate(() => {
        const w = window as unknown as { __copied: string | null };
        w.__copied = null;
        for (const type of ['copy', 'cut']) {
            document.addEventListener(
                type,
                (e) => {
                    const cd = (e as ClipboardEvent).clipboardData;
                    if (!cd) return;
                    const orig = cd.setData.bind(cd);
                    cd.setData = (t: string, d: string): void => {
                        if (t === 'text/plain') w.__copied = d;
                        orig(t, d);
                    };
                },
                true
            );
        }
    });
}

describe('Live モード: 表の範囲選択の編集（実ブラウザ）', function () {
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

    for (const key of ['Backspace', 'Delete']) {
        it(`範囲選択中に ${key} を押すと、選んだセルがすべて空になる`, async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, T);
            await drag(h, 3, 7);
            await h.page.keyboard.press(key);
            await h.page.waitForTimeout(150);
            assert.strictEqual(
                await h.doc(),
                '前\n\n| h1 | h2 | h3 |\n| --- | --- | --- |\n|  |  | a3 |\n|  |  | b3 |\n\n後\n'
            );
        });
    }

    it('範囲を空にしたあとも、同じ範囲が選ばれたまま続けて操作できる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await drag(h, 3, 7);
        await h.page.keyboard.press('Backspace');
        await h.page.waitForTimeout(150);
        assert.deepStrictEqual(await selectedCells(h), [3, 4, 6, 7]);
        const focused = await h.page.evaluate(() =>
            Array.from(document.querySelectorAll('.cm-live-table [contenteditable="true"]')).indexOf(
                document.activeElement
            )
        );
        assert.ok(focused >= 0, 'セルからフォーカスが外れた');
    });

    it('範囲選択中に ⌘X を押すと、範囲がコピーされてから空になる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await hookClipboard(h);
        await drag(h, 3, 7);
        await h.page.keyboard.press('ControlOrMeta+x');
        await h.page.waitForTimeout(150);
        assert.strictEqual(
            await h.page.evaluate<string | null>('window.__copied'),
            'a1\ta2\nb1\tb2'
        );
        assert.strictEqual(
            await h.doc(),
            '前\n\n| h1 | h2 | h3 |\n| --- | --- | --- |\n|  |  | a3 |\n|  |  | b3 |\n\n後\n'
        );
    });

    it('範囲選択中に文字を打つと、範囲は解除され、ドラッグを始めたセルの中身が置き換わる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await drag(h, 3, 7);
        await h.page.keyboard.type('xy');
        await h.page.waitForTimeout(150);
        assert.deepStrictEqual(await selectedCells(h), []);
        assert.strictEqual(
            await h.doc(),
            '前\n\n| h1 | h2 | h3 |\n| --- | --- | --- |\n| xy | a2 | a3 |\n| b1 | b2 | b3 |\n\n後\n'
        );
    });

    it('範囲選択したまま本文をクリックすると、範囲のハイライトが消える', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await drag(h, 3, 7);
        const p = await h.page.evaluate(() => {
            const r = document.querySelectorAll('.cm-content > .cm-line')[0].getBoundingClientRect();
            return { x: r.x + 5, y: r.y + r.height / 2 };
        });
        await h.page.mouse.click(p.x, p.y);
        await h.page.waitForTimeout(150);
        assert.deepStrictEqual(await selectedCells(h), []);
    });

    it('セルから表の下の本文までドラッグすると、表を含めて本文まで選ばれ、生の Markdown でコピーされる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await hookClipboard(h);
        const a = await center(h, 4);
        const b = await h.page.evaluate(() => {
            const lines = document.querySelectorAll('.cm-content > .cm-line');
            const r = lines[lines.length - 1].getBoundingClientRect();
            return { x: r.x + 40, y: r.y + r.height / 2 };
        });
        await h.page.mouse.move(a.x, a.y);
        await h.page.mouse.down();
        await h.page.mouse.move(b.x, b.y, { steps: 10 });
        await h.page.mouse.up();
        await h.page.waitForTimeout(150);
        await h.page.keyboard.press('ControlOrMeta+c');
        await h.page.waitForTimeout(150);
        const copied = await h.page.evaluate<string | null>('window.__copied');
        assert.ok(copied, 'コピーされていない');
        assert.ok(copied.startsWith('| h1 | h2 | h3 |'), `表の先頭から選ばれていない: ${JSON.stringify(copied)}`);
        assert.ok(copied.includes('| b1 | b2 | b3 |\n\n後'), `本文まで選ばれていない: ${JSON.stringify(copied)}`);
        assert.deepStrictEqual(await selectedCells(h), []);
    });

    it('セルから表の上の本文までドラッグすると、本文から表の終わりまで選ばれる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        const a = await center(h, 4);
        const b = await h.page.evaluate(() => {
            const r = document.querySelectorAll('.cm-content > .cm-line')[0].getBoundingClientRect();
            return { x: r.x + 2, y: r.y + r.height / 2 };
        });
        await h.page.mouse.move(a.x, a.y);
        await h.page.mouse.down();
        await h.page.mouse.move(b.x, b.y, { steps: 10 });
        await h.page.mouse.up();
        await h.page.waitForTimeout(150);
        const sel = await h.page.evaluate(() => {
            const v = window.__liveView as unknown as { state: { selection: { main: { from: number; to: number } } } };
            const s = v.state.selection.main;
            return { from: s.from, to: s.to };
        });
        assert.strictEqual(sel.from, 0);
        assert.strictEqual(sel.to, T.indexOf('b3 |') + 'b3 |'.length);
    });
});
