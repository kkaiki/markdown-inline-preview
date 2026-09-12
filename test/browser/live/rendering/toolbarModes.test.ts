/**
 * ツールバー右端のモード表示（PDF / Raw / Live）の並びと、横スクロールしても
 * 消えないこと（実ブラウザ）。
 *
 * ユーザー指示（2026-09-12）:「pdf raw live の並びにしてほしい」
 * 「raw live はずっと右に固定で表示されるようにしてほしい」「pdf の部分は固定しなくていいです」。
 * 幅が狭いときツールバーは横スクロールする（toolbarOverflow.test.ts）が、
 * モード系だけはスクロール領域の外に置いて常に見えるようにする。拡大率は
 * スクロール側に残す（ユーザー選択: 固定するのはモード系ボタンだけ）。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

const DOC = '# 見出し\n\n本文\n';

describe('Live モード: ツールバーのモード表示（実ブラウザ）', function () {
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
            await h.close();
            h = undefined;
        }
    });

    it('並びは PDF / Raw / Live で、右端に固定されるのは Raw と Live', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        const labels = await h.page.evaluate(
            `Array.from(document.querySelectorAll('.cm-live-toolbar-modes > *')).map((e) => e.textContent.trim())`
        );
        assert.deepStrictEqual(labels, ['Raw', 'Live'], '固定するのは Raw / Live だけ');

        // PDF はスクロールする側の末尾（拡大率の右）に置く
        const pdf = await h.page.evaluate(`(() => {
            const scroll = document.querySelector('.cm-live-toolbar-scroll');
            const btn = [...document.querySelectorAll('.cm-live-toolbar-button')].find((b) => b.textContent.trim() === 'PDF');
            return { inScroll: !!btn && scroll.contains(btn), last: !!btn && scroll.lastElementChild.contains(btn) };
        })()`);
        assert.deepStrictEqual(pdf, { inScroll: true, last: true });
    });

    it('モード系ボタンはスクロール領域の外にあり、狭い幅でも右端に残る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        await h.page.setViewportSize({ width: 460, height: 600 });
        await h.page.waitForTimeout(300);

        const r = await h.page.evaluate(`(() => {
            const modes = document.querySelector('.cm-live-toolbar-modes');
            const scroll = document.querySelector('.cm-live-toolbar-scroll');
            scroll.scrollLeft = 0;
            const atStart = modes.getBoundingClientRect();
            scroll.scrollLeft = scroll.scrollWidth;
            const atEnd = modes.getBoundingClientRect();
            return {
                insideScroll: scroll.contains(modes),
                atStartRight: Math.round(atStart.right),
                atEndRight: Math.round(atEnd.right),
                width: Math.round(atEnd.width),
                viewport: window.innerWidth
            };
        })()`);
        const m = r as {
            insideScroll: boolean;
            atStartRight: number;
            atEndRight: number;
            width: number;
            viewport: number;
        };
        assert.strictEqual(m.insideScroll, false, 'モード系がスクロール領域の中にある');
        assert.strictEqual(m.atStartRight, m.atEndRight, '横スクロールでモード系の位置が動いた');
        assert.ok(m.width > 0 && m.atEndRight <= m.viewport + 1, '右端からはみ出している');
    });

    it('拡大率（− 100% +）はスクロール側に残る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        const inside = await h.page.evaluate(
            `document.querySelector('.cm-live-toolbar-scroll').contains(document.querySelector('.cm-live-toolbar-zoom'))`
        );
        assert.strictEqual(inside, true);
    });
});
