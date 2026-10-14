/**
 * Live モードで書式を重ねたとき（`==**example**==`）に、記号が消えて蛍光ペンと太字の両方で表示されることを実 Chromium で固定する。
 *
 * GitHub issue（2026-10-14）: "highlight and bold as in ==**example**==" → 内側の `**` が記号のまま見えていた。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

describe('Live モード: 書式の重ね掛け（実ブラウザ）', function () {
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

    it('==**example**== は記号が消え、example が蛍光ペンかつ太字で表示される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '==**example**==\n\n本文\n');
        await h.setCursor(await h.doc().then((d) => d.length - 1));
        assert.strictEqual(await h.renderedLine(1), 'example');
        const style = await h.page.evaluate<{ bold: boolean; highlighted: boolean }>(`(() => {
            const line = document.querySelectorAll('.cm-line')[0];
            const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
            let node = walker.nextNode();
            while (node && !node.textContent.includes('example')) node = walker.nextNode();
            const el = node.parentElement;
            return {
                bold: Number(getComputedStyle(el).fontWeight) >= 600,
                highlighted: !!el.closest('.cm-live-highlight')
            };
        })()`);
        assert.deepStrictEqual(style, { bold: true, highlighted: true });
    });

    it('カーソルを中に置くと、外側も内側も記号が出る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '==**example**==\n\n本文\n');
        await h.setCursor(6);
        assert.strictEqual(await h.renderedLine(1), '==**example**==');
    });
});
