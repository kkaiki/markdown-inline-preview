/**
 * 表のセルにいる間、右クリックメニューと同じ表の操作をツールバーの左端に出すことを実 Chromium で固定する。
 *
 * ユーザー要望（2026-10-20）:「表の中にいる時は上の部分（ツールバー）に、右クリックして出てくる項目を
 * 一番左の方に表示するようにしてほしい」。右クリックに気づかなくても行・列を増減できるようにする。
 * ソース変換は右クリックメニューと同じ `applyTableCommand`（純関数のテストは tableEdit 側）。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

const TABLE = '前\n\n| 列A | 列B |\n| --- | --- |\n| a1 | b1 |\n\n後\n';
const GROUP = '.cm-live-toolbar-table';
const CELL = '.cm-live-table [contenteditable="true"]';

async function groupVisible(h: LiveHandle): Promise<boolean> {
    return h.page.evaluate<boolean>(`(() => {
        const g = document.querySelector('${GROUP}');
        return !!g && !g.hidden && g.getBoundingClientRect().width > 0;
    })()`);
}

async function clickAction(h: LiveHandle, command: string): Promise<void> {
    await h.page.click(`${GROUP} [data-table-command="${command}"]`);
    await h.page.waitForTimeout(150);
}

describe('Live モード: 表の操作をツールバーに出す（実ブラウザ）', function () {
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

    it('表の外では出ず、セルに入ると出て、表から出ると消える', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await h.setCursor(0);
        assert.strictEqual(await groupVisible(h), false);
        await h.page.locator(CELL).nth(2).click();
        await h.page.waitForTimeout(150);
        assert.strictEqual(await groupVisible(h), true);
        await h.page.click('.cm-line >> nth=0');
        await h.page.waitForTimeout(150);
        assert.strictEqual(await groupVisible(h), false);
    });

    it('右クリックメニューと同じ項目が、ツールバーの左端（☰ のすぐ右、H1 より左）に並ぶ', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await h.page.locator(CELL).nth(2).click();
        await h.page.waitForTimeout(150);
        const commands = await h.page.evaluate<string[]>(
            `[...document.querySelectorAll('${GROUP} [data-table-command]')].map(e => e.dataset.tableCommand)`
        );
        assert.deepStrictEqual(commands, [
            'selectRow', 'selectColumn',
            'insertRowAbove', 'insertRowBelow', 'insertColumnLeft', 'insertColumnRight',
            'deleteRow', 'deleteColumn', 'deleteTable'
        ]);
        const x = await h.page.evaluate<{ menu: number; group: number; h1: number }>(`(() => ({
            menu: document.querySelector('[data-outline="toggle"]').getBoundingClientRect().left,
            group: document.querySelector('${GROUP}').getBoundingClientRect().left,
            h1: document.querySelector('.cm-live-toolbar-button[data-block="heading1"]').getBoundingClientRect().left
        }))()`);
        assert.ok(x.menu < x.group && x.group < x.h1, `並びが ☰ < 表の操作 < H1 になっていない: ${JSON.stringify(x)}`);
    });

    it('「右に列を挿入」で、いるセルの右に空の列が増える', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await h.page.locator(CELL).nth(2).click(); // a1（行1・列0）
        await h.page.waitForTimeout(150);
        await clickAction(h, 'insertColumnRight');
        assert.strictEqual(await h.doc(), '前\n\n| 列A |     | 列B |\n| --- | --- | --- |\n| a1 |     | b1 |\n\n後\n');
    });

    it('「下に行を挿入」と「行を削除」が、いるセルの行に効く', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await h.page.locator(CELL).nth(2).click();
        await h.page.waitForTimeout(150);
        await clickAction(h, 'insertRowBelow');
        assert.strictEqual(await h.doc(), '前\n\n| 列A | 列B |\n| --- | --- |\n| a1 | b1 |\n|     |     |\n\n後\n');
        await h.page.locator(CELL).nth(2).click();
        await h.page.waitForTimeout(150);
        await clickAction(h, 'deleteRow');
        assert.strictEqual(await h.doc(), '前\n\n| 列A | 列B |\n| --- | --- |\n|     |     |\n\n後\n');
    });

    it('ヘッダ行では「上に行を挿入」「行を削除」が無効になり、押しても変わらない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await h.page.locator(CELL).nth(0).click(); // 列A（ヘッダ）
        await h.page.waitForTimeout(150);
        for (const c of ['insertRowAbove', 'deleteRow']) {
            assert.strictEqual(
                await h.page.getAttribute(`${GROUP} [data-table-command="${c}"]`, 'aria-disabled'),
                'true',
                `${c} が無効になっていない`
            );
        }
        await h.page.click(`${GROUP} [data-table-command="deleteRow"]`, { force: true });
        await h.page.waitForTimeout(150);
        assert.strictEqual(await h.doc(), TABLE);
    });

    it('「列を選択」で、いるセルの列がハイライトされる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await h.page.locator(CELL).nth(3).click(); // b1（行1・列1）
        await h.page.waitForTimeout(150);
        await clickAction(h, 'selectColumn');
        const cells = await h.page.evaluate<string[]>(
            `[...document.querySelectorAll('.cm-live-cell-selected')].map(e => e.dataset.row + ',' + e.dataset.col)`
        );
        assert.deepStrictEqual(cells, ['0,1', '1,1']);
    });

    it('「表を削除」で表のブロックごと消え、ツールバーの表の操作も消える', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await h.page.locator(CELL).nth(2).click();
        await h.page.waitForTimeout(150);
        await clickAction(h, 'deleteTable');
        assert.strictEqual(await h.doc(), '前\n\n後\n');
        assert.strictEqual(await groupVisible(h), false);
    });
});
