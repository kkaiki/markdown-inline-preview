/**
 * 表のセル間・表の出入りを矢印キーで行えることを実 Chromium で固定する。
 *
 * 何を: セルで ↑↓ は上下のセルへ、ヘッダで ↑・最終行で ↓ は表の外の行へ出る。本文から ↑↓ で表に入れる。
 *       ⌘↑ / ⌘↓ は同じ列の先頭 / 最後のセルへ。← / → はセルの端で隣のセルへ（ブラウザ既定）。
 * なぜ: 2026-10-03 の監査（docs/testing/audits/2026-10-03-table-keyboard-audit.md #1〜#3）で、
 *       ↑↓ が左右のセルへ動き、本文からは表を丸ごと飛ばし、⌘↑↓ で文書の先頭へ飛んでいた。
 * どの層で: 実キー入力とフォーカス移動を見るので実ブラウザ。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

// セルの DOM 順: 0 h1 1 h2 2 h3 / 3 a1 4 a2 5 a3 / 6 b1 7 b2 8 b3
const T = '前\n\n| h1 | h2 | h3 |\n| --- | --- | --- |\n| a1 | a2 | a3 |\n| b1 | b2 | b3 |\n\n後\n';
const TABLE_FROM = T.indexOf('| h1');
const TABLE_TO = T.indexOf('b3 |') + 'b3 |'.length;

async function clickCell(h: LiveHandle, i: number): Promise<void> {
    await h.page.locator('.cm-live-table [contenteditable="true"]').nth(i).click();
    await h.page.waitForTimeout(80);
}

/** フォーカス中のセルの番号（セルに無ければ -1）と、CodeMirror 側のカーソル。 */
async function where(h: LiveHandle): Promise<{ cell: number; cmFocused: boolean; head: number }> {
    return h.page.evaluate(() => {
        const cells = Array.from(document.querySelectorAll('.cm-live-table [contenteditable="true"]'));
        return {
            cell: cells.indexOf(document.activeElement),
            cmFocused: document.activeElement?.classList.contains('cm-content') ?? false,
            head: window.__liveView.state.selection.main.head
        };
    });
}

async function press(h: LiveHandle, key: string): Promise<void> {
    await h.page.keyboard.press(key);
    await h.page.waitForTimeout(100);
}

describe('Live モード: 表の矢印キー移動（実ブラウザ）', function () {
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

    it('セルで ↓ を押すと、同じ列の1つ下のセルへ移る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await clickCell(h, 4);
        await press(h, 'ArrowDown');
        assert.strictEqual((await where(h)).cell, 7);
    });

    it('セルで ↑ を押すと、同じ列の1つ上のセルへ移る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await clickCell(h, 4);
        await press(h, 'ArrowUp');
        assert.strictEqual((await where(h)).cell, 1);
    });

    it('ヘッダのセルで ↑ を押すと、表の上の行へ出る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await clickCell(h, 1);
        await press(h, 'ArrowUp');
        const w = await where(h);
        assert.strictEqual(w.cmFocused, true, '本文へフォーカスが戻っていない');
        assert.strictEqual(w.head, TABLE_FROM - 1, '表の直前の行にカーソルが無い');
    });

    it('最終行のセルで ↓ を押すと、表の下の行へ出る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await clickCell(h, 7);
        await press(h, 'ArrowDown');
        const w = await where(h);
        assert.strictEqual(w.cmFocused, true, '本文へフォーカスが戻っていない');
        assert.strictEqual(w.head, TABLE_TO + 1, '表の直後の行にカーソルが無い');
    });

    it('表のすぐ上の行で ↓ を押すと、表のヘッダの最初のセルに入る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await h.setCursor(TABLE_FROM - 1);
        await press(h, 'ArrowDown');
        assert.strictEqual((await where(h)).cell, 0);
    });

    it('表のすぐ下の行で ↑ を押すと、表の最終行の最初のセルに入る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await h.setCursor(TABLE_TO + 1);
        await press(h, 'ArrowUp');
        assert.strictEqual((await where(h)).cell, 6);
    });

    it('表に入って出ても文書は変わらない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await h.setCursor(0);
        for (let i = 0; i < 6; i++) await press(h, 'ArrowDown');
        assert.strictEqual(await h.doc(), T);
        assert.strictEqual((await where(h)).head, T.indexOf('後'));
    });

    it('⌘↓ で同じ列の最後のセル、⌘↑ で同じ列のヘッダへ移る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await clickCell(h, 4);
        await press(h, 'ControlOrMeta+ArrowDown');
        assert.strictEqual((await where(h)).cell, 7);
        await press(h, 'ControlOrMeta+ArrowUp');
        assert.strictEqual((await where(h)).cell, 1);
    });

    it('セルの末尾で → は次のセル、セルの先頭で ← は前のセルへ移る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await clickCell(h, 4);
        await press(h, 'End');
        await press(h, 'ArrowRight');
        assert.strictEqual((await where(h)).cell, 5);
        await clickCell(h, 4);
        await press(h, 'Home');
        await press(h, 'ArrowLeft');
        assert.strictEqual((await where(h)).cell, 3);
    });
    it('最後のセルで Tab を押すと行が1つ増え、増えた行の最初のセルへ移る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await clickCell(h, 8);
        await press(h, 'Tab');
        const lines = (await h.doc()).split('\n').filter((l) => l.startsWith('|'));
        assert.strictEqual(lines.length, 5, JSON.stringify(lines));
        assert.match(lines[4], /^\| +\| +\| +\|$/);
        assert.strictEqual((await where(h)).cell, 9);
    });

    it('最初のセルで Shift+Tab を押しても何も変わらない（表から出ない・行も増えない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await clickCell(h, 0);
        await press(h, 'Shift+Tab');
        assert.strictEqual(await h.doc(), T);
        assert.strictEqual((await where(h)).cell, 0);
    });
});
