/**
 * 表のセル範囲を選んで ⌘C したとき、**選んだ範囲だけが・生の Markdown のまま**クリップボードへ載ることを、
 * 選び方ごとに実 Chromium で固定する。
 *
 * 何を: ドラッグ・Shift+クリック・⌘A（行・表全体）・右クリックメニュー（行・列）のどれで選んでも、
 *       列はタブ・行は改行で区切った、その矩形のセルだけが載ること。セルの中身は描画後の文字ではなく
 *       ソースの生 Markdown（`**太字**` や `<span style>`）であること。
 * なぜ: ユーザー確認（2026-10-03）「それぞれ表について、選択した範囲をコピーできるか」。
 *       コピーは描画済みセルの textContent を使っていたため、装飾のあるセルは記法が落ち、
 *       ドラッグを始めた（フォーカス中で生表示の）セルだけ記法が残る、という食い違いがあった。
 *       requirements.md §4.5「コピーは生 Markdown をそのまま載せる」に反する。
 * どの層で: 実マウスのドラッグと実キーの ⌘C、copy イベントが要るので実ブラウザ。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

const BADGE = '<span style="color:#e67700">🟡 承認</span>';
// セルの DOM 順: 0 判定 1 社数 2 理由 / 3 A 4 3,651 5 **消えた** / 6 B 7 4,207 8 BADGE / 9 C 10 5,987 11 新しい
const TABLE =
    `| 判定 | 社数 | 理由 |\n| --- | --- | --- |\n| A | 3,651 | **消えた** |\n| B | 4,207 | ${BADGE} |\n| C | 5,987 | 新しい |\n\n本文\n`;

async function cellCenter(h: LiveHandle, index: number): Promise<{ x: number; y: number }> {
    return h.page.evaluate((i: number) => {
        const c = Array.from(document.querySelectorAll('.cm-live-table [contenteditable="true"]'))[i];
        const r = c.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, index);
}

async function dragCells(h: LiveHandle, from: number, to: number): Promise<void> {
    const a = await cellCenter(h, from);
    const b = await cellCenter(h, to);
    await h.page.mouse.move(a.x, a.y);
    await h.page.mouse.down();
    await h.page.mouse.move(b.x, b.y, { steps: 6 });
    await h.page.mouse.up();
    await h.page.waitForTimeout(150);
}

/** ⌘C を押して、copy イベントで載った text/plain を返す（載らなければ null）。 */
async function copyAndRead(h: LiveHandle): Promise<string | null> {
    await h.page.evaluate(() => {
        const w = window as unknown as { __copied: string | null };
        w.__copied = null;
        document.addEventListener(
            'copy',
            (e: ClipboardEvent) => {
                const cd = e.clipboardData;
                if (!cd) return;
                const orig = cd.setData.bind(cd);
                cd.setData = (type: string, data: string): void => {
                    if (type === 'text/plain') w.__copied = data;
                    orig(type, data);
                };
            },
            true
        );
    });
    await h.page.keyboard.press('ControlOrMeta+c');
    await h.page.waitForTimeout(150);
    return h.page.evaluate<string | null>('window.__copied');
}

async function rightClickMenu(h: LiveHandle, index: number, label: string): Promise<void> {
    await h.page.locator('.cm-live-table [contenteditable="true"]').nth(index).click({ button: 'right' });
    await h.page.waitForTimeout(80);
    await h.page.locator('.cm-live-table-menu-item', { hasText: label }).first().click();
    await h.page.waitForTimeout(120);
}

describe('Live モード: 表の範囲選択のコピー（選び方ごと・実ブラウザ）', function () {
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

    it('ドラッグで選んだ矩形だけがタブ区切りで載る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await dragCells(h, 3, 7); // A〜4,207 の 2×2
        assert.strictEqual(await copyAndRead(h), 'A\t3,651\nB\t4,207');
    });

    it('逆向き（右下から左上）にドラッグしても同じ矩形が載る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await dragCells(h, 7, 3);
        assert.strictEqual(await copyAndRead(h), 'A\t3,651\nB\t4,207');
    });

    it('ドラッグの範囲に装飾のあるセルがあれば、生の Markdown のまま載る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await dragCells(h, 4, 8);
        assert.strictEqual(await copyAndRead(h), `3,651\t**消えた**\n4,207\t${BADGE}`);
    });

    it('装飾のあるセルからドラッグを始めても、終えても、どのセルも生の Markdown で載る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await dragCells(h, 8, 5);
        assert.strictEqual(await copyAndRead(h), `**消えた**\n${BADGE}`);
    });

    it('クリックしたあと Shift+クリックで選んだ矩形が載る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        const a = await cellCenter(h, 0);
        const b = await cellCenter(h, 10);
        await h.page.mouse.click(a.x, a.y);
        await h.page.keyboard.down('Shift');
        await h.page.mouse.click(b.x, b.y);
        await h.page.keyboard.up('Shift');
        await h.page.waitForTimeout(150);
        assert.strictEqual(await copyAndRead(h), '判定\t社数\nA\t3,651\nB\t4,207\nC\t5,987');
    });

    it('⌘A で行を選ぶと、その行が生の Markdown で載る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await h.page.locator('.cm-live-table [contenteditable="true"]').nth(6).click();
        await h.page.keyboard.press('ControlOrMeta+a'); // セル
        await h.page.keyboard.press('ControlOrMeta+a'); // 行
        await h.page.waitForTimeout(100);
        assert.strictEqual(await copyAndRead(h), `B\t4,207\t${BADGE}`);
    });

    it('⌘A で表全体を選ぶと、ヘッダーを含む全行が載る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await h.page.locator('.cm-live-table [contenteditable="true"]').nth(6).click();
        for (let i = 0; i < 3; i++) await h.page.keyboard.press('ControlOrMeta+a');
        await h.page.waitForTimeout(100);
        assert.strictEqual(
            await copyAndRead(h),
            `判定\t社数\t理由\nA\t3,651\t**消えた**\nB\t4,207\t${BADGE}\nC\t5,987\t新しい`
        );
    });

    it('右クリックの「行を選択」で、その行が生の Markdown で載る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await rightClickMenu(h, 4, 'Select row');
        assert.strictEqual(await copyAndRead(h), 'A\t3,651\t**消えた**');
    });

    it('右クリックの「列を選択」で、その列が1行1セルで載る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await rightClickMenu(h, 5, 'Select column');
        assert.strictEqual(await copyAndRead(h), `理由\n**消えた**\n${BADGE}\n新しい`);
    });

    it('範囲を選んでいないときの ⌘C は、セルの中で選んだ文字だけが載る（従来どおり）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await h.page.locator('.cm-live-table [contenteditable="true"]').nth(10).click();
        await h.page.keyboard.press('ControlOrMeta+a'); // セルの中身
        await h.page.waitForTimeout(100);
        assert.strictEqual(await copyAndRead(h), null, 'セル内の選択を自前で書き換えている');
    });

    /**
     * 実 VS Code / Cursor では ⌘C はメニュー経由（`webContents.copy()`）で届き、ブラウザの選択が空だと
     * コピーのコマンド自体が無効になって copy イベントが来ない（ユーザー報告 2026-10-04「コピーしても何も反映されない」）。
     * Playwright のキー入力は選択が空でも copy イベントを起こしてしまうので、「コピー可能な選択がある」ことを直接見る。
     */
    async function copyEnabled(live: LiveHandle): Promise<{ enabled: boolean; selected: string }> {
        return live.page.evaluate(() => ({
            enabled: document.queryCommandEnabled('copy'),
            selected: window.getSelection()?.toString() ?? ''
        }));
    }

    it('ドラッグで範囲を選んだあと、ブラウザ側にもコピー可能な選択が残る（実機の ⌘C はこれが無いと届かない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await dragCells(h, 3, 7);
        const r = await copyEnabled(h);
        assert.ok(r.enabled && r.selected !== '', `コピー可能な選択が無い: ${JSON.stringify(r)}`);
    });

    it('⌘A で行を選んだあとも、ブラウザ側にコピー可能な選択が残る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await h.page.locator('.cm-live-table [contenteditable="true"]').nth(6).click();
        await h.page.keyboard.press('ControlOrMeta+a');
        await h.page.keyboard.press('ControlOrMeta+a');
        await h.page.waitForTimeout(100);
        const r = await copyEnabled(h);
        assert.ok(r.enabled && r.selected !== '', `コピー可能な選択が無い: ${JSON.stringify(r)}`);
    });

    it('右クリックの「列を選択」のあとも、ブラウザ側にコピー可能な選択が残る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await rightClickMenu(h, 5, 'Select column');
        const r = await copyEnabled(h);
        assert.ok(r.enabled && r.selected !== '', `コピー可能な選択が無い: ${JSON.stringify(r)}`);
    });

    it('Shift+↓ のキーボード選択のあとも、ブラウザ側にコピー可能な選択が残る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await h.page.locator('.cm-live-table [contenteditable="true"]').nth(3).click();
        await h.page.keyboard.press('Shift+ArrowDown');
        await h.page.waitForTimeout(100);
        const r = await copyEnabled(h);
        assert.ok(r.enabled && r.selected !== '', `コピー可能な選択が無い: ${JSON.stringify(r)}`);
    });
});
