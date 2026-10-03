/**
 * ツールバーの「Word」ボタン（PRO+ の Word 書き出し）。PDF ボタンの隣に置き、
 * 未購入なら「PRO+」バッジで購入が要ることを示唆する（ユーザー要望 2026-10-03:
 * 「ツールバーにも入れて欲しい。pro と入れて、購入する必要があると促進したい」）。
 *
 * 出すかどうかは host が判断して `settings.proPlusOnSale`（販売中）と `settings.showProBadge`
 * （販売中かつ未購入）で渡す。販売前はボタン自体を出さない（コマンドパレット・右クリックと同じ）。
 * 位置・色・クリックは実 DOM が要るので実 Chromium で見る。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

const PDF = '.cm-live-toolbar-button[data-command="exportPdf"]';
const WORD = '.cm-live-toolbar-button[data-command="exportDocx"]';
const BADGE = `${WORD} .cm-live-toolbar-badge`;
const TIP_NAME = '.cm-live-toolbar-tip-name';

describe('Live モード: Word ボタンと PRO+ バッジ（実ブラウザ）', function () {
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

    it('既定（販売前）では Word ボタンは出ない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n');
        assert.strictEqual(await h.page.locator(WORD).count(), 0);
    });

    it('販売中なら、PDF ボタンのすぐ右に Word ボタンが出る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n', { showLineNumbers: false, proPlusOnSale: true });
        assert.strictEqual((await h.page.locator(WORD).textContent())?.trim(), 'Word');
        const pdf = await h.page.locator(PDF).boundingBox();
        const word = await h.page.locator(WORD).boundingBox();
        assert.ok(pdf && word, '位置が取れない');
        assert.ok(word.x >= pdf.x + pdf.width - 1, `Word が PDF の右にない: ${word.x} < ${pdf.x + pdf.width}`);
    });

    it('未購入（showProBadge）なら Word ボタンに色付きの「PRO+」バッジが付く', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n', { showLineNumbers: false, proPlusOnSale: true, showProBadge: true });
        assert.strictEqual((await h.page.locator(BADGE).textContent())?.trim(), 'PRO+');
        const bg = await h.page.evaluate<string>(
            `getComputedStyle(document.querySelector('${BADGE}')).backgroundColor`
        );
        assert.notStrictEqual(bg, 'rgba(0, 0, 0, 0)', 'バッジに背景色が付いていない');
    });

    it('購入済み（販売中だが showProBadge なし）なら Word ボタンはあるがバッジは出ない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n', { showLineNumbers: false, proPlusOnSale: true });
        assert.strictEqual(await h.page.locator(WORD).count(), 1);
        assert.strictEqual(await h.page.locator(BADGE).count(), 0);
    });

    it('Word ボタン（バッジの上でも）を押すと host へ exportDocx を依頼する', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n', { showLineNumbers: false, proPlusOnSale: true, showProBadge: true });
        await h.page.click(BADGE);
        await h.page.waitForTimeout(150);
        const sent = (await h.sent()).filter((m) => m.type === 'exportDocx');
        assert.deepStrictEqual(sent, [{ type: 'exportDocx' }]);
    });

    it('未購入のとき、ツールチップは PRO+（購入が必要）と伝える', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n', { showLineNumbers: false, proPlusOnSale: true, showProBadge: true });
        await h.page.hover(WORD);
        await h.page.locator('.cm-live-toolbar-tip').waitFor({ state: 'visible', timeout: 5000 });
        assert.strictEqual(
            (await h.page.locator(TIP_NAME).textContent())?.trim(),
            'Export to Word (.docx) (PRO+: purchase required)'
        );
    });

    it('購入済みのツールチップは「Export to Word (.docx)」', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n', { showLineNumbers: false, proPlusOnSale: true });
        await h.page.hover(WORD);
        await h.page.locator('.cm-live-toolbar-tip').waitFor({ state: 'visible', timeout: 5000 });
        assert.strictEqual((await h.page.locator(TIP_NAME).textContent())?.trim(), 'Export to Word (.docx)');
    });

    it('バッジはツールバーの領域内に収まり、エラーも出ない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n', { showLineNumbers: false, proPlusOnSale: true, showProBadge: true });
        const bar = await h.page.locator('.cm-live-toolbar').boundingBox();
        const badge = await h.page.locator(BADGE).boundingBox();
        assert.ok(bar && badge, '位置が取れない');
        assert.ok(badge.y >= bar.y, `上に切れている: ${badge.y} < ${bar.y}`);
        assert.deepStrictEqual(h.errors, []);
    });

    describe('Slides ボタン（Marp スライド書き出し・同じ PRO+ 機能）', () => {
        const SLIDES = '.cm-live-toolbar-button[data-command="exportMarp"]';
        const SLIDES_BADGE = `${SLIDES} .cm-live-toolbar-badge`;

        it('既定（販売前）では Slides ボタンは出ない', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '本文\n');
            assert.strictEqual(await h.page.locator(SLIDES).count(), 0);
        });

        it('販売中なら Word ボタンのすぐ右に Slides ボタンが出る', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '本文\n', { showLineNumbers: false, proPlusOnSale: true });
            assert.strictEqual((await h.page.locator(SLIDES).textContent())?.trim(), 'Slides');
            const word = await h.page.locator(WORD).boundingBox();
            const slides = await h.page.locator(SLIDES).boundingBox();
            assert.ok(word && slides, '位置が取れない');
            assert.ok(slides.x >= word.x + word.width - 1, `Slides が Word の右にない: ${slides.x}`);
        });

        it('未購入なら「PRO+」バッジが付き、購入済みなら付かない', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '本文\n', { showLineNumbers: false, proPlusOnSale: true, showProBadge: true });
            assert.strictEqual((await h.page.locator(SLIDES_BADGE).textContent())?.trim(), 'PRO+');
            await h.close();
            h = await openLive(browser, '本文\n', { showLineNumbers: false, proPlusOnSale: true });
            assert.strictEqual(await h.page.locator(SLIDES).count(), 1);
            assert.strictEqual(await h.page.locator(SLIDES_BADGE).count(), 0);
        });

        it('押すと host へ exportMarp を依頼する', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '本文\n', { showLineNumbers: false, proPlusOnSale: true, showProBadge: true });
            await h.page.click(SLIDES_BADGE);
            await h.page.waitForTimeout(150);
            const sent = (await h.sent()).filter((m) => m.type === 'exportMarp');
            assert.deepStrictEqual(sent, [{ type: 'exportMarp' }]);
        });

        it('ツールチップ: 未購入は購入が必要と伝え、購入済みは機能名だけ', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '本文\n', { showLineNumbers: false, proPlusOnSale: true, showProBadge: true });
            await h.page.hover(SLIDES);
            await h.page.locator('.cm-live-toolbar-tip').waitFor({ state: 'visible', timeout: 5000 });
            assert.strictEqual(
                (await h.page.locator(TIP_NAME).textContent())?.trim(),
                'Export as Slides (Marp PDF) (PRO+: purchase required)'
            );
            await h.close();
            h = await openLive(browser, '本文\n', { showLineNumbers: false, proPlusOnSale: true });
            await h.page.hover(SLIDES);
            await h.page.locator('.cm-live-toolbar-tip').waitFor({ state: 'visible', timeout: 5000 });
            assert.strictEqual((await h.page.locator(TIP_NAME).textContent())?.trim(), 'Export as Slides (Marp PDF)');
        });
    });
});
