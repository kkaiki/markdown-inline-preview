/**
 * ツールバーの PDF ボタンの右上に「PRO+」バッジを出し、クレジット行の除去が有料であることを
 * 示唆する（ユーザー要望 2026-09-21:「PDF の右上に色付きで PRO+ などのようにして
 * 購入しなきゃいけないと示唆できるようにしたい」）。
 *
 * PDF の書き出し自体は無料なので、バッジは「書き出しに課金が要る」と誤解させない位置づけ
 * （ツールチップで「無料。PRO+ でクレジット行を消せる」と補足する）。
 * 出すかどうかは host が判断して `settings.showProBadge` で渡す（販売中かつ未購入のときだけ）。
 * 表示位置・色・クリックの邪魔をしないことは実 DOM が要るので実 Chromium で見る。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

const PDF = '.cm-live-toolbar-button[data-command="exportPdf"]';
const BADGE = `${PDF} .cm-live-toolbar-badge`;
const TIP_NAME = '.cm-live-toolbar-tip-name';

describe('Live モード: PDF ボタンの PRO+ バッジ（実ブラウザ）', function () {
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

    it('showProBadge が true なら、PDF ボタンに「PRO+」バッジが付く', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n', { showLineNumbers: false, showProBadge: true });
        assert.strictEqual((await h.page.locator(BADGE).textContent())?.trim(), 'PRO+');
    });

    it('既定（showProBadge 未指定）ではバッジは出ない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n');
        assert.strictEqual(await h.page.locator(BADGE).count(), 0);
    });

    it('バッジは PDF ボタンの右上に、色付きで表示される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n', { showLineNumbers: false, showProBadge: true });
        const btn = await h.page.locator(PDF).boundingBox();
        const badge = await h.page.locator(BADGE).boundingBox();
        assert.ok(btn && badge, 'ボタンとバッジの位置が取れない');
        assert.ok(badge.x + badge.width / 2 > btn.x + btn.width / 2, `バッジが右寄りでない: ${badge.x}`);
        assert.ok(badge.y + badge.height / 2 < btn.y + btn.height / 2, `バッジが上寄りでない: ${badge.y}`);
        const bg = await h.page.evaluate<string>(
            `getComputedStyle(document.querySelector('${BADGE}')).backgroundColor`
        );
        assert.notStrictEqual(bg, 'rgba(0, 0, 0, 0)', 'バッジに背景色が付いていない');
    });

    it('バッジはツールバーの領域内に収まり、切れない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n', { showLineNumbers: false, showProBadge: true });
        const bar = await h.page.locator('.cm-live-toolbar').boundingBox();
        const badge = await h.page.locator(BADGE).boundingBox();
        assert.ok(bar && badge, '位置が取れない');
        assert.ok(badge.y >= bar.y, `上に切れている: ${badge.y} < ${bar.y}`);
        assert.ok(badge.x + badge.width <= bar.x + bar.width + 1, '右に切れている');
    });

    it('バッジがあっても PDF ボタンは押せて、書き出しを依頼する', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n', { showLineNumbers: false, showProBadge: true });
        // バッジの真上をクリックしてもボタンとして反応する
        await h.page.click(BADGE);
        await h.page.waitForTimeout(150);
        const sent = (await h.sent()).filter((m) => m.type === 'exportPdf');
        assert.deepStrictEqual(sent, [{ type: 'exportPdf' }]);
    });

    it('バッジがあるとき、ツールチップは「無料。PRO+ でクレジット行を消せる」と伝える', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n', { showLineNumbers: false, showProBadge: true });
        await h.page.hover(PDF);
        await h.page.locator('.cm-live-toolbar-tip').waitFor({ state: 'visible', timeout: 5000 });
        assert.strictEqual(
            (await h.page.locator(TIP_NAME).textContent())?.trim(),
            'Export to PDF (free; PRO+ removes the credit line)'
        );
    });

    it('バッジがあっても aria-label は「Export to PDF」から始まる（支援技術・既存の操作を壊さない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n', { showLineNumbers: false, showProBadge: true });
        const label = await h.page.getAttribute(PDF, 'aria-label');
        assert.ok(label?.startsWith('Export to PDF'), `aria-label: ${label}`);
    });

    it('エラーが出ない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n', { showLineNumbers: false, showProBadge: true });
        await h.page.hover(PDF);
        await h.page.waitForTimeout(100);
        assert.deepStrictEqual(h.errors, []);
    });
});
