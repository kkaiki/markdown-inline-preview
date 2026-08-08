/**
 * 表セルの右クリックメニュー（行/列の選択・挿入・削除・表削除）を実 Chromium で固定する。
 *
 * ユーザー要望（2026-08-08）: 「表は、その列のみ、行のみ、インサート、全て削除など
 * 入っていますか？」→ 入っていなかったので追加した機能。
 *
 * ソース変換そのものは `test/suite/live/lists-tables/tableEdit.test.ts`（純関数）が
 * 見る。ここでは **実ブラウザでしか確かめられないこと**だけを見る:
 *   - contextmenu イベントでメニューが開き、Escape / 外側クリックで閉じる
 *   - 項目クリックが CodeMirror のドキュメントへ反映される
 *   - 選択系の項目がセルのハイライト（自前の矩形選択）に反映される
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

const TABLE = '前の段落\n\n| 列A | 列B |\n| --- | --- |\n| a1 | b1 |\n\n後の段落\n';

/** n 番目（0 始まり）の編集可能セルを右クリックする。 */
async function rightClickCell(h: LiveHandle, index: number): Promise<void> {
    const cell = h.page.locator('.cm-live-table [contenteditable="true"]').nth(index);
    await cell.click({ button: 'right' });
    await h.page.waitForTimeout(80);
}

/** メニュー項目をラベルで選ぶ。 */
async function clickMenuItem(h: LiveHandle, label: string): Promise<void> {
    await h.page.locator('.cm-live-table-menu-item', { hasText: label }).first().click();
    await h.page.waitForTimeout(120);
}

/** メニューが開いているか。 */
async function menuOpen(h: LiveHandle): Promise<boolean> {
    return (await h.page.locator('.cm-live-table-menu').count()) > 0;
}

/** ハイライトされているセルの座標。 */
async function selectedCells(h: LiveHandle): Promise<string[]> {
    return h.page.evaluate<string[]>(
        `[...document.querySelectorAll('.cm-live-cell-selected')].map(e => e.dataset.row + ',' + e.dataset.col)`
    );
}

describe('Live モード: 表の右クリックメニュー（実ブラウザ）', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: LiveHandle | undefined;

    before(async () => {
        browser = await launchBrowser();
    });
    after(async function () {
        this.timeout(20000);
        await browser?.close();
    });
    afterEach(async () => {
        if (h) {
            assert.deepStrictEqual(h.errors, [], 'ページ内でエラーが出た');
            await h.close();
            h = undefined;
        }
    });

    it('セルを右クリックするとメニューが開く', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await rightClickCell(h, 0);
        assert.strictEqual(await menuOpen(h), true);
        assert.strictEqual(await h.page.locator('.cm-live-table-menu-item').count(), 9);
    });

    it('Escape でメニューが閉じる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await rightClickCell(h, 0);
        await h.press('Escape');
        assert.strictEqual(await menuOpen(h), false);
    });

    it('メニューの外をクリックすると閉じる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await rightClickCell(h, 0);
        await h.page.mouse.click(5, 5);
        await h.page.waitForTimeout(80);
        assert.strictEqual(await menuOpen(h), false);
    });

    it('「下に行を挿入」でソースに空の行が増える', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await rightClickCell(h, 2); // 本文 a1
        await clickMenuItem(h, '下に行を挿入');
        assert.strictEqual(
            await h.doc(),
            '前の段落\n\n| 列A | 列B |\n| --- | --- |\n| a1 | b1 |\n|     |     |\n\n後の段落\n'
        );
        assert.strictEqual(await menuOpen(h), false);
    });

    it('「右に列を挿入」で全行に空セルが増える', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await rightClickCell(h, 0); // ヘッダ 列A
        await clickMenuItem(h, '右に列を挿入');
        assert.strictEqual(
            await h.doc(),
            '前の段落\n\n| 列A |     | 列B |\n| --- | --- | --- |\n| a1 |     | b1 |\n\n後の段落\n'
        );
    });

    it('「行を削除」でその行が消える', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await rightClickCell(h, 2); // 本文 a1
        await clickMenuItem(h, '行を削除');
        assert.strictEqual(await h.doc(), '前の段落\n\n| 列A | 列B |\n| --- | --- |\n\n後の段落\n');
    });

    it('「列を削除」でその列が消える', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await rightClickCell(h, 1); // ヘッダ 列B
        await clickMenuItem(h, '列を削除');
        assert.strictEqual(await h.doc(), '前の段落\n\n| 列A |\n| --- |\n| a1 |\n\n後の段落\n');
    });

    it('「表を削除」で表のブロックごと消える', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await rightClickCell(h, 0);
        await clickMenuItem(h, '表を削除');
        assert.strictEqual(await h.doc(), '前の段落\n\n後の段落\n');
    });

    it('「行を選択」でその行のセルだけがハイライトされる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await rightClickCell(h, 2); // 本文行
        await clickMenuItem(h, '行を選択');
        assert.deepStrictEqual(await selectedCells(h), ['1,0', '1,1']);
    });

    it('「列を選択」でその列のセルだけがハイライトされる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await rightClickCell(h, 1); // ヘッダの2列目
        await clickMenuItem(h, '列を選択');
        assert.deepStrictEqual(await selectedCells(h), ['0,1', '1,1']);
    });

    it('「行を選択」のあと ⌘C でその行がタブ区切りでコピーされる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        // クリップボードは読めないので、copy イベントに載った文字列を横取りして見る
        await h.page.evaluate(() => {
            document.addEventListener('copy', (e) => {
                const data = e.clipboardData?.getData('text/plain');
                (window as unknown as { __copied?: string }).__copied = data;
            });
        });
        await rightClickCell(h, 2);
        await clickMenuItem(h, '行を選択');
        await h.page.keyboard.press('ControlOrMeta+c');
        await h.page.waitForTimeout(120);
        assert.strictEqual(
            await h.page.evaluate<string | undefined>('window.__copied'),
            'a1\tb1'
        );
    });

    it('ヘッダ行では「行を削除」が無効で、クリックしてもソースが変わらない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await rightClickCell(h, 0);
        const item = h.page.locator('.cm-live-table-menu-item', { hasText: '行を削除' }).first();
        assert.strictEqual(await item.getAttribute('aria-disabled'), 'true');
        await item.click({ force: true });
        await h.page.waitForTimeout(80);
        assert.strictEqual(await h.doc(), TABLE);
    });
});
