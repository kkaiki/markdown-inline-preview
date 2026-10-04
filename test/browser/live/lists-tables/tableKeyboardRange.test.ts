/**
 * 表のセル範囲をキーボード（Shift+矢印・⌘Shift+矢印）で選べることを実 Chromium で固定する。
 *
 * 何を: Shift+↑↓ はフォーカス中のセルから上下へ範囲を伸ばす。Shift+←→ はキャレットがセルの端に
 *       あるとき（それ以上セル内の文字を選べないとき）か、既に範囲があるときに左右へ伸ばす。
 *       ⌘Shift+↑↓ は列の端まで、範囲があるときの ⌘Shift+←→ は行の端まで伸ばす。
 *       範囲があるときの（Shift なしの）矢印は範囲を解除して移動する。選んだ範囲は ⌘C でコピーできる。
 * なぜ: 2026-10-03 の監査（docs/testing/audits/2026-10-03-table-keyboard-audit.md #11・#12）で、
 *       キーボードではセルの範囲を選べなかった（セル内の文字選択になるだけ）。表計算ソフトと同じ操作にそろえる。
 * どの層で: 実キー入力とセル内のキャレット位置が要るので実ブラウザ。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

// セルの DOM 順: 0 h1 1 h2 2 h3 / 3 a1 4 a2 5 a3 / 6 b1 7 b2 8 b3
const T = '前\n\n| h1 | h2 | h3 |\n| --- | --- | --- |\n| a1 | a2 | a3 |\n| b1 | b2 | b3 |\n\n後\n';

async function clickCell(h: LiveHandle, i: number): Promise<void> {
    await h.page.locator('.cm-live-table [contenteditable="true"]').nth(i).click();
    await h.page.waitForTimeout(80);
}

async function keys(h: LiveHandle, ...ks: string[]): Promise<void> {
    for (const k of ks) {
        await h.page.keyboard.press(k);
        await h.page.waitForTimeout(80);
    }
}

async function selectedCells(h: LiveHandle): Promise<number[]> {
    return h.page.evaluate(() =>
        Array.from(document.querySelectorAll('.cm-live-table [contenteditable="true"]'))
            .map((c, i) => (c.classList.contains('cm-live-cell-selected') ? i : -1))
            .filter((i) => i >= 0)
    );
}

async function focusedCell(h: LiveHandle): Promise<number> {
    return h.page.evaluate(() =>
        Array.from(document.querySelectorAll('.cm-live-table [contenteditable="true"]')).indexOf(
            document.activeElement
        )
    );
}

describe('Live モード: 表のキーボードでの範囲選択（実ブラウザ）', function () {
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

    it('Shift+↓ でフォーカス中のセルから下へ範囲が伸びる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await clickCell(h, 4);
        await keys(h, 'Shift+ArrowDown');
        assert.deepStrictEqual(await selectedCells(h), [4, 7]);
    });

    it('Shift+↑ でヘッダまで範囲が伸び、表の外へは出ない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await clickCell(h, 4);
        await keys(h, 'Shift+ArrowUp', 'Shift+ArrowUp');
        assert.deepStrictEqual(await selectedCells(h), [1, 4]);
    });

    it('セルの末尾で Shift+→ を押すと右へ範囲が伸び、続けて Shift+↓ で矩形になる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await clickCell(h, 3);
        await keys(h, 'End', 'Shift+ArrowRight', 'Shift+ArrowDown');
        assert.deepStrictEqual(await selectedCells(h), [3, 4, 6, 7]);
    });

    it('範囲が無くても、セルの末尾で ⌘Shift+→ を押すと行の右端までセルの範囲が伸びる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await clickCell(h, 3);
        await keys(h, 'End', 'ControlOrMeta+Shift+ArrowRight');
        assert.deepStrictEqual(await selectedCells(h), [3, 4, 5]);
    });

    it('範囲が無くても、セルの先頭で ⌘Shift+← を押すと行の左端までセルの範囲が伸びる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await clickCell(h, 8);
        await keys(h, 'Home', 'ControlOrMeta+Shift+ArrowLeft');
        assert.deepStrictEqual(await selectedCells(h), [6, 7, 8]);
    });

    it('セルの途中で ⌘Shift+→ を押したときは、まずセル内の文字を行末まで選ぶ（範囲にしない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await clickCell(h, 3);
        await keys(h, 'Home', 'ControlOrMeta+Shift+ArrowRight');
        assert.deepStrictEqual(await selectedCells(h), []);
    });

    it('セルの途中で Shift+→ を押したときは、セル内の文字選択のまま（範囲にしない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await clickCell(h, 3);
        await keys(h, 'Home', 'Shift+ArrowRight');
        assert.deepStrictEqual(await selectedCells(h), []);
        assert.strictEqual(await h.page.evaluate<string>('String(window.getSelection())'), 'a');
    });

    it('範囲を Shift+← で縮められる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await clickCell(h, 3);
        await keys(h, 'End', 'Shift+ArrowRight', 'Shift+ArrowRight', 'Shift+ArrowLeft');
        assert.deepStrictEqual(await selectedCells(h), [3, 4]);
    });

    it('⌘Shift+↓ で列の最後まで、⌘Shift+↑ で列の先頭まで範囲が伸びる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await clickCell(h, 1);
        await keys(h, 'ControlOrMeta+Shift+ArrowDown');
        assert.deepStrictEqual(await selectedCells(h), [1, 4, 7]);
        await clickCell(h, 7);
        await keys(h, 'ControlOrMeta+Shift+ArrowUp');
        assert.deepStrictEqual(await selectedCells(h), [1, 4, 7]);
    });

    it('範囲があるときの ⌘Shift+→ は行の端まで伸びる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await clickCell(h, 3);
        await keys(h, 'Shift+ArrowDown', 'ControlOrMeta+Shift+ArrowRight');
        assert.deepStrictEqual(await selectedCells(h), [3, 4, 5, 6, 7, 8]);
    });

    it('ドラッグで作った範囲も Shift+↓ で伸ばせる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        const box = await h.page.evaluate(() => {
            const cells = Array.from(document.querySelectorAll('.cm-live-table [contenteditable="true"]'));
            const a = cells[0].getBoundingClientRect();
            const b = cells[1].getBoundingClientRect();
            return [a.x + a.width / 2, a.y + a.height / 2, b.x + b.width / 2, b.y + b.height / 2];
        });
        await h.page.mouse.move(box[0], box[1]);
        await h.page.mouse.down();
        await h.page.mouse.move(box[2], box[3], { steps: 6 });
        await h.page.mouse.up();
        await h.page.waitForTimeout(120);
        await keys(h, 'Shift+ArrowDown');
        assert.deepStrictEqual(await selectedCells(h), [0, 1, 3, 4]);
    });

    it('範囲があるときに（Shift なしの）↓ を押すと、範囲が解除されて下のセルへ移る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await clickCell(h, 1);
        await keys(h, 'Shift+ArrowDown', 'ArrowDown');
        assert.deepStrictEqual(await selectedCells(h), []);
        assert.strictEqual(await focusedCell(h), 7);
    });

    it('キーボードで選んだ範囲を ⌘C するとタブ区切りでコピーされる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, T);
        await h.page.evaluate(() => {
            const w = window as unknown as { __copied: string | null };
            w.__copied = null;
            document.addEventListener(
                'copy',
                (e: ClipboardEvent) => {
                    const cd = e.clipboardData;
                    if (!cd) return;
                    const orig = cd.setData.bind(cd);
                    cd.setData = (t: string, d: string): void => {
                        if (t === 'text/plain') w.__copied = d;
                        orig(t, d);
                    };
                },
                true
            );
        });
        await clickCell(h, 4);
        await keys(h, 'End', 'Shift+ArrowRight', 'Shift+ArrowDown', 'ControlOrMeta+c');
        assert.strictEqual(await h.page.evaluate<string | null>('window.__copied'), 'a2\ta3\nb2\tb3');
    });

    it('セルの末尾で ⌘Shift+→ して ⌘C すると、そのセルから行の右端までがタブ区切りでコピーされる', async function () {
        if (!browser) { this.skip(); return; }
        const BADGE = '<span style="color:#2b8a3e">🟢 着手可能</span>';
        h = await openLive(browser, `前\n\n| 状態 | ID | 内容 |\n| --- | --- | --- |\n| ${BADGE} | V1-001 | **更新** API |\n\n後\n`);
        await h.page.evaluate(() => {
            const w = window as unknown as { __copied: string | null };
            w.__copied = null;
            document.addEventListener(
                'copy',
                (e: ClipboardEvent) => {
                    const cd = e.clipboardData;
                    if (!cd) return;
                    const orig = cd.setData.bind(cd);
                    cd.setData = (t: string, d: string): void => {
                        if (t === 'text/plain') w.__copied = d;
                        orig(t, d);
                    };
                },
                true
            );
        });
        await clickCell(h, 3);
        await keys(h, 'End', 'ControlOrMeta+Shift+ArrowRight', 'ControlOrMeta+c');
        assert.strictEqual(
            await h.page.evaluate<string | null>('window.__copied'),
            `${BADGE}\tV1-001\t**更新** API`
        );
    });
});
