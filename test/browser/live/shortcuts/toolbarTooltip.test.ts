/**
 * ツールバーのボタンにホバーすると「操作名 + 対応ショートカットキー」が出る
 * （＝ツールバーがそのままショートカットのチートシートになる）ことを実 Chromium で固定する。
 *
 * ユーザー要望（2026-08-10）:「それぞれ上の h1 などにホバーした時に、どのショートカットキーが
 * 対応しているかのホバーが見えるようにして欲しい。チートシートです」。
 *
 * OS 標準の `title` ツールチップは出るまで 1〜2 秒かかり、キーが記号のまま読みづらいので
 * 自前のツールチップを出す。位置決め（画面外にはみ出さない）とフォーカスを奪わないことは
 * 実 DOM のレイアウトが要るため jsdom では代替にならない。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

const TIP = '.cm-live-toolbar-tip';
const TIP_NAME = '.cm-live-toolbar-tip-name';
const TIP_KEYS = '.cm-live-toolbar-tip-keys kbd';
const MAC = process.platform === 'darwin';

describe('Live モード: ツールバーのショートカット・チートシート（実ブラウザ）', function () {
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

    /** ツールチップに出ているキーキャップの文字列。 */
    async function keys(handle: LiveHandle): Promise<string[]> {
        return handle.page.locator(TIP_KEYS).allTextContents();
    }

    it('H1 にホバーすると「見出し1」と ⌥⌘1 が出る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n');
        await h.page.hover('.cm-live-toolbar-button[data-block="heading1"]');
        await h.page.locator(TIP).waitFor({ state: 'visible', timeout: 5000 });
        assert.strictEqual((await h.page.locator(TIP_NAME).textContent())?.trim(), 'Heading 1');
        assert.deepStrictEqual(await keys(h), MAC ? ['⌥', '⌘', '1'] : ['Ctrl', 'Shift', '1']);
    });

    it('別のボタンへホバーを移すと表示が入れ替わる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n');
        await h.page.hover('.cm-live-toolbar-button[data-block="heading1"]');
        await h.page.locator(TIP).waitFor({ state: 'visible', timeout: 5000 });
        await h.page.hover('.cm-live-toolbar-button[data-format="bold"]');
        await h.page.waitForFunction(
            `document.querySelector('${TIP_NAME}')?.textContent.trim() === 'Bold'`,
            undefined,
            { timeout: 5000 }
        );
        assert.deepStrictEqual(await keys(h), MAC ? ['⌘', 'B'] : ['Ctrl', 'B']);
    });

    it('ホバーを外すとツールチップは消える', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n');
        await h.page.hover('.cm-live-toolbar-button[data-block="heading1"]');
        await h.page.locator(TIP).waitFor({ state: 'visible', timeout: 5000 });
        await h.page.mouse.move(5, 400);
        await h.page.locator(TIP).waitFor({ state: 'hidden', timeout: 5000 });
    });

    it('ショートカットが無いボタン（PDF）は操作名だけを出す', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n');
        await h.page.hover('.cm-live-toolbar-button[data-command="exportPdf"]');
        await h.page.locator(TIP).waitFor({ state: 'visible', timeout: 5000 });
        assert.strictEqual((await h.page.locator(TIP_NAME).textContent())?.trim(), 'Export to PDF (free)');
        assert.deepStrictEqual(await keys(h), []);
    });

    it('Raw ボタンにはモード切替キー（⌘⇧.）が出る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n');
        await h.page.hover('.cm-live-toolbar-button[data-mode="raw"]');
        await h.page.locator(TIP).waitFor({ state: 'visible', timeout: 5000 });
        assert.deepStrictEqual(await keys(h), MAC ? ['⌘', '⇧', '.'] : ['Ctrl', 'Shift', '.']);
    });

    it('端のボタンでもツールチップが画面の外へはみ出さない', async function () {
        if (!browser) { this.skip(); return; }
        const handle = (h = await openLive(browser, '本文\n'));
        for (const sel of [
            '.cm-live-toolbar-button[data-block="heading1"]',
            '.cm-live-toolbar-button[data-mode="raw"]'
        ]) {
            await handle.page.hover(sel);
            await handle.page.locator(TIP).waitFor({ state: 'visible', timeout: 5000 });
            const box = await handle.page.locator(TIP).boundingBox();
            const width = await handle.page.evaluate<number>('document.documentElement.clientWidth');
            assert.ok(box, 'ツールチップの位置が取れない');
            assert.ok(box.x >= 0, `左にはみ出している: ${box.x}`);
            assert.ok(box.x + box.width <= width + 1, `右にはみ出している: ${box.x + box.width} > ${width}`);
        }
    });

    it('ホバーしてもエディタのフォーカスと選択は変わらない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, 'あいうえお\n');
        await h.select(1, 4);
        await h.page.hover('.cm-live-toolbar-button[data-block="heading1"]');
        await h.page.locator(TIP).waitFor({ state: 'visible', timeout: 5000 });
        const sel = await h.page.evaluate<{ from: number; to: number }>(
            `(() => { const s = window.__liveView.state.selection.main; return { from: s.from, to: s.to }; })()`
        );
        assert.deepStrictEqual(sel, { from: 1, to: 4 });
        assert.strictEqual(
            await h.page.evaluate<boolean>(`document.activeElement === window.__liveView.contentDOM`),
            true
        );
    });

    it('ボタンを押すとツールチップは消え、変換は効く', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n');
        await h.page.hover('.cm-live-toolbar-button[data-block="heading1"]');
        await h.page.locator(TIP).waitFor({ state: 'visible', timeout: 5000 });
        await h.page.click('.cm-live-toolbar-button[data-block="heading1"]');
        await h.page.locator(TIP).waitFor({ state: 'hidden', timeout: 5000 });
        assert.strictEqual(await h.doc(), '# 本文\n');
    });

    it('ネイティブの title ツールチップと二重に出さない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n');
        assert.strictEqual(
            await h.page.getAttribute('.cm-live-toolbar-button[data-block="heading1"]', 'title'),
            null
        );
        assert.strictEqual(
            await h.page.getAttribute('.cm-live-toolbar-button[data-block="heading1"]', 'aria-label'),
            'Heading 1'
        );
    });

    it('エラーが出ない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n');
        for (const sel of ['[data-block="heading1"]', '[data-format="bold"]', '[data-zoom="in"]', '[data-mode="raw"]']) {
            await h.page.hover(`.cm-live-toolbar-button${sel}`);
            await h.page.waitForTimeout(60);
        }
        assert.deepStrictEqual(h.errors, []);
    });
});
