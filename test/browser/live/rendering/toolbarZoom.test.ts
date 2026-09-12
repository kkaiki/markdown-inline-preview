/**
 * ツールバーの拡大率（＋ / − ボタン）が**実際に本文の表示サイズを変える**ことを
 * 実 Chromium で固定する。
 *
 * ユーザー要望（2026-08-09）: 「ここにプラスマイナスを入れて拡大率を入れられるようにして欲しい」。
 *
 * font-size は CSS 変数（`--live-zoom`）越しに効くので、jsdom では「本当に大きくなったか」を
 * 確かめられない。実ブラウザで計算済みスタイルを見る。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

const SEL_OUT = '.cm-live-toolbar-zoom button[data-zoom="out"]';
const SEL_IN = '.cm-live-toolbar-zoom button[data-zoom="in"]';
const SEL_VALUE = '.cm-live-toolbar-zoom .cm-live-toolbar-zoom-value';

describe('Live モード: ツールバーの拡大率（実ブラウザ）', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: LiveHandle | undefined;

    before(async () => {
        browser = await launchBrowser();
    });
    after(async function () {
        // 全スイート連続実行では後始末（browser.close）が 20 秒に収まらず
        // "after all" hook がタイムアウトすることがある（2026-09-12）。
        this.timeout(60000);
        await browser?.close();
    });
    afterEach(async () => {
        if (h) {
            await h.close();
            h = undefined;
        }
    });

    /** 本文の実効フォントサイズ（px）。 */
    async function contentFontSize(handle: LiveHandle): Promise<number> {
        return handle.page.evaluate<number>(
            `parseFloat(getComputedStyle(document.querySelector('.cm-editor .cm-content')).fontSize)`
        );
    }

    it('ツールバーに − / 拡大率 / + が並び、初期表示は 100%', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n');
        assert.strictEqual(await h.page.locator(SEL_OUT).count(), 1);
        assert.strictEqual(await h.page.locator(SEL_IN).count(), 1);
        assert.strictEqual((await h.page.locator(SEL_VALUE).textContent())?.trim(), '100%');
    });

    it('+ を押すと本文が大きくなり、表示も追従する', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n');
        const before = await contentFontSize(h);
        await h.page.click(SEL_IN);
        await h.page.waitForTimeout(80);
        const after = await contentFontSize(h);
        assert.ok(after > before, `拡大されていない: ${before} → ${after}`);
        assert.strictEqual((await h.page.locator(SEL_VALUE).textContent())?.trim(), '110%');
    });

    it('− を押すと本文が小さくなる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n');
        const before = await contentFontSize(h);
        await h.page.click(SEL_OUT);
        await h.page.waitForTimeout(80);
        const after = await contentFontSize(h);
        assert.ok(after < before, `縮小されていない: ${before} → ${after}`);
        assert.strictEqual((await h.page.locator(SEL_VALUE).textContent())?.trim(), '90%');
    });

    it('拡大率の表示を押すと 100% に戻る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n');
        const base = await contentFontSize(h);
        await h.page.click(SEL_IN);
        await h.page.click(SEL_IN);
        await h.page.waitForTimeout(80);
        assert.ok((await contentFontSize(h)) > base);
        await h.page.click(SEL_VALUE);
        await h.page.waitForTimeout(80);
        assert.strictEqual(await contentFontSize(h), base);
        assert.strictEqual((await h.page.locator(SEL_VALUE).textContent())?.trim(), '100%');
    });

    it('拡大しても読み幅は本文サイズに比例して広がる（1行の文字数が変わらない）', async function () {
        if (!browser) { this.skip(); return; }
        const handle = (h = await openLive(browser, '本文\n'));
        const measure = async () =>
            handle.page.evaluate<number>(
                `parseFloat(getComputedStyle(document.querySelector('.cm-editor .cm-content')).maxWidth)`
            );
        const beforeSize = await contentFontSize(h);
        const beforeMeasure = await measure();
        await h.page.click(SEL_IN);
        await h.page.waitForTimeout(80);
        const ratio = (await contentFontSize(h)) / beforeSize;
        const measured = (await measure()) / beforeMeasure;
        assert.ok(Math.abs(measured - ratio) < 0.01, `読み幅が比例していない: ${measured} vs ${ratio}`);
    });

    it('拡大率を変えてもエディタのフォーカスと選択が保たれる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, 'あいうえお\n');
        await h.select(1, 4);
        await h.page.click(SEL_IN);
        await h.page.waitForTimeout(80);
        const sel = await h.page.evaluate<{ from: number; to: number }>(
            `(() => { const s = window.__liveView.state.selection.main; return { from: s.from, to: s.to }; })()`
        );
        assert.deepStrictEqual(sel, { from: 1, to: 4 });
        assert.strictEqual(
            await h.page.evaluate<boolean>(`document.activeElement === window.__liveView.contentDOM`),
            true
        );
    });

    it('拡大率はページを読み込み直しても保たれる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n');
        await h.page.click(SEL_IN);
        await h.page.waitForTimeout(80);
        const zoomed = await contentFontSize(h);
        assert.strictEqual(
            await h.page.evaluate<string | null>(`localStorage.getItem('markdownInline.live.zoom')`),
            '1.1'
        );
        await h.page.reload();
        await h.page.waitForFunction('typeof window.__liveReady !== "undefined"', undefined, { timeout: 15000 });
        await h.page.evaluate(() => window.postMessage({ type: 'init', text: '本文\n', settings: {} }, '*'));
        await h.page.waitForFunction('!!window.__liveView', undefined, { timeout: 15000 });
        await h.page.waitForTimeout(120);
        assert.strictEqual((await h.page.locator(SEL_VALUE).textContent())?.trim(), '110%');
        assert.strictEqual(await contentFontSize(h), zoomed);
    });

    it('エラーが出ない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n');
        await h.page.click(SEL_IN);
        await h.page.click(SEL_OUT);
        await h.page.waitForTimeout(80);
        assert.deepStrictEqual(h.errors, []);
    });
});
