/**
 * 表の列幅を「つまみ」でドラッグ調整できること（実ブラウザ）。
 *
 * ユーザー指示（2026-09-12）:「表について、一時的にでいいので開いている間
 * 列の幅を調整できるようにつまみを選べるようにしてほしい」。
 *
 * 幅は Markdown に書かない（パイプ記法に列幅の表現が無い）。開いているあいだだけ
 * webview が覚えるので、「本文が変わらない」ことと「再描画で消えない」ことを固定する。
 * 実際のドラッグ（pointer イベントと座標）が要るので実 Chromium で確認する。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

const DOC = ['前の段落', '', '| 列A | 列B |', '| --- | --- |', '| a1 | b1 |', '| a2 | b2 |', '', '後の段落', ''].join('\n');

/** つまみを dx だけドラッグする。 */
async function dragHandle(h: LiveHandle, index: number, dx: number): Promise<void> {
    const handles = h.page.locator('.cm-live-col-resize');
    const box = await handles.nth(index).boundingBox();
    assert.ok(box, `つまみ #${index} が見つからない`);
    const y = box.y + box.height / 2;
    const x = box.x + box.width / 2;
    await h.page.mouse.move(x, y);
    await h.page.mouse.down();
    await h.page.mouse.move(x + dx, y, { steps: 5 });
    await h.page.mouse.up();
    await h.page.waitForTimeout(120);
}

/** 各列の実幅。 */
async function columnWidths(h: LiveHandle): Promise<number[]> {
    return h.page.evaluate(
        `Array.from(document.querySelectorAll('.cm-live-table thead th')).map((th) => Math.round(th.getBoundingClientRect().width))`
    );
}

describe('Live モード: 表の列幅つまみ（実ブラウザ）', function () {
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

    it('ヘッダーの列ごとに幅調整のつまみが出る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        const count = await h.page.locator('.cm-live-col-resize').count();
        assert.strictEqual(count, 2, '列の数だけつまみが要る');
    });

    it('つまみを右へドラッグするとその列だけ広がる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        const before = await columnWidths(h);
        await dragHandle(h, 0, 80);
        const after = await columnWidths(h);
        assert.ok(
            after[0] >= before[0] + 60,
            `1列目が広がっていない: ${JSON.stringify(before)} → ${JSON.stringify(after)}`
        );
        assert.ok(
            Math.abs(after[1] - before[1]) <= 2,
            `2列目まで動いた: ${JSON.stringify(before)} → ${JSON.stringify(after)}`
        );
    });

    it('列幅を変えても Markdown 本文は変わらない（幅は保存しない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        await dragHandle(h, 0, 60);
        assert.strictEqual(await h.doc(), DOC);
    });

    it('最小幅より狭くはならない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        await dragHandle(h, 0, -400);
        const after = await columnWidths(h);
        assert.ok(after[0] >= 40, `潰れている: ${after[0]}px`);
    });

    it('表の外を編集して描画し直しても列幅は保たれる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        await dragHandle(h, 0, 80);
        const widened = (await columnWidths(h))[0];

        await h.setCursor(0);
        await h.type('X');
        await h.page.waitForTimeout(300);

        const after = (await columnWidths(h))[0];
        assert.ok(
            Math.abs(after - widened) <= 2,
            `再描画で幅が戻った: ${widened}px → ${after}px`
        );
    });
});
