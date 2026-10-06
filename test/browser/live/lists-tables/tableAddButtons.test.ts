/**
 * 表の右端・下端の「＋」ボタン（列・行を末尾に追加）を実 Chromium で固定する。
 *
 * ユーザー要望（2026-10-06）: 「表の右に追加や insert などの機能もないのでは？」→
 * 右クリックメニューにしか無く気づけないので、表にマウスを乗せたときだけ右端に「列を追加」、
 * 下端に「行を追加」の「＋」を出す。ソース変換は右クリックメニューと同じ `applyTableCommand`。
 *
 * 実ブラウザでしか確かめられないこと（ホバーでの表示切替・クリックでの文書反映・
 * セル編集後でも最新のソースに対して追加されること）を見る。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

const TABLE = '前の段落\n\n| 列A | 列B |\n| --- | --- |\n| a1 | b1 |\n| a2 | b2 |\n\n後の段落\n';

describe('Live モード: 表の「＋」ボタン（実ブラウザ）', function () {
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

    const opacity = (page: LiveHandle['page'], sel: string): Promise<string> =>
        page.evaluate<string>(`getComputedStyle(document.querySelector('${sel}')).opacity`);

    it('表にマウスを乗せないときは「＋」が見えず、乗せると右端と下端に出る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await h.page.mouse.move(2, 2);
        await h.page.waitForTimeout(200);
        assert.strictEqual(await opacity(h.page, '.cm-live-table-add-col'), '0');
        assert.strictEqual(await opacity(h.page, '.cm-live-table-add-row'), '0');
        await h.page.locator('.cm-live-table [contenteditable="true"]').first().hover();
        await h.page.waitForTimeout(300);
        assert.strictEqual(await opacity(h.page, '.cm-live-table-add-col'), '1');
        assert.strictEqual(await opacity(h.page, '.cm-live-table-add-row'), '1');
    });

    it('右端の「＋」で全行の末尾に空の列が増える', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await h.page.locator('.cm-live-table [contenteditable="true"]').first().hover();
        await h.page.locator('.cm-live-table-add-col').click();
        await h.page.waitForTimeout(150);
        assert.strictEqual(
            await h.doc(),
            '前の段落\n\n| 列A | 列B |     |\n| --- | --- | --- |\n| a1 | b1 |     |\n| a2 | b2 |     |\n\n後の段落\n'
        );
    });

    it('下端の「＋」で末尾に空の行が増える', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await h.page.locator('.cm-live-table [contenteditable="true"]').first().hover();
        await h.page.locator('.cm-live-table-add-row').click();
        await h.page.waitForTimeout(150);
        assert.strictEqual(
            await h.doc(),
            '前の段落\n\n| 列A | 列B |\n| --- | --- |\n| a1 | b1 |\n| a2 | b2 |\n|     |     |\n\n後の段落\n'
        );
    });

    it('セルを編集したあとでも、最新の内容に対して行が増える', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        const cell = h.page.locator('.cm-live-table [contenteditable="true"]').nth(2);
        await cell.click();
        await h.page.keyboard.type('X');
        await h.page.waitForTimeout(150);
        await h.page.locator('.cm-live-table-add-row').click();
        await h.page.waitForTimeout(150);
        assert.strictEqual(
            await h.doc(),
            '前の段落\n\n| 列A | 列B |\n| --- | --- |\n| a1X | b1 |\n| a2 | b2 |\n|     |     |\n\n後の段落\n'
        );
    });

    it('ヘッダだけの表でも「行を追加」で本文の行が増える', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '| 列A | 列B |\n| --- | --- |\n');
        await h.page.locator('.cm-live-table [contenteditable="true"]').first().hover();
        await h.page.locator('.cm-live-table-add-row').click();
        await h.page.waitForTimeout(150);
        assert.strictEqual(await h.doc(), '| 列A | 列B |\n| --- | --- |\n|     |     |\n');
    });
});
